import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useBranches() {
  const [branches, setBranches] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    supabase
      .from('my_branches')
      .select('id, branch_id, name, pos_system')
      .order('name')
      .then(({ data }) => {
        setBranches(data ?? [])
        setLoading(false)
      })
  }, [])

  return { branches, loading }
}
