const sql          = require('mssql')
const BaseConnector = require('./base')
const logger        = require('../utils/logger')

class SqlServerConnector extends BaseConnector {
  constructor(config) {
    super(config)
    this.pool = null
    this.sqlConfig = {
      user:     config.db.user,
      password: config.db.password,
      server:   config.db.server,
      port:     config.db.port ?? 1433,
      database: config.db.database,
      options: {
        encrypt:               config.db.encrypt ?? false,
        trustServerCertificate: config.db.trustCert ?? true,
        enableArithAbort:      true,
      },
      pool: { max:5, min:0, idleTimeoutMillis:30000 },
      connectionTimeout: 15000,
      requestTimeout:    60000,
    }
  }

  async connect() {
    if (!this.pool) {
      this.pool = await sql.connect(this.sqlConfig)
      logger.debug(`SQL Server: ${this.config.db.server}/${this.config.db.database}`)
    }
  }

  async _query(queryStr, params = {}) {
    await this.connect()
    const req = this.pool.request()
    // Inyectar parámetros @dateFrom y @dateTo
    if (params.dateFrom) req.input('dateFrom', params.dateFrom)
    if (params.dateTo)   req.input('dateTo',   params.dateTo)
    // Parámetros adicionales
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'dateFrom' && k !== 'dateTo') req.input(k, v)
    }
    const result = await req.query(queryStr)
    return result.recordset
  }

  async close() {
    if (this.pool) { await this.pool.close(); this.pool = null }
  }
}

module.exports = SqlServerConnector
