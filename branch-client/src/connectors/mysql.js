const mysql        = require('mysql2/promise')
const BaseConnector = require('./base')
const logger        = require('../utils/logger')

class MySqlConnector extends BaseConnector {
  constructor(config) {
    super(config)
    this.conn = null
    this.mysqlConfig = {
      host:     config.db.server,
      port:     config.db.port ?? 3306,
      database: config.db.database,
      user:     config.db.user,
      password: config.db.password,
      ssl:      config.db.encrypt ? {} : undefined,
      connectTimeout: 15000,
    }
  }

  async connect() {
    if (!this.conn) {
      this.conn = await mysql.createConnection(this.mysqlConfig)
      logger.debug(`MySQL: ${this.config.db.server}/${this.config.db.database}`)
    }
  }

  async _query(queryStr, params = {}) {
    await this.connect()
    // MySQL usa ? en lugar de @param — reemplazar @dateFrom y @dateTo
    const values = []
    let sql = queryStr
      .replace(/@dateFrom/gi, () => { values.push(params.dateFrom); return '?' })
      .replace(/@dateTo/gi,   () => { values.push(params.dateTo);   return '?' })

    // Parámetros adicionales
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'dateFrom' && k !== 'dateTo') {
        sql = sql.replace(new RegExp(`@${k}`, 'gi'), () => { values.push(v); return '?' })
      }
    }

    const [rows] = await this.conn.execute(sql, values)
    return rows
  }

  async close() {
    if (this.conn) { await this.conn.end(); this.conn = null }
  }
}

module.exports = MySqlConnector
