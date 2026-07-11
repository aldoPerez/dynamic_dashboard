const registry = require('./registry')
const queryManager = require('./queryManager')
const auth = require('../utils/auth')
const logger = require('../utils/logger')
const { broadcastConnection } = require('../api/connectionsRoute')

function registerWebSocket(fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    // En @fastify/websocket el socket real es connection.socket
    const socket = connection.socket

    const branchId = req.headers['x-branch-id']
    const apiKey = req.headers['x-api-key']

    if (!auth.validate(branchId, apiKey)) {
      socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH_FAILED', message: 'API key inválida' }))
      socket.close()
      return
    }

    socket.on('message', raw => handleMessage(socket, raw.toString()))
    socket.on('close', () => handleClose(branchId))
    socket.on('error', err => logger.error(`WS [${branchId}]: ${err.message}`))

    // Ping cada 30s para mantener conexión viva
    const ping = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }))
      }
    }, 30_000)

    socket.on('close', () => clearInterval(ping))
  })
}

function handleMessage(socket, raw) {
  let msg
  try { msg = JSON.parse(raw) } catch { return }

  switch (msg.type) {
    case 'REGISTER':
      registry.register(msg.branchId, {
        branchName: msg.branchName,
        dbType: msg.dbType,
        version: msg.version,
        capabilities: msg.capabilities || [],
      }, socket)
      socket.send(JSON.stringify({ type: 'REGISTERED', message: `Bienvenido ${msg.branchName}` }))
      logger.info(`Registrada: ${msg.branchName} (${msg.branchId})`)
      broadcastConnection('connected', {
        branchId: msg.branchId,
        branchName: msg.branchName,
        dbType: msg.dbType,
        connectedAt: new Date().toISOString(),
      })
      break

    case 'SYNC_DATA':
      registry.updateLiveData(msg.branchId, msg.payload)
      socket.send(JSON.stringify({ type: 'ACK', ref: 'SYNC_DATA' }))
      break

    case 'SYNC_ERROR':
      logger.warn(`Sync error [${msg.branchId}]: ${msg.error}`)
      break

    case 'QUERY_RESULT':
      logger.info(`QUERY_RESULT de ${msg.branchId}: ${JSON.stringify(msg.payload).slice(0, 200)}`)
      queryManager.receiveResult(msg.queryId, msg.branchId, msg.payload)
      break

    case 'QUERY_ERROR':
      queryManager.receiveError(msg.queryId, msg.branchId, msg.error)
      break

    case 'PONG':
      break

    default:
      logger.warn(`Mensaje desconocido: ${msg.type}`)
  }
}

function handleClose(branchId) {
  const b = registry.get(branchId)
  registry.unregister(branchId)
  logger.info(`Desconectada: ${branchId}`)
  broadcastConnection('disconnected', {
    branchId,
    branchName: b?.branchName ?? branchId,
    disconnectedAt: new Date().toISOString(),
  })
}

module.exports = { registerWebSocket }
