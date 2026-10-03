import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { coachingStaffApi } from '@/services/coaching-staff.service'
import { coachAvailabilityApi } from '@/services/coach-availability.service'
import { trainingApi } from '@/services/training.service'
import type { CoachingStaffMember } from '@/types/coaching-staff'
import type { TrainingSession, TrainingResultRow } from '@/types/training'
import type { Position } from '@/types/player'
import { POSITION_LABEL } from '@/types/player'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { COACHING_ROLE_LABEL } from '@/types/auth'
import type { CoachingRole } from '@/types/auth'
import { getCoachPositions } from '@/lib/coachPositionMap'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, X, UserCheck, UserX, ClipboardList } from 'lucide-react'
import { StaffEvaluationDialog } from '@/components/coaching-staff/StaffEvaluationDialog'

// Date math only — no locale, stable across renders
const WEEK = (() => {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(monday), to: fmt(sunday), start: monday, end: sunday }
})()

const MONTH = (() => {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(first), to: fmt(last), date: now }
})()

function formatDate(iso: string, language: string) {
  return new Date(iso).toLocaleDateString(language, { month: 'short', day: 'numeric' })
}

function isAbsentToday(absences: CoachingStaffMember['coachAvailabilities']) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return absences.some((a) => {
    const start = new Date(a.startDate)
    const end = new Date(a.endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return start <= today && today <= end
  })
}

interface AbsenceDialogProps {
  open: boolean
  onClose: () => void
  staffId: string
  onCreated: () => void
}

