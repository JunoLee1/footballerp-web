/*
 * Football ERP — Persona-based k6 Load Test
 *
 * 7 개 대표 페르소나 (HR/Coach/Finance/Asset/GM/Player/Medical) 를 seed 유저로 로그인 후
 * 시나리오에 따라 read/write workload 를 실행. side-effect 는 idempotent 만.
 *
 * Scenarios (SCENARIO env var):
 *   baseline (default) — constant VUs, 30s reads
 *   stress             — ramping VUs 50→100→200, ~2min reads
 *   write              — constant VUs, PATCH /notifications/:id/read
 *   mixed              — baseline reads + write concurrently
 *
 * PERSONA env var (optional): isolate load to one domain persona.
 *   HR_MANAGER | HEAD_COACH | FINANCE_MANAGER | ASSET_MANAGER | GM | PLAYER | MEDICAL_DIRECTOR
 *   (unset → all 7 personas round-robin, existing behaviour)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=baseline k6 run loadtest/personas.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress   k6 run loadtest/personas.k6.js
 *   # Per-domain stress
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress PERSONA=FINANCE_MANAGER k6 run loadtest/personas.k6.js
 *   # Load balancer target
 *   BASE_URL=http://localhost:3002/api SCENARIO=stress   k6 run loadtest/personas.k6.js
 *
 * CI: .github/workflows/loadtest.yml 에서 자동 실행 (nightly + manual dispatch)
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const VUS = parseInt(__ENV.VUS || '10', 10)
const DURATION = __ENV.DURATION || '30s'
const SCENARIO = __ENV.SCENARIO || 'baseline'
const PERSONA_FILTER = __ENV.PERSONA || ''

// Custom metrics — per-persona latency + error tracking + LB distribution
const personaLatency = new Trend('persona_latency', true)
const personaErrors = new Counter('persona_errors')
const upstreamHits = new Counter('lb_upstream_hits')

const ALL_PERSONAS = [
  {
    name: 'HR_MANAGER',
    email: 'hr@club.com',
    endpoints: [
      { path: '/hiring-surveys', label: 'list_surveys' },
      { path: '/plan-reports', label: 'list_plan_reports' },
      { path: '/recruitment/job-postings', label: 'list_postings' },
    ],
  },
  {
    name: 'HEAD_COACH',
    email: 'coach@club.com',
    endpoints: [
      { path: '/training', label: 'list_training_sessions' },
      { path: '/players', label: 'list_players' },
      { path: '/tactical', label: 'list_tactical' },
    ],
  },
  {
    name: 'FINANCE_MANAGER',
    email: 'finance@club.com',
    endpoints: [
      // /operating-expenses requires seasonId; /financial-reports is season-scoped.
      { path: '/operating-expenses?seasonId=1', label: 'list_operating_expenses' },
      { path: '/budget-control', label: 'list_budget_control' },
      { path: '/financial-reports/1', label: 'get_financial_report_season1' },
      // 편성 워크플로우 조회 (spec 2026-08-29). GET 이라 idempotent.
      { path: '/financial-reports/1/plan-requests', label: 'list_budget_plan_requests' },
    ],
  },
  {
    name: 'ASSET_MANAGER',
    email: 'asset@club.com',
    endpoints: [
      { path: '/equipment', label: 'list_equipment_items' },
      { path: '/asset-requests', label: 'list_asset_requests' },
      { path: '/equipment/loans', label: 'list_equipment_loans' },
    ],
  },
  {
    name: 'GM',
    email: 'gm@club.com',
    endpoints: [
      { path: '/plan-reports?filter=pending-final', label: 'list_pending_plan_reports' },
      { path: '/reports?filter=pending-final', label: 'list_pending_reports' },
      { path: '/hiring-dispatches?filter=pending-dispatch', label: 'list_pending_dispatches' },
    ],
  },
  {
    name: 'PLAYER',
    email: 'player@club.com',
    endpoints: [
      { path: '/players', label: 'list_players' },
      { path: '/training', label: 'list_training_sessions' },
      { path: '/notifications/my', label: 'list_my_notifications' },
    ],
  },
  {
    name: 'MEDICAL_DIRECTOR',
    email: 'meddir@club.com',
    endpoints: [
      { path: '/injuries/active', label: 'list_active_injuries' },
      { path: '/medical-equipment-loan', label: 'list_medical_equipment_loans' },
      { path: '/medical-expenses', label: 'list_medical_expenses' },
    ],
  },
  // ---------------------------------------------------------------------------
  // Extended personas (added 2026-09-27) — admin/staff/coaching-variant coverage
  // ---------------------------------------------------------------------------
  {
    name: 'ADMIN',
    email: 'admin@club.com',
    endpoints: [
      { path: '/admin/audit-logs', label: 'admin_audit_logs' },
      { path: '/admin/users', label: 'admin_users' },
      { path: '/departments', label: 'admin_departments' },
    ],
  },
  {
    name: 'SUPERADMIN',
    email: 'superadmin@platform.com',
    endpoints: [
      { path: '/admin/audit-logs', label: 'superadmin_audit_logs' },
      { path: '/admin/users', label: 'superadmin_users' },
      { path: '/departments', label: 'superadmin_departments' },
    ],
  },
  {
    name: 'HR_STAFF',
    email: 'hr.staff@club.com',
    endpoints: [
      { path: '/hiring-surveys', label: 'hrs_list_surveys' },
      { path: '/onboarding-tasks', label: 'hrs_list_onboarding' },
      { path: '/recruitment/job-postings', label: 'hrs_list_postings' },
    ],
  },
  {
    name: 'FINANCE_STAFF',
    email: 'finance.staff@club.com',
    endpoints: [
      { path: '/operating-expenses?seasonId=1', label: 'fs_list_operating_expenses' },
      { path: '/monthly-settlement', label: 'fs_list_monthly_settlement' },
      { path: '/expense-categories', label: 'fs_list_expense_categories' },
    ],
  },
  {
    name: 'ASSET_STAFF',
    email: 'asset.staff@club.com',
    endpoints: [
      { path: '/equipment', label: 'as_list_equipment' },
      { path: '/asset-requests', label: 'as_list_asset_requests' },
      { path: '/inventory', label: 'as_list_inventory' },
    ],
  },
  {
    name: 'FACILITY_MANAGER',
    email: 'facility.manager@club.com',
    endpoints: [
      { path: '/facility', label: 'fm_list_facility' },
      { path: '/facility/reservations', label: 'fm_list_reservations' },
      { path: '/equipment', label: 'fm_list_equipment' },
    ],
  },
  {
    name: 'FACILITY_STAFF',
    email: 'facility.staff@club.com',
    endpoints: [
      { path: '/facility', label: 'fs_list_facility' },
      { path: '/facility/reservations', label: 'fs_list_reservations' },
      { path: '/asset-requests', label: 'fs_list_asset_requests' },
    ],
  },
  {
    name: 'ASSISTANT_COACH',
    email: 'assistant@club.com',
    endpoints: [
      { path: '/training', label: 'ac_list_training' },
      { path: '/players', label: 'ac_list_players' },
      { path: '/tactical', label: 'ac_list_tactical' },
    ],
  },
  {
    name: 'ATTACKING_COACH',
    email: 'attacking@club.com',
    endpoints: [
      { path: '/training', label: 'atk_list_training' },
      { path: '/tactical', label: 'atk_list_tactical' },
      { path: '/formation-snapshots', label: 'atk_list_formations' },
    ],
  },
  {
    name: 'DEFENSIVE_COACH',
    email: 'defensive@club.com',
    endpoints: [
      { path: '/training', label: 'def_list_training' },
      { path: '/tactical', label: 'def_list_tactical' },
      { path: '/formation-snapshots', label: 'def_list_formations' },
    ],
  },
  {
    // Auth 도메인 stress — 인증된 read (login rate-limiter 회피). PLAYER 세션 사용.
    // /auth/login-history 는 admin-only (403) → 제외
    name: 'AUTH',
    email: 'player@club.com',
    endpoints: [
      { path: '/auth/me', label: 'auth_me' },
    ],
  },
  // GM 3 endpoint 개별 stress — 어느 게 병목인지 지목용 (baseline 6395ms 재현 시 어느 endpoint 가 주범인가)
  {
    name: 'GM_PLAN',
    email: 'gm@club.com',
    endpoints: [
      { path: '/plan-reports?filter=pending-final', label: 'gm_plan_reports' },
    ],
  },
  {
    name: 'GM_REPORTS',
    email: 'gm@club.com',
    endpoints: [
      { path: '/reports?filter=pending-final', label: 'gm_reports' },
    ],
  },
  {
    name: 'GM_DISPATCHES',
    email: 'gm@club.com',
    endpoints: [
      { path: '/hiring-dispatches?filter=pending-dispatch', label: 'gm_hiring_dispatches' },
    ],
  },
]

const PERSONAS = PERSONA_FILTER
  ? ALL_PERSONAS.filter((p) => p.name === PERSONA_FILTER)
  : ALL_PERSONAS

if (PERSONA_FILTER && PERSONAS.length === 0) {
  throw new Error(
    `Unknown PERSONA: ${PERSONA_FILTER} (expected: ${ALL_PERSONAS.map((p) => p.name).join('|')})`
  )
}

const PASSWORD = 'Password1!'

// -----------------------------------------------------------------------------
// setup: login each persona + prefetch a few notification ids for write workflow
// -----------------------------------------------------------------------------
export function setup() {
  const tokens = {}
  const notificationIds = {}
  for (const persona of PERSONAS) {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: persona.email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } }
    )
    if (res.status !== 200) {
      console.error(`Login failed for ${persona.name} (${persona.email}): ${res.status} ${res.body}`)
      continue
    }
    const setCookie = res.headers['Set-Cookie'] || ''
    const match = /access-token=([^;]+)/.exec(setCookie)
    if (!match) {
      console.error(`No access-token cookie for ${persona.name}`)
      continue
    }
    tokens[persona.name] = match[1]

    // Prefetch first 5 notification ids for write workflow (idempotent markRead)
    if (SCENARIO === 'write' || SCENARIO === 'mixed') {
      const notifRes = http.get(`${BASE_URL}/notifications`, {
        headers: { Cookie: `access-token=${match[1]}` },
      })
      if (notifRes.status === 200) {
        try {
          const list = notifRes.json()
          const ids = Array.isArray(list) ? list.slice(0, 5).map((n) => n.id).filter((v) => v != null) : []
          notificationIds[persona.name] = ids
        } catch {
          notificationIds[persona.name] = []
        }
      } else {
        notificationIds[persona.name] = []
      }
    }

    // PREWARM=1 env 로 활성화 — setup 단계에서 각 endpoint 1회 GET 하여 서버측 Redis 캐시 채움.
    // 램프-업 초반 cold miss 를 미리 해소하여 stress p95 tail 을 낮춤.
    if (__ENV.PREWARM === '1') {
      const cookie = `access-token=${match[1]}`
      for (const ep of persona.endpoints) {
        http.get(`${BASE_URL}${ep.path}`, { headers: { Cookie: cookie }, tags: { name: 'prewarm' } })
      }
    }

    console.log(`Setup: ${persona.name} logged in${notificationIds[persona.name] ? ` (${notificationIds[persona.name].length} notif ids)` : ''}${__ENV.PREWARM === '1' ? ' [prewarmed]' : ''}`)
    sleep(0.2)
  }
  return { tokens, notificationIds }
}

// -----------------------------------------------------------------------------
// read workflow: each VU picks a persona and runs its 3 GETs
// -----------------------------------------------------------------------------
export function readWorkflow(data) {
  const idx = (__VU - 1) % PERSONAS.length
  const persona = PERSONAS[idx]
  const token = data.tokens[persona.name]
  if (!token) {
    console.error(`No token for ${persona.name} — skipping VU=${__VU}`)
    return
  }
  const headers = { Cookie: `access-token=${token}` }

  group(persona.name, () => {
    for (const ep of persona.endpoints) {
      const url = `${BASE_URL}${ep.path}`
      const res = http.get(url, {
        headers,
        tags: { persona: persona.name, endpoint: ep.label, workload: 'read' },
      })
      const ok = check(res, {
        [`${persona.name} ${ep.label} status<500`]: (r) => r.status < 500,
      })
      personaLatency.add(res.timings.duration, { persona: persona.name, endpoint: ep.label })
      if (!ok) personaErrors.add(1, { persona: persona.name, endpoint: ep.label })
      // LB distribution tracking: nginx sets X-Upstream header
      const upstream = res.headers['X-Upstream']
      if (upstream) upstreamHits.add(1, { upstream })
    }
  })

  sleep(1)
}

// -----------------------------------------------------------------------------
// write workflow: idempotent PATCH /notifications/:id/read
// -----------------------------------------------------------------------------
export function writeWorkflow(data) {
  const idx = (__VU - 1) % PERSONAS.length
  const persona = PERSONAS[idx]
  const token = data.tokens[persona.name]
  const ids = data.notificationIds?.[persona.name] || []
  if (!token) {
    return
  }
  if (ids.length === 0) {
    // No notifications to mark; skip iteration (still counts as a light request)
    return
  }
  const headers = { Cookie: `access-token=${token}` }

  group(`${persona.name}_write`, () => {
    for (const id of ids) {
      const url = `${BASE_URL}/notifications/${id}/read`
      const res = http.patch(url, null, {
        headers,
        tags: { persona: persona.name, endpoint: 'mark_notification_read', workload: 'write' },
      })
      const ok = check(res, {
        [`${persona.name} mark_read status<500`]: (r) => r.status < 500,
      })
      personaLatency.add(res.timings.duration, { persona: persona.name, endpoint: 'mark_notification_read' })
      if (!ok) personaErrors.add(1, { persona: persona.name, endpoint: 'mark_notification_read' })
      const upstream = res.headers['X-Upstream']
      if (upstream) upstreamHits.add(1, { upstream })
    }
  })

  sleep(1)
}

// -----------------------------------------------------------------------------
// scenario selection
// -----------------------------------------------------------------------------
function buildScenarios() {
  const baseline = {
    executor: 'constant-vus',
    vus: VUS,
    duration: DURATION,
    exec: 'readWorkflow',
    tags: { scenario: 'baseline' },
  }
  const stress = {
    executor: 'ramping-vus',
    startVUs: 5,
    stages: [
      { duration: '30s', target: 50 },
      { duration: '30s', target: 100 },
      { duration: '30s', target: 200 },
      { duration: '15s', target: 0 },
    ],
    exec: 'readWorkflow',
    tags: { scenario: 'stress' },
  }
  const write = {
    executor: 'constant-vus',
    vus: 5,
    duration: DURATION,
    exec: 'writeWorkflow',
    tags: { scenario: 'write' },
  }
  const extreme = {
    executor: 'ramping-vus',
    startVUs: 5,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '30s', target: 300 },
      { duration: '60s', target: 500 },
      { duration: '30s', target: 800 },
      { duration: '15s', target: 0 },
    ],
    exec: 'readWorkflow',
    tags: { scenario: 'extreme' },
  }
  const writeHeavy = {
    executor: 'ramping-vus',
    startVUs: 5,
    stages: [
      { duration: '30s', target: 50 },
      { duration: '60s', target: 100 },
      { duration: '30s', target: 200 },
      { duration: '15s', target: 0 },
    ],
    exec: 'writeWorkflow',
    tags: { scenario: 'writeHeavy' },
  }
  if (SCENARIO === 'baseline') return { baseline }
  if (SCENARIO === 'stress') return { stress }
  if (SCENARIO === 'write') return { write }
  if (SCENARIO === 'mixed') return { baseline, write }
  if (SCENARIO === 'extreme') return { extreme }
  if (SCENARIO === 'writeHeavy') return { writeHeavy }
  throw new Error(`Unknown SCENARIO: ${SCENARIO} (expected: baseline|stress|extreme|write|writeHeavy|mixed)`)
}

// -----------------------------------------------------------------------------
// options
// -----------------------------------------------------------------------------
export const options = {
  scenarios: buildScenarios(),
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],
    persona_errors: ['count<50'],
  },
}

// Backward-compat default export (kept in case old CI configs invoke it directly)
export default function (data) {
  readWorkflow(data)
}
