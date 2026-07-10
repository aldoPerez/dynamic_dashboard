const { createClient } = require('@supabase/supabase-js')
const logger = require('./logger')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function loadConfig() {
  // Schema v2: branches tiene db_type en lugar de pos_system
  // data_types tiene query_sql directamente (sin data_type_queries)
  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('id,branch_id,name,db_type,api_key,active,branch_data_types(sync_interval_seconds,data_types(key,label,active))')
    .eq('active', true)
  if (bErr) throw new Error(`Error cargando sucursales: ${bErr.message}`)

  const { data: dataTypes, error: dtErr } = await supabase
    .from('data_types')
    .select('key,query_sql')
    .eq('active', true)
  if (dtErr) throw new Error(`Error cargando tipos de dato: ${dtErr.message}`)

  // Mapa de queries: { dataTypeKey: querySql }
  const queryMap = {}
  for (const dt of dataTypes ?? []) {
    if (dt.key && dt.query_sql) queryMap[dt.key] = dt.query_sql
  }

  // Mapa de sucursales
  const branchMap = new Map()
  for (const b of branches ?? []) {
    branchMap.set(b.branch_id, {
      id:          b.id,
      branchId:    b.branch_id,
      name:        b.name,
      dbType:      b.db_type,       // v2: db_type en lugar de pos_system
      apiKey:      b.api_key,
      dataTypes:   (b.branch_data_types ?? []).filter(d => d.data_types?.active).map(d => d.data_types.key),
      syncInterval: b.branch_data_types?.[0]?.sync_interval_seconds ?? 30,
    })
  }

  logger.info(`Config cargada: ${branchMap.size} sucursales, ${Object.keys(queryMap).length} queries`)
  return { branchMap, queryMap }
}

module.exports = { supabase, loadConfig }
