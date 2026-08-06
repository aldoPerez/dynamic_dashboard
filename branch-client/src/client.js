const { Worker } = require('worker_threads')
const path   = require('path')
const logger = require('./utils/logger')
const { loadConfig } = require('./utils/config')

const config  = loadConfig()
const version = require('../package.json').version

logger.info(`=== Branch Client v${version} ===`)
logger.info(`Sucursal: ${config.branchName} (${config.branchId})`)
logger.info(`BD: ${config.db?.type ?? 'sqlserver'} — ${config.db?.server}/${config.db?.database}`)

// Enriquecer config con versión para que el worker la tenga disponible
config.version = version

// ── Lanzar worker en hilo secundario ─────────────────────────────────────────
const workerPath = path.join(__dirname, 'worker.js')

function startWorker() {
  const worker = new Worker(workerPath, { workerData: { config } })

  worker.on('message', msg => {
    if (msg.type === 'READY') {
      logger.info('Worker listo — conexión establecida')
    }
  })

  worker.on('error', err => {
    logger.error(`Worker error: ${err.message}`)
  })

  worker.on('exit', code => {
    if (code !== 0) {
      logger.warn(`Worker terminó con código ${code} — reiniciando en 5s...`)
      setTimeout(startWorker, 5000)
    } else {
      logger.info('Worker terminó correctamente')
    }
  })

  // Reenviar señales de cierre al worker
  process.on('SIGTERM', () => {
    logger.info('SIGTERM recibido — cerrando worker...')
    worker.postMessage({ type: 'SHUTDOWN' })
  })
  process.on('SIGINT', () => {
    logger.info('SIGINT recibido — cerrando worker...')
    worker.postMessage({ type: 'SHUTDOWN' })
  })

  return worker
}

// El hilo principal solo lanza el worker y queda vivo
// Esto permite que el Service Control Manager de Windows
// reciba la respuesta de "proceso iniciado" inmediatamente,
// sin esperar a que se establezca la conexión WebSocket
startWorker()

logger.info('Hilo principal listo — worker iniciado en segundo plano')
