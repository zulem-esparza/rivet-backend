import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Insertando datos de prueba...')

  // ── Tenant ────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Clínica Veterinaria Huellitas',
      address: 'Blvd. Teófilo Borunda 1450, Col. Partido Romero, Cd. Juárez, Chih.',
      phone: '(656) 800-1234',
      email: 'contacto@huellitas.mx',
      plan: 'pro',
      rfc: 'CVH800101XX1',
    },
  })
  console.log('✓ Tenant creado:', tenant.name)

  // ── Usuarios ──────────────────────────────────────────────
  const hash = await bcrypt.hash('Rivet2026!', 12)

  const userAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@huellitas.mx' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'Dr. Alejandro Ramírez',
      email: 'admin@huellitas.mx',
      passwordHash: hash,
      role: 'admin',
      cedulaProf: '4891234',
    },
  })

  const userVet = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 's.medina@huellitas.mx' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'Dra. Sofía Medina',
      email: 's.medina@huellitas.mx',
      passwordHash: hash,
      role: 'veterinario',
      cedulaProf: '7812345',
    },
  })

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'l.fuentes@huellitas.mx' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'Lucía Fuentes',
      email: 'l.fuentes@huellitas.mx',
      passwordHash: hash,
      role: 'recepcionista',
    },
  })
  console.log('✓ Usuarios creados (3)')

  // ── Propietarios ──────────────────────────────────────────
  const owners = await Promise.all([
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'Ana García', phone: '(656) 123-4567', email: 'ana.garcia@mail.com', curp: 'GAAA850315MCHRNN01' } }),
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'Carlos López', phone: '(656) 234-5678', email: 'carlos.lopez@mail.com' } }),
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'Pedro Martínez', phone: '(656) 345-6789', email: 'pedro.martinez@mail.com' } }),
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'María Soto', phone: '(656) 456-7890', email: 'maria.soto@mail.com' } }),
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'Jorge Hernández', phone: '(656) 567-8901', email: 'jorge.hernandez@mail.com' } }),
    prisma.owner.create({ data: { tenantId: tenant.id, fullName: 'Luis Torres', phone: '(656) 678-9012', email: 'luis.torres@mail.com' } }),
  ])
  console.log('✓ Propietarios creados:', owners.length)

  // ── Pacientes ─────────────────────────────────────────────
  const patients = await Promise.all([
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[0].id, name: 'Luna', species: 'canino', breed: 'Golden Retriever', birthDate: new Date('2023-03-15'), sex: 'hembra', sterilized: true, weightKg: 28, status: 'activo' } }),
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[1].id, name: 'Michi', species: 'felino', breed: 'Siamés', birthDate: new Date('2021-07-20'), sex: 'macho', sterilized: false, weightKg: 4.2, status: 'seguimiento' } }),
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[2].id, name: 'Rocky', species: 'canino', breed: 'Labrador', birthDate: new Date('2024-01-10'), sex: 'macho', sterilized: false, weightKg: 22, status: 'control' } }),
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[3].id, name: 'Perico', species: 'ave', breed: 'Guacamayo', birthDate: new Date('2022-05-05'), sex: 'macho', sterilized: false, weightKg: 0.9, status: 'activo' } }),
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[4].id, name: 'Nala', species: 'felino', breed: 'Persa', birthDate: new Date('2020-11-08'), sex: 'hembra', sterilized: true, weightKg: 3.8, status: 'activo' } }),
    prisma.patient.create({ data: { tenantId: tenant.id, ownerId: owners[5].id, name: 'Coco', species: 'canino', breed: 'Poodle', birthDate: new Date('2025-02-14'), sex: 'macho', sterilized: false, weightKg: 6, status: 'activo' } }),
  ])
  console.log('✓ Pacientes creados:', patients.length)

  // ── Citas de hoy ─────────────────────────────────────────
  const today = new Date()
  const makeTime = (h: number, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m)

  await Promise.all([
    prisma.appointment.create({ data: { tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id, scheduledAt: makeTime(9), type: 'vacunacion', status: 'confirmada', notes: 'Vacunación anual polivalente' } }),
    prisma.appointment.create({ data: { tenantId: tenant.id, patientId: patients[1].id, userId: userAdmin.id, scheduledAt: makeTime(10, 30), type: 'control', status: 'en_espera', notes: 'Control post-cirugía' } }),
    prisma.appointment.create({ data: { tenantId: tenant.id, patientId: patients[2].id, userId: userVet.id, scheduledAt: makeTime(11, 45), type: 'consulta_general', status: 'confirmada', notes: 'Revisión general' } }),
    prisma.appointment.create({ data: { tenantId: tenant.id, patientId: patients[4].id, userId: userAdmin.id, scheduledAt: makeTime(14), type: 'urgencia', status: 'urgente', notes: 'Vómito persistente' } }),
    prisma.appointment.create({ data: { tenantId: tenant.id, patientId: patients[5].id, userId: userVet.id, scheduledAt: makeTime(15, 30), type: 'desparasitacion', status: 'pendiente' } }),
  ])
  console.log('✓ Citas de hoy creadas (5)')

  // ── Historial clínico ─────────────────────────────────────
  const record1 = await prisma.clinicalRecord.create({
    data: {
      tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id,
      visitDate: new Date('2026-05-11'), type: 'vacunacion',
      reason: 'Vacunación anual', diagnosis: 'Paciente sano',
      temperature: 38.5, weightKg: 28,
      notes: 'Sin reacciones adversas inmediatas.',
      vaccinations: { create: [{ vaccineName: 'Polivalente DA2PPV+L4', lotNumber: 'MSD-2026-04', nextDoseDate: new Date('2027-05-11') }] },
    },
  })

  await prisma.clinicalRecord.create({
    data: {
      tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id,
      visitDate: new Date('2026-02-10'), type: 'consulta',
      reason: 'Otitis externa leve', diagnosis: 'Otitis bacteriana OD',
      temperature: 38.5, weightKg: 27.8,
      treatment: 'Otomax gotas 5 gotas c/12h x 7 días. Limpieza auricular.',
    },
  })

  await prisma.clinicalRecord.create({
    data: {
      tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id,
      visitDate: new Date('2025-09-14'), type: 'cirugia',
      reason: 'Esterilización electiva', diagnosis: 'Ovariohisterectomía',
      treatment: 'Anestesia inhalada Isoflurano. Duración: 45 min. Sin complicaciones.',
      notes: 'Alta 4h post-procedimiento.',
    },
  })
  console.log('✓ Historial clínico creado')

  // ── Receta ────────────────────────────────────────────────
  await prisma.prescription.create({
    data: {
      tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id,
      folio: 'RX-2026-0001', issuedAt: new Date('2026-05-11'),
      diagnosis: 'Infección bacteriana leve',
      generalNotes: 'Reposo relativo. Control en 7 días.',
      items: {
        create: [
          { medicationName: 'Amoxicilina + Ácido Clavulánico 500/125 mg', dose: '500mg', frequency: 'Cada 12 horas', durationDays: 7, route: 'oral', instructions: 'Administrar con alimento.', sortOrder: 0 },
          { medicationName: 'Meloxicam 1.5 mg/mL', dose: '1.87 mL', frequency: 'Una vez al día', durationDays: 3, route: 'oral', instructions: 'Administrar preferentemente con comida.', sortOrder: 1 },
        ],
      },
    },
  })
  console.log('✓ Receta creada')

  // ── Consentimiento ────────────────────────────────────────
  await prisma.consentForm.create({
    data: {
      tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id,
      folio: 'CI-2026-0001', type: 'quirurgico',
      procedureDesc: 'Ovariohisterectomía electiva (esterilización)',
      status: 'firmado', signedAt: new Date('2025-09-14'),
    },
  })
  console.log('✓ Consentimiento creado')

  // ── Medicamentos ──────────────────────────────────────────
  const meds = await Promise.all([
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Amoxicilina 500mg', category: 'antibiotico', presentation: 'Cápsula', stock: 2, minStock: 15, unitPrice: 12.5, expirationDate: new Date('2026-08-30'), lotNumber: 'AMX-2024-01' } }),
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Meloxicam 1.5mg/mL', category: 'antiinflamatorio', presentation: 'Solución oral', stock: 7, minStock: 20, unitPrice: 85, expirationDate: new Date('2026-12-15'), lotNumber: 'MLX-2024-03' } }),
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Ketamina 10% 20mL', category: 'anestesico', presentation: 'Ampolleta', stock: 4, minStock: 10, unitPrice: 320, expirationDate: new Date('2026-05-20'), lotNumber: 'K-2023', controlled: true } }),
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Vacuna Polivalente DA2PPV', category: 'biologico', presentation: 'Frasco liofilizado', stock: 24, minStock: 10, unitPrice: 180, expirationDate: new Date('2027-03-01'), lotNumber: 'MSD-2026-04' } }),
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Isoflurano 250mL', category: 'anestesico_inhalado', presentation: 'Frasco', stock: 3, minStock: 2, unitPrice: 1200, expirationDate: new Date('2026-11-10'), controlled: true } }),
    prisma.medication.create({ data: { tenantId: tenant.id, name: 'Enrofloxacina 150mg', category: 'antibiotico', presentation: 'Tableta', stock: 35, minStock: 15, unitPrice: 18, expirationDate: new Date('2026-09-20') } }),
  ])
  console.log('✓ Medicamentos creados:', meds.length)

  // ── Alertas de stock ──────────────────────────────────────
  await Promise.all([
    prisma.systemAlert.create({ data: { tenantId: tenant.id, type: 'stock_bajo', severity: 'danger', title: 'Stock crítico: Amoxicilina 500mg', body: 'Quedan 2 unidades. Mínimo: 15.', referenceId: meds[0].id } }),
    prisma.systemAlert.create({ data: { tenantId: tenant.id, type: 'stock_bajo', severity: 'warning', title: 'Stock bajo: Meloxicam 1.5mg/mL', body: 'Quedan 7 unidades. Mínimo: 20.', referenceId: meds[1].id } }),
    prisma.systemAlert.create({ data: { tenantId: tenant.id, type: 'vencimiento', severity: 'warning', title: 'Ketamina 10% — vence el 20 May', body: 'Revisar lote #K-2023. Próximo a vencer.', referenceId: meds[2].id } }),
    prisma.systemAlert.create({ data: { tenantId: tenant.id, type: 'vacuna_proxima', severity: 'warning', title: 'Vacuna de Luna vence en 3 días', body: 'Recordatorio pendiente para Ana García.' } }),
    prisma.systemAlert.create({ data: { tenantId: tenant.id, type: 'control_pendiente', severity: 'info', title: 'Rocky — control post-cirugía pendiente', body: 'No ha regresado a control (3 semanas).' } }),
  ])
  console.log('✓ Alertas del sistema creadas')

  // ── Facturas ──────────────────────────────────────────────
  await Promise.all([
    prisma.invoice.create({ data: { tenantId: tenant.id, patientId: patients[0].id, userId: userAdmin.id, folio: 'F-2026-0001', status: 'pagada', subtotal: 733, tax: 117, total: 850, paymentMethod: 'tarjeta', issuedAt: new Date('2026-05-11'), paidAt: new Date('2026-05-11'), items: { create: [{ description: 'Consulta + Vacunación anual', quantity: 1, unitPrice: 650, total: 650, sortOrder: 0 }, { description: 'Vacuna Polivalente DA2PPV', quantity: 1, unitPrice: 83, total: 83, sortOrder: 1 }] } } }),
    prisma.invoice.create({ data: { tenantId: tenant.id, patientId: patients[1].id, userId: userAdmin.id, folio: 'F-2026-0002', status: 'pendiente', subtotal: 345, tax: 55, total: 400, issuedAt: new Date('2026-05-10'), items: { create: [{ description: 'Control post-cirugía', quantity: 1, unitPrice: 345, total: 345, sortOrder: 0 }] } } }),
    prisma.invoice.create({ data: { tenantId: tenant.id, patientId: patients[2].id, userId: userVet.id, folio: 'F-2026-0003', status: 'pagada', subtotal: 302, tax: 48, total: 350, paymentMethod: 'efectivo', issuedAt: new Date('2026-05-08'), paidAt: new Date('2026-05-08'), items: { create: [{ description: 'Consulta general', quantity: 1, unitPrice: 302, total: 302, sortOrder: 0 }] } } }),
    prisma.invoice.create({ data: { tenantId: tenant.id, patientId: patients[4].id, userId: userAdmin.id, folio: 'F-2026-0004', status: 'pendiente', subtotal: 1552, tax: 248, total: 1800, issuedAt: new Date('2026-05-05'), items: { create: [{ description: 'Urgencias + Hospitalización 24h', quantity: 1, unitPrice: 1552, total: 1552, sortOrder: 0 }] } } }),
  ])
  console.log('✓ Facturas creadas')

  console.log('')
  console.log('🎉 Seed completado exitosamente.')
  console.log('   Email:    admin@huellitas.mx')
  console.log('   Password: Rivet2026!')
}

main()
  .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
