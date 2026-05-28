import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import { authRoutes } from './routes/auth.js'
import { patientRoutes } from './routes/patients.js'
import { appointmentRoutes } from './routes/appointments.js'
import { inventoryRoutes } from './routes/inventory.js'
import {
  ownerRoutes,
  clinicalRecordRoutes,
  prescriptionRoutes,
  invoiceRoutes,
  userRoutes,
  dashboardRoutes,
} from './routes/index.js'

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
})

// Declaración global para TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>
  }
}

async function buildApp() {
  // ── PLUGINS ─────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5500'],
    credentials: true,
  })

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'cambia_esto_en_produccion_min32chars!!',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
  })

  // Decorar app.authenticate
  app.decorate('authenticate', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'No autorizado.' })
    }
  })

  // ── RUTAS ────────────────────────────────────────────────────
  await app.register(authRoutes,           { prefix: '/api/auth' })
  await app.register(patientRoutes,        { prefix: '/api/patients' })
  await app.register(appointmentRoutes,    { prefix: '/api/appointments' })
  await app.register(inventoryRoutes,      { prefix: '/api/inventory' })
  await app.register(ownerRoutes,          { prefix: '/api/owners' })
  await app.register(clinicalRecordRoutes, { prefix: '/api/clinical-records' })
  await app.register(prescriptionRoutes,   { prefix: '/api/prescriptions' })
  await app.register(invoiceRoutes,        { prefix: '/api/invoices' })
  await app.register(userRoutes,           { prefix: '/api/users' })
  await app.register(dashboardRoutes,      { prefix: '/api/dashboard' })

  // ── HEALTH CHECK ─────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }))

  // ── ERROR HANDLER ────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error)
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: 'Demasiadas peticiones. Intenta en un minuto.' })
    }
    const statusCode = error.statusCode ?? 500
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
    })
  })

  return app
}

// ── ARRANQUE ──────────────────────────────────────────────────
buildApp().then(async (server) => {
  try {
    const port = Number(process.env.PORT ?? 3000)
    const host = process.env.HOST ?? '0.0.0.0'
    await server.listen({ port, host })
    console.log('\n🐾 RiVet API corriendo en http://localhost:' + port)
    console.log('📋 Health check: http://localhost:' + port + '/health\n')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
