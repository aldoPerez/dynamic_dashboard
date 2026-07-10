const { Client }   = require('pg')
const BaseConnector = require('./base')
const logger        = require('../utils/logger')

class PostgreSqlConnector extends BaseConnector {
  constructor(config) {
    super(config)
    this.client = null
    this.pgConfig = {
      host:     config.db.server,
      port:     config.db.port ?? 5432,
      database: config.db.database,
      user:     config.db.user,
      password: config.db.password,
      ssl:      config.db.encrypt ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 15000,
      query_timeout:           60000,
    }
  }

  async connect() {
    if (!this.client) {
      this.client = new Client(this.pgConfig)
      await this.client.connect()
      logger.debug(`PostgreSQL: ${this.config.db.server}/${this.config.db.database}`)
    }
  }

  async _query(queryStr, params = {}) {
    await this.connect()
    // PostgreSQL usa $1, $2... — reemplazar @dateFrom y @dateTo
    const values = []
    let paramIdx = 1
    let sql = queryStr
      .replace(/@dateFrom/gi, () => { values.push(params.dateFrom); return `$${paramIdx++}` })
      .replace(/@dateTo/gi,   () => { values.push(params.dateTo);   return `$${paramIdx++}` })

    for (const [k, v] of Object.entries(params)) {
      if (k !== 'dateFrom' && k !== 'dateTo') {
        sql = sql.replace(new RegExp(`@${k}`, 'gi'), () => { values.push(v); return `$${paramIdx++}` })
      }
    }

    // PostgreSQL no tiene TOP N — convertir a LIMIT N
    sql = sql.replace(/\bSELECT\s+TOP\s+(\d+)\b/gi, (_, n) => `SELECT`)
             .replace(/\bORDER BY\b([\s\S]*?)$/i, (m) => m + ` LIMIT ${sql.match(/TOP\s+(\d+)/i)?.[1] ?? 100}`)

    const result = await this.client.query(sql, values)
    return result.rows
  }

  async close() {
    if (this.client) { await this.client.end(); this.client = null }
  }
}

module.exports = PostgreSqlConnector
