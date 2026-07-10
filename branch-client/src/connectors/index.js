const SqlServerConnector  = require('./sqlserver')
const MySqlConnector      = require('./mysql')
const PostgreSqlConnector = require('./postgresql')

function createConnector(config) {
  switch ((config.db?.type ?? 'sqlserver').toLowerCase()) {
    case 'sqlserver':   return new SqlServerConnector(config)
    case 'mysql':       return new MySqlConnector(config)
    case 'postgresql':
    case 'postgres':    return new PostgreSqlConnector(config)
    default: throw new Error(`Driver de BD no soportado: "${config.db?.type}". Valores válidos: sqlserver, mysql, postgresql`)
  }
}

module.exports = { createConnector }
