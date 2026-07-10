const { supabase } = require('../utils/supabase')
const { decrypt }  = require('../utils/crypto')
const logger       = require('../utils/logger')
const sql          = require('mssql')

function registerPackageRoute(fastify) {
  fastify.get('/api/branches/:branchId/package-config', async (req, reply) => {
    const { branchId } = req.params

    // Schema v2: db_type en lugar de pos_system
    const { data: branch } = await supabase
      .from('branches')
      .select('id,branch_id,name,db_type,api_key,active')
      .eq('branch_id', branchId)
      .single()

    if (!branch)       return reply.code(404).send({ error: `Sucursal "${branchId}" no encontrada` })
    if (!branch.active) return reply.code(400).send({ error: `Sucursal "${branchId}" inactiva` })

    const { data: dbCfg } = await supabase
      .from('branch_db_configs')
      .select('*')
      .eq('branch_id', branch.id)
      .single()

    if (!dbCfg) return reply.code(400).send({
      error: `Sin configuración de BD. Configúrala en el panel admin.`
    })

    let dbPassword
    try { dbPassword = decrypt(dbCfg.db_password_enc) }
    catch (err) {
      logger.error(`Error desencriptando ${branchId}: ${err.message}`)
      return reply.code(500).send({ error: 'Error al procesar BD' })
    }

    // Tipos de dato habilitados para esta sucursal
    const { data: dataTypes } = await supabase
      .from('branch_data_types')
      .select('sync_interval_seconds,data_types(key)')
      .eq('branch_id', branch.id)

    const enabledTypes = (dataTypes ?? []).map(d => d.data_types?.key).filter(Boolean)
    const syncInterval = dataTypes?.[0]?.sync_interval_seconds ?? 30

    // Schema v2: queries vienen directo de data_types (sin data_type_queries)
    const { data: queryRows } = await supabase
      .from('data_types')
      .select('key,query_sql')
      .eq('active', true)
      .in('key', enabledTypes.length > 0 ? enabledTypes : ['_none_'])

    const queries = {}
    for (const q of queryRows ?? []) {
      if (q.key && q.query_sql) queries[q.key] = q.query_sql
    }

    const serverUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`

    const config = {
      branchId:            branch.branch_id,
      branchName:          branch.name,
      apiKey:              branch.api_key,
      serverUrl:           serverUrl.replace(/^http/, 'ws') + '/ws',
      syncIntervalSeconds: syncInterval,
      enabledDataTypes:    enabledTypes,
      queries,
      db: {
        type:              branch.db_type,   // v2: db_type
        server:            dbCfg.db_server,
        port:              dbCfg.db_port,
        database:          dbCfg.db_database,
        user:              dbCfg.db_user,
        password:          dbPassword,
        encrypt:           dbCfg.db_encrypt,
        trustCert:         dbCfg.db_trust_cert,
      },
    }

    logger.info(`Package config generado: ${branchId}`)
    return { config }
  })
}

function registerTestDbRoute(fastify) {
  fastify.post('/api/branches/:branchId/test-db', async (req, reply) => {
    const { db_server, db_port, db_database, db_user, db_password, db_encrypt, db_trust_cert } = req.body ?? {}
    if (!db_server || !db_database || !db_user || !db_password)
      return reply.code(400).send({ error: 'Faltan parámetros' })
    let pool
    try {
      pool = await sql.connect({
        user: db_user, password: db_password, server: db_server,
        port: db_port ?? 1433, database: db_database,
        options: { encrypt: db_encrypt ?? false, trustServerCertificate: db_trust_cert ?? true, enableArithAbort: true },
        connectionTimeout: 10000,
      })
      await pool.request().query('SELECT 1 AS ok')
      return { ok: true, message: `Conexión exitosa a ${db_server}/${db_database}` }
    } catch (err) {
      return reply.code(400).send({ error: `Error: ${err.message}` })
    } finally {
      if (pool) await pool.close().catch(() => {})
    }
  })
}

module.exports = { registerPackageRoute, registerTestDbRoute }
