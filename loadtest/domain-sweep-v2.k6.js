/*
 * Football ERP — Domain Sweep v2 (33 미테스트 도메인 확장)
 *
 * v1 (30 endpoint) 이후 TESTTODO 감사에서 확인된 미테스트 도메인 33개 추가.
 * Persona 는 각 도메인의 자연스러운 접근자 선택.
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 25s
 *   stress — ramping 5→100 VUs · ~1m
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/domain-sweep-v2.k6.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('sweep2_read_latency', true)
const domainErrors = new Counter('sweep2_errors')

const CREDS = {
  admin:    { email: 'admin@club.com',    password: 'Password1!' },
  finance:  { email: 'finance@club.com',  password: 'Password1!' },
  coach:    { email: 'coach@club.com',    password: 'Password1!' },
  hr:       { email: 'hr@club.com',       password: 'Password1!' },
  gm:       { email: 'gm@club.com',       password: 'Password1!' },
  meddir:   { email: 'meddir@club.com',   password: 'Password1!' },
  asset:    { email: 'asset@club.com',    password: 'Password1!' },
}

function loginOptional(creds) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) return null
  const cookie = res.headers['Set-Cookie'] || ''
  const m = cookie.match(/access-token=([^;]+)/)
  if (!m) return null
  return `access-token=${m[1]}`
}

function get(cookie, path, opLabel) {
  const t0 = Date.now()
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie },
    tags: { op: opLabel },
  })
  readLatency.add(Date.now() - t0)
  return res
}

// 33 미테스트 도메인 endpoint list. seasonId=1, deptId=1, matchId=1, playerId 등 seed 상수.
const DOMAIN_MAP = [
  // 20 department-asset-kit  (deptId 필요)
  { persona: 'admin',   path: '/department-asset-kits/1',                            label: 'dept_asset_kit_1' },
  // 21 inventory
  { persona: 'admin',   path: '/inventory',                                          label: 'inventory_list' },
  { persona: 'admin',   path: '/inventory/alerts',                                   label: 'inventory_alerts' },
  // 22 video
  { persona: 'admin',   path: '/videos',                                             label: 'videos_list' },
  // 23 medical-equipment-loan
  { persona: 'meddir',  path: '/medical-equipment-loan',                             label: 'med_equip_loan_list' },
  // 25 transfer-request
  { persona: 'admin',   path: '/transfer-requests',                                  label: 'transfer_requests' },
  // 26 agency
  { persona: 'admin',   path: '/agencies',                                           label: 'agencies_list' },
  // 29 league
  { persona: 'admin',   path: '/leagues',                                            label: 'leagues_list' },
  // 32 club-setting
  { persona: 'admin',   path: '/club-settings',                                      label: 'club_settings' },
  // 35 coaching-staff
  { persona: 'coach',   path: '/coaching-staff',                                     label: 'coaching_staff' },
  // 38 budget
  { persona: 'finance', path: '/budget/financial-reports/1/plan-requests',           label: 'budget_plan_requests' },
  // 40 budget-plan (별칭)
  { persona: 'finance', path: '/financial-reports/1/plan-requests',                  label: 'budget_plan_alt' },
  // 41 expense-category
  { persona: 'finance', path: '/expense-categories',                                 label: 'expense_categories' },
  // 42 revenue-adjustment
  { persona: 'finance', path: '/revenue-adjustment',                                 label: 'revenue_adjustment' },
  // 44 hiring-automation
  { persona: 'hr',      path: '/hiring-automation/league-weights',                   label: 'hiring_league_weights' },
  // 48 onboarding-task
  { persona: 'admin',   path: '/onboarding-tasks/onboarding/1',                      label: 'onboarding_tasks' },
  // 49 onboarding-template
  { persona: 'admin',   path: '/onboarding-templates/1',                             label: 'onboarding_template_1' },
  // 52 probation-review (staff-record 하위)
  { persona: 'hr',      path: '/staff-records/1/probation-reviews',                  label: 'probation_reviews' },
  // 54 plan-review
  { persona: 'admin',   path: '/plan-reviews/1',                                     label: 'plan_review_1' },
  // 56 growth-report
  { persona: 'coach',   path: '/growth-reports/position-average',                    label: 'growth_position_avg' },
  // 57 development-plan (v1 sweep 이미 커버 확인 재실행)
  // (skip — v1 커버됨)
  // 58 dashboard
  { persona: 'admin',   path: '/dashboard/stats',                                    label: 'dashboard_stats' },
  // 59 analysis
  { persona: 'admin',   path: '/analysis/rankings',                                  label: 'analysis_rankings' },
  // 60 guardian (guardian 세션 없음 → admin 으로 401 예상)
  { persona: 'admin',   path: '/guardians/me/children',                              label: 'guardian_children_admin_probe' },
  // 61 attendance-appeal
  { persona: 'coach',   path: '/attendance-appeals',                                 label: 'attendance_appeals' },
  // 63 formation-snapshot
  { persona: 'coach',   path: '/formation-snapshots/match/1',                        label: 'formation_snap_match1' },
  // 64 squad-plan
  { persona: 'coach',   path: '/squad-plan',                                         label: 'squad_plan' },
  // 66 certification
  { persona: 'admin',   path: '/certification',                                      label: 'certification' },
  // 70 webhook
  { persona: 'admin',   path: '/webhook',                                            label: 'webhook' },
  // 71 software-license (backend)
  { persona: 'admin',   path: '/software-licenses',                                  label: 'software_licenses' },
  // 44b hr top-level
  { persona: 'hr',      path: '/hr',                                                 label: 'hr_root' },
  // 50 mandatory-minimum
  { persona: 'admin',   path: '/mandatory-minimum',                                  label: 'mandatory_minimum' },
  // 51 jobs
  { persona: 'admin',   path: '/jobs',                                               label: 'jobs' },
]

const smoke = { executor: 'constant-vus', vus: 2, duration: '25s', tags: { scenario: 'smoke' } }
const stress = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: '15s', target: 5 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  tags: { scenario: 'stress' },
}

export const options = {
  scenarios: SCENARIO === 'smoke' ? { smoke } : SCENARIO === 'stress' ? { stress } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO}`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2500'],
    http_req_failed:   ['rate<0.60'], // 미테스트 도메인이라 4xx/5xx 예상, 광범위 허용
    sweep2_errors:     ['count<300'],
  },
}

export default function () {
  const cookies = {}
  for (const [k, v] of Object.entries(CREDS)) {
    cookies[k] = loginOptional(v)
  }

  for (const { persona, path, label } of DOMAIN_MAP) {
    const c = cookies[persona]
    if (!c) { domainErrors.add(1); continue }
    const r = get(c, path, label)
    if (!check(r, { [`${label} <500`]: (rr) => rr.status < 500 })) domainErrors.add(1)
  }
  sleep(1)
}
