const { loadConfig } = require('./supabase')
const logger = require('./logger')
let branchMap = new Map()
let queryMap  = {}  // { dataTypeKey: querySql }

async function initialize() {
  const c = await loadConfig()
  branchMap = c.branchMap
  queryMap  = c.queryMap
  logger.info('ConfigStore inicializado')
}

async function reload() {
  try {
    const c = await loadConfig()
    branchMap = c.branchMap
    queryMap  = c.queryMap
    logger.info('ConfigStore recargado')
  } catch (err) {
    logger.error(`Error recargando config: ${err.message}`)
  }
}

const getBranch      = id       => branchMap.get(id) ?? null
const validateApiKey = (id, key) => { const b = branchMap.get(id); return b?.apiKey === key }
const getAllBranches  = ()       => Array.from(branchMap.values())

// v2: queryMap es plano { key: sql } — sin distinción de pos_system
const getQuery = (key) => queryMap[key] ?? null
const getAllQueries = () => ({ ...queryMap })

module.exports = { initialize, reload, getBranch, validateApiKey, getQuery, getAllQueries, getAllBranches }
