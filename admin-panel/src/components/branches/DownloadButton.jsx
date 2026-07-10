export default function DownloadButton({ status, progress, error, onDownload, onReset, disabledTitle }) {
  if (status === 'disabled') return <button className="btn-download btn-download--disabled" title={disabledTitle} disabled>📦 Descargar</button>
  if (status === 'idle')     return <button className="btn-download" onClick={onDownload}>📦 Descargar</button>
  if (status === 'downloading' || status === 'generating')
    return <div className="btn-download btn-download--loading" title={progress}><span className="spinner" /> {progress || 'Preparando...'}</div>
  if (status === 'done')  return <button className="btn-download btn-download--done"  onClick={onReset}>✅ Descargado</button>
  if (status === 'error') return <button className="btn-download btn-download--error" title={error} onClick={onReset}>❌ Error — reintentar</button>
  return null
}
