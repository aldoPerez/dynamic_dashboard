const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const TIMEOUT = 60_000
const queries = new Map()

function create({ branchIds, onData, onComplete, onError }) {
  const queryId = uuidv4()
  const timeoutId = setTimeout(() => {
    const q = queries.get(queryId); if (!q) return
    for (const id of q.pending) { onError(id, 'Timeout: la sucursal no respondió en 60s') }
    cleanup(queryId); onComplete()
  }, TIMEOUT)
  queries.set(queryId, { queryId, branchIds, pending: new Set(branchIds), results: new Map(), errors: new Map(), onData, onComplete, onError, timeoutId })
  logger.debug(`Query creada [${queryId}]`)
  return queryId
}

function receiveResult(queryId, branchId, data) {
  const q = queries.get(queryId); if (!q) return
  q.results.set(branchId, data); q.pending.delete(branchId)
  try { q.onData(branchId, data) } catch {}
  if (q.pending.size === 0) { clearTimeout(q.timeoutId); cleanup(queryId); try { q.onComplete() } catch {} }
}

function receiveError(queryId, branchId, msg) {
  const q = queries.get(queryId); if (!q) return
  q.errors.set(branchId, msg); q.pending.delete(branchId)
  try { q.onError(branchId, msg) } catch {}
  if (q.pending.size === 0) { clearTimeout(q.timeoutId); cleanup(queryId); try { q.onComplete() } catch {} }
}

const cleanup = id => queries.delete(id)
const get     = id => queries.get(id) ?? null
module.exports = { create, receiveResult, receiveError, get, cleanup }
