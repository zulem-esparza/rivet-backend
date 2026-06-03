"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const auth_js_1 = require("./routes/auth.js");
const patients_js_1 = require("./routes/patients.js");
const appointments_js_1 = require("./routes/appointments.js");
const inventory_js_1 = require("./routes/inventory.js");
const index_js_1 = require("./routes/index.js");
const app = (0, fastify_1.default)({
    logger: {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    },
});
async function buildApp() {
    // ── PLUGINS ─────────────────────────────────────────────────
    await app.register(helmet_1.default, { contentSecurityPolicy: false });
    await app.register(cors_1.default, {
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5500'],
        credentials: true,
    });
    await app.register(rate_limit_1.default, {
        max: 200,
        timeWindow: '1 minute',
    });
    await app.register(jwt_1.default, {
        secret: process.env.JWT_SECRET ?? 'cambia_esto_en_produccion_min32chars!!',
        sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    });
    // Decorar app.authenticate
    app.decorate('authenticate', async function (req, reply) {
        try {
            await req.jwtVerify();
        }
        catch {
            return reply.status(401).send({ error: 'No autorizado.' });
        }
    });
    // ── RUTAS ────────────────────────────────────────────────────
    await app.register(auth_js_1.authRoutes, { prefix: '/api/auth' });
    await app.register(patients_js_1.patientRoutes, { prefix: '/api/patients' });
    await app.register(appointments_js_1.appointmentRoutes, { prefix: '/api/appointments' });
    await app.register(inventory_js_1.inventoryRoutes, { prefix: '/api/inventory' });
    await app.register(index_js_1.ownerRoutes, { prefix: '/api/owners' });
    await app.register(index_js_1.clinicalRecordRoutes, { prefix: '/api/clinical-records' });
    await app.register(index_js_1.prescriptionRoutes, { prefix: '/api/prescriptions' });
    await app.register(index_js_1.invoiceRoutes, { prefix: '/api/invoices' });
    await app.register(index_js_1.userRoutes, { prefix: '/api/users' });
    await app.register(index_js_1.dashboardRoutes, { prefix: '/api/dashboard' });
    // ── HEALTH CHECK ─────────────────────────────────────────────
    app.get('/health', async () => ({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    }));
    // ── ERROR HANDLER ────────────────────────────────────────────
    app.setErrorHandler((error, _req, reply) => {
        app.log.error(error);
        if (error.statusCode === 429) {
            return reply.status(429).send({ error: 'Demasiadas peticiones. Intenta en un minuto.' });
        }
        const statusCode = error.statusCode ?? 500;
        return reply.status(statusCode).send({
            error: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
        });
    });
    return app;
}
// ── ARRANQUE ──────────────────────────────────────────────────
buildApp().then(async (server) => {
    try {
        const port = Number(process.env.PORT ?? 3000);
        const host = process.env.HOST ?? '0.0.0.0';
        await server.listen({ port, host });
        console.log('\n🐾 RiVet API corriendo en http://localhost:' + port);
        console.log('📋 Health check: http://localhost:' + port + '/health\n');
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
