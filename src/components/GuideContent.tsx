'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import AgentGuideContent from '@/components/AgentGuideContent'

type Tab = 'admin' | 'agent' | 'client'

// ─── Screenshot defaults ──────────────────────────────────────────────────────
const _B = 'https://tknucfjnqapriadgiwuv.supabase.co/storage/v1/object/public/guide/screenshots'

const DEFAULT_CASE_SS: Record<string, { admin?: string; agent?: string }> = {
  awaiting_contract:   { admin: `${_B}/case-admin-awaiting_contract.png`,   agent: `${_B}/case-agent-awaiting_contract.png` },
  awaiting_deposit:    { admin: `${_B}/case-admin-awaiting_deposit.png`,    agent: `${_B}/case-agent-awaiting_deposit.png` },
  awaiting_schedule:   { admin: `${_B}/case-admin-awaiting_schedule.png`,   agent: `${_B}/case-agent-awaiting_schedule.png` },
  reviewing_schedule:  { admin: `${_B}/case-admin-reviewing_schedule.png`,  agent: `${_B}/case-agent-reviewing_schedule.png` },
  awaiting_pricing:    { admin: `${_B}/case-admin-awaiting_pricing.png`,    agent: `${_B}/case-agent-awaiting_pricing.png` },
  awaiting_payment:    { admin: `${_B}/case-admin-awaiting_payment.png`,    agent: `${_B}/case-agent-awaiting_payment.png` },
  awaiting_travel:     { admin: `${_B}/case-admin-awaiting_travel.png`,     agent: `${_B}/case-agent-awaiting_travel.png` },
  awaiting_review:     { admin: `${_B}/case-admin-awaiting_review.png`,     agent: `${_B}/case-agent-awaiting_review.png` },
  awaiting_settlement: { admin: `${_B}/case-admin-awaiting_settlement.png`, agent: `${_B}/case-agent-awaiting_settlement.png` },
  completed:           { admin: `${_B}/case-admin-completed.png`,           agent: `${_B}/case-agent-completed.png` },
}

const DEFAULT_SS: Record<string, string> = {
  overview: `${_B}/admin-overview.png`, cases: `${_B}/admin-cases.png`,
  products: `${_B}/admin-products.png`, agents: `${_B}/admin-agents.png`,
  clients: `${_B}/admin-clients.png`, settlement: `${_B}/admin-settlement.png`,
  contracts: `${_B}/admin-contracts.png`, surveys: `${_B}/admin-surveys.png`,
  admins: `${_B}/admin-admins.png`, audit: `${_B}/admin-audit.png`,
  settings: `${_B}/admin-settings.png`,
  agent_home: `${_B}/agent-home.png`, agent_cases: `${_B}/agent-cases.png`,
  agent_clients: `${_B}/agent-clients.png`, agent_payouts: `${_B}/agent-payouts.png`,
  agent_dashboard: `${_B}/agent-dashboard.png`, agent_profile: `${_B}/agent-profile.png`,
  client_quote: `${_B}/client-quote.png`, client_case_contract: `${_B}/client-case_contract.png`,
  client_deposit_invoice: `${_B}/client-deposit_invoice.png`,
  client_schedule: `${_B}/client-schedule.png`, client_final_invoice: `${_B}/client-final_invoice.png`,
}

// ─── Edit state type ──────────────────────────────────────────────────────────
type GuideEdits = {
  screenshots: Record<string, string[]>  // section key or case_{admin|agent}_{status}
  descs:       Record<string, string>    // section key → custom desc
  actions:     Record<string, string>    // {admin|agent|client}_{status} → action text
}
const EMPTY_EDITS: GuideEdits = { screenshots: {}, descs: {}, actions: {} }

