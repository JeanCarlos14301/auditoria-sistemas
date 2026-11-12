# AuditA — Sistema de Gestión de Auditorías de Seguridad

Sistema para planificar, ejecutar y cerrar auditorías de seguridad de la información con base en **ISO/IEC 27002:2022** e **ISO 19011:2018**. Calcula el cumplimiento, valida la trazabilidad antes del cierre y registra cada cambio en una bitácora forense encadenada criptográficamente.

| Carpeta | Contenido | Estado |
|---|---|---|
| [backend/](backend/) | API REST (Node.js, TypeScript, Express, PostgreSQL) | Completo · suite QA CP-01 a CP-13 aprobada |
| [frontend/](frontend/) | Interfaz web (React, Vite, `http://localhost:5173`) | En curso · pantallas de trabajo y de revisión y cierre |

- Instalación y arquitectura del backend: [backend/README.md](backend/README.md)
- Contrato de la API para el Frontend: [backend/API.md](backend/API.md)
- Puesta en marcha y reglas del frontend: [frontend/README.md](frontend/README.md)

## Inicio rápido

```bash
cd backend
npm install
cp .env.example .env
npm run db:up
npm run dev          # http://localhost:3000/api
npm run test:qa      # en otra terminal
```

Con la API en marcha, el frontend:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```
