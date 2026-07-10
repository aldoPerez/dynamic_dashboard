import { useState, useEffect, useCallback, useRef } from 'react'

const SERVER_URL    = import.meta.env.VITE_SERVER_URL
const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_KEY

/**
 * Solicita datos para todos los widgets del dashboard vía SSE al central-server.
 * Agrupa todas las dataTypes necesarias en una sola llamada por sucursal.
 */
export function useWidgetData({ branchId, widgets, dateFrom, dateTo }) {
  const [data,    setData]    = useState({})   // { dataTypeKey: rows[] }
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const esRef = useRef(null)

  const fetch = useCallback(() => {
    if (!branchId || widgets.length === 0 || !dateFrom || !dateTo) return

    // Recopilar qué dataTypes necesitan los widgets actuales
    const neededTypes = [...new Set(
      widgets.map(l => l.dashboard_widgets?.data_types?.key).filter(Boolean)
    )]
    if (neededTypes.length === 0) return

    // Cancelar fetch anterior si existe
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      branchId,
      dateFrom,
      dateTo: addDay(dateTo),
      dataTypes: neededTypes.join(','),
    })

    const es = new EventSource(
      `${SERVER_URL}/api/query?${params}`,
      { headers: { 'x-api-key': DASHBOARD_KEY } }
    )
    esRef.current = es

    es.addEventListener('branch_data', e => {
      const { data: payload } = JSON.parse(e.data)
      setData(payload ?? {})
    })
    es.addEventListener('branch_error', e => {
      setError(JSON.parse(e.data).error)
      setLoading(false)
      es.close()
    })
    es.addEventListener('done', () => {
      setLoading(false)
      es.close()
    })
    es.onerror = () => {
      setError('Error de conexión con el servidor')
      setLoading(false)
      es.close()
    }

    return () => { es.close(); esRef.current = null }
  }, [branchId, widgets, dateFrom, dateTo])

  useEffect(() => {
    const cleanup = fetch()
    return cleanup
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

/**
 * Datos en vivo — último sync del branch-client
 */
export function useLiveData(branchId) {
  const [liveData, setLiveData] = useState(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!branchId) return
    async function fetchLive() {
      setLoading(true)
      try {
        const res = await globalThis.fetch(
          `${SERVER_URL}/api/live?branchId=${branchId}`,
          { headers: { 'x-api-key': DASHBOARD_KEY } }
        )
        if (res.ok) { const json = await res.json(); setLiveData(json.data) }
      } catch {}
      setLoading(false)
    }
    fetchLive()
    const interval = setInterval(fetchLive, 30_000)
    return () => clearInterval(interval)
  }, [branchId])

  return { liveData, loading }
}

function addDay(dateStr) {
  const d = new Date(dateStr); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
