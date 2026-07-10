import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SERVER_URL = import.meta.env.VITE_SERVER_URL
const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_KEY

const INSTALL_BAT = `@echo off
SET SERVICE_NAME=BranchClient
SET EXE_PATH=%~dp0branch-client.exe
IF NOT EXIST "%EXE_PATH%" ( echo [ERROR] No se encontro branch-client.exe & pause & exit /b 1 )
IF NOT EXIST "%~dp0config.json" ( echo [ERROR] No se encontro config.json & pause & exit /b 1 )
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% == 0 ( SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul & SC delete %SERVICE_NAME% >nul 2>&1 & timeout /t 2 /nobreak >nul )
SC create %SERVICE_NAME% binPath= "\"%EXE_PATH%\"" DisplayName= "Branch Client - Sync de Ventas" start= auto obj= LocalSystem
IF %ERRORLEVEL% NEQ 0 ( echo [ERROR] Ejecuta como Administrador. & pause & exit /b 1 )
SC description %SERVICE_NAME% "Sincroniza ventas en tiempo real con el servidor central"
SC failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/10000/restart/30000
SC start %SERVICE_NAME%
IF %ERRORLEVEL% NEQ 0 ( echo [WARN] Creado pero no pudo iniciarse. Revisa logs\. ) ELSE ( echo [OK] Instalado correctamente. )
pause`

const UNINSTALL_BAT = `@echo off
SET SERVICE_NAME=BranchClient
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% NEQ 0 ( echo [INFO] No instalado. & pause & exit /b 0 )
SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul
SC delete %SERVICE_NAME%
IF %ERRORLEVEL% == 0 ( echo [OK] Eliminado. ) ELSE ( echo [ERROR] Ejecuta como Administrador. )
pause`

export function useDownloadPackage() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)

  async function download(branch) {
    setStatus('downloading'); setProgress('Obteniendo configuración...'); setError(null)
    try {
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default

      const configRes = await fetch(
        `${SERVER_URL}/api/branches/${branch.branch_id}/package-config`,
        { headers: { 'x-api-key': DASHBOARD_KEY } }
      )
      if (!configRes.ok) {
        const err = await configRes.json().catch(() => ({}))
        throw new Error(err.error || `Error del servidor: ${configRes.status}`)
      }
      const { config } = await configRes.json()

      setProgress('Descargando ejecutable...')
      const { data: releaseZip, error: storageErr } = await supabase.storage.from('releases').download('branch-client.zip')
      if (storageErr) throw new Error(`No se pudo descargar el ejecutable: ${storageErr.message}`)
      // Descomprimir el zip descargado para sacar el exe
      const JSZipInner = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default
      const innerZip = await JSZipInner.loadAsync(releaseZip)
      const exeBlob = await innerZip.file('branch-client.exe').async('blob')

      setProgress('Generando paquete...'); setStatus('generating')

      const zip = new JSZip()
      const folder = zip.folder(`${branch.branch_id}-client`)
      folder.file('branch-client.exe', exeBlob)
      folder.file('config.json', JSON.stringify(config, null, 2))
      folder.file('install-service.bat', INSTALL_BAT)
      folder.file('uninstall-service.bat', UNINSTALL_BAT)
      folder.file('INSTALACION.md', `# Branch Client\n## Sucursal: ${branch.name} (${branch.branch_id})\n\n1. Clic derecho en install-service.bat\n2. Ejecutar como Administrador\n3. Revisar logs/ para verificar conexión`)

      const zipBlob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        ({ percent }) => setProgress(`Comprimiendo... ${Math.round(percent)}%`)
      )

      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url; link.download = `${branch.branch_id}-client.zip`
      link.click(); URL.revokeObjectURL(url)

      setStatus('done'); setProgress('')
    } catch (err) { setError(err.message); setStatus('error') }
  }

  function reset() { setStatus('idle'); setProgress(''); setError(null) }
  return { download, status, progress, error, reset }
}
