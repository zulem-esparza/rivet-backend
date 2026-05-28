import { FastifyRequest, FastifyReply } from 'fastify'
import { UserRole } from '@prisma/client'

// Verifica que el request tenga un JWT válido
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'No autorizado. Token inválido o expirado.' })
  }
}

// Verifica que el usuario tenga uno de los roles permitidos
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (!roles.includes(req.user.role)) {
      return reply.status(403).send({ error: 'Acceso denegado. Sin permisos suficientes.' })
    }
  }
}
