import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const COL_TYPES = ['string','number','date','boolean']

export default function DataTypesPage() {
  const { canWrite }  = useAuth()
  const [types,       setTypes]      = useState([])
  const [loading,     setLoading]    = useState(true)
  const [modal,       setModal]      = useState(null)
  const [editType,    setEditType]   = useState(null)
  const [confirm,     setConfirm]    = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase
      .from('data_types')
      .select('*')
      .order('sort_order')
    setTypes(data ?? [])
    setLoading(false)
  }

  async function toggleActive(dt) {
    await supabase.from('data_types').update({ active: !dt.active }).eq('id', dt.id)
    fetchAll()
  }

  async function deleteType(dt) {
    await supabase.from('data_types').delete().eq('id', dt.id)
    setConfirm(null); fetchAll()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tipos de dato</h1>
          <p className="subtitle">Define qué datos se sincronizan y cómo se consultan</p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => { setEditType(null); setModal('type') }}>
            + Nuevo tipo
          </button>
        )}
      </div>

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="dt-list">
          {types.map(dt => (
            <DataTypeCard key={dt.id} dt={dt} canWrite={canWrite}
              onEdit={() => { setEditType(dt); setModal('type') }}
              onToggle={() => toggleActive(dt)}
              onDelete={() => setConfirm(dt)}
            />
          ))}
          {types.length === 0 && (
            <div className="empty">
              <span className="empty-icon">📊</span>
              <p>No hay tipos de dato</p>
              {canWrite && <button className="btn-primary" onClick={() => setModal('type')}>Crear primero</button>}
            </div>
          )}
        </div>
      )}

      {modal === 'type' && (
        <DataTypeModal dt={editType}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchAll() }}
        />
      )}

      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>🗑 Eliminar tipo de dato</h3>
            <p style={{ marginTop:8 }}>
              ¿Eliminar <strong>{confirm.label}</strong>? Se eliminarán también los widgets asociados.
            </p>
            <div className="modal-actions" style={{ border:'none', paddingBottom:0 }}>
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => deleteType(confirm)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tarjeta de tipo de dato ───────────────────────────────────────────────────
function DataTypeCard({ dt, canWrite, onEdit, onToggle, onDelete }) {
  const cols = dt.columns_metadata ?? []
  return (
    <div className={`dt-card ${!dt.active ? 'dt-card--inactive' : ''}`}>
      <div className="dt-card-header">
        <div className="dt-card-title">
          <code className="key-badge" style={{ fontSize:12 }}>{dt.key}</code>
          <strong>{dt.label}</strong>
          {dt.is_live && <span className="badge" style={{ background:'rgba(16,185,129,.15)', color:'#10b981', fontSize:10 }}>● Live</span>}
          {!dt.active && <span className="badge badge-inactive">Inactivo</span>}
        </div>
        {dt.description && <p className="dt-desc">{dt.description}</p>}
        {canWrite && (
          <div className="dt-card-actions">
            <button className="btn-icon" title="Editar" onClick={onEdit}>✏️</button>
            <button className="btn-icon" title={dt.active ? 'Desactivar' : 'Activar'} onClick={onToggle}>
              {dt.active ? '⏸' : '▶️'}
            </button>
            <button className="btn-icon btn-danger" title="Eliminar" onClick={onDelete}>🗑</button>
          </div>
        )}
      </div>

      {/* Preview de columnas */}
      {cols.length > 0 && (
        <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)' }}>
          <div className="dt-cols-preview">
            {cols.map(c => (
              <span key={c.key} className={`dt-col-tag dt-col-tag--${c.type}`}>
                {c.key}
                <span className="dt-col-type">{c.type}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Preview de query */}
      {dt.query_sql && (
        <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)' }}>
          <pre className="query-preview">{dt.query_sql.slice(0,120)}{dt.query_sql.length>120?'…':''}</pre>
        </div>
      )}
    </div>
  )
}

// ── Modal: crear/editar tipo de dato ──────────────────────────────────────────
function DataTypeModal({ dt, onClose, onSaved }) {
  const isEdit = !!dt
  const [form, setForm] = useState({
    key:         dt?.key         ?? '',
    label:       dt?.label       ?? '',
    description: dt?.description ?? '',
    query_sql:   dt?.query_sql   ?? '',
    is_live:     dt?.is_live     ?? false,
    sort_order:  dt?.sort_order  ?? 0,
    active:      dt?.active      ?? true,
  })
  const [columns, setColumns] = useState(dt?.columns_metadata ?? [])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function addColumn() { setColumns(p => [...p, { key:'', label:'', type:'string' }]) }
  function updColumn(i, field, val) { setColumns(p => p.map((c,idx) => idx===i ? {...c,[field]:val} : c)) }
  function delColumn(i) { setColumns(p => p.filter((_,idx) => idx!==i)) }

  function inferColumns() {
    const matches = [...form.query_sql.matchAll(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)]
    const inferred = matches.map(m => ({
      key:   m[1],
      label: m[1].replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()),
      type:  guessType(m[1])
    }))
    if (inferred.length > 0) setColumns(inferred)
  }

  function guessType(name) {
    const n = name.toLowerCase()
    if (n.includes('fecha')||n.includes('date')||n.includes('hora')) return 'date'
    if (n.includes('total')||n.includes('importe')||n.includes('precio')||
        n.includes('cantidad')||n.includes('count')||n.includes('avg')||
        n.includes('promedio')||n.includes('porcentaje')) return 'number'
    return 'string'
  }

  async function save() {
    setError(null)
    if (!form.key.trim())   return setError('La clave es requerida')
    if (!form.label.trim()) return setError('El nombre es requerido')
    if (!/^[a-z0-9_]+$/.test(form.key)) return setError('Solo minúsculas, números y guiones bajos')
    if (!form.is_live && !form.query_sql.trim()) return setError('La query SQL es requerida')
    if (!form.is_live && !form.query_sql.toLowerCase().includes('@datefrom'))
      return setError('La query debe incluir @dateFrom y @dateTo')
    if (columns.some(c => !c.key.trim())) return setError('Todas las columnas necesitan una clave')

    setSaving(true)
    try {
      const record = {
        key:              form.key.trim(),
        label:            form.label.trim(),
        description:      form.description.trim() || null,
        query_sql:        form.is_live ? null : form.query_sql.trim(),
        columns_metadata: columns.filter(c => c.key.trim()),
        is_live:          form.is_live,
        sort_order:       form.sort_order,
        active:           form.active,
      }
      const { error: e } = isEdit
        ? await supabase.from('data_types').update(record).eq('id', dt.id)
        : await supabase.from('data_types').insert(record)
      if (e) throw e
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-query" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? `Editar — ${dt.label}` : 'Nuevo tipo de dato'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <div className="field-grid" style={{ gridTemplateColumns:'1fr 100px 80px' }}>
            <div className="field">
              <label>Clave *</label>
              <input value={form.key} onChange={e=>set('key',e.target.value)}
                placeholder="ventas_dia" disabled={isEdit} className={isEdit?'input-disabled':''} />
              <span className="hint">Solo minúsculas y guiones bajos. No cambiable después.</span>
            </div>
            <div className="field">
              <label>Orden</label>
              <input type="number" value={form.sort_order} onChange={e=>set('sort_order',Number(e.target.value))} className="input-short" />
            </div>
            <div className="field" style={{ justifyContent:'flex-end' }}>
              <label>Solo live</label>
              <input type="checkbox" checked={form.is_live} onChange={e=>set('is_live',e.target.checked)}
                title="Sin @dateFrom/@dateTo — solo datos en tiempo real" />
            </div>
          </div>

          <div className="field">
            <label>Nombre *</label>
            <input value={form.label} onChange={e=>set('label',e.target.value)} placeholder="Ventas del día" />
          </div>

          <div className="field">
            <label>Descripción</label>
            <textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={2} placeholder="Qué muestra este tipo de dato..." />
          </div>

          {!form.is_live && (
            <div className="field">
              <div className="query-params-hint">
                <strong>Parámetros:</strong>
                <code>@dateFrom</code> inicio &nbsp;|&nbsp;
                <code>@dateTo</code> fin (exclusivo)
                &nbsp;|&nbsp;
                <span style={{ fontSize:11, color:'var(--text-3)' }}>
                  SQL Server: usa @param · MySQL: usa ? · PostgreSQL: usa $1
                </span>
              </div>
              <label style={{ marginTop:8 }}>Query SQL *</label>
              <textarea className="sql-editor" value={form.query_sql}
                onChange={e=>set('query_sql',e.target.value)} rows={10} spellCheck={false}
                placeholder={'SELECT\n  columna1 AS alias1,\n  columna2 AS alias2\nFROM Tabla\nWHERE Fecha >= @dateFrom\n  AND Fecha < @dateTo'} />
            </div>
          )}

          {/* Columnas */}
          <div className="field">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <label style={{ margin:0 }}>Columnas que devuelve *</label>
              <div style={{ display:'flex', gap:8 }}>
                {!form.is_live && (
                  <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }} onClick={inferColumns} type="button">
                    ✨ Inferir desde SQL
                  </button>
                )}
                <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }} onClick={addColumn} type="button">
                  + Agregar
                </button>
              </div>
            </div>
            {columns.length === 0 ? (
              <div className="dt-cols-empty">Sin columnas. Escribe la query y usa "Inferir desde SQL".</div>
            ) : (
              <div className="cols-list">
                <div className="cols-header">
                  <span>Clave (alias SQL)</span><span>Etiqueta</span><span>Tipo</span><span></span>
                </div>
                {columns.map((col,i) => (
                  <div key={i} className="col-row">
                    <input value={col.key}   onChange={e=>updColumn(i,'key',e.target.value)}   placeholder="ventaTotal" className="col-input" />
                    <input value={col.label} onChange={e=>updColumn(i,'label',e.target.value)} placeholder="Venta Total" className="col-input" />
                    <select value={col.type} onChange={e=>updColumn(i,'type',e.target.value)} className="col-select">
                      {COL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn-icon btn-danger" onClick={()=>delColumn(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isEdit && (
            <div className="field field-row">
              <label>Activo</label>
              <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} />
            </div>
          )}

          {error && <p className="error-msg">⚠️ {error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
