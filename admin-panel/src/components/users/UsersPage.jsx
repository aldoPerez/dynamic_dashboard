import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const ROLES = [
  { value:'superadmin', label:'Super Admin', desc:'Acceso total incluyendo usuarios' },
  { value:'admin',      label:'Admin',       desc:'CRUD de sucursales y configuración' },
  { value:'viewer',     label:'Viewer',      desc:'Solo lectura en panel admin' },
]

export default function UsersPage() {
  const { profile, isSuperAdmin } = useAuth()
  const [users,        setUsers]        = useState([])
  const [branches,     setBranches]     = useState([])
  const [permissions,  setPermissions]  = useState({}) // userId → Set<branchId>
  const [loading,      setLoading]      = useState(true)
  const [inviteModal,  setInviteModal]  = useState(false)
  const [editUser,     setEditUser]     = useState(null)
  const [permUser,     setPermUser]     = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: uData }, { data: bData }, { data: pData }] = await Promise.all([
      supabase.from('admin_users').select('*').order('created_at'),
      supabase.from('branches').select('id,name,branch_id').eq('active', true).order('name'),
      supabase.from('branch_user_permissions').select('user_id,branch_id'),
    ])
    setUsers(uData ?? [])
    setBranches(bData ?? [])
    // Construir mapa userId → Set de branch_ids
    const map = {}
    for (const p of pData ?? []) {
      if (!map[p.user_id]) map[p.user_id] = new Set()
      map[p.user_id].add(p.branch_id)
    }
    setPermissions(map)
    setLoading(false)
  }

  async function toggleActive(user) {
    await supabase.from('admin_users').update({ active: !user.active }).eq('id', user.id)
    fetchAll()
  }

  async function updateRole(user, role) {
    await supabase.from('admin_users').update({ role }).eq('id', user.id)
    setEditUser(null); fetchAll()
  }

  async function savePermissions(userId, selectedBranchIds) {
    // Borrar todas las existentes y reinserta
    await supabase.from('branch_user_permissions').delete().eq('user_id', userId)
    if (selectedBranchIds.length > 0) {
      await supabase.from('branch_user_permissions').insert(
        selectedBranchIds.map(bid => ({ user_id: userId, branch_id: bid }))
      )
    }
    setPermUser(null); fetchAll()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Usuarios</h1><p className="subtitle">{users.length} administradores</p></div>
        {isSuperAdmin && <button className="btn-primary" onClick={() => setInviteModal(true)}>+ Invitar usuario</button>}
      </div>

      {!isSuperAdmin && <div className="info-banner" style={{ marginBottom:24 }}>ℹ️ Solo los Super Admins pueden gestionar usuarios.</div>}

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Rol</th><th>Sucursales</th>
                <th>Estado</th><th>Creado</th>
                {isSuperAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const userPerms = permissions[u.id] ?? new Set()
                return (
                  <tr key={u.id} className={!u.active ? 'row-inactive' : u.id === profile?.id ? 'row-self' : ''}>
                    <td>
                      <strong>{u.full_name}</strong>
                      {u.id === profile?.id && <span className="self-badge">Tú</span>}
                    </td>
                    <td><span className={`badge badge-role badge-role-${u.role}`}>{ROLES.find(r => r.value === u.role)?.label ?? u.role}</span></td>
                    <td>
                      {userPerms.size === 0
                        ? <span style={{ fontSize:11, color:'var(--text-3)' }}>Sin acceso</span>
                        : userPerms.size === branches.length
                          ? <span className="badge badge-active">Todas ({branches.length})</span>
                          : <span style={{ fontSize:11, color:'var(--text-2)' }}>{userPerms.size} de {branches.length}</span>
                      }
                    </td>
                    <td><span className={`badge ${u.active ? 'badge-active' : 'badge-inactive'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td className="date-cell">{new Date(u.created_at).toLocaleDateString('es-MX')}</td>
                    {isSuperAdmin && (
                      <td>
                        {u.id !== profile?.id && (
                          <div className="actions">
                            <button className="btn-icon" title="Cambiar rol" onClick={() => setEditUser(u)}>🎭</button>
                            <button className="btn-icon" title="Gestionar sucursales" onClick={() => setPermUser(u)}>🏪</button>
                            <button className="btn-icon" title={u.active ? 'Desactivar' : 'Activar'} onClick={() => toggleActive(u)}>
                              {u.active ? '⏸' : '▶️'}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviteModal && <InviteModal branches={branches} onClose={() => setInviteModal(false)} onSaved={() => { setInviteModal(false); fetchAll() }} />}
      {editUser   && <RoleModal user={editUser} onClose={() => setEditUser(null)} onSave={role => updateRole(editUser, role)} />}
      {permUser   && (
        <PermissionsModal
          user={permUser}
          branches={branches}
          current={permissions[permUser.id] ?? new Set()}
          onClose={() => setPermUser(null)}
          onSave={ids => savePermissions(permUser.id, ids)}
        />
      )}
    </div>
  )
}

function InviteModal({ branches, onClose, onSaved }) {
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [role,     setRole]     = useState('viewer')
  const [selected, setSelected] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  function toggleBranch(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function invite() {
    setError(null)
    if (!email.trim()) return setError('El email es requerido')
    if (!name.trim())  return setError('El nombre es requerido')
    setSaving(true)
    try {
      const { data, error: authErr } = await supabase.auth.admin.inviteUserByEmail(email.trim(), { data: { full_name: name.trim() } })
      if (authErr) throw authErr
      await supabase.from('admin_users').insert({ id: data.user.id, full_name: name.trim(), role, active: true })
      if (selected.length > 0) {
        await supabase.from('branch_user_permissions').insert(selected.map(bid => ({ user_id: data.user.id, branch_id: bid })))
      }
      setSuccess(true)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  if (success) return (
    <div className="modal-overlay">
      <div className="modal modal-sm">
        <div className="modal-success-icon">📧</div>
        <h3>Invitación enviada</h3>
        <p>Email de activación enviado a <strong>{email}</strong>.</p>
        <div className="modal-actions" style={{ border:'none', paddingBottom:0, justifyContent:'center' }}>
          <button className="btn-primary" onClick={onSaved}>Listo</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Invitar usuario</h3><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field"><label>Nombre *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Ana García" /></div>
          <div className="field"><label>Email *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ana@empresa.com" /></div>
          <div className="field"><label>Rol *</label>
            <div className="role-options">
              {ROLES.map(r => (
                <label key={r.value} className={`role-option ${role === r.value ? 'role-option--selected' : ''}`}>
                  <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} />
                  <div><strong>{r.label}</strong><p>{r.desc}</p></div>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Sucursales con acceso al dashboard</label>
            <div className="checkbox-group">
              {branches.map(b => (
                <label key={b.id} className="checkbox-label">
                  <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  <span>{b.name}</span>
                  <code className="key-badge">{b.branch_id}</code>
                </label>
              ))}
            </div>
            {branches.length === 0 && <span className="hint">No hay sucursales activas aún.</span>}
          </div>
          {error && <p className="error-msg">⚠️ {error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={invite} disabled={saving}>{saving ? 'Enviando...' : 'Enviar invitación'}</button>
        </div>
      </div>
    </div>
  )
}

function RoleModal({ user, onClose, onSave }) {
  const [role, setRole] = useState(user.role)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Cambiar rol — {user.full_name}</h3><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="role-options">
            {ROLES.map(r => (
              <label key={r.value} className={`role-option ${role === r.value ? 'role-option--selected' : ''}`}>
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} />
                <div><strong>{r.label}</strong><p>{r.desc}</p></div>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave(role)}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function PermissionsModal({ user, branches, current, onClose, onSave }) {
  const [selected, setSelected] = useState(Array.from(current))

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function selectAll()   { setSelected(branches.map(b => b.id)) }
  function selectNone()  { setSelected([]) }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h3>Sucursales — {user.full_name}</h3><span className="hint">Sucursales visibles en el dashboard</span></div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }} onClick={selectAll}>Todas</button>
            <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }} onClick={selectNone}>Ninguna</button>
          </div>
          <div className="checkbox-group">
            {branches.map(b => (
              <label key={b.id} className="checkbox-label">
                <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} />
                <span>{b.name}</span>
                <code className="key-badge">{b.branch_id}</code>
              </label>
            ))}
          </div>
          {branches.length === 0 && <span className="hint">No hay sucursales activas.</span>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave(selected)}>Guardar permisos</button>
        </div>
      </div>
    </div>
  )
}
