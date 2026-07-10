const fastify = require('fastify')({ logger: false })
const configStore = require('./utils/configStore')
const { registerWebSocket } = require('./ws/wsServer')
const { registerRoutes } = require('./api/routes')
const { registerWebhook } = require('./api/webhook')
const { registerPackageRoute, registerTestDbRoute } = require('./api/packageRoute')
const { registerConnectionsRoute } = require('./api/connectionsRoute')
const logger = require('./utils/logger')
const config = require('./utils/config')

async function start() {
  await configStore.initialize()
  await fastify.register(require('@fastify/cors'), {
    origin: (origin, cb) => {
      // Permitir requests sin origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true)
      const allowed = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim())
      if (allowed.includes(origin)) return cb(null, true)
      cb(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
    credentials: false,
  })
  await fastify.register(require('@fastify/websocket'))
  registerWebSocket(fastify)
  registerRoutes(fastify)
  registerWebhook(fastify)
  registerPackageRoute(fastify)
  registerTestDbRoute(fastify)
  registerConnectionsRoute(fastify)
  fastify.get('/health', async () => ({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }))
  await fastify.listen({ port: config.port, host: '0.0.0.0' })
  logger.info(`Servidor central en puerto ${config.port}`)
}

start().catch(err => { console.error('Error fatal:', err.message); process.exit(1) })
