import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { trainingApi } from '@/services/training.service'
import type { TrainingResultRow } from '@/types/training'
import { ATTENDANCE_LABEL, ATTENDANCE_STYLE, SESSION_TYPE_LABEL } from '@/types/training'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface StatCard {
  label: string
  value: number | string
  sub?: string
  color?: string
}

function StatBox({ label, value, sub, color }: StatCard) {
  return (
    <div className="border rounded-lg px-4 py-3 flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function TrainingPlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const [rows, setRows] = useState<TrainingResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!playerId) return
    setLoading(true)
    trainingApi.getResults({ playerId })
      .then(data => {
        // 날짜 오름차순 정렬 (차트용)
        setRows([...data].sort((a, b) => a.session.date.localeCompare(b.session.date)))
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [playerId])

  const playerInfo = rows[0]?.player

  const stats = useMemo(() => {
    const total = rows.length
    const present = rows.filter(r => r.attendance === 'PRESENT').length
    const absentUnauth = rows.filter(r => r.attendance === 'ABSENT_UNAUTHORIZED').length
    const absentAuth = rows.filter(r => r.attendance === 'ABSENT_AUTHORIZED').length
    const lateUnauth = rows.filter(r => r.attendance === 'LATE_UNAUTHORIZED').length
    const lateAuth = rows.filter(r => (r.attendance as string) === 'LATE_AUTHORIZED').length
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0
    const scores = rows.filter(r => r.performanceScore != null).map(r => r.performanceScore!)
    const avgScore = scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : '—'
    return { total, present, absentUnauth, absentAuth, lateUnauth, lateAuth, attendanceRate, avgScore }
  }, [rows])

  const chartData = useMemo(() =>
    rows
      .filter(r => r.performanceScore != null)
      .map(r => ({
        date: format(new Date(r.session.date), 'MM/dd'),
        score: r.performanceScore,
        type: SESSION_TYPE_LABEL[r.session.sessionType] ?? r.session.sessionType,
      })),
    [rows],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        불러오는 중...
      </div>
    )
  }

  if (error || !playerInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-muted-foreground text-sm">데이터를 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>뒤로</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{playerInfo.playerName}</h1>
          <p className="text-sm text-muted-foreground">{playerInfo.position}</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-6">
        {/* 출결 요약 */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">출결 요약</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="총 세션" value={stats.total} />
            <StatBox
              label="출석률"
              value={`${stats.attendanceRate}%`}
              sub={`${stats.present}회 출석`}
              color={stats.attendanceRate >= 80 ? 'text-green-600' : stats.attendanceRate >= 60 ? 'text-amber-500' : 'text-red-500'}
            />
            <StatBox
              label="무단 결석"
              value={stats.absentUnauth}
              sub={stats.lateUnauth > 0 ? `무단 지각 ${stats.lateUnauth}회` : undefined}
              color={stats.absentUnauth > 0 ? 'text-red-500' : undefined}
            />
            <StatBox
              label="평균 퍼포먼스"
              value={stats.avgScore}
              sub={`${chartData.length}회 평가됨`}
            />
          </div>
        </section>

        {/* 퍼포먼스 성장 그래프 */}
        {chartData.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              퍼포먼스 점수 추이
            </h2>
            <div className="border rounded-lg p-4 bg-card">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value) => [typeof value === 'number' ? value : Number(value), '점수']}
                    labelFormatter={(label, payload) => {
                      const type = payload?.[0]?.payload?.type
                      return `${label}${type ? ` · ${type}` : ''}`
                    }}
                  />
                  <ReferenceLine y={5} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* 세션별 결과 테이블 */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">세션별 결과</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>날짜</TableHead>
                  <TableHead className="w-36">세션 유형</TableHead>
                  <TableHead className="w-32">출결</TableHead>
                  <TableHead className="w-20 text-right">점수</TableHead>
                  <TableHead>피드백</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-sm">
                      {format(new Date(r.session.date), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {SESSION_TYPE_LABEL[r.session.sessionType] ?? r.session.sessionType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-normal', ATTENDANCE_STYLE[r.attendance])}
                      >
                        {ATTENDANCE_LABEL[r.attendance] ?? r.attendance}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.performanceScore ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {r.feedback ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  )
}
