'use client'

import { useState } from 'react'

type Tab = 'admin' | 'agent' | 'client'

const CASE_STEPS = [
  {
    status: 'awaiting_contract',
    label: 'Awaiting Contract',
    owner: 'agent' as const,
    agentAction: '고객에게 견적서 링크를 발송합니다. 에이전트·고객·어드민 3자 계약 서명을 조율합니다.',
    adminAction: '케이스 계약서에 카운터사인합니다.',
    clientAction: '에이전트가 보낸 링크로 견적을 확인하고 3자 계약서에 서명합니다.',
    color: 'indigo',
  },
  {
    status: 'awaiting_deposit',
    label: 'Awaiting Deposit',
    owner: 'agent' as const,
    agentAction: '고객으로부터 총 금액의 50% 디파짓을 수령합니다. 고객·여행 정보를 모두 입력하고, 디파짓을 어드민에게 전달합니다.',
    adminAction: '에이전트가 전달한 디파짓 수령을 확인합니다.',
    clientAction: '에이전트에게 디파짓(50%)을 납부합니다. 나머지 절차는 에이전트가 처리합니다.',
    color: 'orange',
  },
  {
    status: 'awaiting_schedule',
    label: 'Awaiting Schedule',
    owner: 'admin' as const,
    agentAction: '어드민이 일정표를 준비하는 동안 대기합니다.',
    adminAction: 'Schedule Editor를 사용해 일정표를 구성합니다. 날짜/블록별로 상품을 배치하고 저장하면 에이전트에게 검토 요청이 전송됩니다.',
    clientAction: '현재 일정을 준비 중입니다. 별도 조치가 필요하지 않습니다.',
    color: 'amber',
  },
  {
    status: 'reviewing_schedule',
    label: 'Reviewing Schedule',
    owner: 'agent' as const,
    agentAction: '어드민이 업로드한 일정표를 검토합니다. 확정하거나 수정 메모와 함께 재작업을 요청합니다.',
    adminAction: '에이전트 확정을 대기합니다. 수정 요청이 오면 일정을 수정하고 재업로드합니다.',
    clientAction: '에이전트가 일정을 검토 중입니다. 별도 조치가 필요하지 않습니다.',
    color: 'violet',
  },
  {
    status: 'awaiting_pricing',
    label: 'Awaiting Final Pricing',
    owner: 'admin' as const,
    agentAction: '어드민이 잔금 인보이스를 확정하는 동안 대기합니다.',
    adminAction: '항목별 최종 가격을 확정하고 잔금 인보이스(Final Invoice)를 발행합니다. 이 시점부터 가격이 고정됩니다.',
    clientAction: '최종 가격을 산정 중입니다. 별도 조치가 필요하지 않습니다.',
    color: 'blue',
  },
  {
    status: 'awaiting_payment',
    label: 'Awaiting Balance Payment',
    owner: 'agent' as const,
    agentAction: '고객에게 잔금 인보이스 링크를 발송합니다. 나머지 50% 잔금을 수령하고 어드민에게 확인합니다.',
    adminAction: '잔금 수령을 확인합니다.',
    clientAction: '에이전트에게 잔금(50%)을 납부합니다. 문의 사항은 담당 에이전트에게 연락하세요.',
    color: 'cyan',
  },
  {
    status: 'awaiting_travel',
    label: 'Awaiting Travel',
    owner: 'none' as const,
    agentAction: '현장 물류를 조율합니다. 여행이 완료되면 Mark Travel Complete를 누릅니다.',
    adminAction: '진행 상황을 모니터링합니다. 파트너 협력 사항이 있으면 처리합니다.',
    clientAction: '즐거운 여행 되세요! 현장에서 도움이 필요하면 담당 에이전트에게 연락하세요.',
    color: 'emerald',
  },
  {
    status: 'awaiting_review',
    label: 'Awaiting Review',
    owner: 'agent' as const,
    agentAction: '고객을 대신해 여행 후기 및 설문을 제출합니다.',
    adminAction: '에이전트가 후기를 제출할 때까지 대기합니다.',
    clientAction: '담당 에이전트에게 여행 소감을 전달해 주세요. 에이전트가 후기를 대신 제출합니다.',
    color: 'teal',
  },
  {
    status: 'awaiting_settlement',
    label: 'Awaiting Settlement',
    owner: 'admin' as const,
    agentAction: '어드민에게 커미션 인보이스를 발행합니다. 정산 지급을 기다립니다.',
    adminAction: '에이전트 커미션을 검토하고 지급합니다. Mark Paid를 누르면 케이스가 완료됩니다.',
    clientAction: '여행이 모두 끝났습니다. 별도 조치가 필요하지 않습니다.',
    color: 'violet',
  },
  {
    status: 'completed',
    label: 'Completed',
    owner: 'none' as const,
    agentAction: '케이스가 완전히 종료되었습니다. 커미션 정산이 완료된 상태입니다.',
    adminAction: '케이스가 완전히 종료되었습니다.',
    clientAction: '케이스 완료. 감사합니다!',
    color: 'gray',
  },
]