// ─── Case pipeline ────────────────────────────────────────────────────────────
const CASE_STEPS = [
  { status: 'awaiting_contract',   label: 'Awaiting Contract',       owner: 'agent' as const, color: 'indigo',
    agentAction:  '고객에게 견적서 링크를 발송하고, 3자 계약(에이전트 → 고객 → 어드민 순)을 조율합니다.\n\n견적서는 이 시점의 상품·가격이 고정된 불변 스냅샷입니다. 나중에 상품이 바뀌더라도 고객이 받은 견적서는 변경되지 않으므로, 발송 전에 내용을 꼼꼼히 확인하세요.\n\n계약서는 3자 모두 서명해야 다음 단계로 넘어갑니다.',
    adminAction:  '에이전트가 발송한 케이스 계약서에 카운터사인합니다. 에이전트와 고객이 먼저 서명하지 않아도 미리 카운터사인해 둘 수 있습니다.',
    clientAction: '에이전트가 보낸 견적서 링크로 내용을 확인하세요. 이후 3자 계약서 서명 링크를 받으면 본인 확인 후 서명합니다.' },
  { status: 'awaiting_deposit',    label: 'Awaiting Deposit',        owner: 'agent' as const, color: 'orange',
    agentAction:  '고객으로부터 총 금액의 50%를 디파짓으로 수령합니다. 이 금액은 어드민에게 전달해야 합니다.\n\n동시에, 고객 프로필(여권·의료 정보 등)과 여행 정보(항공·숙소·출도착일)를 케이스 페이지에 모두 입력해야 합니다. 필수 필드가 비어 있으면 스케줄 단계로 넘어갈 수 없습니다.\n\n상품 구성에 변경이 필요하다면 지금 어드민에게 알려주세요. 이후 단계에서는 항목 변경이 어렵습니다.',
    adminAction:  '에이전트가 전달한 디파짓 수령을 확인합니다. 확인 후 케이스가 스케줄 준비 단계로 넘어갑니다.',
    clientAction: '에이전트에게 총 금액의 50%를 먼저 납부합니다. 나머지는 여행 직전에 납부하게 됩니다.' },
  { status: 'awaiting_schedule',   label: 'Awaiting Schedule',       owner: 'admin' as const, color: 'amber',
    agentAction:  '어드민이 일정표를 준비하는 동안 대기합니다. 이 단계에서 상품 변경이 필요하면 어드민에게 직접 요청하세요. 스케줄이 확정되면 다음 단계부터는 항목을 바꿀 수 없습니다.',
    adminAction:  '이 단계가 상품 항목을 편집할 수 있는 유일한 창구입니다.\n\n먼저 "Edit Selected Products"에서 항목을 검토하세요. 클리닉 사정이나 고객 요청으로 상품을 추가·삭제해야 할 경우 여기서 처리합니다. 변경된 항목은 Quotation(원본 견적서)에는 영향을 주지 않고, 별도의 Final Invoice 초안에만 반영됩니다.\n\n항목이 확정되면 "Schedule Editor"에서 날짜별·블록(오전/오후/저녁)별로 일정을 배치합니다. 상품을 날짜에 연결하고 메모를 추가한 뒤 저장하면, 에이전트에게 검토 요청 알림이 자동 발송됩니다.',
    clientAction: '맞춤 일정을 준비 중입니다. 별도 조치가 필요하지 않습니다.' },
  { status: 'reviewing_schedule',  label: 'Reviewing Schedule',      owner: 'agent' as const, color: 'violet',
    agentAction:  '어드민이 구성한 일정표를 꼼꼼히 검토합니다.\n\n날짜·시간·상품이 고객 요청과 맞는지 확인하세요. 수정이 필요하다면 반드시 "Request Revision"을 클릭하고 구체적인 수정 내용을 메모로 남겨야 합니다. 어드민이 수정 후 재업로드하면 다시 이 단계로 돌아옵니다.\n\n"Confirm"을 누르면 스케줄이 영구적으로 잠깁니다. 이후에는 어떤 방법으로도 일정을 수정할 수 없으니, Confirm 전에 반드시 최종 확인하세요.',
    adminAction:  '에이전트의 검토 결과를 기다립니다. 수정 요청이 도착하면 메모를 확인하고 Schedule Editor에서 수정한 뒤 다시 저장합니다. 저장 시 에이전트에게 재검토 요청이 발송됩니다.',
    clientAction: '에이전트가 일정을 최종 검토 중입니다. 별도 조치가 필요하지 않습니다.' },
  { status: 'awaiting_pricing',    label: 'Awaiting Final Pricing',  owner: 'admin' as const, color: 'blue',
    agentAction:  '어드민이 잔금 인보이스 가격을 확정하는 동안 대기합니다.\n\n이 단계에서는 상품 항목을 추가하거나 삭제할 수 없습니다(스케줄이 이미 확정됐기 때문). 구성 변경이 꼭 필요하다면 어드민에게 요청해 스케줄 재검토 단계로 되돌아가야 합니다.',
    adminAction:  '각 항목의 원가(Partner Cost)를 입력하면 에이전트 마진과 회사 마진이 자동 계산돼 고객 청구가가 표시됩니다.\n\n이 단계에서는 항목 추가·삭제 없이 가격만 조정합니다. 결제 기한도 함께 설정하세요.\n\n"Finalize Pricing & Issue Invoice"를 클릭하면 잔금 인보이스(Final Invoice)가 영구 확정되고, 에이전트에게 알림이 발송됩니다. 확정 이후 가격·항목은 변경되지 않습니다.',
    clientAction: '최종 금액을 산정 중입니다. 곧 에이전트로부터 잔금 안내를 받게 됩니다.' },
  { status: 'awaiting_payment',    label: 'Awaiting Balance Payment',owner: 'agent' as const, color: 'cyan',
    agentAction:  '고객에게 잔금 인보이스 링크를 발송합니다. 남은 50% 잔금을 수령한 뒤 어드민에게 확인 요청을 합니다.\n\n인보이스 링크는 케이스 페이지의 "Send" 버튼으로 복사할 수 있습니다.',
    adminAction:  '에이전트로부터 잔금 수령 확인 요청이 오면, 실제 입금을 확인하고 "Confirm Payment Received"를 클릭합니다. 여행 준비 단계로 넘어갑니다.',
    clientAction: '에이전트가 안내한 계좌로 잔금(50%)을 납부합니다. 납부 후 에이전트에게 알려주세요.' },
  { status: 'awaiting_travel',     label: 'Awaiting Travel',         owner: 'none' as const,  color: 'emerald',
    agentAction:  '여행 당일까지 현장 물류를 조율합니다. 스케줄 링크를 고객에게 공유해 일정을 확인할 수 있게 해주세요.\n\n여행이 모두 완료되면 "Mark Travel Complete"를 클릭합니다. 이 시점이 기록되어 커미션 정산의 기준일이 됩니다.',
    adminAction:  '현장 진행 상황을 모니터링합니다. Partner Payouts 섹션에서 병원·호텔 등 협력사에 원가를 송금 처리합니다.',
    clientAction: '즐거운 여행 되세요! 일정이나 현장 안내가 필요하면 담당 에이전트에게 연락하세요.' },
  { status: 'awaiting_review',     label: 'Awaiting Review',         owner: 'agent' as const, color: 'teal',
    agentAction:  '여행 후 설문 및 후기를 제출합니다. 고객에게 여행 소감을 직접 받아 대신 입력하는 방식입니다.\n\n제출이 완료돼야 커미션 인보이스 발행 단계로 넘어갑니다. 빠른 정산을 원한다면 여행 직후 바로 처리하세요.',
    adminAction:  '에이전트가 후기를 제출할 때까지 대기합니다. 제출되면 자동으로 다음 단계로 넘어갑니다.',
    clientAction: '담당 에이전트에게 여행 소감을 전달해 주세요. 에이전트가 후기를 시스템에 제출합니다.' },
  { status: 'awaiting_settlement', label: 'Awaiting Settlement',     owner: 'admin' as const, color: 'violet',
    agentAction:  '커미션 인보이스를 발행합니다. 케이스 페이지의 "Issue Commission Invoice" 버튼으로 생성할 수 있습니다.\n\n인보이스 발행 후 어드민의 송금을 기다립니다. 정산 금액은 당월 완료 환자 수 기준 커미션 요율(15~25%)이 자동 적용됩니다.',
    adminAction:  '에이전트가 발행한 커미션 인보이스를 확인합니다. 금액이 맞으면 실제 송금 후 "Mark Paid"를 클릭합니다.\n\nMark Paid를 누르는 순간 Settlement 레코드가 자동 생성되고, 케이스 상태가 Completed로 전환됩니다. 송금 전에 실수로 클릭하지 않도록 주의하세요.',
    clientAction: '모든 여정이 완료됐습니다. 별도 조치가 필요하지 않습니다.' },
  { status: 'completed',           label: 'Completed',               owner: 'none' as const,  color: 'gray',
    agentAction:  '케이스가 완전히 종료됐습니다. 커미션 정산까지 모두 완료된 상태입니다. Payouts 탭에서 정산 내역을 확인할 수 있습니다.',
    adminAction:  '케이스가 완전히 종료됐습니다. 모든 문서·정산 기록은 케이스 상세 페이지에서 계속 조회할 수 있습니다.',
    clientAction: '모든 절차가 완료됐습니다. 이용해 주셔서 감사합니다!' },
]

