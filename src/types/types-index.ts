// Payload del JWT
export interface JWTPayload {
  sub: string
  tenantId: string
  role: string
  email: string
}

// Augmentación de Fastify para que req.user esté tipado
declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}
