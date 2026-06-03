"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerRoutes = ownerRoutes;
exports.clinicalRecordRoutes = clinicalRecordRoutes;
exports.prescriptionRoutes = prescriptionRoutes;
exports.invoiceRoutes = invoiceRoutes;
exports.userRoutes = userRoutes;
exports.dashboardRoutes = dashboardRoutes;
const zod_1 = require("zod");
const prisma_js_1 = require("../utils/prisma.js");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// ── OWNERS ────────────────────────────────────────────────────
const ownerSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    curp: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
async function ownerRoutes(app) {
    const auth = { preHandler: [app.authenticate] };
    app.get('/', auth, async (req, reply) => {
        const { search, page = '1', limit = '20' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where = {
            tenantId: req.user.tenantId,
            ...(search && {
                OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search } },
                ],
            }),
        };
        const [owners, total] = await Promise.all([
            prisma_js_1.prisma.owner.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { fullName: 'asc' },
                include: { _count: { select: { patients: true } } },
            }),
            prisma_js_1.prisma.owner.count({ where }),
        ]);
        return reply.send({ data: owners, total });
    });
    app.get('/:id', auth, async (req, reply) => {
        const { id } = req.params;
        const owner = await prisma_js_1.prisma.owner.findFirst({
            where: { id, tenantId: req.user.tenantId },
            include: { patients: true },
        });
        if (!owner)
            return reply.status(404).send({ error: 'Propietario no encontrado.' });
        return reply.send(owner);
    });
    app.post('/', auth, async (req, reply) => {
        const body = ownerSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const owner = await prisma_js_1.prisma.owner.create({ data: { ...body.data, tenantId: req.user.tenantId } });
        return reply.status(201).send(owner);
    });
    app.patch('/:id', auth, async (req, reply) => {
        const { id } = req.params;
        const body = ownerSchema.partial().safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const existing = await prisma_js_1.prisma.owner.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existing)
            return reply.status(404).send({ error: 'Propietario no encontrado.' });
        const owner = await prisma_js_1.prisma.owner.update({ where: { id }, data: body.data });
        return reply.send(owner);
    });
}
// ── CLINICAL RECORDS ──────────────────────────────────────────
const recordSchema = zod_1.z.object({
    patientId: zod_1.z.string().uuid(),
    appointmentId: zod_1.z.string().uuid().optional(),
    visitDate: zod_1.z.string().optional(),
    type: zod_1.z.enum(['consulta', 'vacunacion', 'cirugia', 'control', 'urgencia', 'otro']),
    reason: zod_1.z.string().optional(),
    diagnosis: zod_1.z.string().optional(),
    temperature: zod_1.z.number().optional(),
    weightKg: zod_1.z.number().optional(),
    treatment: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    vaccinations: zod_1.z.array(zod_1.z.object({
        vaccineName: zod_1.z.string(),
        lotNumber: zod_1.z.string().optional(),
        nextDoseDate: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    })).optional(),
});
async function clinicalRecordRoutes(app) {
    const auth = { preHandler: [app.authenticate] };
    app.get('/patient/:patientId', auth, async (req, reply) => {
        const { patientId } = req.params;
        const records = await prisma_js_1.prisma.clinicalRecord.findMany({
            where: { patientId, tenantId: req.user.tenantId },
            orderBy: { visitDate: 'desc' },
            include: {
                vaccinations: true,
                user: { select: { fullName: true } },
            },
        });
        return reply.send(records);
    });
    app.post('/', auth, async (req, reply) => {
        const body = recordSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { vaccinations, ...data } = body.data;
        const record = await prisma_js_1.prisma.clinicalRecord.create({
            data: {
                ...data,
                tenantId: req.user.tenantId,
                userId: req.user.sub,
                visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
                vaccinations: vaccinations
                    ? { create: vaccinations.map(v => ({ ...v, nextDoseDate: v.nextDoseDate ? new Date(v.nextDoseDate) : undefined })) }
                    : undefined,
            },
            include: { vaccinations: true },
        });
        return reply.status(201).send(record);
    });
}
// ── PRESCRIPTIONS ─────────────────────────────────────────────
const prescriptionSchema = zod_1.z.object({
    patientId: zod_1.z.string().uuid(),
    diagnosis: zod_1.z.string().optional(),
    generalNotes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        medicationId: zod_1.z.string().uuid().optional(),
        medicationName: zod_1.z.string(),
        dose: zod_1.z.string().optional(),
        frequency: zod_1.z.string().optional(),
        durationDays: zod_1.z.number().int().optional(),
        route: zod_1.z.string().optional(),
        instructions: zod_1.z.string().optional(),
    })).min(1),
});
async function prescriptionRoutes(app) {
    const auth = { preHandler: [app.authenticate] };
    app.get('/patient/:patientId', auth, async (req, reply) => {
        const { patientId } = req.params;
        const prescriptions = await prisma_js_1.prisma.prescription.findMany({
            where: { patientId, tenantId: req.user.tenantId },
            orderBy: { issuedAt: 'desc' },
            include: { items: true, user: { select: { fullName: true, cedulaProf: true } } },
        });
        return reply.send(prescriptions);
    });
    app.post('/', auth, async (req, reply) => {
        const body = prescriptionSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        // Generar folio automático
        const count = await prisma_js_1.prisma.prescription.count({ where: { tenantId: req.user.tenantId } });
        const folio = `RX-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
        const prescription = await prisma_js_1.prisma.prescription.create({
            data: {
                patientId: body.data.patientId,
                tenantId: req.user.tenantId,
                userId: req.user.sub,
                folio,
                diagnosis: body.data.diagnosis,
                generalNotes: body.data.generalNotes,
                items: { create: body.data.items.map((item, i) => ({ ...item, sortOrder: i })) },
            },
            include: { items: true, patient: { include: { owner: true } }, user: true },
        });
        return reply.status(201).send(prescription);
    });
    app.get('/:id', auth, async (req, reply) => {
        const { id } = req.params;
        const rx = await prisma_js_1.prisma.prescription.findFirst({
            where: { id, tenantId: req.user.tenantId },
            include: {
                items: { include: { medication: true } },
                patient: { include: { owner: true } },
                user: { select: { fullName: true, cedulaProf: true } },
            },
        });
        if (!rx)
            return reply.status(404).send({ error: 'Receta no encontrada.' });
        return reply.send(rx);
    });
}
// ── INVOICES ──────────────────────────────────────────────────
const invoiceSchema = zod_1.z.object({
    patientId: zod_1.z.string().uuid().optional(),
    items: zod_1.z.array(zod_1.z.object({
        appointmentId: zod_1.z.string().uuid().optional(),
        description: zod_1.z.string(),
        quantity: zod_1.z.number().int().min(1).default(1),
        unitPrice: zod_1.z.number().min(0),
    })).min(1),
    paymentMethod: zod_1.z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
    notes: zod_1.z.string().optional(),
});
async function invoiceRoutes(app) {
    const auth = { preHandler: [app.authenticate] };
    app.get('/', auth, async (req, reply) => {
        const { status, from, to, page = '1', limit = '20' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where = {
            tenantId: req.user.tenantId,
            ...(status && { status }),
            ...(from && to && { issuedAt: { gte: new Date(from), lte: new Date(to) } }),
        };
        const [invoices, total] = await Promise.all([
            prisma_js_1.prisma.invoice.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { issuedAt: 'desc' },
                include: {
                    patient: { select: { name: true, owner: { select: { fullName: true } } } },
                    _count: { select: { items: true } },
                },
            }),
            prisma_js_1.prisma.invoice.count({ where }),
        ]);
        return reply.send({ data: invoices, total });
    });
    app.post('/', auth, async (req, reply) => {
        const body = invoiceSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const count = await prisma_js_1.prisma.invoice.count({ where: { tenantId: req.user.tenantId } });
        const folio = `F-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
        const itemsData = body.data.items.map((item, i) => ({
            ...item,
            total: item.quantity * item.unitPrice,
            sortOrder: i,
        }));
        const subtotal = itemsData.reduce((acc, i) => acc + i.total, 0);
        const tax = subtotal * 0.16; // IVA 16%
        const total = subtotal + tax;
        const invoice = await prisma_js_1.prisma.invoice.create({
            data: {
                tenantId: req.user.tenantId,
                patientId: body.data.patientId,
                userId: req.user.sub,
                folio,
                subtotal,
                tax,
                total,
                paymentMethod: body.data.paymentMethod,
                notes: body.data.notes,
                items: { create: itemsData },
            },
            include: { items: true, patient: { include: { owner: true } } },
        });
        return reply.status(201).send(invoice);
    });
    app.patch('/:id/pay', auth, async (req, reply) => {
        const { id } = req.params;
        const body = zod_1.z.object({ paymentMethod: zod_1.z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']) }).safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const existing = await prisma_js_1.prisma.invoice.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existing)
            return reply.status(404).send({ error: 'Factura no encontrada.' });
        const invoice = await prisma_js_1.prisma.invoice.update({
            where: { id },
            data: { status: 'pagada', paidAt: new Date(), paymentMethod: body.data.paymentMethod },
        });
        return reply.send(invoice);
    });
}
// ── USERS ─────────────────────────────────────────────────────
const userSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(['admin', 'veterinario', 'recepcionista']),
    cedulaProf: zod_1.z.string().optional(),
});
async function userRoutes(app) {
    const adminOnly = { preHandler: [app.authenticate] };
    app.get('/', adminOnly, async (req, reply) => {
        const users = await prisma_js_1.prisma.user.findMany({
            where: { tenantId: req.user.tenantId },
            omit: { passwordHash: true },
            orderBy: { fullName: 'asc' },
        });
        return reply.send(users);
    });
    app.post('/', adminOnly, async (req, reply) => {
        if (req.user.role !== 'admin')
            return reply.status(403).send({ error: 'Solo administradores pueden crear usuarios.' });
        const body = userSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { password, ...rest } = body.data;
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma_js_1.prisma.user.create({
            data: { ...rest, passwordHash, tenantId: req.user.tenantId },
            omit: { passwordHash: true },
        });
        return reply.status(201).send(user);
    });
    app.patch('/:id', adminOnly, async (req, reply) => {
        if (req.user.role !== 'admin')
            return reply.status(403).send({ error: 'Solo administradores.' });
        const { id } = req.params;
        const body = userSchema.partial().omit({ password: true }).safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const user = await prisma_js_1.prisma.user.update({
            where: { id },
            data: body.data,
            omit: { passwordHash: true },
        });
        return reply.send(user);
    });
    app.delete('/:id', adminOnly, async (req, reply) => {
        if (req.user.role !== 'admin')
            return reply.status(403).send({ error: 'Solo administradores.' });
        const { id } = req.params;
        if (id === req.user.sub)
            return reply.status(400).send({ error: 'No puedes desactivar tu propia cuenta.' });
        await prisma_js_1.prisma.user.update({ where: { id }, data: { active: false } });
        return reply.status(204).send();
    });
}
// ── DASHBOARD ─────────────────────────────────────────────────
async function dashboardRoutes(app) {
    const auth = { preHandler: [app.authenticate] };
    app.get('/stats', auth, async (req, reply) => {
        const tenantId = req.user.tenantId;
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const [activePatients, todayAppointments, pendingAppointments, monthPrescriptions, todayRevenue, lowStockCount, unresolvedAlerts,] = await Promise.all([
            prisma_js_1.prisma.patient.count({ where: { tenantId, status: 'activo' } }),
            prisma_js_1.prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: startOfDay, lte: endOfDay } } }),
            prisma_js_1.prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: startOfDay, lte: endOfDay }, status: 'pendiente' } }),
            prisma_js_1.prisma.prescription.count({ where: { tenantId, issuedAt: { gte: startOfMonth } } }),
            prisma_js_1.prisma.invoice.aggregate({
                where: { tenantId, status: 'pagada', paidAt: { gte: startOfDay, lte: endOfDay } },
                _sum: { total: true },
            }),
            prisma_js_1.prisma.medication.count({
                where: { tenantId, active: true, stock: { lte: prisma_js_1.prisma.medication.fields.minStock } },
            }),
            prisma_js_1.prisma.systemAlert.count({ where: { tenantId, resolved: false } }),
        ]);
        return reply.send({
            activePatients,
            todayAppointments,
            pendingAppointments,
            monthPrescriptions,
            todayRevenue: todayRevenue._sum.total ?? 0,
            lowStockCount,
            unresolvedAlerts,
        });
    });
}
