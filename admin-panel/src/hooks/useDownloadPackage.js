import { useState } from 'react'

const SERVER_URL    = import.meta.env.VITE_SERVER_URL
const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_KEY

export function useDownloadPackage() {
  const [status,   setStatus]   = useState('idle')
  const [progress, setProgress] = useState('')
  const [error,    setError]    = useState(null)

  async function download(branch) {
    setStatus('downloading')
    setProgress('Generando paquete de instalación...')
    setError(null)

    try {
      // El servidor arma el ZIP completo (config + exe) y lo devuelve directamente
      // Evita todos los problemas de CORS con Supabase Storage desde el browser
      const res = await fetch(
        `${SERVER_URL}/api/branches/${branch.branch_id}/download-package`,
        { headers: { 'x-api-key': DASHBOARD_KEY } }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Error del servidor: ${res.status}`)
      }

      setProgress('Descargando...')
      setStatus('generating')

      const blob = await res.blob()

      // Descargar el zip en el browser
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `${branch.branch_id}-client.zip`
      link.click()
      URL.revokeObjectURL(url)

      setStatus('done')
      setProgress('')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  function reset() { setStatus('idle'); setProgress(''); setError(null) }
  return { download, status, progress, error, reset }
}
