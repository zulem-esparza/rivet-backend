# RiVet Backend API

Backend REST para el sistema de gestión veterinaria RiVet.
Stack: **Node.js 20 + Fastify 4 + Prisma 5 + PostgreSQL 16 + TypeScript**

---

## Requisitos

- Node.js >= 20
- PostgreSQL >= 14 corriendo localmente o en la nube

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env
# → Edita .env con tu DATABASE_URL y JWT_SECRET

# 3. Generar el cliente Prisma
npm run db:generate

# 4. Crear las tablas en la base de datos
npm run db:migrate

# 5. (Opcional) Insertar datos de prueba
npm run db:seed

# 6. Arrancar en modo desarrollo
npm run dev
```

El servidor arranca en `http://localhost:3000`

---

## Variables de entorno (.env)

| Variable          | Descripción                                         |
|-------------------|-----------------------------------------------------|
| `DATABASE_URL`    | Conexión PostgreSQL (postgresql://user:pass@host/db)|
| `JWT_SECRET`      | Secreto para firmar tokens JWT (mín. 32 caracteres) |
| `JWT_EXPIRES_IN`  | Expiración del token (default: `7d`)                |
| `PORT`            | Puerto del servidor (default: `3000`)               |
| `ALLOWED_ORIGINS` | CORS — orígenes permitidos separados por coma       |

---

## Endpoints

### Auth
| Método | Ruta                  | Descripción                        | Auth |
|--------|-----------------------|------------------------------------|------|
| POST   | `/api/auth/register`  | Crear tenant + usuario admin       | ❌   |
| POST   | `/api/auth/login`     | Iniciar sesión, retorna JWT        | ❌   |
| GET    | `/api/auth/me`        | Info del usuario autenticado       | ✅   |

### Dashboard
| Método | Ruta                    | Descripción                     | Auth |
|--------|-------------------------|---------------------------------|------|
| GET    | `/api/dashboard/stats`  | KPIs: pacientes, citas, ingresos| ✅   |

### Pacientes
| Método | Ruta                  | Descripción                              | Auth |
|--------|-----------------------|------------------------------------------|------|
| GET    | `/api/patients`       | Lista con búsqueda y paginación          | ✅   |
| GET    | `/api/patients/:id`   | Detalle + historial + recetas            | ✅   |
| POST   | `/api/patients`       | Crear paciente                           | ✅   |
| PATCH  | `/api/patients/:id`   | Actualizar paciente                      | ✅   |
| DELETE | `/api/patients/:id`   | Archivar paciente (soft delete)          | ✅   |

### Propietarios
| Método | Ruta              | Descripción          | Auth |
|--------|-------------------|----------------------|------|
| GET    | `/api/owners`     | Lista de propietarios| ✅   |
| GET    | `/api/owners/:id` | Detalle + mascotas   | ✅   |
| POST   | `/api/owners`     | Crear propietario    | ✅   |
| PATCH  | `/api/owners/:id` | Actualizar           | ✅   |

### Citas
| Método | Ruta                        | Descripción                   | Auth |
|--------|-----------------------------|-------------------------------|------|
| GET    | `/api/appointments`         | Lista filtrable por fecha/estado| ✅  |
| GET    | `/api/appointments/today`   | Citas del día (dashboard)     | ✅   |
| GET    | `/api/appointments/:id`     | Detalle de cita               | ✅   |
| POST   | `/api/appointments`         | Crear cita                    | ✅   |
| PATCH  | `/api/appointments/:id`     | Actualizar estado o datos     | ✅   |
| DELETE | `/api/appointments/:id`     | Cancelar cita                 | ✅   |

### Historial Clínico
| Método | Ruta                                    | Descripción             | Auth |
|--------|-----------------------------------------|-------------------------|------|
| GET    | `/api/clinical-records/patient/:id`     | Historial de un paciente| ✅   |
| POST   | `/api/clinical-records`                 | Registrar consulta      | ✅   |

### Recetas
| Método | Ruta                               | Descripción              | Auth |
|--------|------------------------------------|--------------------------|------|
| GET    | `/api/prescriptions/patient/:id`   | Recetas de un paciente   | ✅   |
| GET    | `/api/prescriptions/:id`           | Detalle de receta        | ✅   |
| POST   | `/api/prescriptions`               | Crear receta             | ✅   |

### Inventario
| Método | Ruta                             | Descripción                       | Auth |
|--------|----------------------------------|-----------------------------------|------|
| GET    | `/api/inventory`                 | Lista de medicamentos             | ✅   |
| GET    | `/api/inventory/alerts`          | Stock bajo + próximos a vencer    | ✅   |
| GET    | `/api/inventory/:id`             | Detalle + movimientos             | ✅   |
| POST   | `/api/inventory`                 | Agregar medicamento               | ✅   |
| PATCH  | `/api/inventory/:id`             | Actualizar datos                  | ✅   |
| POST   | `/api/inventory/:id/movements`   | Registrar entrada/salida de stock | ✅   |
| DELETE | `/api/inventory/:id`             | Desactivar medicamento            | ✅   |

### Facturación
| Método | Ruta                      | Descripción              | Auth |
|--------|---------------------------|--------------------------|------|
| GET    | `/api/invoices`           | Lista de facturas        | ✅   |
| POST   | `/api/invoices`           | Crear factura            | ✅   |
| PATCH  | `/api/invoices/:id/pay`   | Marcar como pagada       | ✅   |

### Usuarios
| Método | Ruta               | Descripción                   | Auth  |
|--------|--------------------|-------------------------------|-------|
| GET    | `/api/users`       | Lista de usuarios del tenant  | ✅    |
| POST   | `/api/users`       | Crear usuario (solo admin)    | Admin |
| PATCH  | `/api/users/:id`   | Editar usuario                | Admin |
| DELETE | `/api/users/:id`   | Desactivar usuario            | Admin |

---

## Ejemplo de uso

```bash
# 1. Registrar la clínica
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Clínica Huellitas",
    "fullName": "Dr. Alejandro Ramírez",
    "email": "admin@huellitas.mx",
    "password": "secreto123"
  }'

# 2. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@huellitas.mx", "password": "secreto123" }'

# 3. Usar el token en siguientes peticiones
export TOKEN="<token_del_login>"

# 4. Ver stats del dashboard
curl http://localhost:3000/api/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"

# 5. Crear un propietario
curl -X POST http://localhost:3000/api/owners \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "fullName": "Ana García", "phone": "(656) 123-4567" }'

# 6. Crear un paciente
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "<id_del_owner>",
    "name": "Luna",
    "species": "canino",
    "breed": "Golden Retriever",
    "sex": "hembra",
    "weightKg": 28
  }'
```

---

## Estructura del proyecto

```
rivet-backend/
├── prisma/
│   └── schema.prisma        # Modelos de la base de datos
├── src/
│   ├── routes/
│   │   ├── auth.ts          # Login, registro, /me
│   │   ├── patients.ts      # CRUD pacientes
│   │   ├── appointments.ts  # CRUD citas
│   │   ├── inventory.ts     # Medicamentos + movimientos
│   │   └── index.ts         # Owners, historial, recetas, facturas, usuarios, dashboard
│   ├── middlewares/
│   │   └── auth.ts          # JWT + roles
│   ├── utils/
│   │   └── prisma.ts        # Cliente Prisma singleton
│   ├── types/
│   │   └── index.ts         # Tipos globales TypeScript
│   └── server.ts            # Entry point
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Scripts

| Comando             | Descripción                              |
|---------------------|------------------------------------------|
| `npm run dev`       | Servidor con hot-reload (desarrollo)     |
| `npm run build`     | Compilar TypeScript a JavaScript         |
| `npm run start`     | Ejecutar build de producción             |
| `npm run db:migrate`| Aplicar migraciones a la base de datos   |
| `npm run db:generate`| Regenerar cliente Prisma               |
| `npm run db:studio` | Abrir Prisma Studio (GUI de la BD)       |
