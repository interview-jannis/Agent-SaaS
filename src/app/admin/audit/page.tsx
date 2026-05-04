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

// Human-readable verb (present-tense short form). Used mid-sentence.
const ACTION_VERB: Record<string, string> = {
  'agent.contracts_signed': 'signed contracts',
  'agent.approved': 'approved',
  'agent.rejected': 'rejected',
  'agent.deleted': 'deleted agent',
  'agent.setup_completed': 'completed setup',
  'agent.activated': 'activated',
  'agent.deactivated': 'deactivated',
  'case.created': 'created case',
  'case.cancelled': 'cancelled case',
  'case.payment_confirmed': 'confirmed payment for',
  'case.travel_completed': 'marked travel complete on',
  'schedule.uploaded': 'uploaded schedule for',
  'schedule.confirmed': 'confirmed schedule for',
  'schedule.revision_requested': 'requested revision for',
  'schedule.deleted': 'deleted schedule for',
  'settlement.paid': 'paid settlement',
  'product.created': 'created product',
  'product.updated': 'updated product',
  'product.deleted': 'deleted product',
  'product.bulk_uploaded': 'bulk-uploaded products from',
  'category.created': 'created category',
  'category.updated': 'renamed category',
  'category.deleted': 'deleted category',
  'subcategory.created': 'created sub-category',
  'subcategory.updated': 'renamed sub-category',
  'subcategory.deleted': 'deleted sub-category',
  'settings.updated': 'updated setting',
  'contract_template.updated': 'edited contract template',
  'client.created': 'registered client',
  'client.updated': 'updated client info on',
  'admin.invited': 'invited admin',
  'admin.deleted': 'removed admin',
  'document.issued': 'issued document for',
  'document.item_added': 'added line item to document on',
  'document.item_removed': 'removed line item from document on',
  'document.paid': 'recorded payment on',
  'agent.reassigned': 'reassigned agent to',
  'agent_contract.countersigned': 'counter-signed contract for',
  'case.survey_submitted': 'submitted post-trip survey for',
  'case_contract.created': 'created 3-party contract for',
  'case_contract.signed_admin': 'signed 3-party contract (admin) for',
  'case_contract.signed_agent': 'signed 3-party contract (agent) for',
  'case_contract.signed_client': 'signed 3-party contract (client) for',
  'partner.paid': 'paid partner for',
  'quote.finalized': 'finalized pricing for',
  'quote.repriced': 'repriced',
}

type Tone = 'positive' | 'negative' | 'info' | 'schedule' | 'pending'
const ACTION_TONE: Record<string, Tone> = {
  'agent.approved': 'positive',
  'agent.activated': 'positive',
  'agent.setup_completed': 'positive',
  'agent.rejected': 'negative',
  'agent.deactivated': 'negative',
  'agent.deleted': 'negative',
  'case.created': 'info',
  'case.cancelled': 'negative',
  'case.payment_confirmed': 'info',
  'case.travel_completed': 'positive',
  'schedule.uploaded': 'schedule',
  'schedule.confirmed': 'positive',
  'schedule.revision_requested': 'negative',
  'schedule.deleted': 'negative',
  'settlement.paid': 'positive',
  'agent.contracts_signed': 'pending',
  'product.created': 'positive',
  'product.updated': 'info',
  'product.deleted': 'negative',
  'product.bulk_uploaded': 'info',
  'category.created': 'positive',
  'category.updated': 'info',
  'category.deleted': 'negative',
  'subcategory.created': 'positive',
  'subcategory.updated': 'info',
  'subcategory.deleted': 'negative',
  'settings.updated': 'info',
  'contract_template.updated': 'info',
  'client.created': 'positive',
  'client.updated': 'info',
  'admin.invited': 'pending',
  'admin.deleted': 'negative',
  'document.issued': 'info',
  'document.item_added': 'info',
  'document.item_removed': 'negative',
  'document.paid': 'positive',
  'agent.reassigned': 'info',
  'agent_contract.countersigned': 'positive',
  'case.survey_submitted': 'positive',
  'case_contract.created': 'info',
  'case_contract.signed_admin': 'positive',
  'case_contract.signed_agent': 'positive',
  'case_contract.signed_client': 'positive',
  'partner.paid': 'positive',
  'quote.finalized': 'info',
  'quote.repriced': 'info',
}