function AbsenceDialog({ open, onClose, staffId, onCreated }: AbsenceDialogProps) {
  const { t } = useTranslation('admin')
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' })
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.startDate || !form.endDate) {
      toast.error(t('staffManagementPage.absence.dateRequired'))
      return
    }
    setSaving(true)
    try {
      await coachAvailabilityApi.create({
        userId: staffId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim() || undefined,
      })
      toast.success(t('staffManagementPage.absence.registered'))
      setForm({ startDate: '', endDate: '', reason: '' })
      onCreated()
      onClose()
    } catch {
      toast.error(t('staffManagementPage.absence.registerFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('staffManagementPage.absence.dialogTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('staffManagementPage.absence.startDate')}</Label>
            <Input type="date" value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('staffManagementPage.absence.endDate')}</Label>
            <Input type="date" value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('staffManagementPage.absence.reason')}</Label>
            <Textarea rows={2} placeholder={t('staffManagementPage.absence.reasonPlaceholder')} value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('staffManagementPage.absence.cancel')}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving}>
            {saving ? t('staffManagementPage.absence.saving') : t('staffManagementPage.absence.register')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface StaffCardProps {
  member: CoachingStaffMember
  canEdit: boolean
  canEval: boolean
  currentUserId: string
  language: string
  onRefresh: () => void
}

function StaffCard({ member, canEdit, canEval, currentUserId, language, onRefresh }: StaffCardProps) {
  const { t } = useTranslation('admin')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [evalOpen, setEvalOpen] = useState(false)
  const absent = isAbsentToday(member.coachAvailabilities)

  const handleDeleteAbsence = async (absenceId: number) => {
    try {
      await coachAvailabilityApi.delete(absenceId)
      toast.success(t('staffManagementPage.absence.deleted'))
      onRefresh()
    } catch {
      toast.error(t('staffManagementPage.absence.deleteFailed'))
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {absent
              ? <UserX className="h-4 w-4 text-destructive" />
              : <UserCheck className="h-4 w-4 text-green-600" />}
            <span className="font-medium text-sm">{member.nickname ?? t('staffManagementPage.noNickname')}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {member.coachingRole ? (COACHING_ROLE_LABEL[member.coachingRole] ?? member.coachingRole) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(canEval || canEdit) && (
            <Button
              variant="ghost" size="icon" className="h-6 w-6 shrink-0"
              onClick={() => setEvalOpen(true)}
              title={t('staffManagementPage.tooltip.evaluate')}
            >
              <ClipboardList className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost" size="icon" className="h-6 w-6 shrink-0"
              onClick={() => setDialogOpen(true)}
              title={t('staffManagementPage.tooltip.registerAbsence')}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {member.coachAvailabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {member.coachAvailabilities.map((a) => (
            <Badge key={a.id} variant="secondary" className="text-xs gap-1">
              {formatDate(a.startDate, language)}–{formatDate(a.endDate, language)}
              {a.reason && <span className="text-muted-foreground">· {a.reason}</span>}
              {(canEdit || a.createdById === currentUserId) && (
                <button
                  className="ml-0.5 hover:text-destructive"
                  onClick={() => void handleDeleteAbsence(a.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {dialogOpen && (
        <AbsenceDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          staffId={member.id}
          onCreated={onRefresh}
        />
      )}
      <StaffEvaluationDialog
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        staffUserId={member.id}
        staffNickname={member.nickname ?? t('staffManagementPage.noNickname')}
        canCreate={canEval}
      />
    </div>
  )
}

export function StaffManagementPage() {
  const { t, i18n } = useTranslation('admin')
  const { user } = useCurrentUser()
  const [staff, setStaff] = useState<CoachingStaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [results, setResults] = useState<TrainingResultRow[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const weekLabel = `${new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(WEEK.start)} – ${new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(WEEK.end)}`
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long' }).format(MONTH.date)

  const canEdit = user?.role === 'ADMIN' || user?.coachingRole === 'HEAD_COACH'
  const canEval = user?.role === 'ADMIN' || user?.coachingRole === 'HEAD_COACH'

  const fetchStaff = useCallback(() => {
    setStaffLoading(true)
    coachingStaffApi
      .list()
      .then(setStaff)
      .catch(() => toast.error(t('staffManagementPage.loadFailed')))
      .finally(() => setStaffLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchStaff()
    setDataLoading(true)
    Promise.all([
      trainingApi.list(),
      trainingApi.getResults({ from: MONTH.from, to: MONTH.to }),
    ])
      .then(([allSessions, allResults]) => {
        setSessions(
          allSessions.filter((s) => {
            const d = s.date.slice(0, 10)
            return d >= WEEK.from && d <= WEEK.to
          }),
        )
        setResults(allResults)
      })
      .catch(() => toast.error(t('staffManagementPage.dataLoadFailed')))
      .finally(() => setDataLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStaff])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">{t('staffManagementPage.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('staffManagementPage.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Section 1: 스태프 현황 */}
        <section>
          <h2 className="text-sm font-semibold mb-3">{t('staffManagementPage.sectionStaff')}</h2>
          {staffLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('staffManagementPage.noStaff')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {staff.map((member) => (
                <StaffCard
                  key={member.id}
                  member={member}
                  canEdit={canEdit}
                  canEval={canEval}
                  currentUserId={user?.id ?? ''}
                  language={i18n.language}
                  onRefresh={fetchStaff}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Section 2: 세션 배정 */}
        <section>
          <h2 className="text-sm font-semibold mb-1">{t('staffManagementPage.sectionSessions')}</h2>
          <p className="text-xs text-muted-foreground mb-3">{weekLabel}</p>
          {dataLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('staffManagementPage.noSessions')}</p>
          ) : (
            <div className="space-y-2">
              {staff.map((member) => {
                const mySessions = sessions.filter((s) => s.createdById === member.id)
                if (mySessions.length === 0) return null
                return (
                  <div key={member.id} className="rounded-md border px-4 py-3">
                    <p className="text-xs font-semibold mb-1.5">
                      {member.nickname ?? '—'} · {member.coachingRole ? (COACHING_ROLE_LABEL[member.coachingRole] ?? member.coachingRole) : '—'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mySessions.map((s) => (
                        <Badge key={s.id} variant="outline" className="text-xs">
                          {s.date.slice(5, 10)} {s.sessionType.replace(/_/g, ' ')} — {s.goal.slice(0, 20)}{s.goal.length > 20 ? '…' : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <Separator />

        {/* Section 3: 성과 */}
        <section>
          <h2 className="text-sm font-semibold mb-1">{t('staffManagementPage.sectionPerformance')}</h2>
          <p className="text-xs text-muted-foreground mb-3">{t('staffManagementPage.performanceSubtitle', { label: monthLabel })}</p>
          {dataLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staff
                .filter((m) => m.coachingRole && getCoachPositions(m.coachingRole as CoachingRole))
                .map((member) => {
                  const positions = getCoachPositions(member.coachingRole as CoachingRole) ?? []
                  const posResults = results.filter(
                    (r) => positions.includes(r.player.position as Position) && r.performanceScore != null,
                  )
                  const avg =
                    posResults.length > 0
                      ? (posResults.reduce((sum, r) => sum + (r.performanceScore ?? 0), 0) / posResults.length).toFixed(1)
                      : null

                  return (
                    <div key={member.id} className="rounded-md border px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">
                          {member.nickname ?? '—'} · {member.coachingRole ? (COACHING_ROLE_LABEL[member.coachingRole] ?? member.coachingRole) : '—'}
                        </p>
                        {avg != null ? (
                          <span className="text-lg font-bold tabular-nums">
                            {avg}<span className="text-xs font-normal text-muted-foreground">{t('staffManagementPage.scoreUnit')}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('staffManagementPage.noData')}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('staffManagementPage.assignedPositions', { positions: positions.map((p) => POSITION_LABEL[p] ?? p).join(', ') })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('staffManagementPage.resultCount', { count: posResults.length })}
                      </p>
                    </div>
                  )
                })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
