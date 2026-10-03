import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { trainingApi } from '@/services/training.service'
import type { TrainingResultRow } from '@/types/training'
import type { Position } from '@/types/player'
import { POSITION_LABEL } from '@/types/player'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getCoachPositions } from '@/lib/coachPositionMap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts'
import { toast } from 'sonner'
import { Clipboard, Printer } from 'lucide-react'

const PRESENT_STATUSES = new Set(['PRESENT', 'LATE_AUTHORIZED', 'LATE_UNAUTHORIZED'])

function getDefaultRange() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  return { from, to }
}

interface PositionStat {
  position: string
  label: string
  avgScore: number
  attendanceRate: number
  count: number
}

interface PlayerTrend {
  name: string
  data: { date: string; score: number | null }[]
}

function aggregateByPosition(rows: TrainingResultRow[], filterPositions: Position[] | null): PositionStat[] {
  const map: Record<string, { scores: number[]; present: number; total: number }> = {}
  for (const row of rows) {
    const pos = row.player.position as Position
    if (filterPositions && !filterPositions.includes(pos)) continue
    if (!map[pos]) map[pos] = { scores: [], present: 0, total: 0 }
    if (row.performanceScore != null) map[pos].scores.push(row.performanceScore)
    map[pos].total++
    if (PRESENT_STATUSES.has(row.attendance)) map[pos].present++
  }
  return Object.entries(map).map(([pos, stat]) => ({
    position: pos,
    label: POSITION_LABEL[pos as Position] ?? pos,
    avgScore: stat.scores.length > 0
      ? Math.round((stat.scores.reduce((a, b) => a + b, 0) / stat.scores.length) * 10) / 10
      : 0,
    attendanceRate: stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0,
    count: stat.total,
  }))
}

function aggregateSessionTrend(rows: TrainingResultRow[], filterPositions: Position[] | null) {
  const map: Record<string, { present: number; total: number }> = {}
  for (const row of rows) {
    const pos = row.player.position as Position
    if (filterPositions && !filterPositions.includes(pos)) continue
    const date = row.session.date.slice(0, 10)
    if (!map[date]) map[date] = { present: 0, total: 0 }
    map[date].total++
    if (PRESENT_STATUSES.has(row.attendance)) map[date].present++
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stat]) => ({
      date: date.slice(5),
      attendanceRate: stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0,
    }))
}

function aggregatePlayerTrends(rows: TrainingResultRow[], filterPositions: Position[] | null): PlayerTrend[] {
  const playerMap: Record<string, { name: string; sessions: Record<string, number | null> }> = {}
  for (const row of rows) {
    if (row.performanceScore == null) continue
    const pos = row.player.position as Position
    if (filterPositions && !filterPositions.includes(pos)) continue
    const pid = row.player.id
    const date = row.session.date.slice(0, 10)
    if (!playerMap[pid]) playerMap[pid] = { name: row.player.playerName, sessions: {} }
    playerMap[pid].sessions[date] = row.performanceScore
  }
  const allDates = [...new Set(rows.map(r => r.session.date.slice(0, 10)))].sort()
  return Object.values(playerMap)
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      data: allDates.map(d => ({ date: d.slice(5), score: p.sessions[d] ?? null })),
    }))
}

const LINE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

