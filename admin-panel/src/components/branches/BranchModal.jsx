import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const DB_TYPES = [
  { value:'sqlserver',  label:'SQL Server',  port:1433 },
  { value:'mysql',      label:'MySQL',        port:3306 },
  { value:'postgresql', label:'PostgreSQL',   port:5432 },
]

export default function BranchModal({ branch, onClose, onSaved }) {
  const isEdit = !!branch
  const [form, setForm] = useState({
    branch_id: branch?.branch_id ?? '',
    name:      branch?.name      ?? '',
    db_type:   branch?.db_type   ?? 'sqlserver',
    notes:     branch?.notes     ?? '',
    active:    branch?.active    ?? true,
  })
  const [dataTypes,     setDataTypes]     = useState([])
  const [selectedTypes, setSelectedTypes] = useState([])
  const [syncInterval,  setSyncInterval]  = useState(30)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [generatedKey,  setGeneratedKey]  = useState(null)

  useEffect(() => {
    loadDataTypes()
    if (isEdit) loadBranchDataTypes(branch.id)
  }, [])

  async function loadDataTypes() {
    const { data } = await supabase.from('data_types').select('id,key,label,is_live').eq('active',true).order('sort_order')
    setDataTypes(data ?? [])
    if (!isEdit && data) setSelectedTypes(data.map(d => d.id))
  }

  async function loadBranchDataTypes(branchId) {
    const { data } = await supabase.from('branch_data_types')
      .select('data_type_id,sync_interval_seconds').eq('branch_id', branchId)
    if (data?.length) { setSelectedTypes(data.map(d=>d.data_type_id)); setSyncInterval(data[0].sync_interval_seconds) }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function toggleDT(id) { setSelectedTypes(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]) }

  async function save() {
    setError(null)
    if (!form.branch_id.trim()) return setError('El ID de sucursal es requerido')
    if (!form.name.trim())      return setError('El nombre es requerido')
    if (selectedTypes.length===0) return setError('Selecciona al menos un tipo de dato')
    setSaving(true)
    try {
      let branchDbId = branch?.id
      if (isEdit) {
        const { error:e } = await supabase.from('branches').update({
          name:form.name, db_type:form.db_type, notes:form.notes, active:form.active
        }).eq('id',branch.id)
        if (e) throw e
      } else {
        const { data, error:e } = await supabase.from('branches').insert({
          branch_id: form.branch_id.trim().toUpperCase(),
          name:      form.name.trim(),
          db_type:   form.db_type,
          notes:     form.notes.trim() || null,
          active:    true,
        }).select().single()
        if (e) throw e
        branchDbId = data.id; setGeneratedKey(data.api_key)
      }
      await supabase.from('branch_data_types').delete().eq('branch_id', branchDbId)
      if (selectedTypes.length > 0) {
        await supabase.from('branch_data_types').insert(
          selectedTypes.map(dtId => ({ branch_id:branchDbId, data_type_id:dtId, sync_interval_seconds:syncInterval }))
        )
      }
      if (!isEdit) return
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  if (generatedKey) return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-success-icon">🎉</div>
        <h3>Sucursal creada</h3>
        <p>Guarda esta API Key — no se mostrará completa de nuevo:</p>
        <div className="key-display">
          <code>{generatedKey}</code>
          <button onClick={() => navigator.clipboard.writeText(generatedKey)}>Copiar</button>
        </div>
        <p className="hint">Configura la BD y descarga el paquete desde la tabla de sucursales.</p>
        <div className="modal-actions"><button className="btn-primary" onClick={onSaved}>Continuar</button></div>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? `Editar — ${branch.name}` : 'Nueva sucursal'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>ID de sucursal *</label>
            <input value={form.branch_id} onChange={e=>set('branch_id',e.target.value)} placeholder="SUC-001"
              disabled={isEdit} className={isEdit?'input-disabled':''} />
            <span className="hint">Identificador único. No cambiable después.</span>
          </div>
          <div className="field"><label>Nombre *</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Sucursal Centro" />
          </div>

          {/* Motor de BD */}
          <div className="field">
            <label>Motor de base de datos *</label>
            <div className="db-type-selector">
              {DB_TYPES.map(db => (
                <button key={db.value} type="button"
                  className={`db-type-btn ${form.db_type===db.value ? 'db-type-btn--active' : ''}`}
                  onClick={() => set('db_type', db.value)}
                >
                  <span className="db-type-icon">
                    {db.value==='sqlserver'  ? '🟦' : db.value==='mysql' ? '🐬' : '🐘'}
                  </span>
                  <span>{db.label}</span>
                  <span className="hint">Puerto por defecto: {db.port}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Tipos de dato a sincronizar *</label>
            <div className="checkbox-group">
              {dataTypes.map(dt => (
                <label key={dt.id} className="checkbox-label">
                  <input type="checkbox" checked={selectedTypes.includes(dt.id)} onChange={()=>toggleDT(dt.id)} />
                  <span>{dt.label}</span>
                  <code className="key-badge">{dt.key}</code>
                  {dt.is_live && <span className="badge" style={{ background:'rgba(16,185,129,.15)',color:'#10b981',fontSize:9 }}>live</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="field field-row">
            <label>Intervalo de sync (segundos)</label>
            <input type="number" min="10" max="3600" value={syncInterval}
              onChange={e=>setSyncInterval(Number(e.target.value))} className="input-short" />
          </div>

          <div className="field"><label>Notas</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2} placeholder="Dirección, contacto..." />
          </div>

          {isEdit && (
            <div className="field field-row">
              <label>Activa</label>
              <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} />
            </div>
          )}
          {error && <p className="error-msg">⚠️ {error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear sucursal'}
          </button>
        </div>
      </div>
    </div>
  )
}
