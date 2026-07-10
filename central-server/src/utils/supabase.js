const { createClient } = require('@supabase/supabase-js')
const logger = require('./logger')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function loadConfig() {
  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('id,branch_id,name,pos_system,api_key,active,branch_data_types(sync_interval_seconds,data_types(key,label,active))')
    .eq('active', true)
  if (bErr) throw new Error(`Error cargando sucursales: ${bErr.message}`)

  const { data: queries, error: qErr } = await supabase
    .from('data_type_queries')
    .select('pos_system,query_sql,data_types(key)')
  if (qErr) throw new Error(`Error cargando queries: ${qErr.message}`)

  const queryMap = {}
  for (const q of queries ?? []) {
    const pos = q.pos_system; const key = q.data_types?.key
    if (!pos || !key) continue
    if (!queryMap[pos]) queryMap[pos] = {}
    queryMap[pos][key] = q.query_sql
  }

  const branchMap = new Map()
  for (const b of branches ?? []) {
    branchMap.set(b.branch_id, {
      id: b.id, branchId: b.branch_id, name: b.name,
      posSystem: b.pos_system, apiKey: b.api_key,
      dataTypes: (b.branch_data_types ?? []).filter(d => d.data_types?.active).map(d => d.data_types.key),
      syncInterval: b.branch_data_types?.[0]?.sync_interval_seconds ?? 30,
    })
  }
  logger.info(`Config cargada: ${branchMap.size} sucursales`)
  return { branchMap, queryMap }
}

module.exports = { supabase, loadConfig }
