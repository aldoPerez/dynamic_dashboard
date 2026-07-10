const crypto = require('crypto')
const ALGO = 'aes-256-gcm'
function getKey() {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY no definida')
  return Buffer.from(raw.padEnd(32,'0').slice(0,32))
}
function decrypt(b64) {
  const key      = getKey()
  const combined = Buffer.from(b64, 'base64')
  const iv       = combined.slice(0,12)
  const authTag  = combined.slice(combined.length - 16)
  const cipher   = combined.slice(12, combined.length - 16)
  const d = crypto.createDecipheriv(ALGO, key, iv)
  d.setAuthTag(authTag)
  return Buffer.concat([d.update(cipher), d.final()]).toString('utf8')
}
function encrypt(plaintext) {
  const key = getKey(); const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([c.update(plaintext,'utf8'), c.final()])
  return Buffer.concat([iv, enc, c.getAuthTag()]).toString('base64')
}
module.exports = { encrypt, decrypt }
