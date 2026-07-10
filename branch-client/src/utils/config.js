const fs   = require('fs')
const path = require('path')
function loadConfig() {
  const locs = [
    path.join(path.dirname(process.execPath),'config.json'),
    path.join(process.cwd(),'config.json'),
    path.join(__dirname,'../../config.json'),
  ]
  const configPath = locs.find(l => fs.existsSync(l))
  if (!configPath) { console.error('ERROR: No se encontró config.json'); locs.forEach(l=>console.error(' -',l)); process.exit(1) }
  let config
  try { config = JSON.parse(fs.readFileSync(configPath,'utf8')) }
  catch(err) { console.error(`ERROR: config.json inválido: ${err.message}`); process.exit(1) }
  const req = ['branchId','branchName','apiKey','serverUrl','db']
  const dbReq = ['type','server','database','user','password']
  const errors = [
    ...req.filter(f => !config[f]).map(f=>`"${f}" faltante`),
    ...(config.db ? dbReq.filter(f=>!config.db[f]).map(f=>`"db.${f}" faltante`) : [])
  ]
  if (errors.length) { console.error('ERROR config.json:', errors.join(', ')); process.exit(1) }
  console.log('Config cargada:', configPath)
  return config
}
module.exports = { loadConfig }
