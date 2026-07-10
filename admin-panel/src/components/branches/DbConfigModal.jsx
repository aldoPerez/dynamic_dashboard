import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { encrypt } from '../../lib/crypto'

const DB_DEFAULTS = { softrestaurante: { database:'SoftRestaurante' }, squirrel: { database:'SquirrelPOS' } }

export default function DbConfigModal({ branch, onClose, onSaved }) {
  const [form, setForm] = useState({ db_server:'localhost\\SQLEXPRESS', db_port:1433, db_database:DB_DEFAULTS[branch.db_type]?.database ?? '', db_user:'sa', db_password:'', db_encrypt:false, db_trust_cert:true })
  const [hasExisting, setHasExisting] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [error,   setError]   = useState(null)
  const [showPass,setShowPass]= useState(false)

  useEffect(() => { loadExisting() }, [])

  async function loadExisting() {
    const { data } = await supabase.from('branch_db_configs_safe').select('*').eq('branch_id', branch.id).single()
    if (data) {
      setHasExisting(true)
      setForm(f => ({ ...f, db_server: data.db_server, db_port: data.db_port, db_database: data.db_database, db_user: data.db_user, db_encrypt: data.db_encrypt, db_trust_cert: data.db_trust_cert }))
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setTestResult(null) }

  async function testConnection() {
    if (!form.db_password && !hasExisting) return setError('Ingresa la contraseña para probar la conexión')
    setTesting(true); setTestResult(null); setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/branches/${branch.branch_id}/test-db`, {
        method: 'POST',
        headers: { 'x-api-key': import.meta.env.VITE_DASHBOARD_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_server: form.db_server, db_port: form.db_port, db_database: form.db_database, db_user: form.db_user, db_password: form.db_password, db_encrypt: form.db_encrypt, db_trust_cert: form.db_trust_cert })
      })
      const result = await res.json()
      setTestResult({ ok: res.ok, message: result.message || result.error })
      if (res.ok) await supabase.from('branch_db_configs').update({ tested_at: new Date().toISOString() }).eq('branch_id', branch.id)
    } catch (err) { setTestResult({ ok: false, message: err.message }) }
    finally { setTesting(false) }
  }

  async function save() {
    setError(null)
    if (!form.db_server.trim())   return setError('El servidor es requerido')
    if (!form.db_database.trim()) return setError('La base de datos es requerida')
    if (!form.db_user.trim())     return setError('El usuario es requerido')
    if (!form.db_password && !hasExisting) return setError('La contraseña es requerida')
    setSaving(true)
    try {
      const record = { branch_id: branch.id, db_server: form.db_server.trim(), db_port: form.db_port, db_database: form.db_database.trim(), db_user: form.db_user.trim(), db_encrypt: form.db_encrypt, db_trust_cert: form.db_trust_cert }
      if (form.db_password) record.db_password_enc = await encrypt(form.db_password)
      const { error: e } = hasExisting
        ? await supabase.from('branch_db_configs').update(record).eq('branch_id', branch.id)
        : await supabase.from('branch_db_configs').insert(record)
      if (e) throw e
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-db" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h3>Configuración de Base de Datos</h3><span className="modal-subtitle">{branch.name} · {branch.branch_id}</span></div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {hasExisting && <div className="info-banner">✅ Ya existe configuración guardada. La contraseña no se muestra — ingresa una nueva solo si deseas cambiarla.</div>}
          <div className="field-grid">
            <div className="field"><label>Servidor SQL Server *</label><input value={form.db_server} onChange={e => set('db_server', e.target.value)} placeholder="localhost\SQLEXPRESS" /><span className="hint">Host o IP. Usa \\ para instancias nombradas.</span></div>
            <div className="field"><label>Puerto</label><input type="number" value={form.db_port} onChange={e => set('db_port', Number(e.target.value))} className="input-short" /></div>
          </div>
          <div className="field"><label>Base de datos *</label><input value={form.db_database} onChange={e => set('db_database', e.target.value)} /></div>
          <div className="field"><label>Usuario *</label><input value={form.db_user} onChange={e => set('db_user', e.target.value)} placeholder="sa" /></div>
          <div className="field">
            <label>Contraseña {hasExisting ? '(dejar vacío para no cambiar)' : '*'}</label>
            <div className="input-with-icon">
              <input type={showPass ? 'text' : 'password'} value={form.db_password} onChange={e => set('db_password', e.target.value)} placeholder={hasExisting ? '•••••••• (sin cambios)' : 'Contraseña'} />
              <button className="btn-icon input-icon" onClick={() => setShowPass(v => !v)} type="button">{showPass ? '🙈' : '👁'}</button>
            </div>
            <span className="hint">Se encripta con AES-256 antes de guardarse.</span>
          </div>
          <details className="advanced">
            <summary>Opciones avanzadas</summary>
            <div className="advanced-body">
              <label className="checkbox-label"><input type="checkbox" checked={form.db_encrypt} onChange={e => set('db_encrypt', e.target.checked)} /><span>Encriptar conexión (TLS)</span></label>
              <label className="checkbox-label"><input type="checkbox" checked={form.db_trust_cert} onChange={e => set('db_trust_cert', e.target.checked)} /><span>Confiar en certificado del servidor</span></label>
            </div>
          </details>
          {testResult && <div className={`test-result ${testResult.ok ? 'test-ok' : 'test-fail'}`}>{testResult.ok ? '✅' : '❌'} {testResult.message}</div>}
          {error && <p className="error-msg">⚠️ {error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving || testing}>Cancelar</button>
          <button className="btn-secondary" onClick={testConnection} disabled={saving || testing}>{testing ? '⏳ Probando...' : '🔌 Probar conexión'}</button>
          <button className="btn-primary" onClick={save} disabled={saving || testing}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
