const registry = require('../ws/registry')
const logger = require('../utils/logger')
const sseClients = new Set()

function registerConnectionsRoute(fastify) {
  fastify.get('/api/connections', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || '*',  // ← agregar
    })
    const client = { res: reply.raw }
    sseClients.add(client)
    sendToClient(client, 'snapshot', registry.getSummary())
    const ping = setInterval(() => sendToClient(client, 'ping', { ts: Date.now() }), 30_000)
    const snapshot = setInterval(() => sendToClient(client, 'snapshot', registry.getSummary()), 5_000)
    req.raw.on('close', () => { sseClients.delete(client); clearInterval(ping); clearInterval(snapshot) })
    return reply
  })
}

function broadcastConnection(event, data) {
  for (const c of sseClients) sendToClient(c, event, data)
}

function sendToClient(client, event, data) {
  try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch { }
}

module.exports = { registerConnectionsRoute, broadcastConnection }
