const logger = require('../utils/logger')

/**
 * Clase base para todos los conectores de BD.
 * Las subclases implementan connect(), query() y close()
 * usando el driver correspondiente.
 */
class BaseConnector {
  constructor(config) {
    this.config        = config
    this.dbConfig      = config.db
    this.dynamicQueries = config.queries ?? {}
  }

  // ── Métodos que cada driver implementa ───────────────────────────────────
  async connect()               { throw new Error('connect() no implementado') }
  async _query(sql, params)     { throw new Error('_query() no implementado')  }
  async close()                 {}

  /**
   * Ejecuta una query dinámica por clave de tipo de dato.
   * Prioriza las queries del config.json (dinámicas desde Supabase),
   * si no existe cae al fallback hardcodeado en la subclase.
   */
  async runQuery(key, params = {}) {
    const sql = this.dynamicQueries[key]
    if (sql) {
      logger.debug(`Query dinámica: ${key}`)
      return this._query(sql, params)
    }
    logger.warn(`Sin query para: ${key} — tipo de dato no configurado`)
    return []
  }

  /**
   * Ejecuta todos los tipos de dato habilitados para esta sucursal.
   */
  async fetchAll(dataTypeKeys, params = {}) {
    await this.connect()
    const result = {}
    await Promise.all(
      dataTypeKeys.map(async key => {
        try {
          result[key] = await this.runQuery(key, params)
        } catch (err) {
          logger.error(`Error en query "${key}": ${err.message}`)
          result[key] = []
        }
      })
    )
    return result
  }

  checkCancelled(ctrl, name) {
    if (ctrl?.cancelled) throw new Error(`CANCELLED:${name}`)
  }
}

module.exports = BaseConnector
