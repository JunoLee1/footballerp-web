import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { injuryApi } from '@/services/injury.service'
import type {
  InjuryDetail, InjuryReport, RehabStage, RiskLevel, SecurityLevel,
  InjuryAssessment, ExternalReport, ExternalReportStatus,
} from '@/types/injury'
import {
  INJURY_STATUS_STYLE,
  RISK_LEVEL_STYLE, EXTERNAL_REPORT_STATUS_STYLE,
  type BodyPart,
} from '@/types/injury'
import { AssessmentForm } from '@/components/injury/AssessmentForm'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { ArrowLeft, User } from 'lucide-react'
import { POSITION_LABEL } from '@/types/player'

const REHAB_STAGES: RehabStage[] = ['INITIAL_TREATMENT', 'ACUTE_TREATMENT', 'REHABILITATION', 'RETURN_TRAINING', 'CLEARED']
const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH']
const SECURITY_LEVELS: SecurityLevel[] = ['INTERNAL', 'MEDICAL', 'PRIVATE']

const STATUS_STEPS: InjuryDetail['status'][] = [
  'OCCURRED', 'DIAGNOSED', 'REHABILITATING', 'READY_TO_RETURN', 'RETURNED',
]

function StatusTimeline({ current }: { current: InjuryDetail['status'] }) {
  const { t } = useTranslation('medical')
  const currentIdx = STATUS_STEPS.indexOf(current)
  return (
    <div className="flex items-center gap-0 w-full">
      {STATUS_STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                active ? 'bg-primary border-primary text-primary-foreground' :
                done ? 'bg-primary/20 border-primary text-primary' :
                'bg-muted border-muted-foreground/30 text-muted-foreground'
              }`}>
                {done ? '✓' : idx + 1}
              </div>
              <span className={`text-[10px] mt-1 text-center whitespace-nowrap ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {t(`injuries.status.${step}`)}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReturnChecklist({
  assessment,
  rehabLoadPercentage,
}: {
  assessment: InjuryAssessment
  rehabLoadPercentage: number | null | undefined
}) {
  const { t } = useTranslation('medical')
  const avgFunctional = (assessment.strengthScore + assessment.sprintScore + assessment.jumpScore) / 3
  const criteria: { label: string; met: boolean; unknown?: boolean }[] = [
    { label: t('returnReadiness.painNormal'), met: assessment.painLevel <= 2 },
    { label: t('returnReadiness.swellingGone'), met: !assessment.hasSwelling },
    { label: t('returnReadiness.romRecovered'), met: assessment.romScore >= 80 },
    { label: t('returnReadiness.strengthRecovered'), met: avgFunctional >= 80 },
    { label: t('returnReadiness.psychReady'), met: assessment.psychScore <= 30 },
    {
      label: t('returnReadiness.loadRecovered'),
      met: (rehabLoadPercentage ?? 0) >= 80,
      unknown: rehabLoadPercentage == null,
    },
  ]
  const metCount = criteria.filter((c) => c.met && !c.unknown).length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium">{t('returnReadiness.title')}</span>
        <span className="text-xs text-muted-foreground">{t('returnReadiness.met', { count: metCount, total: criteria.length })}</span>
      </div>
      {criteria.map((c) => (
        <div key={c.label} className="flex items-center gap-2">
          <span className={`text-sm ${c.unknown ? 'text-muted-foreground' : c.met ? 'text-green-600' : 'text-muted-foreground'}`}>
            {c.unknown ? '?' : c.met ? '✓' : '○'}
          </span>
          <span className={`text-sm ${c.met && !c.unknown ? '' : 'text-muted-foreground'}`}>{c.label}</span>
          {c.unknown && (
            <span className="text-xs text-muted-foreground">{t('returnReadiness.notRecorded')}</span>
          )}
        </div>
      ))}
    </div>
  )
}

const ALL_EXTERNAL_STATUSES: ExternalReportStatus[] = ['PENDING_SUBMISSION', 'SUBMITTED', 'SUPPLEMENT_REQUESTED', 'COMPLETED']

function ExternalReportRow({
  report,
  injuryId,
  isMedical,
  onUpdated,
}: {
  report: ExternalReport
  injuryId: string
  isMedical: boolean
  onUpdated: (updated: ExternalReport) => void
}) {
  const { t } = useTranslation('medical')
  const [editing, setEditing] = useState(false)
  const [newStatus, setNewStatus] = useState<ExternalReportStatus>(report.status)
  const [note, setNote] = useState(report.submittedNote ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await injuryApi.updateExternalReportStatus(injuryId, report.id, newStatus, note || undefined)
      onUpdated(updated)
      setEditing(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('detail.extReportStatusFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-2 border-b last:border-0 space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t(`externalTarget.${report.target}`)}</span>
          {report.dueDate && (
            <p className="text-xs text-muted-foreground">
              {t('detail.extDue', { date: new Date(report.dueDate).toLocaleDateString('ko-KR') })}
            </p>
          )}
          {report.submittedAt && (
            <p className="text-xs text-muted-foreground">
              {t('detail.extSubmitted', { date: new Date(report.submittedAt).toLocaleDateString('ko-KR') })}
              {report.submittedNote && ` · ${report.submittedNote}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${EXTERNAL_REPORT_STATUS_STYLE[report.status]}`}>
            {t(`externalStatus.${report.status}`)}
          </span>
          {isMedical && report.status !== 'COMPLETED' && !editing && (
            <Button size="sm" variant="outline" onClick={() => { setNewStatus(report.status); setNote(report.submittedNote ?? ''); setEditing(true) }}>
              {t('detail.extStatusChange')}
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="space-y-2 pt-1">
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ExternalReportStatus)}>
            <SelectTrigger className="h-8 text-xs">
              <span>{t(`externalStatus.${newStatus}`)}</span>
            </SelectTrigger>
            <SelectContent>
              {ALL_EXTERNAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`externalStatus.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder={t('detail.extNotePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? t('detail.extSaving') : t('detail.extSave')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              {t('detail.extCancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function InjuryDetailPage() {
  const { t } = useTranslation('medical')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [injury, setInjury] = useState<InjuryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [report, setReport] = useState<InjuryReport | null>(null)
  const [signing, setSigning] = useState(false)
  const [assessment, setAssessment] = useState<InjuryAssessment | null>(null)
  const [externalReports, setExternalReports] = useState<ExternalReport[]>([])

  const [diagnosisName, setDiagnosisName] = useState('')
  const [treatmentContent, setTreatmentContent] = useState('')
  const [rehabStage, setRehabStage] = useState<RehabStage | ''>('')
  const [trainingReturnDate, setTrainingReturnDate] = useState('')
  const [matchAvailable, setMatchAvailable] = useState<boolean | ''>('')
  const [matchAvailableWarning, setMatchAvailableWarning] = useState(false)
  const [allowedActivities, setAllowedActivities] = useState<string>('')
  const [reinjuryRisk, setReinjuryRisk] = useState<RiskLevel | ''>('')
  const [medicalOpinion, setMedicalOpinion] = useState('')
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('INTERNAL')

  const isMedical = user?.role === 'ADMIN' ||
    (user?.role === 'COACHING_STAFF' && (user?.coachingRole === 'MEDICAL' || user?.coachingRole === 'MEDICAL_DIRECTOR'))

  function fillForm(r: InjuryReport) {
    setDiagnosisName(r.diagnosisName ?? '')
    setTreatmentContent(r.treatmentContent ?? '')
    setRehabStage(r.rehabStage ?? '')
    setTrainingReturnDate(r.trainingReturnDate ? r.trainingReturnDate.slice(0, 10) : '')
    setMatchAvailable(r.matchAvailable ?? '')
    setMatchAvailableWarning(r.matchAvailable === true && !r.medicalSignedAt)
    setAllowedActivities(r.allowedActivities ?? '')
    setReinjuryRisk(r.reinjuryRisk ?? '')
    setMedicalOpinion(r.medicalOpinion ?? '')
    setSecurityLevel(r.securityLevel)
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      injuryApi.get(id),
      injuryApi.getReport(id),
      injuryApi.getAssessment(id),
      injuryApi.getExternalReports(id),
    ])
      .then(([inj, r, assess, reports]) => {
        setInjury(inj)
        if (r) { fillForm(r); setReport(r) }
        setAssessment(assess)
        setExternalReports(reports)
      })
      .catch(() => { toast.error(t('detail.loadFailed')); navigate('/injuries') })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      const updated = await injuryApi.saveReport(id, {
        diagnosisName: diagnosisName || undefined,
        treatmentContent: treatmentContent || undefined,
        rehabStage: rehabStage || undefined,
        trainingReturnDate: trainingReturnDate || undefined,
        matchAvailable: matchAvailable === '' ? undefined : matchAvailable,
        allowedActivities: allowedActivities || undefined,
        reinjuryRisk: reinjuryRisk || undefined,
        medicalOpinion: medicalOpinion || undefined,
        securityLevel,
      })
      setReport(updated)
      setMatchAvailableWarning((updated as any)._warning === 'MATCH_AVAILABLE_WITHOUT_MEDICAL_CLEARANCE')
      toast.success(t('detail.reportSaved'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('detail.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const mySignRole =
    user?.role === 'ADMIN' ? 'MEDICAL' :
    user?.coachingRole === 'HEAD_COACH' ? 'COACH' :
    user?.coachingRole === 'PHYSICAL_COACH' ? 'TRAINER' :
    (user?.coachingRole === 'MEDICAL' || user?.coachingRole === 'MEDICAL_DIRECTOR') ? 'MEDICAL' :
    null

  const handleToggleSign = async () => {
    if (!id || !mySignRole) return
    setSigning(true)
    try {
      const isSigned =
        mySignRole === 'COACH' ? !!report?.coachSignedAt :
        mySignRole === 'TRAINER' ? !!report?.trainerSignedAt :
        !!report?.medicalSignedAt
      const updated = isSigned
        ? await injuryApi.unsignReport(id)
        : await injuryApi.signReport(id)
      setReport(updated)
      toast.success(isSigned ? t('detail.unsignSuccess') : t('detail.signSuccess'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('detail.signFailed'))
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }
  if (!injury) return null

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/injuries')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{t('detail.title')}</h1>
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs mt-0.5 ${INJURY_STATUS_STYLE[injury.status]}`}>
            {t(`injuries.status.${injury.status}`)}
          </span>
        </div>
        {isMedical && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t('detail.saving') : t('detail.save')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">

          <div>
            <h2 className="text-sm font-semibold mb-3">{t('detail.basicInfo')}</h2>
            <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center gap-3 mb-4">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{injury.player.playerName}</p>
                <p className="text-muted-foreground text-xs">
                  {POSITION_LABEL[injury.player.position as keyof typeof POSITION_LABEL] ?? '—'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('detail.fieldBodyPart')}</p>
                <p className="font-medium">{t(`injuries.bodyPart.${injury.bodyPart as BodyPart}`)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('detail.fieldCause')}</p>
                <p className="font-medium">{t(`injuries.cause.${injury.cause}`)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('detail.fieldOccurredAt')}</p>
                <p className="font-medium tabular-nums">
                  {new Date(injury.occurredAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('detail.fieldExpectedReturn')}</p>
                <p className="font-medium tabular-nums">
                  {injury.expectedReturnDate
                    ? new Date(injury.expectedReturnDate).toLocaleDateString('ko-KR')
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">{t('detail.medicalReport')}</h2>
            {!isMedical && (
              <p className="text-sm text-muted-foreground mb-4">{t('detail.medicalOnlyNote')}</p>
            )}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('detail.fieldDiagnosis')}</Label>
                <Input
                  placeholder={t('detail.fieldDiagnosisPlaceholder')}
                  value={diagnosisName}
                  onChange={(e) => setDiagnosisName(e.target.value)}
                  disabled={!isMedical}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.fieldTreatment')}</Label>
                <Textarea
                  placeholder={t('detail.fieldTreatmentPlaceholder')}
                  value={treatmentContent}
                  onChange={(e) => setTreatmentContent(e.target.value)}
                  rows={3}
                  disabled={!isMedical}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.fieldRehabStage')}</Label>
                <Select
                  value={rehabStage}
                  onValueChange={(v) => setRehabStage(v as RehabStage)}
                  disabled={!isMedical}
                >
                  <SelectTrigger>
                    <span>{rehabStage ? t(`rehabStage.${rehabStage}`) : <span className="text-muted-foreground">{t('detail.fieldRehabNone')}</span>}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {REHAB_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{t(`rehabStage.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('detail.fieldTrainingReturn')}</Label>
                  <Input
                    type="date"
                    value={trainingReturnDate}
                    onChange={(e) => setTrainingReturnDate(e.target.value)}
                    disabled={!isMedical}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('detail.fieldMatchAvailable')}</Label>
                  <Select
                    value={matchAvailable === '' ? '' : String(matchAvailable)}
                    onValueChange={(v) => setMatchAvailable(v === '' ? '' : v === 'true')}
                    disabled={!isMedical}
                  >
                    <SelectTrigger>
                      <span>
                        {matchAvailable === ''
                          ? <span className="text-muted-foreground">{t('detail.fieldMatchNone')}</span>
                          : matchAvailable ? t('detail.fieldMatchYes') : t('detail.fieldMatchNo')}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">{t('detail.fieldMatchYes')}</SelectItem>
                      <SelectItem value="false">{t('detail.fieldMatchNo')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {matchAvailableWarning && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{t('detail.matchAvailableWarning')}</span>
                </div>
              )}

              <div className="space-y-1">
                <Label>{t('detail.fieldAllowedActivities')}</Label>
                {isMedical ? (
                  <Textarea
                    value={allowedActivities}
                    onChange={(e) => setAllowedActivities(e.target.value)}
                    placeholder={t('detail.fieldAllowedActivitiesPlaceholder')}
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {allowedActivities || t('detail.fieldAllowedActivitiesEmpty')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.fieldReinjuryRisk')}</Label>
                <Select
                  value={reinjuryRisk}
                  onValueChange={(v) => setReinjuryRisk(v as RiskLevel)}
                  disabled={!isMedical}
                >
                  <SelectTrigger>
                    {reinjuryRisk
                      ? <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${RISK_LEVEL_STYLE[reinjuryRisk]}`}>{t(`riskLevel.${reinjuryRisk}`)}</span>
                      : <span className="text-muted-foreground">{t('detail.fieldRiskNone')}</span>}
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r} value={r}>{t(`riskLevel.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.fieldOpinion')}</Label>
                <Textarea
                  placeholder={t('detail.fieldOpinionPlaceholder')}
                  value={medicalOpinion}
                  onChange={(e) => setMedicalOpinion(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                  disabled={!isMedical}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.fieldSecurity')}</Label>
                <Select
                  value={securityLevel}
                  onValueChange={(v) => setSecurityLevel(v as SecurityLevel)}
                  disabled={!isMedical}
                >
                  <SelectTrigger>
                    <span>{t(`securityLevel.${securityLevel}`)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {SECURITY_LEVELS.map((s) => (
                      <SelectItem key={s} value={s}>{t(`securityLevel.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* 상태 타임라인 */}
          {injury && (
            <section className="border rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-4">{t('detail.statusTimeline')}</h2>
              <StatusTimeline current={injury.status} />
            </section>
          )}

          {/* 가중치 평가 */}
          {isMedical && injury && (
            <section className="border rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-1">{t('detail.assessmentSection')}</h2>
              <p className="text-xs text-muted-foreground mb-4">
                {t('detail.assessmentNote')}
              </p>
              <AssessmentForm
                injuryId={injury.id}
                initial={assessment}
                onSaved={({ assessment: a, triggeredReports }) => {
                  setAssessment(a)
                  if (triggeredReports) {
                    injuryApi.getExternalReports(injury.id).then(setExternalReports)
                  }
                }}
              />
            </section>
          )}

          {/* 외부 의무보고서 */}
          {externalReports.length > 0 && (
            <section className="border rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">{t('detail.externalReports')}</h2>
              <div>
                {externalReports.map((r) => (
                  <ExternalReportRow
                    key={r.id}
                    report={r}
                    injuryId={injury.id}
                    isMedical={isMedical}
                    onUpdated={(updated) =>
                      setExternalReports((prev) => prev.map((x) => x.id === updated.id ? updated : x))
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* 복귀 체크리스트 */}
          {assessment && (
            <section className="border rounded-lg p-5">
              <h2 className="text-sm font-semibold mb-3">{t('detail.returnChecklist')}</h2>
              <ReturnChecklist assessment={assessment} rehabLoadPercentage={report?.rehabLoadPercentage ?? null} />
            </section>
          )}

          {report && (
            <div>
              <h2 className="text-sm font-semibold mb-3">{t('detail.returnPlan')}</h2>
              <p className="text-xs text-muted-foreground mb-3">
                {t('detail.returnPlanNote')}
              </p>
              <div className="space-y-2">
                {([
                  { role: 'COACH' as const, label: t('detail.roleCoach'), signedAt: report.coachSignedAt, signer: report.coachSigner },
                  { role: 'TRAINER' as const, label: t('detail.roleTrainer'), signedAt: report.trainerSignedAt, signer: report.trainerSigner },
                  { role: 'MEDICAL' as const, label: t('detail.roleMedical'), signedAt: report.medicalSignedAt, signer: report.medicalSigner },
                ]).map(({ role, label, signedAt, signer }) => (
                  <div key={role} className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${signedAt ? 'border-green-200 bg-green-50' : 'bg-muted/30'}`}>
                    <div className="text-sm">
                      <span className="font-medium">{label}</span>
                      {signedAt && signer && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {signer.nickname} · {new Date(signedAt).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                      {!signedAt && <span className="text-xs text-muted-foreground ml-2">{t('detail.unsigned')}</span>}
                    </div>
                    {mySignRole === role && (
                      <Button
                        size="sm"
                        variant={signedAt ? 'outline' : 'default'}
                        onClick={handleToggleSign}
                        disabled={signing}
                        className={signedAt ? 'text-red-600 border-red-300 hover:bg-red-50' : ''}
                      >
                        {signing ? t('detail.signing') : signedAt ? t('detail.unsign') : t('detail.sign')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
