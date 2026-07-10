import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useDownloadPackage } from '../../hooks/useDownloadPackage'
import BranchModal from './BranchModal'
import DbConfigModal from './DbConfigModal'
import DownloadButton from './DownloadButton'

export default function BranchesPage() {
  const { canWrite } = useAuth()
  const [branches,   setBranches]   = useState([])
  const [dbStatuses, setDbStatuses] = useState({})
  const [loading,    setLoading]    = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [dbModal,    setDbModal]    = useState(null)
  const [editBranch, setEditBranch] = useState(null)
  const [confirm,    setConfirm]    = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: bData }, { data: dbData }] = await Promise.all([
      supabase.from('branches').select('*').order('created_at', { ascending: false }),
      supabase.from('branch_db_configs_safe').select('branch_id,tested_at'),
    ])
    setBranches(bData ?? [])
    const map = {}
    for (const d of dbData ?? []) map[d.branch_id] = d
    setDbStatuses(map)
    setLoading(false)
  }

  async function toggleActive(branch) {
    await supabase.from('branches').update({ active: !branch.active }).eq('id', branch.id)
    fetchAll()
  }

  async function regenerateKey(branch) {
    await supabase.rpc('regenerate_branch_api_key', { p_branch_id: branch.id })
    setConfirm(null); fetchAll()
  }

  async function deleteBranch(branch) {
    await supabase.from('branches').delete().eq('id', branch.id)
    setConfirm(null); fetchAll()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Sucursales</h1><p className="subtitle">{branches.length} registradas</p></div>
        {canWrite && <button className="btn-primary" onClick={() => { setEditBranch(null); setModalOpen(true) }}>+ Nueva sucursal</button>}
      </div>
      {loading ? <div className="loading">Cargando...</div> : branches.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🏪</span><p>No hay sucursales registradas</p>
          {canWrite && <button className="btn-primary" onClick={() => setModalOpen(true)}>Agregar primera sucursal</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Nombre</th><th>POS</th><th>BD</th><th>API Key</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr></thead>
            <tbody>
              {branches.map(b => (
                <BranchRow key={b.id} branch={b} dbStatus={dbStatuses[b.id] ?? null} canWrite={canWrite}
                  onEdit={() => { setEditBranch(b); setModalOpen(true) }}
                  onDbConfig={() => setDbModal(b)}
                  onToggle={() => toggleActive(b)}
                  onRegenerate={() => setConfirm({ type:'regen', branch: b })}
                  onDelete={() => setConfirm({ type:'delete', branch: b })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && <BranchModal branch={editBranch} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchAll() }} />}
      {dbModal && <DbConfigModal branch={dbModal} onClose={() => setDbModal(null)} onSaved={() => { setDbModal(null); fetchAll() }} />}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>{confirm.type === 'regen' ? '⚠️ Regenerar API Key' : '🗑 Eliminar sucursal'}</h3>
            <p style={{ marginTop:8 }}>
              {confirm.type === 'regen'
                ? <>¿Regenerar la API Key de <strong>{confirm.branch.name}</strong>? El cliente dejará de conectarse hasta instalar el nuevo paquete.</>
                : <>¿Eliminar <strong>{confirm.branch.name}</strong> permanentemente?</>}
            </p>
            <div className="modal-actions" style={{ border:'none', paddingBottom:0 }}>
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={confirm.type === 'regen' ? 'btn-warn' : 'btn-danger'} onClick={() => confirm.type === 'regen' ? regenerateKey(confirm.branch) : deleteBranch(confirm.branch)}>
                {confirm.type === 'regen' ? 'Regenerar' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DbStatusBadge({ dbStatus }) {
  if (!dbStatus)           return <span className="db-status"><span className="db-status-dot missing"/>Sin configurar</span>
  if (!dbStatus.tested_at) return <span className="db-status"><span className="db-status-dot untested"/>Sin probar</span>
  return <span className="db-status" title={`Última prueba: ${new Date(dbStatus.tested_at).toLocaleString('es-MX')}`}><span className="db-status-dot ok"/>Configurada</span>
}

function BranchRow({ branch, dbStatus, canWrite, onEdit, onDbConfig, onToggle, onRegenerate, onDelete }) {
  const [showKey, setShowKey] = useState(false)
  const { download, status, progress, error, reset } = useDownloadPackage()
  return (
    <tr className={!branch.active ? 'row-inactive' : ''}>
      <td><code className="branch-id">{branch.branch_id}</code></td>
      <td><strong>{branch.name}</strong>{branch.notes && <p className="row-notes">{branch.notes}</p>}</td>
      <td><span className={`badge badge-pos badge-${branch.pos_system}`}>{branch.pos_system === 'softrestaurante' ? 'SoftRest.' : 'Squirrel'}</span></td>
      <td><DbStatusBadge dbStatus={dbStatus} /></td>
      <td>
        <div className="api-key-cell">
          <code className="api-key">{showKey ? branch.api_key : '••••••••••••••••'}</code>
          <button className="btn-icon" onClick={() => setShowKey(v => !v)}>{showKey ? '🙈' : '👁'}</button>
          <button className="btn-icon" onClick={() => navigator.clipboard.writeText(branch.api_key)}>📋</button>
        </div>
      </td>
      <td><span className={`badge ${branch.active ? 'badge-active' : 'badge-inactive'}`}>{branch.active ? 'Activa' : 'Inactiva'}</span></td>
      <td className="date-cell">{new Date(branch.created_at).toLocaleDateString('es-MX')}</td>
      <td>
        <div className="actions">
          {canWrite && <button className="btn-icon" title="Configurar BD" onClick={onDbConfig} style={{ fontSize:16 }}>🗄️</button>}
          <DownloadButton status={dbStatus ? status : 'disabled'} progress={progress} error={error} onDownload={() => download(branch)} onReset={reset} disabledTitle={!dbStatus ? 'Configura la BD primero' : undefined} />
          {canWrite && <>
            <button className="btn-icon" title="Editar" onClick={onEdit}>✏️</button>
            <button className="btn-icon" title={branch.active ? 'Desactivar' : 'Activar'} onClick={onToggle}>{branch.active ? '⏸' : '▶️'}</button>
            <button className="btn-icon btn-warn"   title="Regenerar API Key" onClick={onRegenerate}>🔑</button>
            <button className="btn-icon btn-danger" title="Eliminar"          onClick={onDelete}>🗑</button>
          </>}
        </div>
      </td>
    </tr>
  )
}
