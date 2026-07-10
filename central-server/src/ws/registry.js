const { WebSocket } = require('ws')
const branches = new Map()

const register      = (id, meta, ws) => branches.set(id, { ...meta, branchId:id, connectedAt:new Date(), lastSyncAt:null, ws, liveData:null })
const unregister    = id  => branches.delete(id)
const get           = id  => branches.get(id) ?? null
const getAll        = ()  => Array.from(branches.values())
const isConnected   = id  => branches.has(id)

function updateLiveData(id, data) {
  const b = branches.get(id); if (!b) return
  b.liveData = data; b.lastSyncAt = new Date()
}

function send(id, msg) {
  const b = branches.get(id); if (!b) return false
  if (b.ws.readyState !== WebSocket.OPEN) return false
  b.ws.send(JSON.stringify(msg)); return true
}

function getSummary() {
  return Array.from(branches.values()).map(b => ({
    branchId: b.branchId, branchName: b.branchName, posSystem: b.posSystem,
    version: b.version, connectedAt: b.connectedAt, lastSyncAt: b.lastSyncAt,
    hasLiveData: b.liveData !== null, liveData: b.liveData,
  }))
}

module.exports = { register, unregister, get, getAll, isConnected, updateLiveData, send, getSummary }
