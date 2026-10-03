import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { developmentPlanApi } from '@/services/development-plan.service'
import { seasonApi } from '@/services/season.service'
import type { DevelopmentPlan } from '@/types/development-plan'
import { PLAN_STATUS_STYLE } from '@/types/development-plan'
import type { Season } from '@/types/season'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

interface Props {
  playerId: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface CreateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  seasons: Season[]
  onSaved: () => void
}

function CreatePlanDialog({ open, onOpenChange, playerId, seasons, onSaved }: CreateDialogProps) {
  const { t } = useTranslation('player')
  const [goals, setGoals] = useState('')
  const [notes, setNotes] = useState('')
  const [seasonId, setSeasonId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!goals.trim() || !seasonId) {
      toast.error(t('pdp.saveFailed'))
      return
    }
    setSaving(true)
    try {
      const payload: Parameters<typeof developmentPlanApi.create>[0] = {
        playerId,
        seasonId: Number(seasonId),
        goals: goals.trim(),
      }
      if (notes.trim()) payload.notes = notes.trim()
      await developmentPlanApi.create(payload)
      toast.success(t('pdp.saved'))
      setGoals('')
      setNotes('')
      setSeasonId('')
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('pdp.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('pdp.createTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('pdp.seasonLabel')} *</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger>
                {seasonId
                  ? <span>{seasons.find(s => String(s.id) === seasonId)?.name ?? seasonId}</span>
                  : <span className="text-muted-foreground">{t('pdp.seasonPlaceholder')}</span>}
              </SelectTrigger>
              <SelectContent>
                {seasons.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('pdp.goalLabel')} *</Label>
            <Textarea
              placeholder={t('pdp.goalPlaceholder')}
              value={goals}
              onChange={e => setGoals(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('pdp.memoLabel')}</Label>
            <Textarea
              placeholder={t('pdp.memoPlaceholder')}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('pdp.cancel')}</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>{saving ? t('pdp.saving') : t('pdp.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlayerDevelopmentPlanTab({ playerId }: Props) {
  const { t } = useTranslation('player')
  const { user } = useCurrentUser()
  const [plans, setPlans] = useState<DevelopmentPlan[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const isCoachingStaff = user?.role === 'COACHING_STAFF'
  const isHeadCoach = isCoachingStaff && user?.coachingRole === 'HEAD_COACH'
  const canCreate = isCoachingStaff || user?.role === 'ADMIN'

  const fetchPlans = () => {
    setLoading(true)
    developmentPlanApi
      .list({ playerId })
      .then(setPlans)
      .catch(() => toast.error(t('pdp.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPlans()
    seasonApi.list().then(setSeasons).catch(() => null)
  }, [playerId])

  const handleActivate = async (id: number) => {
    try {
      await developmentPlanApi.activate(id)
      toast.success(t('pdp.activateSaved'))
      fetchPlans()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('pdp.activateFailed'))
    }
  }

  const handleReview = async (id: number) => {
    try {
      await developmentPlanApi.review(id)
      toast.success(t('pdp.reviewSaved'))
      fetchPlans()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('pdp.reviewFailed'))
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{t('pdp.total', { count: plans.length })}</h3>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('pdp.addBtn')}
          </Button>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          {t('pdp.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <div key={plan.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{plan.season.name}</span>
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${PLAN_STATUS_STYLE[plan.status]}`}>
                    {t(`devPlanStatus.${plan.status}`)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {plan.status === 'DRAFT' && (isHeadCoach || plan.coachId === user?.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void handleActivate(plan.id)}
                    >
                      {t('pdp.activate')}
                    </Button>
                  )}
                  {plan.status === 'ACTIVE' && isHeadCoach && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void handleReview(plan.id)}
                    >
                      {t('pdp.review')}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{plan.goals}</p>
              {plan.notes && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{plan.notes}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('pdp.writtenBy', { coach: plan.coach.nickname ?? plan.coach.username, date: formatDate(plan.createdAt) })}
                {plan.reviewedAt && t('pdp.reviewedAt', { date: formatDate(plan.reviewedAt) })}
              </p>
            </div>
          ))}
        </div>
      )}

      <CreatePlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        playerId={playerId}
        seasons={seasons}
        onSaved={() => { setCreateOpen(false); fetchPlans() }}
      />
    </div>
  )
}