const NEUTRAL = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
const COLOR_MAP: Record<string, typeof NEUTRAL> = {
  indigo: NEUTRAL, orange: NEUTRAL, amber: NEUTRAL, violet: NEUTRAL,
  blue: NEUTRAL, cyan: NEUTRAL, emerald: NEUTRAL, teal: NEUTRAL, gray: NEUTRAL,
}

function OwnerBadge({ owner, highlight }: { owner: 'agent' | 'admin' | 'none'; highlight: Tab }) {
  if (owner === 'none') return <span className="text-xs text-gray-400 font-medium">자동 진행</span>
  const isYou =
    (highlight === 'admin' && owner === 'admin') ||
    (highlight === 'agent' && owner === 'agent')
  if (isYou)
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0f4c35] text-white">내 차례</span>
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      {owner === 'admin' ? '어드민' : '에이전트'}
    </span>
  )
}

function CasesFlow({ perspective }: { perspective: Tab }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">케이스 진행 흐름</h3>
      <p className="text-sm text-gray-500 mb-4">
        모든 케이스는 계약 서명부터 정산까지 아래 9단계 파이프라인을 거칩니다.
        {perspective !== 'client' && ' "내 차례" 표시 단계는 직접 액션을 취해야 다음 단계로 넘어갑니다.'}
      </p>
      <div className="space-y-2">
        {CASE_STEPS.map((step, i) => {
          const c = COLOR_MAP[step.color]
          const isOpen = expanded === step.status
          const action =
            perspective === 'admin' ? step.adminAction :
            perspective === 'agent' ? step.agentAction :
            step.clientAction
          const isYourMove =
            (perspective === 'admin' && step.owner === 'admin') ||
            (perspective === 'agent' && step.owner === 'agent')
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
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isYourMove ? 'bg-[#0f4c35] text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i + 1}
                </span>
                <span className={`flex-1 text-sm font-medium ${isOpen ? c.text : 'text-gray-700'}`}>
                  {step.label}
                </span>
                <OwnerBadge owner={step.owner} highlight={perspective} />
                <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className={`mx-1 px-4 py-3 rounded-b-xl border border-t-0 ${c.border} ${c.bg}`}>
                  <p className="text-sm text-gray-700 leading-relaxed">{action}</p>
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

// ─── Admin sections ───────────────────────────────────────────────────────────

const ADMIN_SECTIONS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    title: 'Overview',
    desc: '실시간 대시보드. 활성 케이스 수, 매출, 단계별 케이스 현황, 에이전트 성과 스파크라인을 한눈에 확인할 수 있습니다. 매일 아침 가장 먼저 확인하는 화면입니다.',
    details: [
      '파이프라인 요약 — 각 단계별 케이스 수 현황',
      '해당 기간 매출 및 커미션 수치',
      '어드민 액션이 필요한 케이스로 빠르게 접근 가능',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'Cases',
    desc: '전체 에이전트의 모든 케이스를 관리하는 핵심 화면입니다. 상태별 필터, 케이스 번호·고객명 검색, 케이스 클릭 시 상세 페이지로 이동합니다.',
    details: [
      '상태 탭으로 파이프라인 단계별 케이스만 집중해서 볼 수 있습니다',
      '케이스 상세: 계약 카운터사인, 스케줄 작성, 가격 확정, 결제 확인',
      'Schedule Editor — 날짜·블록 단위 일정 빌더, 상품 연동',
      'Edit Selected Products — 스케줄 단계에서 견적 항목 추가/삭제',
      'Finalize Pricing — 항목별 가격 확정 후 잔금 인보이스 발행',
      '케이스 취소(잔금 결제 전) — 사유 기록과 함께 처리',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
      </svg>
    ),
    title: 'Products',
    desc: '제공하는 모든 서비스의 마스터 카탈로그입니다. 카테고리(K-Medical, K-Beauty, K-Wellness 등)와 서브카테고리로 구성됩니다.',
    details: [
      '상품 추가/수정 — 가격, 파트너 정보, 이미지 관리',
      '상품 옵션(Variant) — 동일 상품의 다양한 가격/회차 등록',
      'Excel 일괄 업로드 — Dry-run 미리보기 후 확정 가능',
      'Manage Categories — 카테고리 추가 및 순서 변경',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Agents',
    desc: '에이전트 명단을 관리합니다. 신규 에이전트 초대, 온보딩 계약서 검토, NDA·파트너십 계약 카운터사인, 승인 또는 거절을 처리합니다.',
    details: [
      '이메일로 에이전트 초대 — 초대 링크를 통해 온보딩 시작',
      'NDA·파트너십 계약 카운터사인 — 모든 계약 서명 완료 후 에이전트 활성화 가능',
      'Approve & Activate — 모든 계약이 카운터사인 된 후 활성화',
      '에이전트별 활성 케이스 수, 커미션 요율, 월간 완료 환자 수 확인',
      '담당 어드민 배정 (슈퍼 어드민 전용)',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Clients',
    desc: '전체 에이전트의 고객 통합 데이터베이스입니다. 여권 정보, 의료 이력, 식이·기도 등 무슬림 친화 설정을 포함한 상세 프로필을 조회합니다.',
    details: [
      '고객 프로필: 여권 정보, 병력, 식이 제한, 기도 시간·장소 등 무슬림 친화 설정 포함',
      '각 고객의 담당 에이전트로 바로 이동 가능',
      '필수 필드 미입력 시 케이스 다음 단계 진행 불가',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Settlement',
    desc: '에이전트 커미션 정산을 추적하고 처리합니다. 케이스가 완료되면 정산 레코드가 자동 생성됩니다.',
    details: [
      '정산 대기 목록 — 커미션 인보이스가 발행된 케이스 확인',
      '송금 완료 후 지급일 입력 → 정산 완료 처리',
      'Partner Payouts — 병원, 호텔 등 협력사별 결제 현황 추적',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'Contracts',
    desc: '에이전트 온보딩 시 서명하는 NDA·파트너십 계약서 템플릿을 관리합니다. 변경 사항은 신규 에이전트부터 적용됩니다.',
    details: [
      'NDA 본문 편집 — 에이전트 활성화 전 서명하는 비밀유지계약서',
      '파트너십 계약 본문 편집 — 커미션 및 협력 조건',
      '슈퍼 어드민만 수정 가능, 일반 어드민은 조회만 가능',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    title: 'Surveys',
    desc: '여행 후 설문 질문을 관리하고 제출된 응답을 조회합니다.',
    details: [
      '질문 탭 — 여행 후 설문 질문 추가·수정·순서 변경 (슈퍼 어드민 전용)',
      '응답 탭 — 케이스별 제출된 설문 응답 전체 조회',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25-2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    title: 'Admins',
    desc: '어드민 계정을 관리합니다. 슈퍼 어드민에게만 표시됩니다.',
    details: [
      '이메일로 신규 어드민 초대 — 본인이 직접 비밀번호 설정',
      '슈퍼 어드민 지정 — 템플릿 편집, 어드민 관리 등 전체 권한 부여',
      '어드민 계정 삭제 (본인 계정은 삭제 불가)',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
    title: 'Audit Log',
    desc: '시스템에서 발생한 모든 주요 작업의 불변 기록입니다. 누가, 무엇을, 언제 했는지 추적합니다.',
    details: [
      '케이스 상태 변경, 상품 편집, 에이전트 초대, 계약 서명, 결제 확인 등 기록',
      '행위자 유형(어드민/에이전트/시스템) 및 날짜 범위로 필터링',
      '컴플라이언스, 분쟁 해결, 온보딩 검토에 활용',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Settings',
    desc: '시스템 전역 설정입니다. 슈퍼 어드민만 수정 가능하며, 일반 어드민은 조회만 가능합니다.',
    details: [
      '환율(KRW/USD) — 전체 가격 계산에 사용',
      '회사 마진율 — 에이전트 마진 적용 전 원가에 더해지는 비율',
      '계좌 정보 — 고객 인보이스에 표시되는 입금 계좌',
      '디파짓 비율 — 기본 디파짓 비율 (현재 50%)',
      '회사 도장 — 최종 인보이스에 삽입되는 법인 도장 이미지',
      '온보딩 OT — 신규 에이전트에게 보여주는 오리엔테이션 자료',
    ],
  },
]

// ─── Agent sections ───────────────────────────────────────────────────────────

const AGENT_SECTIONS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    title: 'Home',
    desc: '하루를 시작하는 메인 화면입니다. 지금 당장 내가 처리해야 할 케이스와 이번 달 활동 요약을 보여줍니다.',
    details: [
      'Action Required — 다음 단계로 넘어가려면 내가 직접 처리해야 하는 케이스 목록',
      '월별 통계: 활성 케이스, 완료 여행, 발생 매출',
      '신규 케이스 빠른 생성 — 상품 선택 및 견적 구성',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
    title: 'Cases',
    desc: '내가 담당하는 모든 케이스 목록입니다. 파이프라인 단계별로 정리되어 있습니다.',
    details: [
      '상태 탭으로 내 액션이 필요한 케이스와 대기 중인 케이스를 구분해서 볼 수 있습니다',
      '케이스 상세: 고객 정보 입력, 문서 링크 발송, 스케줄 확정, 여행 완료 처리',
      '견적서·인보이스·스케줄 링크를 복사해 고객에게 바로 발송 가능',
      '케이스 취소(잔금 결제 전) — 취소 사유와 함께 처리',
      '어드민에게만 보이는 내부 메모(Agent Notes) 작성 가능',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Clients',
    desc: '내 고객 데이터베이스입니다. 고객 프로필에는 여행 선호도, 의료 정보, 무슬림 친화 요건이 저장됩니다.',
    details: [
      '고객 프로필을 직접 생성하거나, 케이스 생성 시 자동으로 연결됩니다',
      '필수 필드가 모두 입력되어야 케이스가 스케줄 단계로 진행됩니다',
      '여권, 비상 연락처, 병력, 생활 습관, 식이·무슬림 친화 설정 등 상세 관리',
      '한 고객이 여러 케이스에 등록될 수 있습니다 (재방문 고객)',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Payouts',
    desc: '나의 커미션 지급 내역입니다. 완료 케이스별 정산 레코드를 확인할 수 있습니다.',
    details: [
      '정산 번호, 케이스 번호, KRW 금액, 지급일 조회',
      '커미션 요율은 월간 완료 환자 수에 따라 자동 계산됩니다',
      '요율 구간: 15%(0~10명) / 20%(11~30명) / 25%(31명+)',
      '매월 초기화 — 케이스 단위가 아닌 환자 단위 집계 (그룹 4명 = 4명 카운트)',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Dashboard',
    desc: '내 성과 대시보드입니다. 케이스 볼륨, 매출 추이, 고객 증가 등을 차트로 확인합니다.',
    details: [
      '월별 케이스 완료 수 vs. 활성 파이프라인',
      '기간별 발생 매출',
      '환자 수 추적 (커미션 요율 구간에 영향)',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    title: 'Profile',
    desc: '계정 설정 화면입니다. 개인 정보, 커미션 수령 계좌 정보, 비밀번호 변경을 관리합니다.',
    details: [
      '이름, 전화번호, 국가, 이메일 (이메일 변경은 어드민 문의)',
      '계좌 정보 — 커미션 정산금이 입금될 계좌',
      '비밀번호 변경',
    ],
  },
]

// ─── Onboarding flow ──────────────────────────────────────────────────────────

const ONBOARDING_STEPS = [
  { label: '초대', desc: '어드민이 이메일로 초대 링크를 발송합니다.' },
  { label: '오리엔테이션', desc: '온보딩 자료를 읽고 확인합니다.' },
  { label: 'NDA', desc: '신원 정보를 입력하고 비밀유지계약서에 서명합니다.' },
  { label: '파트너십', desc: '파트너십 계약서(커미션 조건)에 서명합니다.' },
  { label: '승인 대기', desc: '어드민이 두 계약서를 검토하고 카운터사인합니다. 완료되면 알림을 받습니다.' },
  { label: '계정 설정', desc: '이메일, 비밀번호, 계좌 정보를 등록합니다.' },
  { label: '활성화', desc: '에이전트 대시보드에 접근해 케이스 생성을 시작합니다.' },
]

// ─── Client sections ──────────────────────────────────────────────────────────

const CLIENT_TOUCH_POINTS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: '견적서 (Quote)',
    desc: '에이전트가 발송하는 초기 가격 안내서입니다. 선택된 상품, 그룹별 구성, 예상 총액을 확인할 수 있습니다.',
    details: [
      '고유 링크로 접근 — 별도 로그인 불필요',
      '상품 목록, 그룹 인원별 수량, 예상 금액 표시',
      '어드민이 최종 가격을 확정하기 전까지 유효한 견적입니다',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75m-7.5-7.5h15M3.75 4.5h16.5A2.25 2.25 0 0122.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 17.25V6.75A2.25 2.25 0 013.75 4.5z" />
      </svg>
    ),
    title: '3자 계약서',
    desc: '고객·에이전트·(주)인터뷰 3자 간의 공식 계약서입니다. 에이전트에게서 링크를 받아 온라인으로 서명합니다.',
    details: [
      '서명 전 계약서 전문을 꼼꼼히 읽어주세요',
      '본인 확인을 위해 이름을 직접 입력합니다',
      '서명 패드에 전자 서명을 진행합니다',
      '고객·에이전트·어드민 3자 모두 서명해야 다음 단계로 넘어갑니다',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    title: '디파짓 인보이스',
    desc: '총 금액의 50%에 해당하는 첫 번째 결제 요청서입니다. 에이전트가 링크를 발송하면 납부하여 예약을 확정합니다.',
    details: [
      'USD 및 KRW 환산 금액 표시',
      '에이전트 계좌 정보 포함',
      '수령 확인 후 일정 준비가 시작됩니다',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
      </svg>
    ),
    title: '스케줄 (일정표)',
    desc: '맞춤 제작된 날짜별 여행 일정표입니다. 확정 후 에이전트가 링크를 공유합니다.',
    details: [
      '일별 오전·오후·저녁 블록으로 구성',
      '각 블록에 서비스명, 클리닉/장소, 시간 표시',
      '그룹 여행의 경우 구성원별 일정이 다를 수 있습니다',
      '여행 중 참고를 위해 PDF로 인쇄하거나 저장하세요',
    ],
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    title: '잔금 인보이스 (Final Invoice)',
    desc: '여행 출발 전 납부하는 나머지 50% 결제 요청서입니다. 가격 확정 후 에이전트가 발송합니다.',
    details: [
      '항목별 최종 가격과 잔금 총액 표시',
      '법인 도장 및 계좌 정보 포함',
      '납부 완료 시 예약이 최종 확정됩니다',
    ],
  },
]

function SectionCard({ icon, title, desc, details }: { icon: React.ReactNode; title: string; desc: string; details: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-start gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0f4c35]/8 flex items-center justify-center text-[#0f4c35] shrink-0 mt-0.5">
          {icon}
        </span>
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
                <span className="w-1.5 h-1.5 rounded-full bg-[#0f4c35]/40 mt-1.5 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GuideContent({ defaultTab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'admin')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'admin', label: 'Admin' },
    { key: 'agent', label: 'Agent' },
    { key: 'client', label: 'Client' },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">가이드</h1>
          <p className="text-sm text-gray-500 mt-1">
            역할별 Tiktak 화면 안내 및 케이스 전체 흐름을 설명합니다.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-8 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Admin tab ── */}
        {tab === 'admin' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0f4c35]">역할</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                어드민은 (주)인터뷰를 대표해 플랫폼 전체를 운영합니다. 상품·에이전트·케이스 물류를 관리하며 스케줄 작성, 가격 확정, 결제 확인, 정산 처리를 담당합니다. <strong>슈퍼 어드민</strong>은 추가로 시스템 설정, 계약서 템플릿, 어드민 계정 관리 권한을 가집니다.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">화면 안내</h3>
              <div className="space-y-2">
                {ADMIN_SECTIONS.map(s => (
                  <SectionCard key={s.title} {...s} />
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="admin" />
            </div>
          </div>
        )}

        {/* ── Agent tab ── */}
        {tab === 'agent' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0f4c35]">역할</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                에이전트는 고객을 직접 응대하는 담당자입니다. 고객을 유치하고 견적을 구성하며 결제를 수금하고 어드민과 협력해 여행 전 과정을 관리합니다. 여행 후 후기 제출까지 마치면 케이스가 완료됩니다. 커미션은 케이스 완료 후 월간 환자 수에 따라 자동으로 산정됩니다.
              </p>
            </div>

            {/* Onboarding flow */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">온보딩 흐름</h3>
              <div className="flex flex-col sm:flex-row gap-0 overflow-x-auto pb-1">
                {ONBOARDING_STEPS.map((step, i) => (
                  <div key={step.label} className="flex sm:flex-col items-start sm:items-center gap-2 sm:gap-1 min-w-0 sm:min-w-[96px] sm:max-w-[110px]">
                    <div className="flex sm:flex-col items-center gap-2 sm:gap-0 w-full">
                      <div className="flex items-center w-full sm:w-auto sm:flex-col">
                        {i > 0 && <div className="hidden sm:block h-px w-full bg-gray-200 -mt-4 mb-0" />}
                        <div className="w-7 h-7 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center shrink-0 z-10">
                          {i + 1}
                        </div>
                        {i < ONBOARDING_STEPS.length - 1 && (
                          <div className="flex-1 h-px bg-gray-200 sm:hidden ml-1" />
                        )}
                      </div>
                    </div>
                    <div className="sm:text-center pb-3 sm:pb-0">
                      <p className="text-xs font-semibold text-gray-800 whitespace-nowrap sm:whitespace-normal sm:mt-1.5">{step.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed hidden sm:block">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Mobile: show descriptions separately */}
              <div className="sm:hidden mt-3 space-y-2">
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
                {AGENT_SECTIONS.map(s => (
                  <SectionCard key={s.title} {...s} />
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="agent" />
            </div>
          </div>
        )}

        {/* ── Client tab ── */}
        {tab === 'client' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0f4c35]">역할</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                고객은 Tiktak에 별도 로그인 계정이 없습니다. 모든 고객 접점은 에이전트가 발송하는 안전한 링크를 통해 이루어집니다 — 견적서, 인보이스, 계약서, 스케줄이 여기에 해당합니다. Tiktak 내 모든 운영은 담당 에이전트가 대신 처리합니다.
              </p>
            </div>

            {/* Client journey */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">고객 여정</h3>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="space-y-3">
                  {[
                    { step: '1', text: '에이전트에게 연락해 여행 목적과 요건을 상담합니다.' },
                    { step: '2', text: '에이전트가 보낸 맞춤 견적서 링크를 확인합니다.' },
                    { step: '3', text: '에이전트가 보낸 3자 계약서 링크에서 계약서에 서명합니다.' },
                    { step: '4', text: '디파짓 인보이스(50%)를 납부해 예약을 확정합니다.' },
                    { step: '5', text: '에이전트에게 나머지 개인 정보 및 의료 정보를 제공합니다.' },
                    { step: '6', text: '에이전트가 보낸 일정표(스케줄 링크)를 확인합니다.' },
                    { step: '7', text: '잔금 인보이스(50%)를 납부합니다.' },
                    { step: '8', text: '여행을 즐기고 프로그램에 참여합니다.' },
                    { step: '9', text: '여행 후 담당 에이전트에게 소감을 전달합니다.' },
                  ].map(item => (
                    <div key={item.step} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {item.step}
                      </span>
                      <p className="text-sm text-gray-700">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">고객이 받는 문서</h3>
              <div className="space-y-2">
                {CLIENT_TOUCH_POINTS.map(s => (
                  <SectionCard key={s.title} {...s} />
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <CasesFlow perspective="client" />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
