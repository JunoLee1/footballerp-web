import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { injuryApi } from '@/services/injury.service'
import type { InjuryAssessment } from '@/types/injury'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface Props {
  injuryId: string
  initial: InjuryAssessment | null
  onSaved: (result: { assessment: InjuryAssessment; triggeredReports: boolean }) => void
}

function ScoreField({
  label, hint, value, onChange, min = 0, max = 100,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void
  min?: number; max?: number
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="h-8 w-24 text-sm"
      />
    </div>
  )
}

export function AssessmentForm({ injuryId, initial, onSaved }: Props) {
  const { t } = useTranslation('medical')
  const [painLevel, setPainLevel] = useState(initial?.painLevel ?? 0)
  const [hasSwelling, setHasSwelling] = useState(initial?.hasSwelling ?? false)
  const [romScore, setRomScore] = useState(initial?.romScore ?? 100)
  const [strengthScore, setStrengthScore] = useState(initial?.strengthScore ?? 100)
  const [sprintScore, setSprintScore] = useState(initial?.sprintScore ?? 100)
  const [jumpScore, setJumpScore] = useState(initial?.jumpScore ?? 100)
  const [psychScore, setPsychScore] = useState(initial?.psychScore ?? 0)
  const [positionRiskScore, setPositionRiskScore] = useState(initial?.positionRiskScore ?? 0)
  const [saving, setSaving] = useState(false)

  const medicalPrev = (painLevel / 10) * 20 + (hasSwelling ? 10 : 0) + ((100 - romScore) / 100) * 10
  const functionalPrev = ((100 - (strengthScore + sprintScore + jumpScore) / 3) / 100) * 40
  const modifierPrev = ((psychScore + positionRiskScore) / 2 / 100) * 20
  const totalPrev = Math.round(medicalPrev + functionalPrev + modifierPrev)

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await injuryApi.saveAssessment(injuryId, {
        painLevel, hasSwelling, romScore,
        strengthScore, sprintScore, jumpScore,
        psychScore, positionRiskScore,
      })
      if (result.triggeredReports) {
        toast.success(t('assessment.savedWithReport'))
      } else {
        toast.success(t('assessment.saved'))
      }
      onSaved(result)
    } catch {
      toast.error(t('assessment.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-lg border p-4 ${totalPrev >= 80 ? 'border-destructive bg-destructive/5' : 'border-border bg-muted/30'}`}>
        <p className="text-xs font-medium text-muted-foreground mb-1">{t('assessment.previewLabel')}</p>
        <p className={`text-3xl font-bold tabular-nums ${totalPrev >= 80 ? 'text-destructive' : ''}`}>
          {totalPrev}
          <span className="text-base font-normal text-muted-foreground ml-1">/ 100</span>
        </p>
        {totalPrev >= 80 && (
          <p className="text-xs text-destructive mt-1">{t('assessment.threshold')}</p>
        )}
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span>{t('assessment.medicalScore', { score: medicalPrev.toFixed(1) })}</span>
          <span>{t('assessment.functionalScore', { score: functionalPrev.toFixed(1) })}</span>
          <span>{t('assessment.modifierScore', { score: modifierPrev.toFixed(1) })}</span>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('assessment.medicalSection')}</p>
        <ScoreField label={t('assessment.painLabel')} hint={t('assessment.painHint')} value={painLevel} onChange={setPainLevel} min={0} max={10} />
        <div className="flex items-center gap-3">
          <Switch checked={hasSwelling} onCheckedChange={setHasSwelling} id="swelling" />
          <Label htmlFor="swelling" className="text-xs">{t('assessment.swellingLabel')}</Label>
        </div>
        <ScoreField label={t('assessment.romLabel')} hint={t('assessment.romHint')} value={romScore} onChange={setRomScore} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('assessment.functionalSection')}</p>
        <ScoreField label={t('assessment.strengthLabel')} hint={t('assessment.strengthHint')} value={strengthScore} onChange={setStrengthScore} />
        <ScoreField label={t('assessment.sprintLabel')} hint={t('assessment.sprintHint')} value={sprintScore} onChange={setSprintScore} />
        <ScoreField label={t('assessment.jumpLabel')} hint={t('assessment.jumpHint')} value={jumpScore} onChange={setJumpScore} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('assessment.modifierSection')}</p>
        <ScoreField label={t('assessment.psychLabel')} hint={t('assessment.psychHint')} value={psychScore} onChange={setPsychScore} />
        <ScoreField label={t('assessment.posRiskLabel')} hint={t('assessment.posRiskHint')} value={positionRiskScore} onChange={setPositionRiskScore} />
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? t('assessment.saving') : t('assessment.save')}
      </Button>
    </div>
  )
}
