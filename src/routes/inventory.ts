import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const medicationSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['antibiotico', 'antiinflamatorio', 'anestesico', 'anestesico_inhalado', 'biologico', 'antiparasitario', 'hormonal', 'otro']),
  presentation: z.string().optional(),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
  unitPrice: z.number().min(0).default(0),
  expirationDate: z.string().optional(),
  lotNumber: z.string().optional(),
  controlled: z.boolean().optional(),
})

const movementSchema = z.object({
  type: z.enum(['entrada', 'salida', 'ajuste', 'merma']),
  quantity: z.number().int().min(1),
  reason: z.string().optional(),
})

export async function inventoryRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /inventory — lista de medicamentos
  app.get('/', auth, async (req, reply) => {
    const q = z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      lowStock: z.coerce.boolean().optional(),
      expiringSoon: z.coerce.boolean().optional(), // vencen en 30 días
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).safeParse(req.query)

    if (!q.success) return reply.status(400).send({ error: q.error.flatten() })
    const { search, category, lowStock, expiringSoon, page, limit } = q.data
    const skip = (page - 1) * limit

    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)

    const where = {
      tenantId: req.user.tenantId,
      active: true,
      ...(category && { category: category as any }),
      ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
      ...(lowStock && { stock: { lte: prisma.medication.fields.minStock } }),
      ...(expiringSoon && { expirationDate: { lte: in30Days } }),
    }

    const [meds, total] = await Promise.all([
      prisma.medication.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.medication.count({ where }),
    ])

    return reply.send({ data: meds, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /inventory/alerts — medicamentos bajo stock o por vencer
  app.get('/alerts', auth, async (req, reply) => {
    const tenantId = req.user.tenantId
    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)

    const [lowStock, expiringSoon] = await Promise.all([
      prisma.medication.findMany({
        where: { tenantId, active: true, stock: { lte: prisma.medication.fields.minStock } },
        orderBy: { stock: 'asc' },
      }),
      prisma.medication.findMany({
        where: { tenantId, active: true, expirationDate: { lte: in30Days, gte: new Date() } },
        orderBy: { expirationDate: 'asc' },
      }),
    ])

    return reply.send({ lowStock, expiringSoon })
  })

  // GET /inventory/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const med = await prisma.medication.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: {
        inventoryMovements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
      },
    })
    if (!med) return reply.status(404).send({ error: 'Medicamento no encontrado.' })
    return reply.send(med)
  })

  // POST /inventory
  app.post('/', auth, async (req, reply) => {
    const body = medicationSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const med = await prisma.medication.create({
      data: {
        ...body.data,
        tenantId: req.user.tenantId,
        expirationDate: body.data.expirationDate ? new Date(body.data.expirationDate) : undefined,
      },
    })

    return reply.status(201).send(med)
  })

  // PATCH /inventory/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = medicationSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.medication.findFirst({ where: { id, tenantId: req.user.tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Medicamento no encontrado.' })

    const med = await prisma.medication.update({
      where: { id },
      data: {
        ...body.data,
        expirationDate: body.data.expirationDate ? new Date(body.data.expirationDate) : undefined,
      },
    })

    return reply.send(med)
  })

  // POST /inventory/:id/movements — registrar entrada/salida de stock
  app.post('/:id/movements', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = movementSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const med = await prisma.medication.findFirst({ where: { id, tenantId: req.user.tenantId } })
    if (!med) return reply.status(404).send({ error: 'Medicamento no encontrado.' })

    const delta = ['entrada', 'ajuste'].includes(body.data.type)
      ? body.data.quantity
      : -body.data.quantity

    const newStock = med.stock + delta
    if (newStock < 0) {
      return reply.status(400).send({ error: 'Stock insuficiente para registrar esta salida.' })
    }

    const [movement] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          medicationId: id,
          tenantId: req.user.tenantId,
          userId: req.user.sub,
          type: body.data.type,
          quantity: body.data.quantity,
          reason: body.data.reason,
        },
      }),
      prisma.medication.update({ where: { id }, data: { stock: newStock } }),
    ])

    // Generar alerta si el stock queda bajo el mínimo
    if (newStock <= med.minStock) {
      await prisma.systemAlert.upsert({
        where: { id: `stock-${id}` } as any,
        create: {
          tenantId: req.user.tenantId,
          type: 'stock_bajo',
          severity: newStock === 0 ? 'danger' : 'warning',
          title: `Stock bajo: ${med.name}`,
          body: `Quedan ${newStock} unidades. Mínimo: ${med.minStock}.`,
          referenceId: id,
        },
        update: {
          resolved: false,
          body: `Quedan ${newStock} unidades. Mínimo: ${med.minStock}.`,
        },
      })
    }

    return reply.status(201).send({ movement, newStock })
  })

  // DELETE /inventory/:id — desactiva (soft delete)
  app.delete('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const existing = await prisma.medication.findFirst({ where: { id, tenantId: req.user.tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Medicamento no encontrado.' })

    await prisma.medication.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
