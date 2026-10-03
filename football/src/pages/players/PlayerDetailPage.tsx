import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { getCountryName } from '@/lib/countryName'
import { maskDateOfBirth } from '@/lib/pii'
import { playerApi } from '@/services/player.service'
import { teamApi } from '@/services/team.service'
import type { PlayerDetail, PlayerStatus, PositionZone, MarketValueEntry } from '@/types/player'
import {
  POSITION_ABBR,
  POSITION_ZONE,
  WORK_PERMIT_LABEL,
  WORK_PERMIT_STYLE,
} from '@/types/player'
import type { WorkPermitStatus } from '@/types/prospect'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ArrowLeft, Pencil, ShieldAlert, Trash2, TrendingUp } from 'lucide-react'
import { useConfirm } from '@/lib/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlayerFormDialog } from './PlayerFormDialog'
import { PlayerStatusDialog } from './PlayerStatusDialog'
import { PlayerDevelopmentPlanTab } from './PlayerDevelopmentPlanTab'
import { StatsTab } from './tabs/StatsTab'
import { JerseyTab } from './tabs/JerseyTab'
import { MotivationTab } from './tabs/MotivationTab'
import { GrowthReportTab } from './tabs/GrowthReportTab'
import { PositionDiversityChart } from '@/components/players/PositionDiversityChart'
import { SecondaryPositionsModule } from '@/components/player/SecondaryPositionsModule'
import { playerPdiApi, type PositionDiversityEntry } from '@/services/playerPdi.service'
import { LiteModeGate } from '@/components/ui/LiteModeGate'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const ZONE_STYLE: Record<PositionZone, { badge: string; avatar: string }> = {
  GK: { badge: 'bg-amber-100 text-amber-800 border-amber-300', avatar: 'bg-amber-100 text-amber-800' },
  DEF: { badge: 'bg-blue-100 text-blue-800 border-blue-300', avatar: 'bg-blue-100 text-blue-800' },
  MID: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', avatar: 'bg-emerald-100 text-emerald-800' },
  FWD: { badge: 'bg-rose-100 text-rose-800 border-rose-300', avatar: 'bg-rose-100 text-rose-800' },
}

const STATUS_STYLE: Record<PlayerStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  ON_LOAN: 'bg-purple-100 text-purple-800 border-purple-200',
  RELEASED: 'bg-gray-100 text-gray-600 border-gray-200',
  RETIRED: 'bg-gray-100 text-gray-500 border-gray-200',
}

function calcAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatSalary(salary: number): string {
  if (salary >= 100_000_000) return `${(salary / 100_000_000).toFixed(1)}억원`
  if (salary >= 10_000) return `${(salary / 10_000).toFixed(0)}만원`
  return `${salary.toLocaleString()}원`
}

function fmtMv(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`
  return String(v)
}

function fmtMvTick(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`
  return String(v)
}

interface StatRowProps {
  label: string
  value: string | number
}
function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

