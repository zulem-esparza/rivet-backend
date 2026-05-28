import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import bcrypt from 'bcryptjs'

// ── OWNERS ────────────────────────────────────────────────────
const ownerSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  curp: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export async function ownerRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/', auth, async (req, reply) => {
    const { search, page = '1', limit = '20' } = req.query as any
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.user.tenantId,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }),
    }

    const [owners, total] = await Promise.all([
      prisma.owner.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { fullName: 'asc' },
        include: { _count: { select: { patients: true } } },
      }),
      prisma.owner.count({ where }),
    ])

    return reply.send({ data: owners, total })
  })

  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const owner = await prisma.owner.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: { patients: true },
    })
    if (!owner) return reply.status(404).send({ error: 'Propietario no encontrado.' })
    return reply.send(owner)
  })

  app.post('/', auth, async (req, reply) => {
    const body = ownerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const owner = await prisma.owner.create({ data: { ...body.data, tenantId: req.user.tenantId } })
    return reply.status(201).send(owner)
  })

  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = ownerSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const existing = await prisma.owner.findFirst({ where: { id, tenantId: req.user.tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Propietario no encontrado.' })
    const owner = await prisma.owner.update({ where: { id }, data: body.data })
    return reply.send(owner)
  })
}

// ── CLINICAL RECORDS ──────────────────────────────────────────
const recordSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  visitDate: z.string().optional(),
  type: z.enum(['consulta', 'vacunacion', 'cirugia', 'control', 'urgencia', 'otro']),
  reason: z.string().optional(),
  diagnosis: z.string().optional(),
  temperature: z.number().optional(),
  weightKg: z.number().optional(),
  treatment: z.string().optional(),
  notes: z.string().optional(),
  vaccinations: z.array(z.object({
    vaccineName: z.string(),
    lotNumber: z.string().optional(),
    nextDoseDate: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
})

export async function clinicalRecordRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/patient/:patientId', auth, async (req, reply) => {
    const { patientId } = req.params as { patientId: string }
    const records = await prisma.clinicalRecord.findMany({
      where: { patientId, tenantId: req.user.tenantId },
      orderBy: { visitDate: 'desc' },
      include: {
        vaccinations: true,
        user: { select: { fullName: true } },
      },
    })
    return reply.send(records)
  })

  app.post('/', auth, async (req, reply) => {
    const body = recordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { vaccinations, ...data } = body.data

    const record = await prisma.clinicalRecord.create({
      data: {
        ...data,
        tenantId: req.user.tenantId,
        userId: req.user.sub,
        visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
        vaccinations: vaccinations
          ? { create: vaccinations.map(v => ({ ...v, nextDoseDate: v.nextDoseDate ? new Date(v.nextDoseDate) : undefined })) }
          : undefined,
      },
      include: { vaccinations: true },
    })

    return reply.status(201).send(record)
  })
}

// ── PRESCRIPTIONS ─────────────────────────────────────────────
const prescriptionSchema = z.object({
  patientId: z.string().uuid(),
  diagnosis: z.string().optional(),
  generalNotes: z.string().optional(),
  items: z.array(z.object({
    medicationId: z.string().uuid().optional(),
    medicationName: z.string(),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    durationDays: z.number().int().optional(),
    route: z.string().optional(),
    instructions: z.string().optional(),
  })).min(1),
})

export async function prescriptionRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/patient/:patientId', auth, async (req, reply) => {
    const { patientId } = req.params as { patientId: string }
    const prescriptions = await prisma.prescription.findMany({
      where: { patientId, tenantId: req.user.tenantId },
      orderBy: { issuedAt: 'desc' },
      include: { items: true, user: { select: { fullName: true, cedulaProf: true } } },
    })
    return reply.send(prescriptions)
  })

  app.post('/', auth, async (req, reply) => {
    const body = prescriptionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Generar folio automático
    const count = await prisma.prescription.count({ where: { tenantId: req.user.tenantId } })
    const folio = `RX-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`

    const prescription = await prisma.prescription.create({
      data: {
        patientId: body.data.patientId,
        tenantId: req.user.tenantId,
        userId: req.user.sub,
        folio,
        diagnosis: body.data.diagnosis,
        generalNotes: body.data.generalNotes,
        items: { create: body.data.items.map((item, i) => ({ ...item, sortOrder: i })) },
      },
      include: { items: true, patient: { include: { owner: true } }, user: true },
    })

    return reply.status(201).send(prescription)
  })

  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const rx = await prisma.prescription.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: {
        items: { include: { medication: true } },
        patient: { include: { owner: true } },
        user: { select: { fullName: true, cedulaProf: true } },
      },
    })
    if (!rx) return reply.status(404).send({ error: 'Receta no encontrada.' })
    return reply.send(rx)
  })
}

