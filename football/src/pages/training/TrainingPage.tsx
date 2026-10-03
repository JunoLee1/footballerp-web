import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { trainingApi } from '@/services/training.service'
import { seasonApi } from '@/services/season.service'
import type { CoachingRole } from '@/types/auth'
import type { TrainingSession, SessionType, ContentPhase } from '@/types/training'
import { SESSION_TYPE_LABEL, SESSION_TYPE_STYLE, PHASE_LABEL } from '@/types/training'
import type { Season } from '@/types/season'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, CheckCircle, Clock, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

const SESSION_TYPES = Object.keys(SESSION_TYPE_LABEL) as SessionType[]
const PHASES = Object.keys(PHASE_LABEL) as ContentPhase[]
const PAGE_SIZE = 10

const DEFAULT_SESSION_TYPE: Partial<Record<CoachingRole, SessionType>> = {
  DEFENSIVE_COACH: 'TACTICAL_DEFENSIVE',
  ATTACKING_COACH: 'TACTICAL_ATTACKING',
  PHYSICAL_COACH: 'PHYSICAL',
  GOALKEEPER_COACH: 'INDIVIDUAL_SKILL',
}

type ContentRow = { phase: ContentPhase; description: string }

const SESSION_CONTENT_TEMPLATE: Record<SessionType, ContentRow[]> = {
  TACTICAL_DEFENSIVE: [
    { phase: 'WARMUP', description: '준비운동 및 스트레칭' },
    { phase: 'DRILL', description: '수비 블록 훈련' },
    { phase: 'TACTICAL', description: '수비 진형 조직' },
    { phase: 'GAME', description: '수비 압박 모의게임' },
  ],
  TACTICAL_ATTACKING: [
    { phase: 'WARMUP', description: '준비운동 및 스트레칭' },
    { phase: 'DRILL', description: '공격 조합 훈련' },
    { phase: 'TACTICAL', description: '공격 전개 패턴' },
    { phase: 'GAME', description: '공격 모의게임' },
  ],
  TACTICAL_FULL_TEAM: [
    { phase: 'WARMUP', description: '준비운동 및 스트레칭' },
    { phase: 'DRILL', description: '포지션별 드릴' },
    { phase: 'TACTICAL', description: '전술 훈련' },
    { phase: 'GAME', description: '전술 모의게임' },
  ],
  PHYSICAL: [
    { phase: 'WARMUP', description: '준비운동 및 스트레칭' },
    { phase: 'DRILL', description: '체력 훈련' },
    { phase: 'GAME', description: '마무리 훈련' },
  ],
  INDIVIDUAL_SKILL: [
    { phase: 'WARMUP', description: '준비운동 및 스트레칭' },
    { phase: 'DRILL', description: '개인기 훈련' },
    { phase: 'DRILL', description: '포지션별 집중 훈련' },
  ],
  PSYCHOLOGICAL_SOCIAL: [],
  SET_PIECE: [],
}

interface CreateSessionDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  seasons: Season[]
  activeSeason: Season | null
  onSaved: () => void
  coachingRole?: CoachingRole | null
}

