const fs   = require('fs')
const path = require('path')
const logDir  = path.join(path.dirname(process.execPath), 'logs')
try { fs.mkdirSync(logDir, { recursive:true }) } catch {}
const logFile = path.join(logDir, `branch-client-${new Date().toISOString().slice(0,10)}.log`)
function ts() { return new Date().toISOString().replace('T',' ').slice(0,19) }
function write(level, msg) {
  const line = `[${ts()}] [${level.padEnd(5)}] ${msg}`
  console.log(line)
  try { fs.appendFileSync(logFile, line + '\n') } catch {}
}
// Limpia logs > 7 días
try {
  const cut = Date.now() - 7*24*60*60*1000
  fs.readdirSync(logDir).forEach(f => { const fp = path.join(logDir,f); if (fs.statSync(fp).mtimeMs < cut) fs.unlinkSync(fp) })
} catch {}
module.exports = {
  info:  m => write('INFO',  m),
  warn:  m => write('WARN',  m),
  error: m => write('ERROR', m),
  debug: m => { if (process.env.DEBUG) write('DEBUG', m) },
}
