import { UserRole } from '@prisma/client'

// Payload del JWT
export interface JWTPayload {
  sub: string       // userId
  tenantId: string
  role: UserRole
  email: string
}

// Augmentación de Fastify para que req.user esté tipado
declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload
  }
}
