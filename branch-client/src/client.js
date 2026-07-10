const WebSocket = require('ws')
const { loadConfig }    = require('./utils/config')
const { createConnector } = require('./connectors')
const logger = require('./utils/logger')

const config = loadConfig()
let ws = null, syncInterval = null, reconnectTimer = null
let reconnectDelay = 5000
const MAX_DELAY    = 60000
const pendingQueries = new Map()

function connect() {
  logger.info(`Conectando a ${config.serverUrl}...`)
  ws = new WebSocket(config.serverUrl, {
    headers: { 'x-branch-id': config.branchId, 'x-api-key': config.apiKey }
  })
  ws.on('open', onOpen); ws.on('message', onMessage)
  ws.on('close', onClose); ws.on('error', onError)
}

function onOpen() {
  logger.info('✓ Conectado al servidor central')
  reconnectDelay = 5000
  send({
    type: 'REGISTER', branchId: config.branchId, branchName: config.branchName,
    dbType: config.db?.type ?? 'sqlserver',
    version: require('../package.json').version,
    capabilities: ['live_sync', 'historical_query'],
  })
  startLiveSync()
}

function onMessage(raw) {
  let msg; try { msg = JSON.parse(raw) } catch { return }
  switch (msg.type) {
    case 'PING':           send({ type:'PONG', timestamp:Date.now() }); break
    case 'REQUEST_SYNC':   runLiveSync(); break
    case 'UPDATE_INTERVAL':restartLiveSync(msg.intervalSeconds); break
    case 'REQUEST_QUERY':  handleQuery(msg); break
    case 'CANCEL_QUERY':   cancelQuery(msg.queryId); break
  }
}

function onClose(code) {
  logger.warn(`Conexión cerrada [${code}]`); stopLiveSync(); scheduleReconnect()
}
function onError(err) { logger.error(`WebSocket: ${err.message}`) }

// ── Live sync ─────────────────────────────────────────────────────────────────
async function runLiveSync() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  try {
    const connector = createConnector(config)
    const today     = new Date(); today.setHours(0,0,0,0)
    const tomorrow  = new Date(today); tomorrow.setDate(tomorrow.getDate()+1)
    const params    = { dateFrom: today, dateTo: tomorrow }
    const keys      = config.enabledDataTypes ?? Object.keys(config.queries ?? {})
    const data      = await connector.fetchAll(keys, params)
    await connector.close()
    send({ type:'SYNC_DATA', branchId:config.branchId, timestamp:new Date().toISOString(), payload:data })
    logger.info(`↑ Live sync — ${keys.length} tipos de dato`)
  } catch (err) {
    logger.error(`Error sync: ${err.message}`)
    send({ type:'SYNC_ERROR', branchId:config.branchId, error:err.message })
  }
}

function startLiveSync() {
  runLiveSync()
  syncInterval = setInterval(runLiveSync, (config.syncIntervalSeconds ?? 30)*1000)
  logger.info(`Sync cada ${config.syncIntervalSeconds ?? 30}s`)
}
function stopLiveSync()       { if (syncInterval) { clearInterval(syncInterval); syncInterval=null } }
function restartLiveSync(s)   { stopLiveSync(); config.syncIntervalSeconds=s; startLiveSync() }

// ── Historical query ──────────────────────────────────────────────────────────
async function handleQuery(msg) {
  const { queryId, dateFrom, dateTo, dataTypes } = msg
  if (!queryId || !dateFrom || !dateTo) {
    send({ type:'QUERY_ERROR', queryId, error:'Parámetros inválidos' }); return
  }
  if (pendingQueries.has(queryId)) return

  const abortCtrl = { cancelled: false }
  pendingQueries.set(queryId, abortCtrl)
  send({ type:'QUERY_STARTED', queryId, dateFrom, dateTo })

  try {
    const connector = createConnector(config)
    const keys      = dataTypes?.includes('all')
      ? (config.enabledDataTypes ?? Object.keys(config.queries ?? {}))
      : (dataTypes ?? [])
    const params    = { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }
    const data      = await connector.fetchAll(keys, params)
    await connector.close()

    if (abortCtrl.cancelled) return
    send({ type:'QUERY_RESULT', queryId, branchId:config.branchId, dateFrom, dateTo, timestamp:new Date().toISOString(), payload:data })
    logger.info(`↑ Query [${queryId}] completada`)
  } catch (err) {
    if (!abortCtrl.cancelled) {
      logger.error(`Error query [${queryId}]: ${err.message}`)
      send({ type:'QUERY_ERROR', queryId, error:err.message })
    }
  } finally { pendingQueries.delete(queryId) }
}

function cancelQuery(id) {
  const c = pendingQueries.get(id)
  if (c) { c.cancelled=true; pendingQueries.delete(id) }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  logger.info(`Reconectando en ${reconnectDelay/1000}s...`)
  reconnectTimer = setTimeout(() => { reconnectTimer=null; connect() }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay*2, MAX_DELAY)
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

logger.info(`=== Branch Client v${require('../package.json').version} ===`)
logger.info(`Sucursal: ${config.branchName} (${config.branchId})`)
logger.info(`BD: ${config.db?.type ?? 'sqlserver'} — ${config.db?.server}/${config.db?.database}`)
connect()

process.on('SIGTERM', () => { stopLiveSync(); if (ws) ws.close(); process.exit(0) })
process.on('SIGINT',  () => { stopLiveSync(); if (ws) ws.close(); process.exit(0) })
