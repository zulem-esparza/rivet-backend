"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_js_1 = require("../utils/prisma.js");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
const registerSchema = zod_1.z.object({
    tenantName: zod_1.z.string().min(2),
    tenantPhone: zod_1.z.string().optional(),
    tenantEmail: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    cedulaProf: zod_1.z.string().optional(),
});
async function authRoutes(app) {
    // POST /auth/login
    app.post('/login', async (req, reply) => {
        const body = loginSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { email, password } = body.data;
        const user = await prisma_js_1.prisma.user.findFirst({
            where: { email, active: true },
            include: { tenant: true },
        });
        if (!user || !user.tenant.active) {
            return reply.status(401).send({ error: 'Credenciales incorrectas.' });
        }
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid)
            return reply.status(401).send({ error: 'Credenciales incorrectas.' });
        const token = app.jwt.sign({
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
            email: user.email,
        });
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
        });
    });
    // POST /auth/register — crea tenant + usuario admin
    app.post('/register', async (req, reply) => {
        const body = registerSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { tenantName, tenantPhone, tenantEmail, fullName, email, password, cedulaProf } = body.data;
        const existing = await prisma_js_1.prisma.user.findFirst({ where: { email } });
        if (existing)
            return reply.status(409).send({ error: 'El correo ya está registrado.' });
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const result = await prisma_js_1.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: { name: tenantName, phone: tenantPhone, email: tenantEmail },
            });
            const user = await tx.user.create({
                data: {
                    tenantId: tenant.id,
                    fullName,
                    email,
                    passwordHash,
                    role: 'admin',
                    cedulaProf,
                },
            });
            return { tenant, user };
        });
        const token = app.jwt.sign({
            sub: result.user.id,
            tenantId: result.tenant.id,
            role: result.user.role,
            email: result.user.email,
        });
        return reply.status(201).send({ token, tenantId: result.tenant.id });
    });
    // GET /auth/me — info del usuario autenticado
    app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { id: req.user.sub },
            include: { tenant: true },
            omit: { passwordHash: true },
        });
        if (!user)
            return reply.status(404).send({ error: 'Usuario no encontrado.' });
        return reply.send(user);
    });
}