const NEUTRAL = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
const COLOR_MAP: Record<string, typeof NEUTRAL> = {
  indigo: NEUTRAL, orange: NEUTRAL, amber: NEUTRAL, violet: NEUTRAL,
  blue: NEUTRAL, cyan: NEUTRAL, emerald: NEUTRAL, teal: NEUTRAL, gray: NEUTRAL,
}

// ─── Section base definitions ─────────────────────────────────────────────────
const ADMIN_SECTIONS_BASE = [
  { key: 'overview', title: 'Overview',
    desc: '실시간 운영 대시보드입니다. 매일 아침 가장 먼저 확인하는 화면으로, 전체 파이프라인 상황을 한눈에 파악할 수 있습니다.',
    details: ['단계별 케이스 수 요약 — 어디에 병목이 있는지 즉시 확인', '해당 기간 매출, 커미션, 완료 환자 수 집계', '어드민 액션이 필요한 케이스(카운터사인 대기, 스케줄 작업 대기, 결제 확인 대기 등) 목록으로 빠르게 이동', '에이전트별 성과 스파크라인 — 활성 케이스·완료 여행 추이'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { key: 'cases', title: 'Cases',
    desc: '전체 에이전트의 모든 케이스를 관리하는 핵심 화면입니다. 상태별 필터, 케이스 번호·고객명 검색, 케이스 클릭 시 상세 페이지로 이동합니다.',
    details: [
      '상태 탭으로 파이프라인 단계별 케이스만 집중해서 볼 수 있습니다',
      '케이스 상세: 계약 카운터사인, 스케줄 작성, 가격 확정, 결제 확인',
      'Trip Name(Concept) — 케이스의 식별 이름. 스케줄 표지에 자동 반영되며, 케이스 취소 시 확인용으로 사용됩니다',
      '그룹 구조: 견적서는 구성원 그룹(각자 다른 시술)과 Shared 그룹(전원 공유 활동)으로 구성됩니다',
      'Edit Selected Products(awaiting_schedule 단계만) — 항목 추가·삭제. 견적서(Quotation)는 최초 생성 후 불변 스냅샷으로 고정됩니다',
      'Finalize Pricing(awaiting_pricing 단계) — 항목별 가격만 확정. 항목 추가·삭제는 이 단계에서 불가, 필요 시 스케줄 단계로 돌아가야 합니다',
      '문서 불변성: 한 번 생성된 Quotation·Final Invoice·Schedule은 수정되지 않습니다. 스케줄은 버전이 새로 생성되고, 인보이스는 Finalize 시 최종 확정됩니다',
      '스케줄 잠금: 에이전트가 Confirm하면 Schedule은 더 이상 수정·삭제할 수 없습니다',
      'Internal Notes — 스케줄 항목에 어드민 전용 메모. 고객·에이전트 화면에 노출되지 않습니다',
      'Commission Invoice Mark Paid 시 Settlement 레코드가 자동 생성되어 케이스가 Completed로 전환됩니다',
      '케이스 취소(잔금 결제 전) — Trip Name을 직접 입력해야만 취소가 진행됩니다',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg> },
  { key: 'products', title: 'Products',
    desc: '에이전트가 견적서에 담을 수 있는 모든 서비스의 마스터 카탈로그입니다. 상품은 카테고리 → 서브카테고리 구조로 분류됩니다.',
    details: [
      '6대 카테고리: K-Medical(진료), K-Beauty(클리닉 시술), K-Wellness(스파·힐링), K-Education(교육), K-Starcation(엔터테인먼트), Subpackage(호텔 등 패키지)',
      '서브카테고리: K-Beauty는 클리닉명(예: DIAR, Dr.Tune\'s), K-Medical은 진료과로 구분',
      '상품 옵션(Variant) — 동일 상품의 회차·사이즈·등급별 가격을 한 상품 카드 아래 묶어 관리',
      '마진 적용 규칙: K-Wellness 중 Spa·Henna만 마진 자동 적용, 나머지 Wellness와 Subpackage는 원가 그대로 청구(별도 설정 가능)',
      '무슬림 친화 필터: has_female_doctor(여의사 가능), has_prayer_room(기도실 보유), dietary_type(할랄 등급) 플래그 설정',
      '이미지 관리 — 상품별 대표 이미지 및 추가 이미지 등록',
      '비활성화(is_active OFF) — 에이전트 카탈로그에서 숨김 처리, 기존 견적 데이터는 유지',
      'Excel 일괄 업로드 — Dry-run 미리보기 후 확정. 누락 상품 일괄 삭제 옵션(deleteMissing) 지원',
      'Manage Categories — 카테고리·서브카테고리 추가 및 순서 변경 (새 카테고리는 Excel 업로드로 자동 생성되지 않음)',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" /></svg> },
  { key: 'agents', title: 'Agents',
    desc: '에이전트 명단을 관리합니다. 신규 에이전트 초대부터 온보딩 계약 검토, 활성화, 담당 어드민 배정까지 처리합니다.',
    details: [
      '이메일로 에이전트 초대 — 발송된 링크로 에이전트가 온보딩을 시작(OT → NDA → 파트너십 계약 순)',
      'NDA·파트너십 계약 카운터사인 — 에이전트가 서명한 계약서를 검토하고 어드민이 카운터사인. 두 계약 모두 완료되어야 Approve 버튼이 활성화됨',
      'Approve & Activate — 승인 시 에이전트가 계정 Setup(이메일·비밀번호·계좌)을 완료하고 서비스 이용 시작',
      'Reject — 온보딩 중 부적합 사유 발생 시 사유를 기록하고 거절. 에이전트에게 알림 발송',
      '커미션 요율 확인 — 당월 완료 환자 수에 따라 15·20·25% 자동 적용. 에이전트 카드에 현재 요율 표시',
      '담당 어드민 배정(슈퍼 어드민 전용) — 케이스 알림이 담당 어드민에게 우선 라우팅됨',
      '에이전트별 활성 케이스 수, 누적 완료 여행, 계좌 정보 조회 가능',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
  { key: 'clients', title: 'Clients',
    desc: '전체 에이전트의 고객을 통합 조회합니다. 여권 정보, 의료 이력, 무슬림 친화 설정 등 VIP 의료관광에 필요한 상세 프로필을 관리합니다.',
    details: [
      '전체 에이전트 고객 통합 검색 — 이름·국적·에이전트명으로 필터링',
      '필수 필드 완성도 표시 — 미입력 항목이 있으면 케이스가 다음 단계로 진행되지 않음',
      '기본 정보: 여권 번호, 생년월일, 국적, 비상연락처, 혈액형, 알레르기, 복용 약물',
      '무슬림 친화 설정: 식이 제한(할랄 등급), 기도 빈도·장소 선호, 동성 의사·치료사 요청, 혼성 활동 참여 여부',
      '생활 습관: 임신 여부, 흡연·음주 상태 — 시술 및 마취 관련 사전 파악용',
      '각 고객이 참여한 케이스 목록 및 담당 에이전트로 바로 이동 가능',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { key: 'settlement', title: 'Settlement',
    desc: '에이전트 커미션 정산 내역을 관리합니다. 커미션 인보이스 Mark Paid 시 자동으로 정산 레코드가 생성됩니다.',
    details: [
      '정산 목록 — 커미션 인보이스가 Mark Paid된 케이스의 정산 레코드 자동 집계',
      '미지급 vs 지급 완료 상태 구분 — 지급일이 비어있으면 미지급 상태',
      '실제 송금 후 지급일(paid_at)을 입력하면 해당 정산이 완료 처리됨',
      '※ 협력사(병원·호텔 등) 원가 지급(Partner Payouts)은 각 케이스 상세 페이지에서 별도 처리합니다 — 이 화면은 에이전트 커미션 전용',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg> },
  { key: 'contracts', title: 'Contracts',
    desc: '에이전트 온보딩 시 서명하는 NDA·파트너십 계약서 템플릿을 관리합니다. 변경 사항은 신규 에이전트부터 적용됩니다.',
    details: ['NDA 본문 편집 — 에이전트 활성화 전 서명하는 비밀유지계약서', '파트너십 계약 본문 편집 — 커미션 및 협력 조건', '슈퍼 어드민만 수정 가능, 일반 어드민은 조회만 가능'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
  { key: 'surveys', title: 'Surveys',
    desc: '여행 후기 설문을 관리합니다. 에이전트가 awaiting_review 단계에서 이 질문들을 바탕으로 고객 후기를 제출합니다.',
    details: [
      'Questions 탭 — 설문 질문 추가·수정·순서 변경. 슈퍼 어드민만 편집 가능, 일반 어드민은 조회만 가능',
      '질문 변경 사항은 이후 제출되는 케이스부터 적용됨 (기존 제출 응답에는 영향 없음)',
      'Responses 탭 — 케이스별 제출된 응답 전체 조회. 에이전트가 고객 대신 작성한 내용 확인 가능',
      '설문 응답은 케이스 완료 이후 서비스 개선 및 파트너 피드백 자료로 활용',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg> },
  { key: 'admins', title: 'Admins',
    desc: '어드민 계정을 관리합니다. 슈퍼 어드민에게만 표시됩니다.',
    details: ['이메일로 신규 어드민 초대 — 본인이 직접 비밀번호 설정', '슈퍼 어드민 지정 — 템플릿 편집, 어드민 관리 등 전체 권한 부여', '어드민 계정 삭제 (본인 계정은 삭제 불가)'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> },
  { key: 'audit', title: 'Audit Log',
    desc: '시스템에서 발생한 모든 주요 작업의 불변 기록입니다. 누가, 무엇을, 언제 했는지 추적합니다.',
    details: ['케이스 상태 변경, 상품 편집, 에이전트 초대, 계약 서명, 결제 확인 등 기록', '행위자 유형(어드민/에이전트/시스템) 및 날짜 범위로 필터링', '컴플라이언스, 분쟁 해결, 온보딩 검토에 활용'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg> },
  { key: 'settings', title: 'Settings',
    desc: '시스템 전역 설정입니다. 슈퍼 어드민만 수정 가능하며, 일반 어드민은 조회만 가능합니다.',
    details: ['환율(KRW/USD) — 전체 가격 계산에 사용', '회사 마진율 — 에이전트 마진 적용 전 원가에 더해지는 비율', '계좌 정보 — 고객 인보이스에 표시되는 입금 계좌', '디파짓 비율 — 기본 디파짓 비율 (현재 50%)', '회사 도장 — 최종 인보이스에 삽입되는 법인 도장 이미지', '온보딩 OT — 신규 에이전트에게 보여주는 오리엔테이션 자료'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

const ONBOARDING_STEPS = [
  { label: '초대',      desc: '어드민이 이메일로 초대 링크를 발송합니다.' },
  { label: '오리엔테이션', desc: '온보딩 자료를 읽고 확인합니다.' },
  { label: 'NDA',      desc: '신원 정보를 입력하고 비밀유지계약서에 서명합니다.' },
  { label: '파트너십',  desc: '파트너십 계약서(커미션 조건)에 서명합니다.' },
  { label: '승인 대기', desc: '어드민이 두 계약서를 검토하고 카운터사인합니다. 완료되면 알림을 받습니다.' },
  { label: '계정 설정', desc: '이메일, 비밀번호, 계좌 정보를 등록합니다.' },
  { label: '활성화',    desc: '에이전트 대시보드에 접근해 케이스 생성을 시작합니다.' },
]

const AGENT_SECTIONS_BASE = [
  { key: 'agent_home', title: 'Home',
    desc: 'A client-facing presentation page you can use during initial consultations. Shows TikkTakk\'s service offering and the full journey from first contact to completion.',
    details: [
      '"Why TikkTakk" — VIP concierge service, Muslim-friendly by default, all-in-one programme, vetted partners with transparent pricing',
      '"How It Works" — 6-step journey overview for clients: Choose Program → Receive Quotation → Sign & Confirm → Secure Booking → Get Schedule → Experience Korea',
      'Useful to walk a new client through what to expect before building their quote',
      'Notification bell (top right) — real-time alerts when admin uploads a schedule, confirms a payment, or takes any action on your cases',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg> },
  { key: 'agent_product', title: 'Product',
    desc: 'The quote-building workspace. Browse the full product catalogue, configure client groups, and generate a quotation in one flow.',
    details: [
      'Top bar — set Trip Name, select Client, and travel dates (required before creating a quote)',
      'Category pills — filter by K-Medical, K-Beauty, K-Wellness, K-Education, K-Starcation, or Subpackage',
      'Muslim Friendly filter — narrow by prayer room, female medical staff, and dietary grade (Halal Certified / Friendly / etc.)',
      'Groups — each group represents a set of clients who share the same services. "Shared Activities" auto-applies to all members across every group',
      'Add Group — for trips with multiple clients needing different services (e.g. Group 1: procedures, Group 2: wellness only)',
      'Member count per group (±) determines how the price multiplies for that group\'s items',
      'Trip Services — Subpackage items (hotel, interpreter, car, concierge) are priced per day/night, not per person. Hotel nights auto-sync to travel dates',
      'Product detail modal — view images, description, Muslim-friendly tags, and choose a specific variant (e.g. session count, room type)',
      'Create Quote — takes you to the review page to confirm all line items and prices before saving. Cart is preserved in localStorage if you navigate away',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" /></svg> },
  { key: 'agent_cases', title: 'Cases',
    desc: '담당 케이스 전체 목록입니다. 상태별 탭으로 파이프라인을 관리하고, 케이스를 클릭해 상세 작업을 진행합니다.',
    details: [
      '상태 탭 — "내 액션 필요" / "대기 중" 으로 구분해 우선순위 파악',
      'Trip Info — 출도착 항공편, 숙소명·주소 입력. 디파짓 단계에서 모두 채워야 함',
      'Members — 케이스에 포함된 고객 목록(그룹 구성). 각 고객의 정보 완성도 표시',
      'Trip Services — 견적서에 담긴 상품 목록 조회 (에이전트는 수정 불가, 어드민만 가능)',
      'Schedule — 어드민이 업로드한 일정표 확인·Confirm·Request Revision',
      'Send 버튼 — 견적서·인보이스·스케줄 링크를 클립보드에 복사해 고객에게 바로 발송',
      '케이스 취소 — Trip Name을 직접 입력해야 진행. 잔금 결제 전 단계에서만 가능',
      'Agent Notes — 어드민에게만 보이는 내부 메모. 고객 화면에는 노출되지 않음',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg> },
  { key: 'agent_clients', title: 'Clients',
    desc: '내 고객 데이터베이스입니다. 고객 프로필에는 여행 선호도, 의료 정보, 무슬림 친화 요건이 저장됩니다.',
    details: ['고객 프로필을 직접 생성하거나, 케이스 생성 시 자동으로 연결됩니다', '필수 필드가 모두 입력되어야 케이스가 스케줄 단계로 진행됩니다', '여권, 비상 연락처, 병력, 생활 습관, 식이·무슬림 친화 설정 등 상세 관리', '한 고객이 여러 케이스에 등록될 수 있습니다 (재방문 고객)'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
  { key: 'agent_payouts', title: 'Payouts',
    desc: '나의 커미션 지급 내역입니다. 완료 케이스별 정산 레코드를 확인할 수 있습니다.',
    details: ['정산 번호, 케이스 번호, KRW 금액, 지급일 조회', '커미션 요율은 월간 완료 환자 수에 따라 자동 계산됩니다', '요율 구간: 15%(0~10명) / 20%(11~30명) / 25%(31명+)', '매월 초기화 — 케이스 단위가 아닌 환자 단위 집계 (그룹 4명 = 4명 카운트)'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg> },
  { key: 'agent_dashboard', title: 'Dashboard',
    desc: '내 성과 대시보드입니다. 케이스 볼륨, 매출 추이, 고객 증가 등을 차트로 확인합니다.',
    details: ['월별 케이스 완료 수 vs. 활성 파이프라인', '기간별 발생 매출', '환자 수 추적 (커미션 요율 구간에 영향)'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg> },
  { key: 'agent_profile', title: 'Profile',
    desc: '계정 설정 화면입니다. 개인 정보, 커미션 수령 계좌 정보, 비밀번호 변경을 관리합니다.',
    details: ['이름, 전화번호, 국가, 이메일 (이메일 변경은 어드민 문의)', '계좌 정보 — 커미션 정산금이 입금될 계좌', '비밀번호 변경'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg> },
]

const CLIENT_SECTIONS_BASE = [
  { key: 'client_quote', title: '견적서 (Quote)',
    desc: '에이전트가 발송하는 초기 가격 안내서입니다. 선택한 서비스와 예상 금액을 확인할 수 있습니다.',
    details: [
      '고유 링크로 접근 — 별도 로그인이나 앱 설치 불필요',
      '그룹 구성원별 서비스 목록과 예상 총액 표시',
      '이 시점의 가격은 추정치입니다 — 어드민이 최종 가격을 확정하면 별도로 잔금 인보이스가 발송됩니다',
      '이후 에이전트로부터 3자 계약서 서명 링크를 받게 됩니다',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
  { key: 'client_case_contract', title: '3자 계약서',
    desc: '고객·에이전트·(주)인터뷰 3자 간의 공식 계약서입니다. 에이전트에게서 링크를 받아 온라인으로 서명합니다.',
    details: ['서명 전 계약서 전문을 꼼꼼히 읽어주세요', '본인 확인을 위해 이름을 직접 입력합니다', '서명 패드에 전자 서명을 진행합니다', '고객·에이전트·어드민 3자 모두 서명해야 다음 단계로 넘어갑니다'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75m-7.5-7.5h15M3.75 4.5h16.5A2.25 2.25 0 0122.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 17.25V6.75A2.25 2.25 0 013.75 4.5z" /></svg> },
  { key: 'client_deposit_invoice', title: '디파짓 인보이스',
    desc: '총 금액의 50%에 해당하는 첫 번째 결제 요청서입니다. 에이전트가 링크를 발송하면 납부하여 예약을 확정합니다.',
    details: ['USD 및 KRW 환산 금액 표시', '에이전트 계좌 정보 포함', '수령 확인 후 일정 준비가 시작됩니다'],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg> },
  { key: 'client_schedule', title: '스케줄 (일정표)',
    desc: '맞춤 제작된 날짜별 여행 일정표입니다. 에이전트가 확정 후 링크를 공유합니다.',
    details: [
      '날짜별 오전·오후·저녁 블록으로 구성된 일별 일정 안내',
      '서비스명, 클리닉/장소명, 예상 시간 표시',
      '그룹 여행의 경우 구성원별 개인 일정과 전체 공유 활동이 함께 표시됩니다',
      '여행 중 참고할 수 있도록 저장해두거나 인쇄하세요',
      '일정 관련 문의는 담당 에이전트에게 연락하세요',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" /></svg> },
  { key: 'client_final_invoice', title: '잔금 인보이스 (Final Invoice)',
    desc: '여행 출발 전 납부하는 나머지 50% 결제 요청서입니다. 어드민이 최종 가격을 확정한 뒤 에이전트가 발송합니다.',
    details: [
      '항목별 최종 확정 가격과 잔금 총액 표시 — 이 금액이 실제 청구 금액입니다',
      '(주)인터뷰 법인 도장 날인 — 공식 상업 인보이스로 은행 송금 시 참고 가능',
      '에이전트 계좌 정보 및 결제 기한 포함',
      '납부 후 에이전트에게 알리면, 어드민이 수령 확인 후 여행 준비 단계로 넘어갑니다',
    ],
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg> },
]


// ─── Helpers ──────────────────────────────────────────────────────────────────
function OwnerBadge({ owner, highlight }: { owner: 'agent' | 'admin' | 'none'; highlight: Tab }) {
  if (owner === 'none') return <span className="text-xs text-gray-400 font-medium">자동 진행</span>
  const isYou = (highlight === 'admin' && owner === 'admin') || (highlight === 'agent' && owner === 'agent')
  if (isYou) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0f4c35] text-white">내 차례</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{owner === 'admin' ? '어드민' : '에이전트'}</span>
}

// uploadKey는 Supabase Storage 저장 경로에 사용 (e.g. 'overview' → 'screenshots/guide-overview-{ts}.png')
function MultiImageField({ label, values, onChange, uploadKey }: {
  label: string; values: string[]; onChange: (urls: string[]) => void; uploadKey: string
}) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `screenshots/guide-${uploadKey}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('guide').upload(path, file, {
      upsert: true, contentType: file.type,
    })
    if (error) {
      alert('업로드 실패: ' + error.message)
    } else {
      const { data } = supabase.storage.from('guide').getPublicUrl(path)
      onChange([...values, data.publicUrl])
    }
    setUploading(false)
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i))
  }

  function updateUrl(i: number, url: string) {
    const next = [...values]; next[i] = url; onChange(next)
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      {values.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {values.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-4 text-right shrink-0">{i + 1}</span>
              <input
                type="url"
                value={url}
                onChange={e => updateUrl(i, e.target.value)}
                className="flex-1 min-w-0 text-xs font-mono border border-[#0f4c35]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0f4c35]/40 bg-white text-gray-800"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-rose-200 text-rose-400 hover:bg-rose-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0f4c35] hover:bg-[#0f4c35]/90 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {uploading ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
        {uploading ? '업로드 중…' : '이미지 추가'}
      </button>
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = '' } }}
      />
    </div>
  )
}

function EditTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <textarea
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-[#0f4c35]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0f4c35]/40 bg-white text-gray-800 resize-y leading-relaxed"
      />
    </div>
  )
}

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="flex-1 mx-2 h-4 rounded bg-white border border-gray-200 text-[9px] text-gray-400 flex items-center px-2">tikktakk</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full block" loading="lazy" onError={() => setFailed(true)} />
    </div>
  )
}

function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {urls.map((url, i) => (
        <div key={i}>
          {urls.length > 1 && (
            <p className="text-[10px] text-gray-400 mb-1">이미지 {i + 1}</p>
          )}
          <BrowserFrame src={url} alt={`${alt} ${i + 1}`} />
        </div>
      ))}
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────
function SectionCard({
  icon, title, desc, details, screenshots,
  editMode, uploadKey, onChangeScreenshots, onChangeDesc,
}: {
  icon: React.ReactNode; title: string; desc: string; details: string[]; screenshots?: string[]
  editMode: boolean
  uploadKey: string
  onChangeScreenshots: (v: string[]) => void
  onChangeDesc: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-start gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0f4c35]/8 flex items-center justify-center text-[#0f4c35] shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50">
          <ul className="mt-3 space-y-1.5">
            {details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0f4c35]/40 mt-1.5 shrink-0" />{d}
              </li>
            ))}
          </ul>
          {!editMode && screenshots && screenshots.length > 0 && (
            <ImageGallery urls={screenshots} alt={`${title} screen`} />
          )}
          {editMode && (
            <div className="mt-4 p-3 rounded-lg border border-[#0f4c35]/15 bg-[#0f4c35]/3">
              <EditTextarea label="설명 텍스트" value={desc} onChange={onChangeDesc} />
              <MultiImageField
                label="스크린샷"
                values={screenshots ?? []}
                onChange={onChangeScreenshots}
                uploadKey={uploadKey}
              />
              {screenshots && screenshots.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] text-gray-400 mb-1">미리보기</p>
                  <ImageGallery urls={screenshots} alt={`${title} screen`} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CasesFlow ────────────────────────────────────────────────────────────────
function CasesFlow({
  perspective, editMode, edits, onEdit,
}: {
  perspective: Tab
  editMode: boolean
  edits: GuideEdits
  onEdit: (type: keyof GuideEdits, key: string, value: string | string[]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  function caseSS(status: string, p: 'admin' | 'agent'): string[] {
    const k = `case_${p}_${status}`
    const saved = edits.screenshots[k]
    if (saved && saved.length > 0) return saved
    const def = DEFAULT_CASE_SS[status]?.[p]
    return def ? [def] : []
  }
  function caseAction(p: Tab, status: string): string {
    const k = `${p}_${status}`
    if (edits.actions[k]) return edits.actions[k]
    const step = CASE_STEPS.find(s => s.status === status)!
    return p === 'admin' ? step.adminAction : p === 'agent' ? step.agentAction : step.clientAction
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">케이스 진행 흐름</h3>
      <p className="text-sm text-gray-500 mb-4">
        모든 케이스는 계약 서명부터 정산까지 아래 9단계 파이프라인을 거칩니다.
        {perspective !== 'client' && ' "내 차례" 표시 단계는 직접 액션을 취해야 다음 단계로 넘어갑니다.'}
      </p>
      <div className="space-y-2">
        {CASE_STEPS.map((step, i) => {
          const c = NEUTRAL
          const isOpen = expanded === step.status
          const isYourMove =
            (perspective === 'admin' && step.owner === 'admin') ||
            (perspective === 'agent' && step.owner === 'agent')
          const actionText = caseAction(perspective, step.status)
          const screenshots = perspective !== 'client'
            ? caseSS(step.status, perspective as 'admin' | 'agent')
            : []

          return (
            <div key={step.status}>
              <button
                onClick={() => setExpanded(isOpen ? null : step.status)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  isOpen
                    ? `${c.bg} ${c.border} border`
                    : isYourMove
                    ? 'bg-[#0f4c35]/5 border border-[#0f4c35]/20 hover:border-[#0f4c35]/40'
                    : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isYourMove ? 'bg-[#0f4c35] text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </span>
                <span className={`flex-1 text-sm font-medium ${isOpen ? c.text : 'text-gray-700'}`}>{step.label}</span>
                <OwnerBadge owner={step.owner} highlight={perspective} />
                <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className={`mx-1 px-4 py-3 rounded-b-xl border border-t-0 ${c.border} ${c.bg}`}>
                  <div className="space-y-2">
                    {actionText.split('\n\n').map((para, pi) => (
                      <p key={pi} className="text-sm text-gray-700 leading-relaxed">{para}</p>
                    ))}
                  </div>
                  {!editMode && screenshots.length > 0 && (
                    <ImageGallery urls={screenshots} alt={`${step.label} screen`} />
                  )}

                  {editMode && (
                    <div className="mt-3 p-3 rounded-lg border border-[#0f4c35]/15 bg-[#0f4c35]/3 space-y-1">
                      <EditTextarea
                        label={`${perspective === 'admin' ? 'Admin' : perspective === 'agent' ? 'Agent' : 'Client'} 액션 텍스트`}
                        value={actionText}
                        onChange={v => onEdit('actions', `${perspective}_${step.status}`, v)}
                      />
                      {perspective !== 'client' && (
                        <MultiImageField
                          label={`${perspective === 'admin' ? 'Admin' : 'Agent'} 스크린샷`}
                          values={caseSS(step.status, perspective as 'admin' | 'agent')}
                          onChange={v => onEdit('screenshots', `case_${perspective}_${step.status}`, v)}
                          uploadKey={`case-${perspective}-${step.status}`}
                        />
                      )}
                      {screenshots.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-gray-400 mb-1">미리보기</p>
                          <ImageGallery urls={screenshots} alt={`${step.label} screen`} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-gray-400">잔금 결제 전(1~6단계)까지 케이스 취소가 가능합니다. 종료 상태: 완료, 취소.</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GuideContent({ defaultTab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'admin')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<GuideEdits>(EMPTY_EDITS)
  const [savedEdits, setSavedEdits] = useState<GuideEdits>(EMPTY_EDITS)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: adminRow } = await supabase
        .from('admins').select('is_super_admin').eq('auth_user_id', user.id).maybeSingle()
      if (adminRow?.is_super_admin) setIsSuperAdmin(true)

      const { data: setting } = await supabase
        .from('system_settings').select('value').eq('key', 'guide_content').maybeSingle()
      if (setting?.value) {
        const v = setting.value as Partial<{
          screenshots: Record<string, string | string[]>
          descs: Record<string, string>
          actions: Record<string, string>
        }>
        // migrate: old data stored single strings, now arrays
        const screenshots: Record<string, string[]> = {}
        for (const [k, val] of Object.entries(v.screenshots ?? {})) {
          screenshots[k] = Array.isArray(val) ? val : [val]
        }
        const loaded: GuideEdits = {
          screenshots,
          descs:   v.descs   ?? {},
          actions: v.actions ?? {},
        }
        setEdits(loaded)
        setSavedEdits(loaded)
      }
    }
    init()
  }, [])

  function setEdit(type: keyof GuideEdits, key: string, value: string | string[]) {
    setEdits(prev => ({ ...prev, [type]: { ...prev[type], [key]: value } }))
  }

  async function save() {
    setSaving(true)
    await supabase.from('system_settings').upsert({ key: 'guide_content', value: edits }, { onConflict: 'key' })
    setSavedEdits(edits)
    setEditMode(false)
    setSaving(false)
  }

  function cancel() {
    setEdits(savedEdits)
    setEditMode(false)
  }

  // Merge helpers
  function ss(key: string): string[] {
    const saved = edits.screenshots[key]
    if (saved && saved.length > 0) return saved
    const def = DEFAULT_SS[key]
    return def ? [def] : []
  }
  function desc(sectionKey: string, base: string): string {
    return edits.descs[sectionKey] || base
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'admin', label: 'Admin' },
    { key: 'agent', label: 'Agent' },
    { key: 'client', label: 'Client' },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">가이드</h1>
            <p className="text-sm text-gray-500 mt-1">역할별 TikkTakk 화면 안내 및 케이스 전체 흐름을 설명합니다.</p>
          </div>
          {isSuperAdmin && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#0f4c35] border border-gray-200 hover:border-[#0f4c35]/30 rounded-lg px-3 py-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              콘텐츠 편집
            </button>
          )}
        </div>

        {/* Edit mode banner */}
        {editMode && (
          <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 bg-[#0f4c35]/5 border border-[#0f4c35]/20 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0f4c35] animate-pulse" />
              <span className="text-sm font-medium text-[#0f4c35]">편집 모드 — 각 섹션을 열어 스크린샷 URL과 텍스트를 수정하세요</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={cancel} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                취소
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs font-medium text-white bg-[#0f4c35] hover:bg-[#0f4c35]/90 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {saving && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving ? '저장 중…' : '변경사항 저장'}
              </button>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-8 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Admin tab ── */}
        {tab === 'admin' && (
          <div className="space-y-8">
            <p className="text-sm text-gray-600 leading-relaxed">
              어드민은 (주)인터뷰를 대표해 플랫폼 전체를 운영합니다. 상품·에이전트·케이스 물류를 관리하며 스케줄 작성, 가격 확정, 결제 확인, 정산 처리를 담당합니다. <strong>슈퍼 어드민</strong>은 추가로 시스템 설정, 계약서 템플릿, 어드민 계정 관리 권한을 가집니다.
            </p>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">화면 안내</h3>
              <div className="space-y-2">
                {ADMIN_SECTIONS_BASE.map(s => (
                  <SectionCard
                    key={s.key} icon={s.icon} title={s.title}
                    desc={desc(s.key, s.desc)} details={s.details}
                    screenshots={ss(s.key)}
                    editMode={editMode} uploadKey={s.key}
                    onChangeScreenshots={v => setEdit('screenshots', s.key, v)}
                    onChangeDesc={v => setEdit('descs', s.key, v)}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="admin" editMode={editMode} edits={edits} onEdit={setEdit} />
            </div>
          </div>
        )}

        {/* ── Agent tab ── */}
        {tab === 'agent' && (
          <div className="space-y-8">
            <p className="text-sm text-gray-600 leading-relaxed">
              에이전트는 고객을 직접 응대하는 담당자입니다. 고객을 유치하고 견적을 구성하며 결제를 수금하고 어드민과 협력해 여행 전 과정을 관리합니다. 여행 후 후기 제출까지 마치면 케이스가 완료됩니다. 커미션은 케이스 완료 후 월간 환자 수에 따라 자동으로 산정됩니다.
            </p>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">온보딩 흐름</h3>
              <div className="hidden sm:flex overflow-x-auto pb-2">
                {ONBOARDING_STEPS.map((step, i) => (
                  <div key={step.label} className="flex flex-col items-center flex-1 min-w-[100px]">
                    <div className="relative w-full flex items-center justify-center h-8">
                      {i > 0 && <div className="absolute left-0 right-1/2 top-1/2 h-px bg-gray-200" />}
                      {i < ONBOARDING_STEPS.length - 1 && <div className="absolute left-1/2 right-0 top-1/2 h-px bg-gray-200" />}
                      <div className="w-7 h-7 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center z-10 relative shrink-0">{i + 1}</div>
                    </div>
                    <div className="text-center px-2 mt-1.5 pb-3">
                      <p className="text-xs font-semibold text-gray-800">{step.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="sm:hidden space-y-2">
                {ONBOARDING_STEPS.map((step, i) => (
                  <div key={step.label} className="flex gap-2 text-sm">
                    <span className="text-[#0f4c35] font-bold w-4 shrink-0">{i + 1}.</span>
                    <span className="text-gray-600"><strong>{step.label}</strong> — {step.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">화면 안내</h3>
              <div className="space-y-2">
                {AGENT_SECTIONS_BASE.map(s => (
                  <SectionCard
                    key={s.key} icon={s.icon} title={s.title}
                    desc={s.desc} details={s.details}
                    screenshots={[]}
                    editMode={false} uploadKey={s.key}
                    onChangeScreenshots={() => {}}
                    onChangeDesc={() => {}}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="agent" editMode={false} edits={edits} onEdit={setEdit} />
            </div>

            {/* ── Super admin only: edit agent guide content ── */}
            {isSuperAdmin && (
              <div className="border-t border-dashed border-[#0f4c35]/30 pt-8">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-[#0f4c35]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                  <h3 className="text-sm font-semibold text-[#0f4c35]">에이전트 가이드 콘텐츠 편집 (슈퍼 어드민 전용)</h3>
                  <span className="text-xs text-gray-400">— 에이전트에게 실제 보여지는 영문 콘텐츠입니다</span>
                </div>
                <AgentGuideContent
                  editMode={editMode}
                  edits={edits}
                  onEdit={setEdit}
                  embedded
                />
              </div>
            )}
          </div>
        )}

        {/* ── Client tab ── */}
        {tab === 'client' && (
          <div className="space-y-8">
            <p className="text-sm text-gray-600 leading-relaxed">
              고객은 TikkTakk에 별도 로그인 계정이 없습니다. 모든 고객 접점은 에이전트가 발송하는 안전한 링크를 통해 이루어집니다 — 견적서, 인보이스, 계약서, 스케줄이 여기에 해당합니다. TikkTakk 내 모든 운영은 담당 에이전트가 대신 처리합니다.
            </p>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">고객 여정</h3>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                {[
                  '에이전트에게 연락해 여행 목적과 요건을 상담합니다.',
                  '에이전트가 보낸 맞춤 견적서 링크를 확인합니다.',
                  '에이전트가 보낸 3자 계약서 링크에서 계약서에 서명합니다.',
                  '디파짓 인보이스(50%)를 납부해 예약을 확정합니다.',
                  '에이전트에게 나머지 개인 정보 및 의료 정보를 제공합니다.',
                  '에이전트가 보낸 일정표(스케줄 링크)를 확인합니다.',
                  '잔금 인보이스(50%)를 납부합니다.',
                  '여행을 즐기고 프로그램에 참여합니다.',
                  '여행 후 담당 에이전트에게 소감을 전달합니다.',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-gray-700">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">고객이 받는 문서</h3>
              <div className="space-y-2">
                {CLIENT_SECTIONS_BASE.map(s => (
                  <SectionCard
                    key={s.key} icon={s.icon} title={s.title}
                    desc={desc(s.key, s.desc)} details={s.details}
                    screenshots={ss(s.key)}
                    editMode={editMode} uploadKey={s.key}
                    onChangeScreenshots={v => setEdit('screenshots', s.key, v)}
                    onChangeDesc={v => setEdit('descs', s.key, v)}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="client" editMode={editMode} edits={edits} onEdit={setEdit} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
