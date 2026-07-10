const registry = require('../ws/registry')
const queryManager = require('../ws/queryManager')
const configStore = require('../utils/configStore')
const auth = require('../utils/auth')
const logger = require('../utils/logger')

function registerRoutes(fastify) {
  fastify.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return
    const key = req.headers['x-api-key'] || req.query?.key
    if (!key || key !== process.env.DASHBOARD_KEY)
      reply.code(401).send({ error: 'No autorizado' })
  })

  // Estado de todas las conexiones
  fastify.get('/api/branches', async () => ({ branches: registry.getSummary() }))

  // Datos live del último sync
  fastify.get('/api/live', async (req, reply) => {
    const { branchId } = req.query
    if (branchId) {
      const b = registry.get(branchId)
      if (!b) return reply.code(404).send({ error: `${branchId} no conectada` })
      return { branchId, data: b.liveData }
    }
    return {
      branches: registry.getAll().map(b => ({
        branchId: b.branchId, branchName: b.branchName,
        lastSyncAt: b.lastSyncAt, data: b.liveData,
      }))
    }
  })

  // Query histórica via SSE
  fastify.get('/api/query', async (req, reply) => {
    const { dateFrom, dateTo } = req.query
    if (!dateFrom || !dateTo)
      return reply.code(400).send({ error: 'Se requieren dateFrom y dateTo' })

    const dataTypes = req.query.dataTypes
      ? req.query.dataTypes.split(',').map(s => s.trim())
      : ['all']

    const branchIds = req.query.branchId
      ? req.query.branchId.split(',').map(s => s.trim())
      : registry.getAll().map(b => b.branchId)

    const connected = branchIds.filter(id => registry.isConnected(id))
    const disconnected = branchIds.filter(id => !registry.isConnected(id))

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || '*',  // ← agregar
    })

    const sse = (event, data) =>
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    for (const id of disconnected)
      sse('branch_error', { branchId: id, error: 'Sucursal no conectada' })

    if (connected.length === 0) {
      sse('done', { message: 'Ninguna sucursal disponible' })
      reply.raw.end()
      return reply
    }

    const queryId = queryManager.create({
      branchIds: connected,
      onData(branchId, data) {
        const b = registry.get(branchId)
        sse('branch_data', {
          branchId, branchName: b?.branchName ?? branchId,
          dateFrom, dateTo, data,
        })
      },
      onError(branchId, error) { sse('branch_error', { branchId, error }) },
      onComplete() {
        sse('done', {
          queriedBranches: connected.length,
          disconnectedBranches: disconnected.length,
        })
        reply.raw.end()
      },
    })

    for (const id of connected)
      registry.send(id, { type: 'REQUEST_QUERY', queryId, dateFrom, dateTo, dataTypes })

    req.raw.on('close', () => {
      const q = queryManager.get(queryId)
      if (q) {
        for (const id of q.pending)
          registry.send(id, { type: 'CANCEL_QUERY', queryId })
        queryManager.cleanup(queryId)
      }
    })

    return reply
  })

  // Forzar sync de una sucursal
  fastify.post('/api/branches/:branchId/sync', async (req, reply) => {
    const { branchId } = req.params
    if (!registry.isConnected(branchId))
      return reply.code(404).send({ error: `${branchId} no conectada` })
    registry.send(branchId, { type: 'REQUEST_SYNC' })
    return { ok: true }
  })
}

module.exports = { registerRoutes }
