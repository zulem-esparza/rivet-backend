"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
async function authenticate(req, reply) {
    try {
        await req.jwtVerify();
    }
    catch {
        return reply.status(401).send({ error: 'No autorizado. Token inválido o expirado.' });
    }
}
function requireRole(...roles) {
    return async (req, reply) => {
        await authenticate(req, reply);
        if (!roles.includes(req.user.role)) {
            return reply.status(403).send({ error: 'Acceso denegado.' });
        }
    };
}
