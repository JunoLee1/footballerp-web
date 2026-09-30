import http from 'k6/http'
import { check } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://localhost:3001/api'
const COOKIE = __ENV.COOKIE || ''

const DOMAINS = [
  '/facility', '/department-asset-kits', '/inventory', '/videos', '/medical-equipment-loan',
  '/agencies',
  '/teams', '/seasons', '/leagues', '/matches', '/clubs', '/club-settings',
  '/coaches', '/coach-availabilities', '/coaching-staff', '/training-loads', '/training-references',
  '/expense-categories', '/revenue-adjustment', '/account-codes',
  '/hiring-automation', '/hr', '/hr-reports', '/staff-records', '/onboarding-tasks', '/onboarding-templates', '/probation-reviews',
  '/ops-reports', '/plan-reviews', '/incident-reports', '/growth-reports', '/development-plans', '/dashboard', '/analysis',
  '/guardians', '/attendance-appeals', '/department-review-configs', '/formation-snapshots', '/tactical', '/certification',
  '/countries', '/software-licenses',
  // 유소년 · 학부모 domain 추가 (2026-09-30 배치)
  '/youth-registrations', '/academy-fees', '/player-callups',
  '/guardians/me/children', '/dashboard/youth-development', '/dashboard/academy-finance',
]

// Per-domain trends
const trends = {}
for (const d of DOMAINS) trends[d] = new Trend(`p95_${d.replace(/[^a-z0-9]/gi, '_').replace(/^_/, '')}`, true)
const failRate = new Rate('domain_fail_rate')

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '20s', target: 30 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<3000'],
    'http_req_failed': ['rate<0.5'],
  },
}

export default function () {
  for (const d of DOMAINS) {
    const res = http.get(`${BASE}${d}`, { headers: { Cookie: COOKIE }, tags: { domain: d } })
    trends[d].add(res.timings.duration)
    failRate.add(!check(res, { 'not 500': (r) => r.status !== 500 }))
  }
}
