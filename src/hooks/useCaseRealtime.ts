'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Subscribe to row changes that affect a single case's detail page. Calls
// `onChange` (debounced ~250ms) whenever cases / case_contracts / documents /
// schedules rows for this case are inserted/updated. The page can hand its
// existing fetchCase() function as onChange — it'll re-fetch and React will
// re-render with the new state, removing the need for a manual reload after
// a counter-party signs / pays / uploads.
//
// SQL prerequisite: supabase_realtime publication must include these tables
// (see sql/2026-05-06_realtime_case_tables.sql).

export function useCaseRealtime(caseId: string | null | undefined, onChange: () => unknown | Promise<unknown>) {
  // Keep onChange in a ref so the channel doesn't have to re-subscribe every
  // render — caller-passed inline arrow functions have a new identity each render.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Unique per hook instance — multiple subscribers on the same page (parent
  // + contract section) can't share a channel name (Supabase rejects adding
  // postgres_changes callbacks once subscribed).
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!caseId) return

    let timer: ReturnType<typeof setTimeout> | null = null
    function fire() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { onChangeRef.current() }, 250)
    }

    const channel = supabase
      .channel(`case:${caseId}:${instanceIdRef.current}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cases', filter: `id=eq.${caseId}` }, fire)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'case_contracts', filter: `case_id=eq.${caseId}` }, fire)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `case_id=eq.${caseId}` }, fire)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'schedules', filter: `case_id=eq.${caseId}` }, fire)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [caseId])
}
