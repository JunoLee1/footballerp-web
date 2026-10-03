import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { dashboardApi } from '@/services/dashboard.service'
import type { FinanceDashboard, TrendEntry } from '@/services/dashboard.service'
import { seasonApi } from '@/services/season.service'
import { useFinancialReport } from '@/services/budget-plan.service'
import { computeSponsorUncollected } from '@/pages/finance/sponsorUncollected'
import type { Season, WageCapKPI } from '@/types/season'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AvailableBudgetCard } from '@/components/finance/AvailableBudgetCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const FIELD_LABELS: Record<string, string> = {
  TICKET: '입장권',
  SPONSORSHIP: '스폰서십',
  BROADCAST: '방송권',
  MERCHANDISE: '상품',
  SUBSIDY: '보조금',
  PARENT_COMPANY: '모기업',
  ACADEMY_FEE: '아카데미',
  OTHER: '기타',
}
const DONUT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#6b7280',
]

function Gauge({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{actual.toLocaleString()}</span>
        <span>{target.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function DashboardCharts() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | undefined>()
  const [viewMode, setViewMode] = useState<'season' | 'month'>('season')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [data, setData] = useState<FinanceDashboard | null>(null)
  const [wageCapKpi, setWageCapKpi] = useState<WageCapKPI | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    seasonApi.list().then((list) => {
      setSeasons(list)
      const active = list.find((s) => s.status === 'ACTIVE')
      if (active) setSelectedSeasonId(active.id)
    }).catch(() => toast.error('시즌 목록을 불러오지 못했습니다'))
    // WageCapKPI is always sourced from the currently active season on the
    // backend (`/seasons/active/wage-cap-kpi`) — no need to refetch when the
    // dashboard's season filter changes.
    seasonApi.getWageCapKPI().then(setWageCapKpi).catch(() => setWageCapKpi(null))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params: { seasonId?: number; year?: number; month?: number } = {}
    if (viewMode === 'season') {
      if (selectedSeasonId) params.seasonId = selectedSeasonId
    } else {
      params.year = year
      params.month = month
    }
    dashboardApi
      .getFinance(params)
      .then(setData)
      .catch(() => toast.error('대시보드 데이터를 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [selectedSeasonId, viewMode, year, month])

  // ADR 0024: 시즌 뷰일 때 sponsorship 미수금 배지 표시.
  // dashboardApi 응답은 Actual (cash) 만 담으므로 FinancialReport 를 병행 조회해서
  // expectedRevenueSponsorship 을 얻는다. Monthly 뷰나 seasonId 미선택 시엔 disable.
  const { data: financialReport } = useFinancialReport(
    viewMode === 'season' ? selectedSeasonId ?? null : null,
  )
  const sponsorUncollected = computeSponsorUncollected(
    financialReport?.plannedRevenueSponsorship,
    financialReport?.expectedRevenueSponsorship,
  )

  const donutSource = viewMode === 'season' ? data?.donut.season : data?.donut.monthly
  const donutEntries = donutSource
    ? Object.entries(donutSource)
        .filter(([, v]) => v > 0)
        .map(([key, value], i) => ({
          name: FIELD_LABELS[key] ?? key,
          value,
          color: DONUT_COLORS[i % DONUT_COLORS.length],
        }))
    : []

  const trendData = (data?.trend ?? []).map((e: TrendEntry) => ({
    label: `${e.year}-${String(e.month).padStart(2, '0')}`,
    수익: e.totalRevenue,
    지출: e.totalExpense,
    순이익: e.netIncome,
  }))

  const gauges = data?.gauges

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">재무 대시보드</h1>

        {/* View mode toggle */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setViewMode('season')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'season' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            시즌 전체
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 border-l transition-colors ${viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            특정 월
          </button>
        </div>

        {viewMode === 'season' ? (
          <Select
            value={selectedSeasonId ? String(selectedSeasonId) : ''}
            onValueChange={(v) => setSelectedSeasonId(Number(v))}
          >
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="시즌 선택">
                {seasons.find((s) => s.id === selectedSeasonId)?.name ?? '시즌 선택'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)} label={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true)
            const params: { seasonId?: number; year?: number; month?: number } = {}
            if (viewMode === 'season') {
              if (selectedSeasonId) params.seasonId = selectedSeasonId
            } else {
              params.year = year
              params.month = month
            }
            dashboardApi
              .getFinance(params)
              .then(setData)
              .catch(() => toast.error('새로고침 실패'))
              .finally(() => setLoading(false))
          }}
        >
          새로고침
        </Button>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground animate-pulse">데이터 로딩 중...</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DonutChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <span>수익 구성 ({viewMode === 'season' ? '시즌 전체' : `${year}년 ${month}월`})</span>
              {sponsorUncollected > 0 && (
                <span
                  className="text-xs font-normal text-amber-600"
                  data-testid="dashboard-sponsor-uncollected-badge"
                  title="스폰서십 SponsorshipPayment.dueDate 기준 예상 - 실지급 (ADR 0024)"
                >
                  스폰서십 미수금 {sponsorUncollected.toLocaleString()}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {donutEntries.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                데이터 없음
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={donutEntries}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                  >
                    {donutEntries.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => (typeof value === 'number' ? value.toLocaleString() : String(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* GaugeGroup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">성과 지표</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {gauges ? (
              <>
                <Gauge
                  label="수익달성률"
                  actual={gauges.revenueAchievement.actual}
                  target={gauges.revenueAchievement.target}
                />
                <Gauge
                  label="예산소진율"
                  actual={gauges.budgetConsumption.spent}
                  target={gauges.budgetConsumption.approved}
                />
                <Gauge
                  label="월기여도"
                  actual={gauges.monthlyContribution.monthly}
                  target={gauges.monthlyContribution.annualTarget}
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                데이터 없음
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available budget KPI (4th card): active season's 총 가용 예산. */}
        {wageCapKpi && <AvailableBudgetCard kpi={wageCapKpi} />}
      </div>

      {/* BarLineChart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">월별 수익/지출/순이익 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              데이터 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString())}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString())}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(value) => (typeof value === 'number' ? value.toLocaleString() : String(value))} />
                <Legend />
                <Bar yAxisId="left" dataKey="수익" fill="#3b82f6" />
                <Bar yAxisId="left" dataKey="지출" fill="#ef4444" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="순이익"
                  stroke="#22c55e"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
