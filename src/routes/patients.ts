import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const patientSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1),
  species: z.enum(['canino', 'felino', 'ave', 'roedor', 'reptil', 'otro']),
  breed: z.string().optional(),
  birthDate: z.string().optional(),
  sex: z.enum(['macho', 'hembra']).optional(),
  sterilized: z.boolean().optional(),
  weightKg: z.number().positive().optional(),
  status: z.enum(['activo', 'seguimiento', 'control', 'archivado']).optional(),
  microchip: z.string().optional(),
  notes: z.string().optional(),
})

const querySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['activo', 'seguimiento', 'control', 'archivado']).optional(),
  species: z.enum(['canino', 'felino', 'ave', 'roedor', 'reptil', 'otro']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

export async function patientRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /patients — lista con búsqueda y paginación
  app.get('/', auth, async (req, reply) => {
    const q = querySchema.safeParse(req.query)
    if (!q.success) return reply.status(400).send({ error: q.error.flatten() })

    const { search, status, species, page, limit } = q.data
    const skip = (page - 1) * limit
    const tenantId = req.user.tenantId

    const where = {
      tenantId,
      ...(status && { status }),
      ...(species && { species }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { owner: { fullName: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, fullName: true, phone: true, email: true } },
          _count: { select: { appointments: true, clinicalRecords: true } },
        },
      }),
      prisma.patient.count({ where }),
    ])

    return reply.send({ data: patients, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /patients/:id — detalle con historial reciente
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const patient = await prisma.patient.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: {
        owner: true,
        appointments: {
          orderBy: { scheduledAt: 'desc' },
          take: 5,
          include: { user: { select: { fullName: true } } },
        },
        clinicalRecords: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { vaccinations: true, user: { select: { fullName: true } } },
        },
        prescriptions: {
          orderBy: { issuedAt: 'desc' },
          take: 5,
          include: { items: true, user: { select: { fullName: true } } },
        },
      },
    })

    if (!patient) return reply.status(404).send({ error: 'Paciente no encontrado.' })
    return reply.send(patient)
  })

  // POST /patients
  app.post('/', auth, async (req, reply) => {
    const body = patientSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Verificar que el owner pertenece al mismo tenant
    const owner = await prisma.owner.findFirst({
      where: { id: body.data.ownerId, tenantId: req.user.tenantId },
    })
    if (!owner) return reply.status(404).send({ error: 'Propietario no encontrado.' })

    const patient = await prisma.patient.create({
      data: {
        ...body.data,
        tenantId: req.user.tenantId,
        birthDate: body.data.birthDate ? new Date(body.data.birthDate) : undefined,
        weightKg: body.data.weightKg ? body.data.weightKg : undefined,
      },
      include: { owner: true },
    })

    return reply.status(201).send(patient)
  })

  // PATCH /patients/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = patientSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.patient.findFirst({
      where: { id, tenantId: req.user.tenantId },
    })
    if (!existing) return reply.status(404).send({ error: 'Paciente no encontrado.' })

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...body.data,
        birthDate: body.data.birthDate ? new Date(body.data.birthDate) : undefined,
      },
      include: { owner: true },
    })

    return reply.send(patient)
  })

  // DELETE /patients/:id — soft delete (archiva)
  app.delete('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const existing = await prisma.patient.findFirst({
      where: { id, tenantId: req.user.tenantId },
    })
    if (!existing) return reply.status(404).send({ error: 'Paciente no encontrado.' })

    await prisma.patient.update({ where: { id }, data: { status: 'archivado' } })
    return reply.status(204).send()
  })
}