export function CoachDashboardPage() {
  const { t } = useTranslation('training')
  const { user } = useCurrentUser()
  const coachPositions = getCoachPositions(user?.coachingRole)

  const [range, setRange] = useState(getDefaultRange)
  const [positionFilter, setPositionFilter] = useState<'own' | 'all'>('own')
  const [rows, setRows] = useState<TrainingResultRow[]>([])
  const [loading, setLoading] = useState(false)

  const activePositions = (positionFilter === 'own' && coachPositions) ? coachPositions : null

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await trainingApi.getResults({ from: range.from, to: range.to })
      setRows(data)
    } catch {
      toast.error(t('dashboard.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  const positionStats = aggregateByPosition(rows, activePositions)
  const sessionTrend = aggregateSessionTrend(rows, activePositions)
  const playerTrends = aggregatePlayerTrends(rows, activePositions)

  const totalSessions = [...new Set(rows.map(r => r.sessionId))].length
  const overallAttendance = rows.length > 0
    ? Math.round((rows.filter(r => PRESENT_STATUSES.has(r.attendance)).length / rows.length) * 100)
    : 0
  const missingData = rows
    .filter(r => r.performanceScore == null)
    .map(r => r.player.playerName)
  const uniqueMissing = [...new Set(missingData)]

  const roleLabel = user?.coachingRole
    ? t(`coachingRole.${user.coachingRole}`)
    : t('dashboard.defaultRole')

  const copySlack = async () => {
    const posLines = positionStats
      .map(p => `  • ${p.label}: ${p.avgScore > 0 ? p.avgScore.toFixed(1) : '—'} / ${t('dashboard.slackAttendanceLabel')} ${p.attendanceRate}%`)
      .join('\n')
    const missingLine = uniqueMissing.length > 0
      ? uniqueMissing.slice(0, 5).join(', ') + (uniqueMissing.length > 5 ? ` ${t('dashboard.more', { count: uniqueMissing.length - 5 })}` : '')
      : t('dashboard.none')

    const text = [
      t('dashboard.slackHeader', { month: range.from.slice(0, 7), role: roleLabel }),
      t('dashboard.slackPeriod', { from: range.from, to: range.to, sessions: totalSessions }),
      `━━━━━━━━━━━━━━━━━━━━`,
      t('dashboard.slackPositions'),
      posLines,
      t('dashboard.slackAttendance', { rate: overallAttendance }),
      t('dashboard.slackMissing', { names: missingLine }),
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('dashboard.slackCopied'))
    } catch {
      toast.error(t('dashboard.copyFailed'))
    }
  }

  const copyEmail = async () => {
    const header = t('dashboard.emailPositionCol').padEnd(24) + t('dashboard.emailAvgScoreCol').padEnd(12) + t('dashboard.emailAttendanceRateCol')
    const divider = '-'.repeat(44)
    const tableRows = positionStats
      .map(p => p.label.padEnd(24) + (p.avgScore > 0 ? p.avgScore.toFixed(1) : '—').padEnd(12) + `${p.attendanceRate}%`)
      .join('\n')
    const missingLine = uniqueMissing.length > 0
      ? uniqueMissing.slice(0, 10).join(', ') + (uniqueMissing.length > 10 ? ` ${t('dashboard.more', { count: uniqueMissing.length - 10 })}` : '')
      : t('dashboard.none')

    const text = [
      t('dashboard.emailSubject', { month: range.from.slice(0, 7), role: roleLabel }),
      '',
      t('dashboard.emailSummaryHeader'),
      t('dashboard.emailSummary', { from: range.from, to: range.to, sessions: totalSessions }),
      '',
      t('dashboard.emailPositionHeader'),
      header,
      divider,
      tableRows,
      '',
      t('dashboard.emailCoachComment'),
      t('dashboard.emailCoachCommentPlaceholder'),
      '',
      t('dashboard.emailMissingHeader'),
      missingLine,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('dashboard.emailCopied'))
    } catch {
      toast.error(t('dashboard.copyFailed'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{roleLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copySlack} disabled={rows.length === 0}>
            <Clipboard className="h-3.5 w-3.5 mr-1" />{t('dashboard.copySlack')}
          </Button>
          <Button variant="outline" size="sm" onClick={copyEmail} disabled={rows.length === 0}>
            <Clipboard className="h-3.5 w-3.5 mr-1" />{t('dashboard.copyEmail')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0}>
            <Printer className="h-3.5 w-3.5 mr-1" />{t('dashboard.printPdf')}
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="border-b px-6 py-3 flex flex-wrap gap-4 items-end shrink-0 bg-muted/30 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs">{t('dashboard.startDate')}</Label>
          <Input
            type="date"
            value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="w-36 h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('dashboard.endDate')}</Label>
          <Input
            type="date"
            value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="w-36 h-8 text-sm"
          />
        </div>
        {coachPositions && (
          <div className="space-y-1">
            <Label className="text-xs">{t('dashboard.positionRange')}</Label>
            <Select value={positionFilter} onValueChange={v => setPositionFilter(v as 'own' | 'all')}>
              <SelectTrigger className="w-36 h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="own">{t('dashboard.ownOnly')}</SelectItem>
                <SelectItem value="all">{t('dashboard.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button size="sm" onClick={fetchData} disabled={loading} className="h-8">
          {loading ? t('dashboard.searching') : t('dashboard.search')}
        </Button>
      </div>

      {/* 인쇄 헤더 (화면에선 숨김) */}
      <div className="hidden print:block px-6 py-4 border-b">
        <h1 className="text-xl font-bold">{t('dashboard.printTitle', { month: range.from.slice(0, 7), role: roleLabel })}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.printSubtitle', { from: range.from, to: range.to, sessions: totalSessions, rate: overallAttendance })}</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 min-h-0">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            {t('dashboard.noData')}
          </div>
        ) : (
          <>
            {/* 상단 KPI */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{totalSessions}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.totalSessions')}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{overallAttendance}%</p>
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.attendanceRate')}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{uniqueMissing.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.uneval')}</p>
              </div>
            </div>

            {/* 차트 행 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 포지션별 평균 점수 */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">{t('dashboard.positionAvgScore')}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={positionStats} margin={{ top: 4, right: 8, bottom: 24, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : String(v))} />
                    <Bar dataKey="avgScore" fill="#3b82f6" name={t('dashboard.chartAvgScore')} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 세션별 출석률 추이 */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">{t('dashboard.sessionAttendanceTrend')}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={sessionTrend} margin={{ top: 4, right: 8, bottom: 24, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Line type="monotone" dataKey="attendanceRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.chartAttendanceRate')} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 선수별 점수 추이 */}
            {playerTrends.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">{t('dashboard.playerScoreTrend')}</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={playerTrends[0].data.map((d, i) => ({
                      date: d.date,
                      ...Object.fromEntries(playerTrends.map(p => [p.name, p.data[i]?.score])),
                    }))}
                    margin={{ top: 4, right: 8, bottom: 24, left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    {playerTrends.map((p, i) => (
                      <Line
                        key={p.name}
                        type="monotone"
                        dataKey={p.name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={1.5}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 미평가 선수 알림 */}
            {uniqueMissing.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">{t('dashboard.unevalAlert', { count: uniqueMissing.length })}</p>
                <p className="text-xs text-amber-700">{uniqueMissing.join(', ')}</p>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
