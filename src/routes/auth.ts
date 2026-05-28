import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = z.object({
  tenantName: z.string().min(2),
  tenantPhone: z.string().optional(),
  tenantEmail: z.string().email().optional(),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  cedulaProf: z.string().optional(),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { email, password } = body.data

    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { tenant: true },
    })

    if (!user || !user.tenant.active) {
      return reply.status(401).send({ error: 'Credenciales incorrectas.' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Credenciales incorrectas.' })

    const token = app.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    })

    return reply.send({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        cedulaProf: user.cedulaProf,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          plan: user.tenant.plan,
        },
      },
    })
  })

  // POST /auth/register — crea tenant + usuario admin
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { tenantName, tenantPhone, tenantEmail, fullName, email, password, cedulaProf } = body.data

    const existing = await prisma.user.findFirst({ where: { email } })
    if (existing) return reply.status(409).send({ error: 'El correo ya está registrado.' })

    const passwordHash = await bcrypt.hash(password, 12)

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: tenantName, phone: tenantPhone, email: tenantEmail },
      })
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          fullName,
          email,
          passwordHash,
          role: 'admin',
          cedulaProf,
        },
      })
      return { tenant, user }
    })

    const token = app.jwt.sign({
      sub: result.user.id,
      tenantId: result.tenant.id,
      role: result.user.role,
      email: result.user.email,
    })

    return reply.status(201).send({ token, tenantId: result.tenant.id })
  })

  // GET /auth/me — info del usuario autenticado
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { tenant: true },
      omit: { passwordHash: true },
    })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado.' })
    return reply.send(user)
  })
}
