# Sistema de Ventas en Tiempo Real

## Estructura

```
admin-panel/      React + Vite  (Vercel)
central-server/   Node.js + WebSocket  (Railway)
branch-client/    Ejecutable Windows  (sucursales)
supabase/         Schema SQL
```

## Setup

1. Ejecutar `supabase/schema.sql` en Supabase SQL Editor
2. Configurar variables de entorno en cada proyecto
3. Deploy: admin-panel → Vercel | central-server → Railway
4. Compilar branch-client: `npm run build:win` en la carpeta branch-client

## Variables de entorno

Cada proyecto tiene su propio `.env.example` con la documentación de cada variable.
