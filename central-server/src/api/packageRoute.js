const { supabase } = require('../utils/supabase')
const { decrypt }  = require('../utils/crypto')
const logger       = require('../utils/logger')
const sql          = require('mssql')

function registerPackageRoute(fastify) {

  // ── Genera config + descarga exe + arma zip — todo server-side ─────────────
  fastify.get('/api/branches/:branchId/download-package', async (req, reply) => {
    const { branchId } = req.params

    const { data: branch } = await supabase
      .from('branches')
      .select('id,branch_id,name,db_type,api_key,active')
      .eq('branch_id', branchId)
      .single()

    if (!branch)        return reply.code(404).send({ error: `Sucursal "${branchId}" no encontrada` })
    if (!branch.active) return reply.code(400).send({ error: `Sucursal "${branchId}" inactiva` })

    const { data: dbCfg } = await supabase
      .from('branch_db_configs')
      .select('*')
      .eq('branch_id', branch.id)
      .single()

    if (!dbCfg) return reply.code(400).send({ error: 'Sin configuración de BD. Configúrala primero.' })

    let dbPassword
    try { dbPassword = decrypt(dbCfg.db_password_enc) }
    catch (err) { return reply.code(500).send({ error: 'Error al procesar BD' }) }

    // Tipos de dato habilitados
    const { data: dataTypes } = await supabase
      .from('branch_data_types')
      .select('sync_interval_seconds,data_types(key)')
      .eq('branch_id', branch.id)

    const enabledTypes = (dataTypes ?? []).map(d => d.data_types?.key).filter(Boolean)
    const syncInterval = dataTypes?.[0]?.sync_interval_seconds ?? 30

    // Queries desde data_types directo (schema v2)
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
        type:     branch.db_type,
        server:   dbCfg.db_server,
        port:     dbCfg.db_port,
        database: dbCfg.db_database,
        user:     dbCfg.db_user,
        password: dbPassword,
        encrypt:  dbCfg.db_encrypt,
        trustCert: dbCfg.db_trust_cert,
      },
    }

    // Descargar el exe/zip desde Supabase Storage server-side (sin CORS)
    const { data: signedData, error: signedErr } = await supabase
      .storage
      .from('releases')
      .createSignedUrl('branch-client.zip', 300)

    if (signedErr) return reply.code(500).send({ error: `Error accediendo a Storage: ${signedErr.message}` })

    const exeRes = await fetch(signedData.signedUrl)
    if (!exeRes.ok) return reply.code(500).send({ error: `Error descargando ejecutable: ${exeRes.status}` })

    const exeBuffer = Buffer.from(await exeRes.arrayBuffer())

    // Armar el ZIP final con JSZip
    const JSZip = require('jszip')
    const zip   = new JSZip()
    const folder = zip.folder(`${branch.branch_id}-client`)

    folder.file('branch-client.zip',    exeBuffer)
    folder.file('config.json',          JSON.stringify(config, null, 2))
    folder.file('install-service.bat',  INSTALL_BAT)
    folder.file('uninstall-service.bat', UNINSTALL_BAT)
    folder.file('INSTALACION.md', [
      `# Branch Client`,
      `## Sucursal: ${branch.name} (${branch.branch_id})`,
      ``,
      `1. Clic derecho en install-service.bat`,
      `2. Ejecutar como Administrador`,
      `3. Revisar logs/ para verificar conexión`,
    ].join('\n'))

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    logger.info(`Package generado para ${branchId}: ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB`)

    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${branch.branch_id}-client.zip"`)
      .header('Content-Length', zipBuffer.length)
      .send(zipBuffer)
  })

  // ── Solo config JSON (para compatibilidad) ─────────────────────────────────
  fastify.get('/api/branches/:branchId/package-config', async (req, reply) => {
    const { branchId } = req.params

    const { data: branch } = await supabase
      .from('branches')
      .select('id,branch_id,name,db_type,api_key,active')
      .eq('branch_id', branchId)
      .single()

    if (!branch)        return reply.code(404).send({ error: `Sucursal "${branchId}" no encontrada` })
    if (!branch.active) return reply.code(400).send({ error: `Sucursal "${branchId}" inactiva` })

    const { data: dbCfg } = await supabase
      .from('branch_db_configs').select('*').eq('branch_id', branch.id).single()

    if (!dbCfg) return reply.code(400).send({ error: 'Sin configuración de BD.' })

    let dbPassword
    try { dbPassword = decrypt(dbCfg.db_password_enc) }
    catch { return reply.code(500).send({ error: 'Error al procesar BD' }) }

    const { data: dataTypes } = await supabase
      .from('branch_data_types').select('sync_interval_seconds,data_types(key)').eq('branch_id', branch.id)

    const enabledTypes = (dataTypes ?? []).map(d => d.data_types?.key).filter(Boolean)
    const syncInterval = dataTypes?.[0]?.sync_interval_seconds ?? 30

    const { data: queryRows } = await supabase
      .from('data_types').select('key,query_sql').eq('active', true)
      .in('key', enabledTypes.length > 0 ? enabledTypes : ['_none_'])

    const queries = {}
    for (const q of queryRows ?? []) { if (q.key && q.query_sql) queries[q.key] = q.query_sql }

    const serverUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`

    return {
      config: {
        branchId: branch.branch_id, branchName: branch.name,
        apiKey: branch.api_key,
        serverUrl: serverUrl.replace(/^http/, 'ws') + '/ws',
        syncIntervalSeconds: syncInterval, enabledDataTypes: enabledTypes, queries,
        db: { type: branch.db_type, server: dbCfg.db_server, port: dbCfg.db_port,
              database: dbCfg.db_database, user: dbCfg.db_user, password: dbPassword,
              encrypt: dbCfg.db_encrypt, trustCert: dbCfg.db_trust_cert },
      }
    }
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

const INSTALL_BAT = `@echo off
SET SERVICE_NAME=BranchClient
SET EXE_PATH=%~dp0branch-client.exe
IF NOT EXIST "%EXE_PATH%" ( echo [ERROR] No se encontro branch-client.exe & pause & exit /b 1 )
IF NOT EXIST "%~dp0config.json" ( echo [ERROR] No se encontro config.json & pause & exit /b 1 )
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% == 0 ( SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul & SC delete %SERVICE_NAME% >nul 2>&1 & timeout /t 2 /nobreak >nul )
SC create %SERVICE_NAME% binPath= "\\"%EXE_PATH%\\"" DisplayName= "Branch Client - Sync de Ventas" start= auto obj= LocalSystem
IF %ERRORLEVEL% NEQ 0 ( echo [ERROR] Ejecuta como Administrador. & pause & exit /b 1 )
SC description %SERVICE_NAME% "Sincroniza ventas en tiempo real con el servidor central"
SC failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/10000/restart/30000
SC start %SERVICE_NAME%
IF %ERRORLEVEL% NEQ 0 ( echo [WARN] Creado pero no pudo iniciarse. Revisa logs\\. ) ELSE ( echo [OK] Instalado correctamente. )
pause`

const UNINSTALL_BAT = `@echo off
SET SERVICE_NAME=BranchClient
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% NEQ 0 ( echo [INFO] No instalado. & pause & exit /b 0 )
SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul
SC delete %SERVICE_NAME%
IF %ERRORLEVEL% == 0 ( echo [OK] Eliminado. ) ELSE ( echo [ERROR] Ejecuta como Administrador. )
pause`

module.exports = { registerPackageRoute, registerTestDbRoute }