export function PlayerDetailPage() {
  const { t, i18n } = useTranslation('player')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useCurrentUser()
  const [player, setPlayer] = useState<PlayerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const [mvHistory, setMvHistory] = useState<MarketValueEntry[]>([])
  const [mvInput, setMvInput] = useState('')
  const [mvSaving, setMvSaving] = useState(false)
  const [pdiData, setPdiData] = useState<PositionDiversityEntry[]>([])
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoteTeamId, setPromoteTeamId] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [availableTeams, setAvailableTeams] = useState<Array<{id: number; name: string}>>([])
  const [allergyEditMode, setAllergyEditMode] = useState(false)
  const [allergyInput, setAllergyInput] = useState('')
  const [allergySaving, setAllergySaving] = useState(false)
  const [wpStatus, setWpStatus] = useState<WorkPermitStatus>('NOT_REQUIRED')
  const [wpExpiry, setWpExpiry] = useState('')
  const [wpSaving, setWpSaving] = useState(false)

  const confirm = useConfirm()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'
  const canChangeStatus = user?.role === 'ADMIN'
  const canPromote = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || (user?.role as string) === 'GM'
  const isOwnProfile = user?.role === 'PLAYER' && player?.userId === user?.id
  const canSeeMarketValue =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && user.frontOfficeRole === 'TD')
  const canUpdateMarketValue = canSeeMarketValue
  const canSeeContract =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && user.frontOfficeRole === 'TD')
  const isYouthPlayer = player?.team?.type === 'YOUTH'
  const hasYouthHistory = !!(player?.promotedFromYouthAt || player?.youthOriginTeamId)
  const canCoachGrowth =
    user?.role === 'ADMIN' ||
    user?.role === 'COACHING_STAFF'
  const canAssignJersey = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'
  const canRetireJersey =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && user.frontOfficeRole === 'TD')
  const canReactivateJersey = user?.role === 'ADMIN'
  const canEditAllergies =
    user?.role === 'ADMIN' ||
    (user?.role === 'COACHING_STAFF' &&
      (user?.coachingRole === 'MEDICAL' || user?.coachingRole === 'MEDICAL_DIRECTOR'))
  const canUpdateWorkPermit =
    user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' &&
      (user?.frontOfficeRole === 'TD' || user?.frontOfficeRole === 'CONTRACT_MANAGER'))

  const handleDelete = async () => {
    if (!player) return
    const ok = await confirm({
      title: t('detailPage.deleteTitle'),
      description: t('detailPage.deleteDescription', { name: player.playerName }),
      confirmText: t('detailPage.deleteConfirm'),
    })
    if (!ok) return
    try {
      await playerApi.delete(player.id)
      toast.success(t('detailPage.deleted'))
      navigate('/players')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detailPage.deleteFailed'))
    }
  }

  const fetchPlayer = () => {
    if (!id) return
    setLoading(true)
    playerApi
      .get(id)
      .then(setPlayer)
      .catch(() => toast.error(t('detailPage.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setAllergyEditMode(false)
    setAllergyInput('')
    fetchPlayer()
  }, [id])

  useEffect(() => {
    if (!id || !canSeeMarketValue) return
    playerApi.getMarketValueHistory(id).then(setMvHistory).catch(() => null)
  }, [id, canSeeMarketValue])

  useEffect(() => {
    if (!player || player.team?.type !== 'YOUTH') return
    playerPdiApi.get(player.id).then(setPdiData).catch(() => setPdiData([]))
  }, [player])

  useEffect(() => {
    if (!player) return
    setWpStatus(player.workPermitStatus)
    setWpExpiry(player.workPermitExpiry ?? '')
  }, [player])

  useEffect(() => {
    if (!promoteOpen) return
    teamApi.list().then((teams) => {
      setAvailableTeams(teams.filter((t: any) => t.type !== 'YOUTH'))
    }).catch(() => null)
  }, [promoteOpen])

  const handleMvUpdate = async () => {
    if (!id || !mvInput) return
    const val = Number(mvInput.replace(/[^0-9]/g, ''))
    if (!val || val <= 0) { toast.error(t('detailPage.mvInvalidAmount')); return }
    setMvSaving(true)
    try {
      await playerApi.updateMarketValue(id, val)
      toast.success(t('detailPage.mvUpdated'))
      setMvInput('')
      fetchPlayer()
      playerApi.getMarketValueHistory(id).then(setMvHistory).catch(() => null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detailPage.mvUpdateFailed'))
    } finally {
      setMvSaving(false)
    }
  }

  const handleWorkPermitSave = async () => {
    setWpSaving(true)
    try {
      await playerApi.updateWorkPermit(player!.id, {
        workPermitStatus: wpStatus,
        ...(wpExpiry && { workPermitExpiry: wpExpiry }),
      })
      toast.success('노동허가 상태가 업데이트되었습니다')
    } catch (e: any) {
      const code = e?.response?.data?.error
      if (code === 'EXPIRY_DATE_REQUIRED') toast.error('APPROVED 시 만료일이 필요합니다')
      else toast.error('저장에 실패했습니다')
    } finally {
      setWpSaving(false)
    }
  }

  const handlePromote = async () => {
    if (!player) return
    if (!promoteTeamId) { toast.error(t('detailPage.promoteTeamRequired')); return }
    const teamId = Number(promoteTeamId)
    setPromoting(true)
    try {
      await playerApi.promote(player.id, teamId)
      toast.success(t('detailPage.promoteSuccess'))
      setPromoteOpen(false)
      setPromoteTeamId('')
      fetchPlayer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detailPage.promoteFailed'))
    } finally {
      setPromoting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <p className="text-sm">{t('detailPage.notFound')}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/players')}>
          {t('detailPage.toList')}
        </Button>
      </div>
    )
  }

  const zone = POSITION_ZONE[player.position]
  const zoneStyle = ZONE_STYLE[zone]
  const latestContract = player.contracts[0] ?? null

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate('/players')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        {canWrite && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {t('detailPage.editBtn')}
          </Button>
        )}
        {canChangeStatus && (
          <Button variant="outline" size="sm" onClick={() => setStatusOpen(true)}>
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
            {t('detailPage.statusBtn')}
          </Button>
        )}
        {isYouthPlayer && canPromote && (
          <Button variant="outline" size="sm" onClick={() => setPromoteOpen(true)}>
            {t('detailPage.promoteBtn')}
          </Button>
        )}
        {user?.role === 'ADMIN' && (
          <Button variant="destructive" size="sm" onClick={() => void handleDelete()}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t('detailPage.deleteBtn')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue={searchParams.get('tab') ?? 'info'} className="h-full flex flex-col">
          <div className="px-6 pt-4 border-b shrink-0">
            <TabsList>
              <TabsTrigger value="info">{t('detailPage.tabInfo')}</TabsTrigger>
              <TabsTrigger value="stats">{t('detailPage.tabStats')}</TabsTrigger>
              {isOwnProfile && <TabsTrigger value="motivation">{t('detailPage.tabMotivation')}</TabsTrigger>}
              <TabsTrigger value="pdp">{t('detailPage.tabPdp')}</TabsTrigger>
              {isYouthPlayer && <TabsTrigger value="growth">{t('detailPage.tabGrowth')}</TabsTrigger>}
              {hasYouthHistory && (
                <TabsTrigger value="youth-history">{t('detailPage.youthHistoryTab')}</TabsTrigger>
              )}
            </TabsList>
          </div>
          <TabsContent value="info" className="flex-1 overflow-auto p-6 mt-0">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* 프로필 카드 */}
              <div className="rounded-lg border bg-card p-5 flex items-start gap-5">
                <Avatar className={`h-16 w-16 text-xl font-semibold ${zoneStyle.avatar}`}>
                  <AvatarFallback className={zoneStyle.avatar}>
                    {player.playerName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold tracking-tight">{player.playerName}</h2>
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono font-bold ${zoneStyle.badge}`}
                    >
                      {POSITION_ABBR[player.position]}
                    </span>
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLE[player.status]}`}
                    >
                      {t(`status.${player.status}`)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{t(`position.${player.position}`)}</p>
                  {player.playStyle ? (
                    <span className="inline-flex items-center text-xs bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full mt-1">
                      {player.playStyle}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs text-muted-foreground mt-1">{t('detailPage.unclassified')}</span>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span>{getCountryName(player.nationality.code, i18n.language)}</span>
                    <span>·</span>
                    <span>{t(`level.${player.level}`)}</span>
                    <span>·</span>
                    <span>{t('detailPage.ageValue', { age: calcAge(player.dateOfBirth) })}</span>
                  </div>
                </div>
              </div>

              <div className={`grid grid-cols-1 gap-4 ${canSeeContract ? 'md:grid-cols-2' : ''}`}>
                {/* 신체 정보 */}
                <div className="rounded-lg border bg-card p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t('detailPage.physicalTitle')}</h3>
                  <Separator className="mb-1" />
                  <StatRow label={t('detailPage.dob')} value={maskDateOfBirth(player.dateOfBirth)} />
                  <Separator />
                  <StatRow label={t('detailPage.age')} value={t('detailPage.ageValue', { age: calcAge(player.dateOfBirth) })} />
                  <Separator />
                  <StatRow label={t('detailPage.height')} value={`${player.height} cm`} />
                  <Separator />
                  <StatRow label={t('detailPage.weight')} value={`${player.weight} kg`} />
                  <Separator />
                  <StatRow label={t('detailPage.foot')} value={t(`foot.${player.preferredFoot}`)} />
                  {player.externalId && (
                    <>
                      <Separator />
                      <StatRow label={t('detailPage.externalId')} value={player.externalId} />
                    </>
                  )}
                  {canSeeMarketValue && (
                    <>
                      <Separator />
                      <StatRow
                        label={t('detailPage.marketValue')}
                        value={
                          player.currentMarketValue != null
                            ? formatSalary(player.currentMarketValue)
                            : '—'
                        }
                      />
                    </>
                  )}
                </div>

                {/* 최근 계약 */}
                {canSeeContract && (
                  <div className="rounded-lg border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">{t('detailPage.contractTitle')}</h3>
                    <Separator className="mb-1" />
                    {latestContract ? (
                      <>
                        <StatRow label={t('detailPage.contractStart')} value={formatDate(latestContract.startDate)} />
                        <Separator />
                        <StatRow label={t('detailPage.contractEnd')} value={formatDate(latestContract.endDate)} />
                        <Separator />
                        <StatRow label={t('detailPage.salary')} value={formatSalary(latestContract.salary)} />
                        <Separator />
                        <StatRow label={t('detailPage.contractStatus')} value={latestContract.status} />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('detailPage.noContract')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 이적 이력 */}
              {player.transfers.length > 0 && (
                <div className="rounded-lg border bg-card p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t('detailPage.transferTitle')}</h3>
                  <Separator className="mb-1" />
                  <div className="space-y-0">
                    {player.transfers.map((tr, i) => (
                      <div key={tr.id}>
                        {i > 0 && <Separator />}
                        <div className="flex items-center justify-between py-2.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                              {t(`transferType.${tr.type}`)}
                            </span>
                            <span className="text-sm text-muted-foreground truncate">
                              {tr.fromClub && tr.toClub
                                ? `${tr.fromClub} → ${tr.toClub}`
                                : tr.fromClub ?? tr.toClub ?? '—'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-medium">
                              {tr.fee != null ? formatSalary(tr.fee) : t('detailPage.feePrivate')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(tr.date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 시장가치 추이 */}
              {canSeeMarketValue && (
                <div className="rounded-lg border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('detailPage.mvHistoryTitle')}
                    </h3>
                    {canUpdateMarketValue && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder={t('detailPage.mvPlaceholder')}
                          value={mvInput ? Number(mvInput).toLocaleString('ko-KR') : ''}
                          onChange={(e) => setMvInput(e.target.value.replace(/[^0-9]/g, ''))}
                          className="h-7 w-32 text-xs"
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleMvUpdate() }}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2"
                          disabled={mvSaving || !mvInput}
                          onClick={() => void handleMvUpdate()}
                        >
                          {mvSaving ? t('detailPage.mvUpdating') : t('detailPage.mvUpdate')}
                        </Button>
                      </div>
                    )}
                  </div>
                  {mvHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {t('detailPage.mvNoHistory')}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart
                        data={[...mvHistory].reverse().map((e) => ({
                          date: new Date(e.recordedAt).toLocaleDateString('ko-KR', { year: '2-digit', month: 'short' }),
                          value: e.value,
                          label: fmtMv(e.value),
                        }))}
                        margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
                      >
                        <defs>
                          <linearGradient id="mvGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis
                          tickFormatter={fmtMvTick}
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                        />
                        <Tooltip
                          formatter={(v) => [fmtMv(typeof v === 'number' ? v : Number(v)), t('detailPage.mvChartLabel')]}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#2563eb"
                          strokeWidth={2}
                          fill="url(#mvGrad)"
                          dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
              {/* 포지션 다양성 지수 (유스 전용) */}
              {player.team?.type === 'YOUTH' && (
                <LiteModeGate blocked>
                  <div className="rounded-lg border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-3">{t('detailPage.positionDiversityTitle')}</h3>
                    <PositionDiversityChart data={pdiData} />
                  </div>
                </LiteModeGate>
              )}

              {/* 알레르기 / 식이 정보 */}
              {(user?.role === 'FRONT_OFFICE' || user?.role === 'ADMIN' ||
                (user?.role === 'COACHING_STAFF' &&
                  (user?.coachingRole === 'MEDICAL' || user?.coachingRole === 'MEDICAL_DIRECTOR'))) && (
                <div className="rounded-lg border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{t('allergySection')}</h3>
                    {canEditAllergies && !allergyEditMode && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAllergyInput(player.allergies.join(', '))
                          setAllergyEditMode(true)
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        {t('allergyEdit')}
                      </Button>
                    )}
                  </div>
                  {allergyEditMode ? (
                    <div className="space-y-2">
                      <Input
                        value={allergyInput}
                        onChange={e => setAllergyInput(e.target.value)}
                        placeholder={t('allergyPlaceholder')}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={allergySaving}
                          onClick={async () => {
                            if (!player) return
                            setAllergySaving(true)
                            try {
                              const parsed = allergyInput
                                .split(',')
                                .map(s => s.trim())
                                .filter(s => s.length > 0)
                              await playerApi.update(player.id, { allergies: parsed })
                              setPlayer(prev => prev ? { ...prev, allergies: parsed } : prev)
                              setAllergyEditMode(false)
                              toast.success(t('allergySaved'))
                            } catch {
                              toast.error(t('allergySaveFailed'))
                            } finally {
                              setAllergySaving(false)
                            }
                          }}
                        >
                          {allergySaving ? t('form.saving') : t('form.submitEdit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAllergyEditMode(false)}
                        >
                          {t('form.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {player.allergies.map((a) => (
                          <Badge key={a} variant="outline">{a}</Badge>
                        ))}
                        {player.allergies.length === 0 && (
                          <span className="text-sm text-muted-foreground">{t('noAllergies')}</span>
                        )}
                      </div>
                      {player.foodPreferences && (
                        <p className="text-sm text-muted-foreground">{player.foodPreferences}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 노동허가 */}
              {player.workPermitStatus !== 'NOT_REQUIRED' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">노동허가</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">현재 상태:</span>
                      <span className={`text-sm font-medium ${WORK_PERMIT_STYLE[player.workPermitStatus]}`}>
                        {WORK_PERMIT_LABEL[player.workPermitStatus]}
                      </span>
                      {player.workPermitExpiry && (
                        <span className="text-xs text-muted-foreground ml-2">
                          만료: {new Date(player.workPermitExpiry).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                    {canUpdateWorkPermit && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex gap-2 items-center">
                          <Select value={wpStatus} onValueChange={(v) => setWpStatus(v as WorkPermitStatus)}>
                            <SelectTrigger className="w-36 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['PENDING', 'APPROVED', 'REJECTED'] as WorkPermitStatus[]).map(s => (
                                <SelectItem key={s} value={s}>{WORK_PERMIT_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {wpStatus === 'APPROVED' && (
                            <Input
                              type="date"
                              value={wpExpiry}
                              onChange={(e) => setWpExpiry(e.target.value)}
                              className="w-36 h-8 text-sm"
                            />
                          )}
                          <Button size="sm" className="h-8" onClick={handleWorkPermitSave} disabled={wpSaving}>
                            {wpSaving ? '저장중...' : '저장'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 부 포지션 */}
              <SecondaryPositionsModule
                playerId={player.id}
                primaryPosition={player.position}
                canEdit={canCoachGrowth}
              />

              {/* 등번호 */}
              <div className="rounded-lg border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t('detailPage.jerseyTitle')}</h3>
                <JerseyTab
                  playerId={player.id}
                  teamId={player.teamId ?? null}
                  canAssign={canAssignJersey}
                  canRetire={canRetireJersey}
                  canReactivate={canReactivateJersey}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="pdp" className="flex-1 overflow-auto mt-0">
            <PlayerDevelopmentPlanTab playerId={player.id} />
          </TabsContent>
          <TabsContent value="stats" className="flex-1 overflow-auto mt-0">
            <StatsTab playerId={player.id} />
          </TabsContent>
          {isOwnProfile && (
            <TabsContent value="motivation" className="flex-1 overflow-auto mt-0">
              <MotivationTab playerId={player.id} />
            </TabsContent>
          )}
          {isYouthPlayer && (
            <TabsContent value="growth" className="flex-1 overflow-auto mt-0">
              <GrowthReportTab playerId={player.id} canCoach={canCoachGrowth} />
            </TabsContent>
          )}
          {hasYouthHistory && (
            <TabsContent value="youth-history" className="flex-1 overflow-auto p-6 mt-0">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="rounded-lg border bg-card p-5">
                  <h3 className="text-sm font-semibold mb-3">{t('detailPage.youthHistoryTab')}</h3>
                  <Separator className="mb-3" />
                  {player.promotedFromYouthAt && (
                    <>
                      <StatRow label={t('detailPage.promotedAt')} value={formatDate(player.promotedFromYouthAt)} />
                      <Separator />
                    </>
                  )}
                  {player.youthOriginTeamId && (
                    <StatRow label={t('detailPage.youthOriginTeam')} value={String(player.youthOriginTeamId)} />
                  )}
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {canWrite && (
        <PlayerFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          player={player}
          onSaved={() => {
            setEditOpen(false)
            fetchPlayer()
          }}
        />
      )}
      {canChangeStatus && (
        <PlayerStatusDialog
          open={statusOpen}
          onOpenChange={setStatusOpen}
          player={player}
          onSaved={() => {
            setStatusOpen(false)
            fetchPlayer()
          }}
        />
      )}
      <Dialog open={promoteOpen} onOpenChange={(open) => {
        setPromoteOpen(open)
        if (!open) setPromoteTeamId('')
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detailPage.promoteTitle')}</DialogTitle>
            <DialogDescription>{t('detailPage.promoteDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={promoteTeamId} onValueChange={setPromoteTeamId}>
              <SelectTrigger>
                <SelectValue placeholder={t('detailPage.promoteTeamPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPromoteOpen(false); setPromoteTeamId('') }}>{t('form.cancel')}</Button>
            <Button disabled={promoting} onClick={() => void handlePromote()}>
              {promoting ? t('detailPage.promoting') : t('detailPage.promoteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
