import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime(),
  type: z.enum(['consulta_general', 'vacunacion', 'cirugia', 'control', 'urgencia', 'desparasitacion', 'otro']),
  notes: z.string().optional(),
})

const querySchema = z.object({
  date: z.string().optional(),         // YYYY-MM-DD — filtra citas de ese día
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(['pendiente', 'confirmada', 'en_espera', 'completada', 'urgente', 'cancelada']).optional(),
  patientId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

export async function appointmentRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /appointments
  app.get('/', auth, async (req, reply) => {
    const q = querySchema.safeParse(req.query)
    if (!q.success) return reply.status(400).send({ error: q.error.flatten() })

    const { date, from, to, status, patientId, page, limit } = q.data
    const skip = (page - 1) * limit

    const dateFilter = date
      ? { gte: new Date(`${date}T00:00:00`), lte: new Date(`${date}T23:59:59`) }
      : from && to
        ? { gte: new Date(from), lte: new Date(to) }
        : undefined

    const where = {
      tenantId: req.user.tenantId,
      ...(status && { status }),
      ...(patientId && { patientId }),
      ...(dateFilter && { scheduledAt: dateFilter }),
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          patient: {
            include: { owner: { select: { fullName: true, phone: true } } },
          },
          user: { select: { id: true, fullName: true } },
        },
      }),
      prisma.appointment.count({ where }),
    ])

    return reply.send({ data: appointments, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /appointments/today — shortcut para el dashboard
  app.get('/today', auth, async (req, reply) => {
    const today = new Date()
    const start = new Date(today.setHours(0, 0, 0, 0))
    const end = new Date(today.setHours(23, 59, 59, 999))

    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.user.tenantId,
        scheduledAt: { gte: start, lte: end },
        status: { not: 'cancelada' },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        patient: { include: { owner: { select: { fullName: true, phone: true } } } },
        user: { select: { fullName: true } },
      },
    })

    return reply.send(appointments)
  })

  // GET /appointments/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const appt = await prisma.appointment.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: {
        patient: { include: { owner: true } },
        user: { select: { id: true, fullName: true, cedulaProf: true } },
      },
    })
    if (!appt) return reply.status(404).send({ error: 'Cita no encontrada.' })
    return reply.send(appt)
  })

  // POST /appointments
  app.post('/', auth, async (req, reply) => {
    const body = appointmentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const patient = await prisma.patient.findFirst({
      where: { id: body.data.patientId, tenantId: req.user.tenantId },
    })
    if (!patient) return reply.status(404).send({ error: 'Paciente no encontrado.' })

    const appt = await prisma.appointment.create({
      data: {
        ...body.data,
        tenantId: req.user.tenantId,
        scheduledAt: new Date(body.data.scheduledAt),
      },
      include: {
        patient: { include: { owner: true } },
        user: { select: { fullName: true } },
      },
    })

    return reply.status(201).send(appt)
  })

  // PATCH /appointments/:id — actualizar estado o datos
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = appointmentSchema
      .extend({
        status: z.enum(['pendiente', 'confirmada', 'en_espera', 'completada', 'urgente', 'cancelada']).optional(),
      })
      .partial()
      .safeParse(req.body)

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.appointment.findFirst({
      where: { id, tenantId: req.user.tenantId },
    })
    if (!existing) return reply.status(404).send({ error: 'Cita no encontrada.' })

    const appt = await prisma.appointment.update({
      where: { id },
      data: {
        ...body.data,
        scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : undefined,
      },
    })

    return reply.send(appt)
  })

  // DELETE /appointments/:id — cancela la cita
  app.delete('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const existing = await prisma.appointment.findFirst({
      where: { id, tenantId: req.user.tenantId },
    })
    if (!existing) return reply.status(404).send({ error: 'Cita no encontrada.' })

    await prisma.appointment.update({ where: { id }, data: { status: 'cancelada' } })
    return reply.status(204).send()
  })
}
