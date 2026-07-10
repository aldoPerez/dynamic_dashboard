import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Legend
} from 'recharts'

const DEFAULT_COLORS = ['#7c3aed','#ec4899','#4f8ef7','#10b981','#f59e0b','#ef4444','#06b6d4']

const fmt  = n => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits:2 })}`
const fmtK = n => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : fmt(n)
const fmtAxis = v => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(0)}k` : v

const TT_STYLE = {
  background:'#1e2535', border:'1px solid #2a3347',
  borderRadius:6, fontSize:12, color:'#e8eaf0'
}

/**
 * WidgetRenderer — renderiza cualquier tipo de widget dinámicamente.
 *
 * Props:
 *   layout    → fila de branch_dashboard_layouts con dashboard_widgets y data_types
 *   data      → objeto con los datos por clave de tipo: { "resumen_ventas": [...], ... }
 *   liveData  → datos del live sync (corteDia, mesas)
 */
export default function WidgetRenderer({ layout, data, liveData }) {
  const widget   = layout.dashboard_widgets
  const dataType = widget?.data_types

  if (!widget || !dataType) return <Empty text="Widget sin configurar" />

  // La clave del tipo de dato determina qué datos usar
  // Ej: dataType.key = "resumen_ventas" → data["resumen_ventas"]
  const dataKey  = dataType.key
  const isLive   = dataType.is_live

  // Para tipos live usamos liveData, para el resto los datos del query
  let rows = []
  if (isLive) {
    // mesas_estado → liveData.mesas
    // cualquier otro live → liveData[dataKey]
    rows = dataKey === 'mesas_estado'
      ? (liveData?.mesas ?? [])
      : (liveData?.[dataKey] ?? [])
  } else {
    rows = data?.[dataKey] ?? []
  }

  const colors  = widget.colors?.length > 0 ? widget.colors : DEFAULT_COLORS
  const yFields = widget.y_fields ?? []
  const xField  = widget.x_field

  switch (widget.chart_type) {
    case 'kpi':   return <KpiWidget   widget={widget} rows={rows} isLive={isLive} liveData={liveData} dataKey={dataKey} />
    case 'line':  return <LineWidget  rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'area':  return <AreaWidget  rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'bar':   return <BarWidget   rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'bar_h': return <BarHWidget  rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'donut': return <DonutWidget rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'pie':   return <PieWidget   rows={rows} xField={xField} yFields={yFields} colors={colors} />
    case 'table': return <TableWidget rows={rows} cols={yFields.length > 0 ? yFields : Object.keys(rows[0] ?? {})} />
    default:      return <Empty text={`Tipo desconocido: ${widget.chart_type}`} />
  }
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function KpiWidget({ widget, rows, isLive, liveData, dataKey }) {
  let value = null

  if (isLive) {
    // Para datos en vivo buscamos en liveData.corteDia o liveData directamente
    value = liveData?.corteDia?.[widget.kpi_field]
         ?? liveData?.[dataKey]?.[0]?.[widget.kpi_field]
         ?? null
  } else {
    // Para datos históricos tomamos el primer row
    value = rows[0]?.[widget.kpi_field] ?? null
  }

  const isMoney  = widget.kpi_prefix === '$'
  const display  = value === null
    ? '—'
    : typeof value === 'number'
      ? (isMoney ? fmtK(value) : value.toLocaleString('es-MX'))
      : value

  return (
    <div className="kpi-widget">
      <div className="kpi-widget-value">
        {widget.kpi_prefix && <span className="kpi-prefix">{widget.kpi_prefix}</span>}
        {display}
        {widget.kpi_suffix && <span className="kpi-suffix"> {widget.kpi_suffix}</span>}
      </div>
      {isLive && <div className="kpi-live-badge">● En vivo</div>}
      {rows.length === 0 && !isLive && <div className="widget-empty" style={{ padding:'8px 0', fontSize:11 }}>Sin datos para el período</div>}
    </div>
  )
}

// ── Line ──────────────────────────────────────────────────────────────────────
function LineWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" />
        <XAxis dataKey={xField} tick={{ fontSize:11, fill:'#8892a4' }} />
        <YAxis tick={{ fontSize:11, fill:'#8892a4' }} tickFormatter={fmtAxis} />
        <Tooltip contentStyle={TT_STYLE} />
        {yFields.length > 1 && <Legend wrapperStyle={{ fontSize:11 }} />}
        {yFields.map((f,i) => (
          <Line key={f} type="monotone" dataKey={f} name={fmtLabel(f)}
            stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r:3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Area ──────────────────────────────────────────────────────────────────────
function AreaWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows}>
        <defs>
          {yFields.map((f,i) => (
            <linearGradient key={f} id={`grad_${f}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors[i % colors.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0}   />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" />
        <XAxis dataKey={xField} tick={{ fontSize:11, fill:'#8892a4' }} />
        <YAxis tick={{ fontSize:11, fill:'#8892a4' }} tickFormatter={fmtAxis} />
        <Tooltip contentStyle={TT_STYLE} />
        {yFields.length > 1 && <Legend wrapperStyle={{ fontSize:11 }} />}
        {yFields.map((f,i) => (
          <Area key={f} type="monotone" dataKey={f} name={fmtLabel(f)}
            stroke={colors[i % colors.length]} fill={`url(#grad_${f})`} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Bar vertical ──────────────────────────────────────────────────────────────
function BarWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" />
        <XAxis dataKey={xField} tick={{ fontSize:11, fill:'#8892a4' }} />
        <YAxis tick={{ fontSize:11, fill:'#8892a4' }} tickFormatter={fmtAxis} />
        <Tooltip contentStyle={TT_STYLE} />
        {yFields.length > 1 && <Legend wrapperStyle={{ fontSize:11 }} />}
        {yFields.map((f,i) => (
          <Bar key={f} dataKey={f} name={fmtLabel(f)}
            fill={colors[i % colors.length]} radius={[3,3,0,0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Bar horizontal ────────────────────────────────────────────────────────────
function BarHWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  const height = Math.max(160, rows.length * 36)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" />
        <XAxis type="number" tick={{ fontSize:11, fill:'#8892a4' }} tickFormatter={fmtAxis} />
        <YAxis type="category" dataKey={xField} tick={{ fontSize:11, fill:'#8892a4' }} width={110} />
        <Tooltip contentStyle={TT_STYLE} />
        {yFields.map((f,i) => (
          <Bar key={f} dataKey={f} name={fmtLabel(f)}
            fill={colors[i % colors.length]} radius={[0,3,3,0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function DonutWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  const valueKey = yFields[0]
  const total    = rows.reduce((a,r) => a + (r[valueKey] || 0), 0)
  return (
    <div>
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={rows} dataKey={valueKey} nameKey={xField}
            cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
            {rows.map((_,i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={v => fmt(v)} contentStyle={TT_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-legend">
        {rows.map((r,i) => (
          <div key={i} className="donut-legend-row">
            <span className="donut-legend-label">
              <span className="donut-legend-dot" style={{ background:colors[i % colors.length] }} />
              {fmtLabel(String(r[xField] ?? '—'))}
            </span>
            <span className="donut-legend-val">
              {fmt(r[valueKey])} · {total ? ((r[valueKey]/total)*100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pie ───────────────────────────────────────────────────────────────────────
function PieWidget({ rows, xField, yFields, colors }) {
  if (!rows.length || !xField || !yFields.length) return <Empty />
  const valueKey = yFields[0]
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={rows} dataKey={valueKey} nameKey={xField}
          cx="50%" cy="50%" outerRadius={80}
          label={({ name, percent }) => `${fmtLabel(String(name))} ${(percent*100).toFixed(0)}%`}
          labelLine={false}>
          {rows.map((_,i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={v => fmt(v)} contentStyle={TT_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────
function TableWidget({ rows, cols }) {
  if (!rows.length) return <Empty />
  if (!cols.length) cols = Object.keys(rows[0])
  return (
    <div className="widget-table-wrap">
      <table className="widget-table">
        <thead>
          <tr>{cols.map(c => <th key={c}>{fmtLabel(c)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c}>
                  {typeof row[c] === 'number'
                    ? row[c].toLocaleString('es-MX')
                    : row[c] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Empty({ text = 'Sin datos para el período' }) {
  return <div className="widget-empty">{text}</div>
}

function fmtLabel(s) {
  return s.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())
}
