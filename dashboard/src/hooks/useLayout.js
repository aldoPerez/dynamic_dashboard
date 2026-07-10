import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Carga los widgets del dashboard para una sucursal.
 * Cada widget incluye:
 *   - Configuración visual: chart_type, width, x_field, y_fields, kpi_field, colors
 *   - Info del tipo de dato: key (para buscar en los datos), columns_metadata
 */
export function useLayout(branchId) {
  const [widgets, setWidgets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    supabase
      .from('branch_dashboard_layouts')
      .select(`
        id,
        sort_order,
        dashboard_widgets (
          id,
          title,
          chart_type,
          width,
          x_field,
          y_fields,
          kpi_field,
          kpi_prefix,
          kpi_suffix,
          colors,
          data_type_id,
          data_types (
            key,
            label,
            is_live,
            columns_metadata
          )
        )
      `)
      .eq('branch_id', branchId)
      .eq('visible', true)
      .order('sort_order')
      .then(({ data, error }) => {
        console.log('Layout raw:', JSON.stringify(data))
        console.log('Layout error:', error)
        setWidgets((data ?? []).filter(l => l.dashboard_widgets?.data_types))
        setLoading(false)
      })
  }, [branchId])

  return { widgets, loading }
}