// ── INVOICES ──────────────────────────────────────────────────
const invoiceSchema = z.object({
  patientId: z.string().uuid().optional(),
  items: z.array(z.object({
    appointmentId: z.string().uuid().optional(),
    description: z.string(),
    quantity: z.number().int().min(1).default(1),
    unitPrice: z.number().min(0),
  })).min(1),
  paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
  notes: z.string().optional(),
})

export async function invoiceRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/', auth, async (req, reply) => {
    const { status, from, to, page = '1', limit = '20' } = req.query as any
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId: req.user.tenantId,
      ...(status && { status }),
      ...(from && to && { issuedAt: { gte: new Date(from), lte: new Date(to) } }),
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { issuedAt: 'desc' },
        include: {
          patient: { select: { name: true, owner: { select: { fullName: true } } } },
          _count: { select: { items: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ])

    return reply.send({ data: invoices, total })
  })

  app.post('/', auth, async (req, reply) => {
    const body = invoiceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const count = await prisma.invoice.count({ where: { tenantId: req.user.tenantId } })
    const folio = `F-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`

    const itemsData = body.data.items.map((item, i) => ({
      ...item,
      total: item.quantity * item.unitPrice,
      sortOrder: i,
    }))

    const subtotal = itemsData.reduce((acc, i) => acc + i.total, 0)
    const tax = subtotal * 0.16   // IVA 16%
    const total = subtotal + tax

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: req.user.tenantId,
        patientId: body.data.patientId,
        userId: req.user.sub,
        folio,
        subtotal,
        tax,
        total,
        paymentMethod: body.data.paymentMethod,
        notes: body.data.notes,
        items: { create: itemsData },
      },
      include: { items: true, patient: { include: { owner: true } } },
    })

    return reply.status(201).send(invoice)
  })

  app.patch('/:id/pay', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.invoice.findFirst({ where: { id, tenantId: req.user.tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Factura no encontrada.' })

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status: 'pagada', paidAt: new Date(), paymentMethod: body.data.paymentMethod },
    })

    return reply.send(invoice)
  })
}

// ── USERS ─────────────────────────────────────────────────────
const userSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'veterinario', 'recepcionista']),
  cedulaProf: z.string().optional(),
})

export async function userRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [app.authenticate] }

  app.get('/', adminOnly, async (req, reply) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      omit: { passwordHash: true },
      orderBy: { fullName: 'asc' },
    })
    return reply.send(users)
  })

  app.post('/', adminOnly, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Solo administradores pueden crear usuarios.' })

    const body = userSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { password, ...rest } = body.data
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { ...rest, passwordHash, tenantId: req.user.tenantId },
      omit: { passwordHash: true },
    })

    return reply.status(201).send(user)
  })

  app.patch('/:id', adminOnly, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Solo administradores.' })
    const { id } = req.params as { id: string }
    const body = userSchema.partial().omit({ password: true }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const user = await prisma.user.update({
      where: { id },
      data: body.data,
      omit: { passwordHash: true },
    })

    return reply.send(user)
  })

  app.delete('/:id', adminOnly, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Solo administradores.' })
    const { id } = req.params as { id: string }
    if (id === req.user.sub) return reply.status(400).send({ error: 'No puedes desactivar tu propia cuenta.' })

    await prisma.user.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}

// ── DASHBOARD ─────────────────────────────────────────────────
export async function dashboardRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/stats', auth, async (req, reply) => {
    const tenantId = req.user.tenantId
    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0))
    const endOfDay = new Date(today.setHours(23, 59, 59, 999))
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const [
      activePatients,
      todayAppointments,
      pendingAppointments,
      monthPrescriptions,
      todayRevenue,
      lowStockCount,
      unresolvedAlerts,
    ] = await Promise.all([
      prisma.patient.count({ where: { tenantId, status: 'activo' } }),
      prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: startOfDay, lte: endOfDay } } }),
      prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: startOfDay, lte: endOfDay }, status: 'pendiente' } }),
      prisma.prescription.count({ where: { tenantId, issuedAt: { gte: startOfMonth } } }),
      prisma.invoice.aggregate({
        where: { tenantId, status: 'pagada', paidAt: { gte: startOfDay, lte: endOfDay } },
        _sum: { total: true },
      }),
      prisma.medication.count({
        where: { tenantId, active: true, stock: { lte: prisma.medication.fields.minStock } },
      }),
      prisma.systemAlert.count({ where: { tenantId, resolved: false } }),
    ])

    return reply.send({
      activePatients,
      todayAppointments,
      pendingAppointments,
      monthPrescriptions,
      todayRevenue: todayRevenue._sum.total ?? 0,
      lowStockCount,
      unresolvedAlerts,
    })
  })
}
