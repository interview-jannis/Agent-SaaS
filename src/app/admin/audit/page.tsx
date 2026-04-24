'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type LogRow = {
  id: string
  actor_type: 'agent' | 'admin' | 'system'
  actor_label: string | null
  action: string
  target_type: string | null
  target_label: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  'agent.contracts_signed': 'Agent signed contracts',
  'agent.approved': 'Agent approved',
  'agent.rejected': 'Agent rejected',
  'agent.setup_completed': 'Agent completed setup',
  'agent.activated': 'Agent activated',
  'agent.deactivated': 'Agent deactivated',
  'case.created': 'Case created',
  'case.cancelled': 'Case cancelled',
  'case.payment_confirmed': 'Payment confirmed',
  'case.travel_completed': 'Travel completed',
  'schedule.uploaded': 'Schedule uploaded',
  'schedule.confirmed': 'Schedule confirmed',
  'schedule.revision_requested': 'Revision requested',
  'schedule.deleted': 'Schedule deleted',
  'settlement.paid': 'Settlement paid',
}

const ACTION_STYLES: Record<string, string> = {
  'agent.approved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'agent.rejected': 'bg-red-50 text-red-700 border-red-200',
  'agent.activated': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'agent.deactivated': 'bg-red-50 text-red-700 border-red-200',
  'case.created': 'bg-blue-50 text-blue-700 border-blue-200',
  'case.cancelled': 'bg-red-50 text-red-700 border-red-200',
  'case.payment_confirmed': 'bg-blue-50 text-blue-700 border-blue-200',
  'case.travel_completed': 'bg-gray-50 text-gray-700 border-gray-200',
  'schedule.uploaded': 'bg-violet-50 text-violet-700 border-violet-200',
  'schedule.confirmed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'schedule.revision_requested': 'bg-rose-50 text-rose-700 border-rose-200',
  'schedule.deleted': 'bg-red-50 text-red-700 border-red-200',
  'settlement.paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'agent.contracts_signed': 'bg-amber-50 text-amber-700 border-amber-200',
  'agent.setup_completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return iso.slice(0, 10)
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState<'' | 'agent' | 'admin' | 'system'>('')

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs((data as LogRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = logs.filter(l => {
    if (actionFilter && l.action !== actionFilter) return false
    if (actorFilter && l.actor_type !== actorFilter) return false
    return true
  })

  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort()

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Audit Log</h1>
        {!loading && <span className="text-xs text-gray-400">{filtered.length}{filtered.length !== logs.length ? ` of ${logs.length}` : ''}</span>}
        <p className="text-xs text-gray-500 ml-2">Last 200 events</p>

        <div className="ml-auto flex items-center gap-2">
          <select value={actorFilter} onChange={e => setActorFilter(e.target.value as typeof actorFilter)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]">
            <option value="">All actors</option>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]">
            <option value="">All actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
          <button onClick={fetchLogs}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 hover:border-gray-300">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-16">No events match the filter.</p>
        ) : (
          <div className="max-w-5xl mx-auto px-6 py-4 space-y-1">
            {filtered.map(l => {
              const label = ACTION_LABELS[l.action] ?? l.action
              const style = ACTION_STYLES[l.action] ?? 'bg-gray-50 text-gray-700 border-gray-200'
              const detailsStr = l.details && Object.keys(l.details).length > 0
                ? Object.entries(l.details).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')
                : ''
              return (
                <div key={l.id} className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 text-sm">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${style}`}>
                    {label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800">
                      <span className="font-medium">{l.actor_label ?? l.actor_type}</span>
                      {l.target_label && (
                        <>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="font-mono text-gray-700">{l.target_label}</span>
                        </>
                      )}
                    </p>
                    {detailsStr && (
                      <p className="text-xs text-gray-500 mt-0.5 break-words">{detailsStr}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0 mt-0.5" title={l.created_at}>
                    {timeAgo(l.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