function CreateSessionDialog({ open, onOpenChange, seasons, activeSeason, onSaved, coachingRole }: CreateSessionDialogProps) {
  const { t } = useTranslation('training')
  const defaultType: SessionType =
    (coachingRole && DEFAULT_SESSION_TYPE[coachingRole]) ?? 'TACTICAL_FULL_TEAM'

  const [date, setDate] = useState('')
  const [goal, setGoal] = useState('')
  const [sessionType, setSessionType] = useState<SessionType>(defaultType)
  const [seasonId, setSeasonId] = useState<string>(activeSeason ? String(activeSeason.id) : '')
  const [contents, setContents] = useState<ContentRow[]>(() => SESSION_CONTENT_TEMPLATE[defaultType] ?? [])
  const [newPhase, setNewPhase] = useState<ContentPhase>('WARMUP')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      const defaultSType = (coachingRole && DEFAULT_SESSION_TYPE[coachingRole]) ?? 'TACTICAL_FULL_TEAM'
      setSessionType(defaultSType)
      setContents(SESSION_CONTENT_TEMPLATE[defaultSType] ?? [])
      setDate('')
      setGoal('')
      setSeasonId(activeSeason ? String(activeSeason.id) : '')
      setNewDesc('')
    }
  }, [open])

  const addContent = () => {
    if (!newDesc.trim()) return
    setContents((prev) => [...prev, { phase: newPhase, description: newDesc.trim() }])
    setNewDesc('')
  }

  const removeContent = (i: number) => setContents((prev) => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!date || !goal.trim() || !seasonId) {
      toast.error(t('createDialog.required'))
      return
    }
    setSaving(true)
    try {
      await trainingApi.create({
        date,
        goal: goal.trim(),
        sessionType,
        seasonId: Number(seasonId),
        ...(contents.length > 0 ? { contents } : {}),
      })
      toast.success(t('createDialog.saved'))
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('createDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('createDialog.title')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>{t('createDialog.dateLabel')} *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('createDialog.goalLabel')} *</Label>
            <Textarea placeholder={t('createDialog.goalPlaceholder')} value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('createDialog.typeLabel')} *</Label>
            <Select
              value={sessionType}
              onValueChange={(v) => {
                const sType = v as SessionType
                setSessionType(sType)
                setContents(SESSION_CONTENT_TEMPLATE[sType] ?? [])
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SESSION_TYPES.map((st) => <SelectItem key={st} value={st}>{t(`sessionType.${st}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('createDialog.seasonLabel')} *</Label>
            <Select value={seasonId} onValueChange={(v) => { if (v) setSeasonId(v) }}>
              <SelectTrigger><SelectValue placeholder={t('createDialog.seasonPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {seasons.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 세션 구성 */}
          <div className="space-y-1.5">
            <Label>{t('createDialog.contentLabel')} <span className="text-muted-foreground font-normal">{t('createDialog.optional')}</span></Label>
            {contents.length > 0 && (
              <div className="space-y-1 mb-2">
                {contents.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                    <span className="text-xs text-muted-foreground bg-background border rounded px-1.5 py-0.5 shrink-0">
                      {t(`phase.${c.phase}`)}
                    </span>
                    <span className="flex-1 truncate">{c.description}</span>
                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => removeContent(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Select value={newPhase} onValueChange={(v) => setNewPhase(v as ContentPhase)}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => <SelectItem key={p} value={p}>{t(`phase.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="flex-1 h-8 text-sm"
                placeholder={t('createDialog.contentPlaceholder')}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContent() } }}
              />
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={addContent} disabled={!newDesc.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('createDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('createDialog.saving') : t('createDialog.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TrainingPage() {
  const { t, i18n } = useTranslation('training')
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>('ALL')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  const canCreate = user?.role === 'ADMIN' || user?.role === 'COACHING_STAFF'
  const canApprove = user?.role === 'ADMIN' || user?.coachingRole === 'HEAD_COACH'

  useEffect(() => {
    seasonApi.list().then((list) => {
      setSeasons(list)
      const active = list.find((s) => s.status === 'ACTIVE') ?? null
      setActiveSeason(active)
      if (active) setSelectedSeasonId(String(active.id))
    }).catch(() => null)
  }, [])

  const fetchSessions = (seasonId?: number) => {
    setLoading(true)
    setPage(1)
    trainingApi.list(seasonId)
      .then(setSessions)
      .catch(() => toast.error(t('page.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const sid = selectedSeasonId === 'ALL' ? undefined : Number(selectedSeasonId)
    fetchSessions(sid)
  }, [selectedSeasonId])

  const handleApprove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await trainingApi.approve(id)
      toast.success(t('page.approveSuccess'))
      setSessions((prev) => prev.map((s) => s.id === id ? { ...s, isApproved: true } : s))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('page.approveFailed'))
    }
  }

  const sessionsByDate = sessions.reduce<Map<string, SessionType[]>>((acc, s) => {
    const d = s.date.slice(0, 10)
    if (!acc.has(d)) acc.set(d, [])
    acc.get(d)!.push(s.sessionType)
    return acc
  }, new Map())

  const filteredSessions = selectedDate
    ? sessions.filter(s => s.date.slice(0, 10) === selectedDate)
    : []

  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE)
  const paged = filteredSessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const calFirstDay = new Date(viewYear, viewMonth, 1)
  const calLastDay = new Date(viewYear, viewMonth + 1, 0)
  const calCells: (number | null)[] = [
    ...Array.from({ length: calFirstDay.getDay() }, () => null),
    ...Array.from({ length: calLastDay.getDate() }, (_, i) => i + 1),
  ]
  const toCalDateStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US'
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' })
  const prevMonth = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)
  const DAY_LABELS = [0, 1, 2, 3, 4, 5, 6].map(i => t(`day.${i}`))

  const dateSubtitle = selectedDate
    ? t('page.dateSubtitle', {
        date: new Date(selectedDate + 'T00:00:00').toLocaleDateString(locale, { month: 'long', day: 'numeric' }),
        count: filteredSessions.length,
      })
    : t('page.selectDateHint')

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('page.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateSubtitle}</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('page.addSession')}
          </Button>
        )}
      </div>

      <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0 bg-muted/30">
        <Select value={selectedSeasonId ?? 'ALL'} onValueChange={(v) => setSelectedSeasonId(v ?? 'ALL')}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('page.allSeasons')}</SelectItem>
            {seasons.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 아이폰 캘린더 스타일 — 상단 그리드 */}
      <div className="shrink-0 border-b px-4 pt-3 pb-4 select-none">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{monthLabel}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <span key={d} className="text-center text-[11px] text-muted-foreground py-0.5">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {calCells.map((day, i) => {
            if (!day) return <span key={`e-${i}`} />
            const dateStr = toCalDateStr(day)
            const daySessions = sessionsByDate.get(dateStr) ?? []
            const isSelected = selectedDate === dateStr
            const isToday = todayStr === dateStr
            return (
              <button
                key={dateStr}
                onClick={() => { setSelectedDate(isSelected ? null : dateStr); setPage(1) }}
                className="flex flex-col items-center gap-0.5 py-0.5"
              >
                <span className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-full text-sm transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : isToday
                    ? 'text-primary font-semibold hover:bg-muted'
                    : 'hover:bg-muted',
                )}>
                  {day}
                </span>
                <div className="flex flex-col items-center gap-0.5 w-full px-0.5">
                  {daySessions.slice(0, 2).map((type, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'w-full text-center rounded px-0.5 leading-tight',
                        'text-[8px] font-medium border truncate',
                        isSelected
                          ? 'bg-primary/20 text-primary-foreground border-primary/30'
                          : SESSION_TYPE_STYLE[type],
                      )}
                    >
                      {t(`sessionType.${type}`)}
                    </span>
                  ))}
                  {daySessions.length > 2 && (
                    <span className="text-[8px] text-muted-foreground">+{daySessions.length - 2}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 하단 세션 리스트 */}
      <div className="flex-1 overflow-auto">
        {!selectedDate ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('page.selectDateBody')}
          </div>
        ) : loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {t('page.noSession')}
          </div>
        ) : (
          <div className="divide-y">
            {paged.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/training/${s.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.goal}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 ${SESSION_TYPE_STYLE[s.sessionType]}`}>
                      {t(`sessionType.${s.sessionType}`)}
                    </span>
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {s.isApproved
                    ? <CheckCircle className="h-4 w-4 text-green-600" />
                    : <Clock className="h-4 w-4 text-muted-foreground" />}
                  {canApprove && !s.isApproved && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => handleApprove(s.id, e)}>
                      {t('page.approve')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={filteredSessions.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>

      <CreateSessionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        seasons={seasons}
        activeSeason={activeSeason}
        coachingRole={user?.coachingRole}
        onSaved={() => {
          setCreateOpen(false)
          const sid = selectedSeasonId === 'ALL' ? undefined : Number(selectedSeasonId)
          fetchSessions(sid)
        }}
      />
    </div>
  )
}
