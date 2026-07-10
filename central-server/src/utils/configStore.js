const { loadConfig } = require('./supabase')
const logger = require('./logger')
let branchMap = new Map()
let queryMap  = {}

async function initialize() {
  const c = await loadConfig(); branchMap = c.branchMap; queryMap = c.queryMap
  logger.info('ConfigStore inicializado')
}
async function reload() {
  try { const c = await loadConfig(); branchMap = c.branchMap; queryMap = c.queryMap; logger.info('ConfigStore recargado') }
  catch (err) { logger.error(`Error recargando config: ${err.message}`) }
}
const getBranch       = id  => branchMap.get(id) ?? null
const validateApiKey  = (id, key) => { const b = branchMap.get(id); return b?.apiKey === key }
const getQuery        = (pos, key) => queryMap[pos]?.[key] ?? null
const getAllBranches   = ()  => Array.from(branchMap.values())
module.exports = { initialize, reload, getBranch, validateApiKey, getQuery, getAllBranches }
