import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const CHART_TYPES = [
  { value:'kpi',   label:'KPI',           icon:'🔢', desc:'Número grande' },
  { value:'line',  label:'Línea',         icon:'📈', desc:'Tendencia en el tiempo' },
  { value:'area',  label:'Área',          icon:'📉', desc:'Tendencia rellena' },
  { value:'bar',   label:'Barras',        icon:'📊', desc:'Comparación vertical' },
  { value:'bar_h', label:'Barras horiz.', icon:'📋', desc:'Comparación horizontal' },
  { value:'donut', label:'Dona',          icon:'🍩', desc:'Distribución %' },
  { value:'pie',   label:'Pie',           icon:'🥧', desc:'Sectores' },
  { value:'table', label:'Tabla',         icon:'📄', desc:'Datos tabulares' },
]

const WIDTHS = [
  { value:'1/3', label:'1/3', cols:1 },
  { value:'1/2', label:'1/2', cols:2 },
  { value:'2/3', label:'2/3', cols:3 },
  { value:'full',label:'Full',cols:4 },
]

const COLORS_PRESET = ['#7c3aed','#ec4899','#4f8ef7','#10b981','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function DashboardConfigPage() {
  const { canWrite }     = useAuth()
  const [branches,       setBranches]       = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [layouts,        setLayouts]        = useState([])
  const [allWidgets,     setAllWidgets]     = useState([])
  const [dataTypes,      setDataTypes]      = useState([])  // todos los data_types activos
  const [loading,        setLoading]        = useState(false)
  const [modal,          setModal]          = useState(null) // null | 'widget' | 'add'
  const [editWidget,     setEditWidget]     = useState(null)
  const [saving,         setSaving]         = useState(false)
  const dragItem = useRef(null)
  const dragOver = useRef(null)

  useEffect(() => {
    loadBranches()
    loadDataTypes()
    loadAllWidgets()
  }, [])

  useEffect(() => {
    if (selectedBranch) loadLayout(selectedBranch)
  }, [selectedBranch])

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('id,branch_id,name').eq('active',true).order('name')
    setBranches(data ?? [])
    if (data?.length) setSelectedBranch(data[0].id)
  }

  async function loadDataTypes() {
    const { data } = await supabase
      .from('data_types')
      .select('id,key,label,is_live,columns_metadata')
      .eq('active', true)
      .order('sort_order')
    setDataTypes(data ?? [])
  }

  async function loadAllWidgets() {
    const { data } = await supabase
      .from('dashboard_widgets')
      .select('*, data_types(key,label,is_live,columns_metadata)')
      .eq('active', true)
      .order('created_at')
    setAllWidgets(data ?? [])
  }

  async function loadLayout(branchId) {
    setLoading(true)
    const { data } = await supabase
      .from('branch_dashboard_layouts')
      .select('*, dashboard_widgets(*, data_types(key,label,is_live,columns_metadata))')
      .eq('branch_id', branchId)
      .eq('visible', true)
      .order('sort_order')
    setLayouts(data ?? [])
    setLoading(false)
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  function onDragStart(e, i)  { dragItem.current = i; e.currentTarget.style.opacity='0.4' }
  function onDragEnter(i)     { dragOver.current = i }
  function onDragEnd(e) {
    e.currentTarget.style.opacity = '1'
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return
    const reordered = [...layouts]
    const dragged   = reordered.splice(dragItem.current, 1)[0]
    reordered.splice(dragOver.current, 0, dragged)
    dragItem.current = null; dragOver.current = null
    setLayouts(reordered)
    reordered.forEach((l,i) => supabase.from('branch_dashboard_layouts').update({ sort_order:i }).eq('id',l.id))
  }

  async function addWidgetToLayout(widgetId) {
    await supabase.from('branch_dashboard_layouts').upsert({
      branch_id:  selectedBranch,
      widget_id:  widgetId,
      sort_order: layouts.length,
      visible:    true,
    }, { onConflict:'branch_id,widget_id' })
    loadLayout(selectedBranch); loadAllWidgets(); setModal(null)
  }

  async function removeFromLayout(layoutId) {
    await supabase.from('branch_dashboard_layouts').delete().eq('id', layoutId)
    loadLayout(selectedBranch)
  }

  async function saveWidget(formData) {
    setSaving(true)
    try {
      if (editWidget?.id) {
        await supabase.from('dashboard_widgets').update(formData).eq('id', editWidget.id)
      } else {
        const { data } = await supabase.from('dashboard_widgets').insert(formData).select().single()
        if (data && selectedBranch) await addWidgetToLayout(data.id)
      }
      await loadAllWidgets()
      await loadLayout(selectedBranch)
      setModal(null); setEditWidget(null)
    } finally { setSaving(false) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Configura widgets y orden por sucursal</p>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <select className="branch-select-admin" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {canWrite && (
            <>
              <button className="btn-secondary" onClick={() => { setEditWidget(null); setModal('add') }}>
                + Agregar existente
              </button>
              <button className="btn-primary" onClick={() => { setEditWidget(null); setModal('widget') }}>
                + Nuevo widget
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? <div className="loading">Cargando...</div> : layouts.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">📊</span>
          <p>Sin widgets en este dashboard</p>
          {canWrite && <button className="btn-primary" onClick={() => setModal('widget')}>Crear primer widget</button>}
        </div>
      ) : (
        <>
          <p className="drag-hint">⠿ Arrastra para reordenar</p>
          <div className="dash-grid">
            {layouts.map((layout, i) => {
              const w = layout.dashboard_widgets
              const dt = w?.data_types
              if (!w || !dt) return null
              const colClass = { '1/3':'dash-widget-card--1_3','1/2':'dash-widget-card--1_2','2/3':'dash-widget-card--2_3','full':'dash-widget-card--full' }[w.width] ?? 'dash-widget-card--1_3'
              return (
                <div key={layout.id} className={`dash-widget-card ${colClass}`}
                  draggable={canWrite}
                  onDragStart={e => onDragStart(e, i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragEnd={onDragEnd}
                  onDragOver={e => e.preventDefault()}
                >
                  <div className="dash-widget-header">
                    <div className="dash-widget-title">
                      <span className="dash-widget-icon">{CHART_TYPES.find(c=>c.value===w.chart_type)?.icon ?? '📊'}</span>
                      <strong>{w.title}</strong>
                    </div>
                    <div className="dash-widget-meta">
                      <span className="badge" style={{ background:'var(--surface-2)',color:'var(--text-2)',fontSize:10 }}>
                        {CHART_TYPES.find(c=>c.value===w.chart_type)?.label}
                      </span>
                      <span className="badge" style={{ background:'var(--surface-2)',color:'var(--text-3)',fontSize:10 }}>
                        {w.width}
                      </span>
                      {canWrite && (
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn-icon" onClick={() => { setEditWidget(w); setModal('widget') }}>✏️</button>
                          <button className="btn-icon btn-danger" onClick={() => removeFromLayout(layout.id)}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Preview de configuración */}
                  <div className="dash-widget-body">
                    <div className="widget-preview">
                      <div className="widget-preview-query">
                        <span className="hint">Tipo de dato: </span>
                        <code style={{ fontSize:11 }}>{dt.key}</code>
                        {dt.is_live && <span style={{ fontSize:10, color:'#10b981', marginLeft:6 }}>● live</span>}
                      </div>
                      <div className="widget-preview-fields">
                        {w.chart_type === 'kpi' && w.kpi_field && (
                          <span className="preview-field preview-field--kpi">
                            Campo: {w.kpi_field}
                            {w.kpi_prefix && ` (${w.kpi_prefix})`}
                          </span>
                        )}
                        {['line','area','bar','bar_h'].includes(w.chart_type) && (
                          <>
                            {w.x_field && <span className="preview-field preview-field--x">X: {w.x_field}</span>}
                            {(w.y_fields??[]).map(f => <span key={f} className="preview-field preview-field--y">Y: {f}</span>)}
                          </>
                        )}
                        {['donut','pie'].includes(w.chart_type) && (
                          <>
                            {w.x_field && <span className="preview-field preview-field--x">Etiqueta: {w.x_field}</span>}
                            {(w.y_fields??[])[0] && <span className="preview-field preview-field--y">Valor: {(w.y_fields??[])[0]}</span>}
                          </>
                        )}
                        {w.chart_type === 'table' && (
                          (w.y_fields??[]).map(f => <span key={f} className="preview-field preview-field--y">{f}</span>)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {modal === 'widget' && (
        <WidgetModal
          widget={editWidget}
          dataTypes={dataTypes}
          onClose={() => { setModal(null); setEditWidget(null) }}
          onSave={saveWidget}
          saving={saving}
        />
      )}

      {modal === 'add' && (
        <AddWidgetModal
          widgets={allWidgets}
          existingIds={new Set(layouts.map(l => l.widget_id))}
          onClose={() => setModal(null)}
          onAdd={addWidgetToLayout}
        />
      )}
    </div>
  )
}

// ── Modal: crear/editar widget ────────────────────────────────────────────────
function WidgetModal({ widget, dataTypes, onClose, onSave, saving }) {
  const isEdit = !!widget?.id
  const [form, setForm] = useState({
    title:       widget?.title       ?? '',
    chart_type:  widget?.chart_type  ?? 'kpi',
    width:       widget?.width       ?? '1/3',
    data_type_id:widget?.data_type_id?? '',
    x_field:     widget?.x_field     ?? '',
    y_fields:    widget?.y_fields     ?? [],
    kpi_field:   widget?.kpi_field   ?? '',
    kpi_prefix:  widget?.kpi_prefix  ?? '',
    kpi_suffix:  widget?.kpi_suffix  ?? '',
    colors:      widget?.colors      ?? [...COLORS_PRESET.slice(0,3)],
  })
  const [error, setError] = useState(null)

  // Tipo de dato seleccionado y sus columnas
  const selectedDT   = dataTypes.find(dt => dt.id === form.data_type_id)
  const allCols      = selectedDT?.columns_metadata ?? []
  const numberCols   = allCols.filter(c => c.type === 'number')

  const needsXY  = ['line','area','bar','bar_h'].includes(form.chart_type)
  const needsPie = ['donut','pie'].includes(form.chart_type)
  const needsKpi = form.chart_type === 'kpi'
  const needsTbl = form.chart_type === 'table'

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function changeChartType(type) {
    setForm(f => ({ ...f, chart_type:type, x_field:'', y_fields:[], kpi_field:'' }))
  }

  function changeDT(id) {
    setForm(f => ({ ...f, data_type_id:id, x_field:'', y_fields:[], kpi_field:'' }))
  }

  function toggleY(key) {
    setForm(f => ({
      ...f,
      y_fields: f.y_fields.includes(key)
        ? f.y_fields.filter(k => k !== key)
        : [...f.y_fields, key]
    }))
  }

  function validate() {
    if (!form.title.trim())     return 'El título es requerido'
    if (!form.data_type_id)     return 'Selecciona un tipo de dato'
    if (allCols.length === 0)   return 'El tipo de dato no tiene columnas definidas. Ve a Tipos de dato y usa "Inferir desde SQL".'
    if (needsKpi && !form.kpi_field)           return 'Selecciona el campo a mostrar'
    if (needsXY  && !form.x_field)             return 'Selecciona el campo para el eje X'
    if ((needsXY || needsPie) && !form.y_fields.length) return 'Selecciona al menos un campo Y'
    if (needsTbl && !form.y_fields.length)     return 'Selecciona las columnas a mostrar'
    return null
  }

  function handleSave() {
    const err = validate()
    if (err) return setError(err)
    onSave({
      data_type_id: form.data_type_id,
      title:        form.title.trim(),
      chart_type:   form.chart_type,
      width:        form.width,
      x_field:      form.x_field || null,
      y_fields:     form.y_fields,
      kpi_field:    form.kpi_field || null,
      kpi_prefix:   form.kpi_prefix,
      kpi_suffix:   form.kpi_suffix,
      colors:       form.colors,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-widget" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Editar widget' : 'Nuevo widget'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Título */}
          <div className="field">
            <label>Título *</label>
            <input value={form.title} onChange={e => set('title',e.target.value)} placeholder="Ventas del día" />
          </div>

          {/* Tipo de gráfica */}
          <div className="field">
            <label>Tipo de gráfica *</label>
            <div className="chart-type-grid">
              {CHART_TYPES.map(ct => (
                <button key={ct.value} type="button"
                  className={`chart-type-btn ${form.chart_type===ct.value ? 'chart-type-btn--active' : ''}`}
                  onClick={() => changeChartType(ct.value)}
                  title={ct.desc}
                >
                  <span className="chart-type-icon">{ct.icon}</span>
                  <span className="chart-type-label">{ct.label}</span>
                </button>
              ))}
            </div>
            <span className="hint">{CHART_TYPES.find(c=>c.value===form.chart_type)?.desc}</span>
          </div>

          {/* Tipo de dato */}
          <div className="field">
            <label>Tipo de dato (fuente de datos) *</label>
            <select value={form.data_type_id} onChange={e => changeDT(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {dataTypes.map(dt => (
                <option key={dt.id} value={dt.id}>
                  [{dt.key}] {dt.label}{dt.is_live ? ' ● live' : ''}
                </option>
              ))}
            </select>
            {form.data_type_id && allCols.length === 0 && (
              <span className="hint" style={{ color:'var(--yellow)' }}>
                ⚠️ Sin columnas definidas. Ve a Tipos de dato → editar → "Inferir desde SQL".
              </span>
            )}
          </div>

          {/* Columnas disponibles — solo si hay tipo de dato seleccionado */}
          {allCols.length > 0 && (
            <>
              {/* KPI */}
              {needsKpi && (
                <div className="field">
                  <label>Campo a mostrar *</label>
                  <select value={form.kpi_field} onChange={e => set('kpi_field',e.target.value)}>
                    <option value="">— Seleccionar columna —</option>
                    {numberCols.map(c => (
                      <option key={c.key} value={c.key}>{c.label} ({c.key})</option>
                    ))}
                  </select>
                  <div className="field-grid-3" style={{ marginTop:8 }}>
                    <div className="field">
                      <label>Prefijo</label>
                      <input value={form.kpi_prefix} onChange={e=>set('kpi_prefix',e.target.value)} placeholder="$" />
                    </div>
                    <div className="field">
                      <label>Sufijo</label>
                      <input value={form.kpi_suffix} onChange={e=>set('kpi_suffix',e.target.value)} placeholder="pax" />
                    </div>
                  </div>
                </div>
              )}

              {/* Eje X */}
              {(needsXY || needsPie) && (
                <div className="field">
                  <label>{needsPie ? 'Campo de etiqueta (X) *' : 'Eje X *'}</label>
                  <div className="cols-checkbox-group">
                    {allCols.map(c => (
                      <label key={c.key} className={`checkbox-label ${form.x_field===c.key ? 'checkbox-label--selected' : ''}`}
                        style={{ cursor:'pointer' }} onClick={() => set('x_field', c.key)}>
                        <input type="radio" name="x_field" checked={form.x_field===c.key} readOnly />
                        <span>{c.label}</span>
                        <code className="key-badge">{c.key}</code>
                        <span className={`dt-col-type dt-col-type--${c.type}`}>{c.type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Eje Y / Columnas */}
              {(needsXY || needsPie || needsTbl) && (
                <div className="field">
                  <label>
                    {needsTbl ? 'Columnas a mostrar *' : needsPie ? 'Campo de valor (Y) *' : 'Eje Y *'}
                  </label>
                  <div className="cols-checkbox-group">
                    {(needsPie ? numberCols : needsTbl ? allCols : numberCols).map(c => (
                      <label key={c.key} className="checkbox-label">
                        <input type="checkbox"
                          checked={form.y_fields.includes(c.key)}
                          onChange={() => toggleY(c.key)} />
                        <span>{c.label}</span>
                        <code className="key-badge">{c.key}</code>
                        <span className={`dt-col-type dt-col-type--${c.type}`}>{c.type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Colores */}
          {!needsKpi && !needsTbl && (
            <div className="field">
              <label>Colores</label>
              <div className="colors-row">
                {form.colors.map((c,i) => (
                  <input key={i} type="color" value={c} className="color-picker"
                    onChange={e => setForm(f => ({ ...f, colors: f.colors.map((col,ci) => ci===i ? e.target.value : col) }))} />
                ))}
                {form.colors.length < 8 && (
                  <button type="button" className="btn-secondary" style={{ fontSize:11, padding:'4px 8px' }}
                    onClick={() => setForm(f => ({ ...f, colors: [...f.colors, COLORS_PRESET[f.colors.length % COLORS_PRESET.length]] }))}>
                    + Color
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Ancho */}
          <div className="field">
            <label>Ancho en el dashboard</label>
            <div className="width-selector">
              {WIDTHS.map(w => (
                <button key={w.value} type="button"
                  className={`width-btn ${form.width===w.value ? 'width-btn--active' : ''}`}
                  onClick={() => set('width',w.value)}>
                  <div className="width-preview">
                    {Array.from({length:4}).map((_,i) => (
                      <div key={i} className={`width-block ${i<w.cols?'width-block--filled':''}`} />
                    ))}
                  </div>
                  <span>{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error-msg">⚠️ {error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear widget'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: agregar widget existente ───────────────────────────────────────────
function AddWidgetModal({ widgets, existingIds, onClose, onAdd }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Agregar widget existente</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {widgets.length === 0
            ? <p style={{ color:'var(--text-3)', fontSize:13 }}>No hay widgets creados aún.</p>
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {widgets.map(w => {
                  const already = existingIds.has(w.id)
                  const ct = CHART_TYPES.find(c => c.value === w.chart_type)
                  return (
                    <div key={w.id} className={`add-widget-row ${already?'add-widget-row--added':''}`}>
                      <div className="add-widget-info">
                        <span>{ct?.icon}</span>
                        <strong>{w.title}</strong>
                        <span className="badge" style={{ background:'var(--surface-2)',color:'var(--text-3)',fontSize:10 }}>{ct?.label}</span>
                        <code className="key-badge">{w.data_types?.key}</code>
                      </div>
                      <button
                        className={already?'btn-secondary':'btn-primary'}
                        style={{ fontSize:12, padding:'5px 14px', flexShrink:0 }}
                        disabled={already}
                        onClick={() => !already && onAdd(w.id)}
                      >
                        {already ? '✓ Agregado' : '+ Agregar'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
