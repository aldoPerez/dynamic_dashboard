const configStore = require('../utils/configStore')
const logger      = require('../utils/logger')

function registerWebhook(fastify) {
  fastify.post('/webhooks/supabase', async (req, reply) => {
    const secret    = process.env.WEBHOOK_SECRET
    const signature = req.headers['x-webhook-secret']
    if (!secret || signature !== secret) { logger.warn('Webhook rechazado'); return reply.code(401).send({ error:'Unauthorized' }) }
    logger.info(`Webhook recibido: ${req.body?.table} ${req.body?.type}`)
    await configStore.reload()
    return { ok: true }
  })
}

module.exports = { registerWebhook }
