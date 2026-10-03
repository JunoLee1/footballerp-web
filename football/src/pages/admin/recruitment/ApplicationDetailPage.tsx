import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { recruitmentApi } from '@/services/recruitment.service'
import type { JobApplication, Interview, InterviewRound, InterviewResult, ReferenceCheckResult, OfferApproval } from '@/types/recruitment'
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_STYLE, OFFER_APPROVAL_STAGE_LABEL } from '@/types/recruitment'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { maskPhone } from '@/lib/pii'

// #370 — status labels grew from 8 → 14 values (3-stage approval). We keep the
// legacy `STATUS_LABEL` map for the old shortened variants used by the badge
// variant heuristic, but the canonical labels come from types/recruitment.ts.
const STATUS_LABEL: Record<string, string> = {
  ...APPLICATION_STATUS_LABEL,
  HIRED: '채용완료',
}

function StatusBadge({ status }: { status: string }) {
  const badgeClass =
    (APPLICATION_STATUS_STYLE as Record<string, string>)[status] ??
    (status === 'REJECTED'
      ? 'bg-red-100 text-red-800'
      : status === 'HIRED' || status === 'OFFERED'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-100 text-slate-700')
  return <Badge className={badgeClass}>{STATUS_LABEL[status] ?? status}</Badge>
}

/**
 * Offer 3-stage approval timeline (#370). Renders one row per stage in the
 * canonical order 팀장 → 부서장 → HR, marking each row as APPROVED / REJECTED /
 * PENDING based on the offerApprovals trail and the current application status.
 * Absent when the application never entered the offer approval flow.
 */
function OfferApprovalTimeline({ app }: { app: JobApplication }) {
  const trail = app.offerApprovals ?? []
  const inFlight = app.status?.startsWith('OFFER_PENDING_')
  const rejected = app.status?.startsWith('OFFER_') && app.status?.endsWith('_REJECTED')
  const finalOffered = app.status === 'OFFERED' || app.status === 'ONBOARDED'
  if (trail.length === 0 && !inFlight && !rejected && !finalOffered) return null

  const stages: Array<'LEADER' | 'DEPT_HEAD' | 'HR'> = ['LEADER', 'DEPT_HEAD', 'HR']
  const trailByStage = new Map<string, OfferApproval>(trail.map((a) => [a.stage, a]))

  const pendingStage: string | null = app.status === 'OFFER_PENDING_LEADER'
    ? 'LEADER'
    : app.status === 'OFFER_PENDING_DEPT_HEAD'
      ? 'DEPT_HEAD'
      : app.status === 'OFFER_PENDING_HR'
        ? 'HR'
        : null

  return (
    <section className="border rounded-md p-3">
      <h3 className="font-semibold text-sm mb-2">오퍼 결재 이력</h3>
      <ol className="space-y-1.5 text-sm">
        {stages.map((s) => {
          const row = trailByStage.get(s)
          const isPending = pendingStage === s && !row
          const label = OFFER_APPROVAL_STAGE_LABEL[s]
          if (row) {
            return (
              <li key={s} className="flex items-start gap-2">
                <span
                  className={
                    row.action === 'APPROVED'
                      ? 'inline-block w-16 text-emerald-700 font-medium'
                      : 'inline-block w-16 text-red-700 font-medium'
                  }
                >
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString('ko-KR')} ·{' '}
                  {row.reviewer.nickname ?? row.reviewer.username} ·{' '}
                  {row.action === 'APPROVED' ? '승인' : '반려'}
                  {row.reason ? ` · ${row.reason}` : ''}
                </span>
              </li>
            )
          }
          return (
            <li key={s} className="flex items-start gap-2">
              <span
                className={
                  isPending
                    ? 'inline-block w-16 text-amber-700 font-medium'
                    : 'inline-block w-16 text-muted-foreground'
                }
              >
                {label}
              </span>
              <span className="text-xs text-muted-foreground">
                {isPending ? '결재 대기' : '대기'}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ResultBadge({ result }: { result: string }) {
  const variant = result === 'PASS' || result === 'CLEAR' ? 'default' : result === 'FAIL' || result === 'FLAGGED' ? 'destructive' : 'secondary'
  const label: Record<string, string> = { PENDING: '보류', PASS: '합격', FAIL: '불합격', CLEAR: '이상없음', FLAGGED: '이슈있음' }
  return <Badge variant={variant}>{label[result] ?? result}</Badge>
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('admin')
  const { user } = useCurrentUser()

  const [app, setApp] = useState<JobApplication | null>(null)
  const [loading, setLoading] = useState(true)

  // Interview dialog
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [interviewRound, setInterviewRound] = useState<InterviewRound>('ROUND_1')
  const [interviewScheduledAt, setInterviewScheduledAt] = useState('')

  // Interview result dialog
  const [resultOpen, setResultOpen] = useState(false)
  const [resultTarget, setResultTarget] = useState<Interview | null>(null)
  const [resultForm, setResultForm] = useState({ scoreSkill: '', scoreComm: '', scoreCulture: '', comment: '', result: 'PENDING' as InterviewResult })

  // Reference check dialog
  const [refOpen, setRefOpen] = useState(false)
  const [refForm, setRefForm] = useState({ contactName: '', relationship: '', notes: '' })

  // Reference update
  const [refResultOpen, setRefResultOpen] = useState(false)
  const [refResult, setRefResult] = useState<ReferenceCheckResult>('PENDING')

  const [saving, setSaving] = useState(false)
  const [reinstating, setReinstating] = useState(false)

  const appId = Number(id)

  const load = async () => {
    try {
      setApp(await recruitmentApi.getApplication(appId))
    } catch {
      toast.error(t('recruitment.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [appId])

  const canWrite = user?.role === 'ADMIN' || user?.role === 'GM' || (user?.role === 'FRONT_OFFICE' && user.frontOfficeRole === 'HR_MANAGER')
  const canApprove = user?.role === 'ADMIN' || user?.role === 'GM'

  const handleReject = async () => {
    if (!confirm(t('recruitment.confirmReject'))) return
    setSaving(true)
    try {
      setApp(await recruitmentApi.rejectApplication(appId))
      toast.success(t('recruitment.rejectApplication'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleReinstate = async () => {
    if (!app) return
    setReinstating(true)
    try {
      await recruitmentApi.reinstateApplication(app.id)
      toast.success(t('recruitment.reinstateSuccess'))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.reinstateFailed'))
    } finally {
      setReinstating(false)
    }
  }

  const handleOffer = async () => {
    setSaving(true)
    try {
      setApp(await recruitmentApi.offerApplication(appId))
      toast.success(t('recruitment.offerApplication'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleStartOnboarding = async () => {
    if (!user) return
    setSaving(true)
    try {
      await recruitmentApi.startOnboarding(appId, user.id)
      await load()
      toast.success(t('recruitment.startOnboarding'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddInterview = async () => {
    setSaving(true)
    try {
      await recruitmentApi.scheduleInterview(appId, {
        round: interviewRound,
        ...(interviewScheduledAt && { scheduledAt: interviewScheduledAt }),
      })
      setInterviewOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const openResultDialog = (interview: Interview) => {
    setResultTarget(interview)
    setResultForm({
      scoreSkill: interview.scoreSkill != null ? String(interview.scoreSkill) : '',
      scoreComm: interview.scoreComm != null ? String(interview.scoreComm) : '',
      scoreCulture: interview.scoreCulture != null ? String(interview.scoreCulture) : '',
      comment: interview.comment ?? '',
      result: interview.result,
    })
    setResultOpen(true)
  }

  const handleSaveResult = async () => {
    if (!resultTarget) return
    setSaving(true)
    try {
      await recruitmentApi.updateInterview(appId, resultTarget.round, {
        ...(resultForm.scoreSkill && { scoreSkill: Number(resultForm.scoreSkill) }),
        ...(resultForm.scoreComm && { scoreComm: Number(resultForm.scoreComm) }),
        ...(resultForm.scoreCulture && { scoreCulture: Number(resultForm.scoreCulture) }),
        ...(resultForm.comment && { comment: resultForm.comment }),
        result: resultForm.result,
      })
      setResultOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateRefCheck = async () => {
    if (!refForm.contactName.trim() || !refForm.relationship.trim()) {
      toast.error(t('recruitment.nameRequired'))
      return
    }
    setSaving(true)
    try {
      await recruitmentApi.createReferenceCheck(appId, {
        contactName: refForm.contactName.trim(),
        relationship: refForm.relationship.trim(),
        ...(refForm.notes.trim() && { notes: refForm.notes.trim() }),
      })
      setRefOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateRefResult = async () => {
    setSaving(true)
    try {
      await recruitmentApi.updateReferenceCheck(appId, { result: refResult })
      setRefResultOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyEmail = async () => {
    setSaving(true)
    try {
      await recruitmentApi.verifyEmail(appId, '000000')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteMfa = async () => {
    setSaving(true)
    try {
      await recruitmentApi.completeMfa(appId)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('recruitment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">로딩 중...</div>
  if (!app) return <div className="p-6 text-sm text-destructive">지원서를 찾을 수 없습니다.</div>

  const usedRounds = new Set(app.interviews.map((i) => i.round))

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="space-y-1">
        <button
          onClick={() => navigate(`/admin/recruitment/postings/${app.postingId}`)}
          className="text-sm text-muted-foreground hover:underline"
        >
          {t('recruitment.backToPosting')}
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{app.applicantName}</h1>
          <StatusBadge status={app.status} />
        </div>
        <div className="text-sm text-muted-foreground space-x-4">
          <span>{app.email}</span>
          {app.phone && <span>{maskPhone(app.phone)}</span>}
          <span className="text-xs">{app.posting.title}</span>
        </div>
      </div>

      {/* Actions */}
      {canWrite && app.status !== 'REJECTED' && app.status !== 'ONBOARDED' && (
        <div className="flex gap-2 flex-wrap">
          {canApprove && app.status === 'REFERENCE_CHECK' && (
            <Button onClick={() => void handleOffer()} disabled={saving}>
              {t('recruitment.offerApplication')}
            </Button>
          )}
          {app.status === 'OFFERED' && !app.onboarding && (
            <Button onClick={() => void handleStartOnboarding()} disabled={saving}>
              {t('recruitment.startOnboarding')}
            </Button>
          )}
          <Button variant="destructive" onClick={() => void handleReject()} disabled={saving}>
            {t('recruitment.rejectApplication')}
          </Button>
        </div>
      )}
      {app.status === 'REJECTED' && canWrite && (
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={reinstating}
            onClick={() => void handleReinstate()}
          >
            {reinstating ? t('recruitment.reinstating') : t('recruitment.reinstateBtn')}
          </Button>
        </div>
      )}

      {/* #370 — Offer 3-stage approval timeline (팀장 → 부서장 → HR) */}
      <OfferApprovalTimeline app={app} />

      {/* Interviews */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t('recruitment.interviews')}</h2>
          {canWrite && usedRounds.size < 2 && (
            <Button size="sm" variant="outline" onClick={() => {
              setInterviewRound(usedRounds.has('ROUND_1') ? 'ROUND_2' : 'ROUND_1')
              setInterviewScheduledAt('')
              setInterviewOpen(true)
            }}>
              {t('recruitment.addInterview')}
            </Button>
          )}
        </div>
        {app.interviews.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('recruitment.noInterviews')}</p>
        )}
        {app.interviews.map((iv) => (
          <div key={iv.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{iv.round === 'ROUND_1' ? t('recruitment.round1') : t('recruitment.round2')}</span>
              <div className="flex items-center gap-2">
                <ResultBadge result={iv.result} />
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => openResultDialog(iv)}>
                    {t('recruitment.enterResult')}
                  </Button>
                )}
              </div>
            </div>
            {iv.scheduledAt && (
              <p className="text-sm text-muted-foreground">
                {t('recruitment.scheduledAt')}: {new Date(iv.scheduledAt).toLocaleString('ko-KR')}
              </p>
            )}
            {(iv.scoreSkill != null || iv.scoreComm != null || iv.scoreCulture != null) && (
              <div className="flex gap-4 text-sm">
                {iv.scoreSkill != null && <span>{t('recruitment.scoreSkill')}: {iv.scoreSkill}</span>}
                {iv.scoreComm != null && <span>{t('recruitment.scoreComm')}: {iv.scoreComm}</span>}
                {iv.scoreCulture != null && <span>{t('recruitment.scoreCulture')}: {iv.scoreCulture}</span>}
              </div>
            )}
            {iv.comment && <p className="text-sm">{iv.comment}</p>}
          </div>
        ))}
      </section>

      {/* Reference Check */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t('recruitment.referenceCheck')}</h2>
          {canWrite && !app.referenceCheck && (
            <Button size="sm" variant="outline" onClick={() => {
              setRefForm({ contactName: '', relationship: '', notes: '' })
              setRefOpen(true)
            }}>
              {t('recruitment.startRefCheck')}
            </Button>
          )}
        </div>
        {app.referenceCheck ? (
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{app.referenceCheck.contactName}</p>
                <p className="text-sm text-muted-foreground">{app.referenceCheck.relationship}</p>
              </div>
              <div className="flex items-center gap-2">
                <ResultBadge result={app.referenceCheck.result} />
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setRefResult(app.referenceCheck!.result)
                    setRefResultOpen(true)
                  }}>
                    {t('recruitment.updateResult')}
                  </Button>
                )}
              </div>
            </div>
            {app.referenceCheck.notes && <p className="text-sm">{app.referenceCheck.notes}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">레퍼런스 체크 미진행</p>
        )}
      </section>

      {/* Onboarding */}
      {(app.status === 'OFFERED' || app.status === 'ONBOARDED') && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t('recruitment.onboarding')}</h2>
          {app.onboarding ? (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('recruitment.emailVerified')}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={app.onboarding.emailVerifiedAt ? 'default' : 'secondary'}>
                    {app.onboarding.emailVerifiedAt ? t('recruitment.done') : t('recruitment.notDone')}
                  </Badge>
                  {canWrite && !app.onboarding.emailVerifiedAt && (
                    <Button size="sm" variant="outline" onClick={() => void handleVerifyEmail()} disabled={saving}>
                      {t('recruitment.verifyEmailManual')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('recruitment.mfaRegistered')}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={app.onboarding.mfaRegisteredAt ? 'default' : 'secondary'}>
                    {app.onboarding.mfaRegisteredAt ? t('recruitment.done') : t('recruitment.notDone')}
                  </Badge>
                  {canWrite && app.onboarding.emailVerifiedAt && !app.onboarding.mfaRegisteredAt && (
                    <Button size="sm" variant="outline" onClick={() => void handleCompleteMfa()} disabled={saving}>
                      {t('recruitment.completeMfaManual')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            canWrite && (
              <Button variant="outline" onClick={() => void handleStartOnboarding()} disabled={saving}>
                {t('recruitment.startOnboarding')}
              </Button>
            )
          )}
        </section>
      )}

      {/* Add Interview Dialog */}
      <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('recruitment.addInterview')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('recruitment.round')}</Label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={interviewRound}
                onChange={(e) => setInterviewRound(e.target.value as InterviewRound)}
              >
                {!usedRounds.has('ROUND_1') && <option value="ROUND_1">{t('recruitment.round1')}</option>}
                {!usedRounds.has('ROUND_2') && <option value="ROUND_2">{t('recruitment.round2')}</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.scheduledAt')}</Label>
              <Input type="datetime-local" value={interviewScheduledAt} onChange={(e) => setInterviewScheduledAt(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void handleAddInterview()} disabled={saving}>
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interview Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('recruitment.enterResult')} — {resultTarget?.round === 'ROUND_1' ? t('recruitment.round1') : t('recruitment.round2')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(['scoreSkill', 'scoreComm', 'scoreCulture'] as const).map((f) => (
                <div key={f} className="space-y-1">
                  <Label className="text-xs">{t(`recruitment.${f}`)}</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={resultForm[f]}
                    onChange={(e) => setResultForm((p) => ({ ...p, [f]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.comment')}</Label>
              <Textarea value={resultForm.comment} onChange={(e) => setResultForm((p) => ({ ...p, comment: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.result')}</Label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={resultForm.result}
                onChange={(e) => setResultForm((p) => ({ ...p, result: e.target.value as InterviewResult }))}
              >
                <option value="PENDING">{t('recruitment.pending')}</option>
                <option value="PASS">{t('recruitment.pass')}</option>
                <option value="FAIL">{t('recruitment.fail')}</option>
              </select>
            </div>
            <Button className="w-full" onClick={() => void handleSaveResult()} disabled={saving}>저장</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reference Check Dialog */}
      <Dialog open={refOpen} onOpenChange={setRefOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('recruitment.startRefCheck')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('recruitment.contactName')}</Label>
              <Input value={refForm.contactName} onChange={(e) => setRefForm((p) => ({ ...p, contactName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.relationship')}</Label>
              <Input value={refForm.relationship} onChange={(e) => setRefForm((p) => ({ ...p, relationship: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.notes')}</Label>
              <Textarea value={refForm.notes} onChange={(e) => setRefForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <Button className="w-full" onClick={() => void handleCreateRefCheck()} disabled={saving}>저장</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reference Result Update Dialog */}
      <Dialog open={refResultOpen} onOpenChange={setRefResultOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t('recruitment.updateResult')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={refResult}
              onChange={(e) => setRefResult(e.target.value as ReferenceCheckResult)}
            >
              <option value="PENDING">{t('recruitment.pending')}</option>
              <option value="CLEAR">{t('recruitment.clear')}</option>
              <option value="FLAGGED">{t('recruitment.flagged')}</option>
            </select>
            <Button className="w-full" onClick={() => void handleUpdateRefResult()} disabled={saving}>저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
