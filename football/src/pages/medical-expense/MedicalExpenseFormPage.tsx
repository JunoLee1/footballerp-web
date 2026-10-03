import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { medicalExpenseApi } from '@/services/medical-expense.service'
import type { ExpenseCostCategory, ExpensePayerType, MedicalExpense } from '@/types/medical-expense'
import { playerApi } from '@/services/player.service'
import type { Player } from '@/types/player'
import { POSITION_LABEL } from '@/types/player'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

const COST_CATEGORIES: ExpenseCostCategory[] = ['OUTPATIENT', 'EXAMINATION', 'SURGERY', 'REHABILITATION', 'MEDICATION']
const PAYER_TYPES: ExpensePayerType[] = ['CLUB', 'ASSOCIATION', 'INDIVIDUAL']

export function MedicalExpenseFormPage() {
  const { t } = useTranslation('medical')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [expenseLoading, setExpenseLoading] = useState(isEdit)
  const [playersLoading, setPlayersLoading] = useState(true)
  const loading = expenseLoading || playersLoading
  const [saving, setSaving] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])

  const [receiptDate, setReceiptDate] = useState('')
  const [costCategory, setCostCategory] = useState<ExpenseCostCategory>('OUTPATIENT')
  const [totalAmount, setTotalAmount] = useState('')
  const [payerType, setPayerType] = useState<ExpensePayerType>('CLUB')
  const [playerId, setPlayerId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | undefined>()

  useEffect(() => {
    playerApi.list({ status: 'ACTIVE' }).then(setPlayers).catch(() => {}).finally(() => setPlayersLoading(false))
  }, [])

  useEffect(() => {
    if (!id) return
    medicalExpenseApi
      .get(id)
      .then((e: MedicalExpense) => {
        setReceiptDate(e.receiptDate.slice(0, 10))
        setCostCategory(e.costCategory)
        setTotalAmount(String(e.totalAmount))
        setPayerType(e.payerType)
        setPlayerId(e.playerId ?? '')
        setDescription(e.description ?? '')
      })
      .catch(() => { toast.error(t('expenseForm.loadFailed')); navigate('/medical-expenses') })
      .finally(() => setExpenseLoading(false))
  }, [id, navigate])

  const handleSave = async (andSubmit = false) => {
    if (!receiptDate || !totalAmount) { toast.error(t('expenseForm.required')); return }
    setSaving(true)
    try {
      const dto = {
        receiptDate,
        costCategory,
        totalAmount: Number(totalAmount),
        payerType,
        ...(playerId && { playerId }),
        description: description || undefined,
        file,
      }
      let saved: MedicalExpense
      if (isEdit && id) {
        saved = await medicalExpenseApi.update(id, dto)
      } else {
        saved = await medicalExpenseApi.create(dto)
      }
      if (andSubmit) {
        await medicalExpenseApi.submit(saved.id)
        toast.success(t('expenseForm.submitted'))
      } else {
        toast.success(isEdit ? t('expenseForm.saved') : t('expenseForm.draftSaved'))
      }
      navigate(`/medical-expenses/${saved.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('expenseForm.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/medical-expenses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">
          {isEdit ? t('expenseForm.editTitle') : t('expenseForm.createTitle')}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-lg space-y-4">
          <div className="space-y-1.5">
            <Label>{t('expenseForm.receiptDate')}</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.category')}</Label>
            <Select value={costCategory} onValueChange={(v) => setCostCategory(v as ExpenseCostCategory)}>
              <SelectTrigger><span>{t(`expense.costCategory.${costCategory}`)}</span></SelectTrigger>
              <SelectContent>
                {COST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`expense.costCategory.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.amount')}</Label>
            <Input
              type="number"
              min={0}
              placeholder={t('expenseForm.amountPlaceholder')}
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.payer')}</Label>
            <Select value={payerType} onValueChange={(v) => setPayerType(v as ExpensePayerType)}>
              <SelectTrigger><span>{t(`expense.payerType.${payerType}`)}</span></SelectTrigger>
              <SelectContent>
                {PAYER_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>{t(`expense.payerType.${p}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.player')}</Label>
            <Select value={playerId} onValueChange={setPlayerId}>
              <SelectTrigger>
                {playerId
                  ? <span className="truncate">{players.find(p => p.id === playerId)?.playerName ?? playerId}</span>
                  : <span className="text-muted-foreground">{t('expenseForm.playerPlaceholder')}</span>}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('expenseForm.playerNone')}</SelectItem>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.playerName} ({POSITION_LABEL[p.position]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.description')}</Label>
            <Textarea
              placeholder={t('expenseForm.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('expenseForm.file')}</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0])} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? t('expenseForm.saving') : t('expenseForm.saveDraft')}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>
              {saving ? t('expenseForm.submitting') : t('expenseForm.submit')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
