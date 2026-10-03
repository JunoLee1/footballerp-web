import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { contractApi } from '@/services/contract.service'
import type {
  ContractDetail, BonusMetric, BonusPeriod, CompetitionType,
  CreateExtensionDto, CreateBonusDto,
} from '@/types/contract'
import {
  CONTRACT_STATUS_STYLE,
  BONUS_METRIC_LABEL, BONUS_PERIOD_LABEL, formatSalary,
} from '@/types/contract'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, CheckCircle2 } from 'lucide-react'
import { computeSigningBonusAnnual } from './lib/signing-bonus'

const BONUS_METRICS = Object.keys(BONUS_METRIC_LABEL) as BonusMetric[]
const BONUS_PERIODS = Object.keys(BONUS_PERIOD_LABEL) as BonusPeriod[]
const COMPETITION_TYPE_KEYS: Array<CompetitionType | ''> = ['', 'LEAGUE', 'CUP', 'CHAMPIONS_LEAGUE', 'FRIENDLY']

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR')
}

interface AddExtensionDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  contractId: string
  onSaved: () => void
}

function AddExtensionDialog({ open, onOpenChange, contractId, onSaved }: AddExtensionDialogProps) {
  const { t } = useTranslation('contract')
  const [condition, setCondition] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!condition.trim() || !durationMonths) {
      toast.error(t('contractDetail.requiredAll'))
      return
    }
    setSaving(true)
    try {
      const dto: CreateExtensionDto = {
        condition: condition.trim(),
        durationMonths: Number(durationMonths),
      }
      await contractApi.addExtension(contractId, dto)
      toast.success(t('contractDetail.extensionAdded'))
      setCondition(''); setDurationMonths('')
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('contractDetail.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('contractDetail.extensionDialogTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('contractDetail.extensionCondition')}</Label>
            <Input
              placeholder={t('contractDetail.extensionConditionPlaceholder')}
              value={condition}
              onChange={e => setCondition(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.extensionDuration')}</Label>
            <Input
              type="number" min="1" placeholder="12"
              value={durationMonths}
              onChange={e => setDurationMonths(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('contractDetail.cancel')}</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('contractDetail.saving') : t('contractDetail.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface AddBonusDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  contractId: string
  onSaved: () => void
}

function AddBonusDialog({ open, onOpenChange, contractId, onSaved }: AddBonusDialogProps) {
  const { t } = useTranslation('contract')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [metric, setMetric] = useState<BonusMetric>('GOALS')
  const [threshold, setThreshold] = useState('')
  const [period, setPeriod] = useState<BonusPeriod>('SEASON')
  const [competitionType, setCompetitionType] = useState<CompetitionType | ''>('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!description.trim() || !amount || !threshold) {
      toast.error(t('contractDetail.requiredAll'))
      return
    }
    setSaving(true)
    try {
      const dto: CreateBonusDto = {
        amount: Number(amount),
        description: description.trim(),
        triggers: [{
          metric,
          threshold: Number(threshold),
          period,
          competitionType: competitionType || null,
        }],
      }
      await contractApi.addBonus(contractId, dto)
      toast.success(t('contractDetail.bonusAdded'))
      setDescription(''); setAmount(''); setThreshold('')
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('contractDetail.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('contractDetail.bonusDialogTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('contractDetail.bonusDescription')}</Label>
            <Input
              placeholder={t('contractDetail.bonusDescriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.bonusAmount')}</Label>
            <Input
              type="text" inputMode="numeric" placeholder="5,000,000"
              value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
              onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.bonusMetric')}</Label>
            <Select value={metric} onValueChange={v => setMetric(v as BonusMetric)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BONUS_METRICS.map(m => (
                  <SelectItem key={m} value={m}>{t(`contractDetail.bonusMetricLabel.${m}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.bonusThreshold')}</Label>
            <Input
              type="number" placeholder="10"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.bonusPeriod')}</Label>
            <Select value={period} onValueChange={v => setPeriod(v as BonusPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BONUS_PERIODS.map(bp => (
                  <SelectItem key={bp} value={bp}>{t(`contractDetail.bonusPeriodLabel.${bp}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('contractDetail.competitionType')}</Label>
            <Select
              value={competitionType}
              onValueChange={v => setCompetitionType(v as CompetitionType | '')}
            >
              <SelectTrigger><SelectValue placeholder={t('contractDetail.competitionTypeAll')} /></SelectTrigger>
              <SelectContent>
                {COMPETITION_TYPE_KEYS.map(ck => (
                  <SelectItem key={ck} value={ck}>{t(`contractDetail.competitionTypeLabel.${ck || 'ALL'}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('contractDetail.cancel')}</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('contractDetail.saving') : t('contractDetail.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ContractDetailPage() {
  const { t } = useTranslation('contract')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [buyoutAmount, setBuyoutAmount] = useState('')
  const [addingBuyout, setAddingBuyout] = useState(false)
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false)
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [markPaidDate, setMarkPaidDate] = useState('')
  const [markingPaid, setMarkingPaid] = useState(false)

  const canWrite = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'

  const canMarkPaid =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' &&
      (user?.frontOfficeRole === 'FINANCE_MANAGER' || user?.frontOfficeRole === 'CONTRACT_MANAGER'))

  const load = async () => {
    setLoading(true)
    if (!id) {
      setLoading(false)
      return
    }
    try {
      const data = await contractApi.get(id)
      setContract(data)
    } catch {
      toast.error(t('contractDetail.loadFailed'))
      setContract(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  const handleAddBuyout = async () => {
    if (!buyoutAmount || !contract) return
    setAddingBuyout(true)
    try {
      await contractApi.addBuyout(contract.id, Number(buyoutAmount))
      toast.success(t('contractDetail.buyoutAdded'))
      setBuyoutAmount('')
      void load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('contractDetail.saveFailed'))
    } finally {
      setAddingBuyout(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!contract) return
    setMarkingPaid(true)
    try {
      await contractApi.markSigningBonusPaid(contract.id, markPaidDate || undefined)
      toast.success(t('contractDetail.signingBonusMarkPaidSuccess'))
      setMarkPaidOpen(false)
      setMarkPaidDate('')
      void load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('contractDetail.saveFailed'))
    } finally {
      setMarkingPaid(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
        <p>{t('contractDetail.loadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t('contractDetail.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('contractDetail.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${CONTRACT_STATUS_STYLE[contract.status]}`}>
              {t(`contracts.status.${contract.status}`)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* 기본 정보 */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('contractDetail.basicInfo')}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('contractDetail.period')}</dt>
              <dd className="font-medium tabular-nums">
                {formatDate(contract.startDate)} — {formatDate(contract.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('contractDetail.salary')}</dt>
              <dd className="font-medium">{formatSalary(contract.salary)}</dd>
            </div>
          </dl>
        </section>

        {/* 서명 보너스 */}
        {contract.signingBonus > 0 && (
          <section data-testid="signing-bonus-card">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">
              {t('contractDetail.signingBonus')}
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('contractDetail.signingBonusAmount')}</dt>
                <dd className="font-medium tabular-nums">{formatSalary(contract.signingBonus)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('contractDetail.signingBonusAnnual')}</dt>
                <dd className="font-medium tabular-nums">
                  {formatSalary(
                    computeSigningBonusAnnual(contract.signingBonus, contract.startDate, contract.endDate)
                  )} / 년
                </dd>
              </div>
              {contract.signingBonusScheduledAt && (
                <div>
                  <dt className="text-muted-foreground">{t('contractDetail.signingBonusScheduled')}</dt>
                  <dd className="font-medium tabular-nums">{formatDate(contract.signingBonusScheduledAt)}</dd>
                </div>
              )}
              <div className="col-span-2 flex items-center justify-between">
                <div>
                  <dt className="text-muted-foreground">{t('contractDetail.signingBonusStatus')}</dt>
                  {contract.signingBonusPaidAt ? (
                    <dd className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>{t('contractDetail.signingBonusPaid')}</span>
                      <span data-testid="paid-date" className="tabular-nums">
                        · {formatDate(contract.signingBonusPaidAt)}
                      </span>
                    </dd>
                  ) : (
                    <dd className="text-sm text-muted-foreground">{t('contractDetail.signingBonusUnpaid')}</dd>
                  )}
                </div>
                {!contract.signingBonusPaidAt && canMarkPaid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    data-testid="mark-paid-btn"
                    onClick={() => {
                      setMarkPaidDate(new Date().toISOString().slice(0, 10))
                      setMarkPaidOpen(true)
                    }}
                  >
                    {t('contractDetail.signingBonusMarkPaid')}
                  </Button>
                )}
              </div>
            </dl>
          </section>
        )}

        {/* 바이아웃 조항 */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('contractDetail.buyout')}</h2>
          {contract.buyoutClause ? (
            <p className="text-sm font-medium">{formatSalary(contract.buyoutClause.amount)}</p>
          ) : canWrite ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                placeholder={t('contractDetail.buyoutPlaceholder')}
                value={buyoutAmount ? Number(buyoutAmount).toLocaleString('ko-KR') : ''}
                onChange={e => setBuyoutAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-40 h-8 text-sm"
              />
              <Button
                size="sm" className="h-8"
                onClick={() => void handleAddBuyout()}
                disabled={addingBuyout || !buyoutAmount}
              >
                {addingBuyout ? t('contractDetail.saving') : t('contractDetail.add')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('contractDetail.none')}</p>
          )}
        </section>

        {/* 연장 옵션 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t('contractDetail.extensions')}</h2>
            {canWrite && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setExtensionDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />{t('contractDetail.add')}
              </Button>
            )}
          </div>
          {contract.extensionOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('contractDetail.noExtensions')}</p>
          ) : (
            <ul className="space-y-2">
              {contract.extensionOptions.map(e => (
                <li key={e.id} className="rounded border px-3 py-2 text-sm">
                  <span className="font-medium">{t('contractDetail.extensionMonths', { count: e.durationMonths })}</span>
                  <span className="mx-2 text-muted-foreground">—</span>
                  {e.condition}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 성과 보너스 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t('contractDetail.bonuses')}</h2>
            {canWrite && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setBonusDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />{t('contractDetail.add')}
              </Button>
            )}
          </div>
          {contract.performanceBonuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('contractDetail.noBonuses')}</p>
          ) : (
            <ul className="space-y-3">
              {contract.performanceBonuses.map(b => (
                <li key={b.id} className="rounded border px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{b.description}</span>
                    <span className="text-sm tabular-nums">{formatSalary(b.amount)}</span>
                  </div>
                  <ul className="space-y-1">
                    {b.triggers.map(tr => (
                      <li key={tr.id} className="text-xs text-muted-foreground">
                        {t(`contractDetail.bonusMetricLabel.${tr.metric}`)} ≥ {tr.threshold} ({t(`contractDetail.bonusPeriodLabel.${tr.period}`)})
                        {tr.competitionType && ` · ${tr.competitionType}`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AddExtensionDialog
        open={extensionDialogOpen}
        onOpenChange={setExtensionDialogOpen}
        contractId={contract.id}
        onSaved={() => { setExtensionDialogOpen(false); void load() }}
      />
      <AddBonusDialog
        open={bonusDialogOpen}
        onOpenChange={setBonusDialogOpen}
        contractId={contract.id}
        onSaved={() => { setBonusDialogOpen(false); void load() }}
      />
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('contractDetail.signingBonusMarkPaidTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{t('contractDetail.signingBonusMarkPaidDesc')}</p>
            <div className="space-y-1.5">
              <Label>{t('contractDetail.signingBonusPaidAt')}</Label>
              <Input
                type="date"
                value={markPaidDate}
                onChange={(e) => setMarkPaidDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidOpen(false)} disabled={markingPaid}>
              {t('contractDetail.cancel')}
            </Button>
            <Button onClick={() => void handleMarkPaid()} disabled={markingPaid}>
              {markingPaid ? t('contractDetail.saving') : t('contractDetail.signingBonusMarkPaidConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