// Monochrome icon styling — keeps the shape distinction (per-action SVG) but
// drops the per-tone color noise. The tone field is retained for future use
// (e.g. accent on hover, filtering) but renders uniformly here.
const TONE_COLORS: Record<Tone, { icon: string; iconBg: string }> = {
  positive: { icon: 'text-gray-500', iconBg: 'bg-gray-50 ring-1 ring-gray-200' },
  negative: { icon: 'text-gray-500', iconBg: 'bg-gray-50 ring-1 ring-gray-200' },
  info:     { icon: 'text-gray-500', iconBg: 'bg-gray-50 ring-1 ring-gray-200' },
  schedule: { icon: 'text-gray-500', iconBg: 'bg-gray-50 ring-1 ring-gray-200' },
  pending:  { icon: 'text-gray-500', iconBg: 'bg-gray-50 ring-1 ring-gray-200' },
}

function toneOf(action: string): Tone { return ACTION_TONE[action] ?? 'info' }

// Small category icon (16x16). Each action maps to a shape; missing → filled dot.
function ActionIcon({ action, className }: { action: string; className?: string }) {
  const cls = `w-3.5 h-3.5 ${className ?? ''}`
  const props = { fill: 'none' as const, viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2.2, className: cls }
  const paths: Record<string, string> = {
    // checkmarks
    'agent.approved':               'M4.5 12.75l6 6 9-13.5',
    'agent.activated':              'M4.5 12.75l6 6 9-13.5',
    'agent.setup_completed':        'M4.5 12.75l6 6 9-13.5',
    'schedule.confirmed':           'M4.5 12.75l6 6 9-13.5',
    // x marks
    'agent.rejected':               'M6 18L18 6M6 6l12 12',
    'agent.deactivated':            'M6 18L18 6M6 6l12 12',
    'case.cancelled':               'M6 18L18 6M6 6l12 12',
    // trash (deletes)
    'schedule.deleted':             'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    'agent.deleted':                'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    // plus (created)
    'case.created':                 'M12 4.5v15m7.5-7.5h-15',
    'product.created':              'M12 4.5v15m7.5-7.5h-15',
    // pencil (updated)
    'product.updated':              'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    // trash (deleted)
    'product.deleted':              'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    // upload arrow (bulk upload)
    'product.bulk_uploaded':        'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
    // categories — plus / pencil / trash same as products
    'category.created':             'M12 4.5v15m7.5-7.5h-15',
    'subcategory.created':          'M12 4.5v15m7.5-7.5h-15',
    'category.updated':             'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    'subcategory.updated':          'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    'category.deleted':             'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    'subcategory.deleted':          'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    // gear (settings)
    'settings.updated':             'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z',
    // pencil (contract template + client updated + document items)
    'contract_template.updated':    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    'client.updated':               'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    // user-plus / user-minus (clients/admins)
    'client.created':               'M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z',
    'admin.invited':                'M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z',
    'admin.deleted':                'M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z',
    // document (issued/items)
    'document.issued':              'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    'document.item_added':          'M12 4.5v15m7.5-7.5h-15',
    'document.item_removed':        'M5 12h14',
    // currency (paid)
    'document.paid':                'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z',
    'partner.paid':                 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z',
    // arrows-right-left (reassigned)
    'agent.reassigned':             'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    // checkmark on document (counter-signed / 3-party contract signs / survey)
    'agent_contract.countersigned': 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
    'case_contract.signed_admin':   'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
    'case_contract.signed_agent':   'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
    'case_contract.signed_client':  'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
    // document plus (case_contract.created — new contract created)
    'case_contract.created':        'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    // chat-bubble (survey response)
    'case.survey_submitted':        'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
    // tag (pricing finalize / reprice)
    'quote.finalized':              'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
    'quote.repriced':               'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
    // currency (banknote-ish)
    'case.payment_confirmed':       'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z',
    'settlement.paid':              'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z',
    // paper plane (travel complete)
    'case.travel_completed':        'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
    // upload arrow
    'schedule.uploaded':            'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
    // refresh (revision)
    'schedule.revision_requested':  'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
    // pencil/document (contracts)
    'agent.contracts_signed':       'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  }
  const d = paths[action]
  if (!d) return <svg {...props}><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></svg>
  return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
}

// Time helpers
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return ''
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Format numeric-looking detail values with commas. Keep strings as-is.
function formatDetailValue(k: string, v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString('en-US')
  if (typeof v === 'string') {
    if (/_krw$|amount/i.test(k) && /^\d+$/.test(v)) return Number(v).toLocaleString('en-US')
    return v
  }
  return JSON.stringify(v)
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return ''
  if (typeof details.reason === 'string') return `— "${details.reason}"`
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${formatDetailValue(k, v)}`)
    .join(' · ')
}

type DateFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  custom: 'Custom range',
}

function dateFilterMatch(iso: string, filter: DateFilter, customFrom: string, customTo: string): boolean {
  if (filter === 'all') return true
  const d = new Date(iso)
  if (filter === 'custom') {
    if (customFrom && d < new Date(customFrom)) return false
    if (customTo) {
      // include the full "to" day
      const toEnd = new Date(customTo)
      toEnd.setHours(23, 59, 59, 999)
      if (d > toEnd) return false
    }
    return true
  }
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const today = startOfDay(now)
  if (filter === 'today') return d >= today
  if (filter === 'yesterday') {
    const yesterday = new Date(today.getTime() - 86400000)
    return d >= yesterday && d < today
  }
  if (filter === 'last7') return d >= new Date(today.getTime() - 7 * 86400000)
  if (filter === 'last30') return d >= new Date(today.getTime() - 30 * 86400000)
  return true
}

const PAGE_SIZE = 200

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState<'' | 'agent' | 'admin' | 'system'>('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const fetchLogs = useCallback(async (nextLimit: number) => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(nextLimit)
    const rows = (data as LogRow[]) ?? []
    setLogs(rows)
    setReachedEnd(rows.length < nextLimit)
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => { fetchLogs(limit) }, [fetchLogs, limit])

  function loadOlder() {
    setLoadingMore(true)
    setLimit(l => l + PAGE_SIZE)
  }

  function refresh() {
    setLoading(true)
    fetchLogs(limit)
  }

  const filtered = logs.filter(l => {
    if (actionFilter && l.action !== actionFilter) return false
    if (actorFilter && l.actor_type !== actorFilter) return false
    if (!dateFilterMatch(l.created_at, dateFilter, customFrom, customTo)) return false
    return true
  })

  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort()

  // Group by day
  const groupedByDay: { key: string; label: string; items: LogRow[] }[] = []
  for (const l of filtered) {
    const k = dayKey(l.created_at)
    const last = groupedByDay[groupedByDay.length - 1]
    if (last && last.key === k) last.items.push(l)
    else groupedByDay.push({ key: k, label: dayLabel(l.created_at), items: [l] })
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-900">Audit Log</h1>
          {!loading && <span className="text-xs text-gray-400">{filtered.length}{filtered.length !== logs.length ? ` of ${logs.length}` : ''}</span>}
        </div>

        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]">
            {(Object.entries(DATE_FILTER_LABELS) as [DateFilter, string][]).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]" />
              <span>–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]" />
            </div>
          )}
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
            {uniqueActions.map(a => <option key={a} value={a}>{ACTION_VERB[a] ?? a}</option>)}
          </select>
          <button onClick={refresh}
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
          <div className="px-4 md:px-12 py-6 md:py-8 space-y-6">
            {groupedByDay.map(group => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm flex items-center gap-3 py-2 mb-1">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{group.label}</span>
                  <span className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] text-gray-400">{group.items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map(l => {
                    const tone = toneOf(l.action)
                    const colors = TONE_COLORS[tone]
                    const verb = ACTION_VERB[l.action] ?? l.action
                    const detail = formatDetails(l.details)
                    const timeLabel = group.label === 'Today' ? timeAgo(l.created_at) || hhmm(l.created_at) : hhmm(l.created_at)
                    // Hide target_label if it's already contained in actor_label (avoid "#AG-004 did X #AG-004")
                    const showTarget = l.target_label && (!l.actor_label || !l.actor_label.includes(l.target_label))
                    return (
                      <div key={l.id} className="group flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 text-sm">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${colors.iconBg}`}>
                          <ActionIcon action={l.action} className={colors.icon} />
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono shrink-0 w-14 tabular-nums">{timeLabel}</span>
                        <p className="flex-1 min-w-0 text-gray-800 truncate">
                          <span className="font-semibold text-gray-900">{l.actor_label ?? l.actor_type}</span>
                          <span className="text-gray-500 mx-1.5">{verb}</span>
                          {showTarget && (
                            <span className="font-mono text-gray-700">{l.target_label}</span>
                          )}
                          {detail && <span className="text-gray-500 ml-1.5">{detail}</span>}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Load older */}
            <div className="flex items-center justify-center pt-2">
              {reachedEnd ? (
                <p className="text-[11px] text-gray-400">All events loaded ({logs.length})</p>
              ) : (
                <button onClick={loadOlder} disabled={loadingMore}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800 disabled:opacity-40 transition-colors">
                  {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} older`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
