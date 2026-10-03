import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { medicalExpenseApi } from '@/services/medical-expense.service'
import type { MedicalExpense } from '@/types/medical-expense'
import {
  EXPENSE_STATUS_STYLE,
} from '@/types/medical-expense'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArrowLeft, Download, Check, X, Pencil, User } from 'lucide-react'
import { POSITION_LABEL } from '@/types/player'

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatAmount(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

function RejectDialog({ open, onOpenChange, onConfirm, title }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: (reason: string) => Promise<void>
  title: string
}) {
  const { t } = useTranslation('medical')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (!reason.trim()) { toast.error(t('expenseDetail.rejectReasonRequired')); return }
    setLoading(true)
    try { await onConfirm(reason.trim()) } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>{t('expenseDetail.rejectReasonLabel')}</Label>
          <Textarea
            placeholder={t('expenseDetail.rejectReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t('expenseDetail.cancel')}</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? t('expenseDetail.processing') : t('expenseDetail.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MedicalExpenseDetailPage() {
  const { t } = useTranslation('medical')
  const { id } = useParams<{ id: string }>()
  const { user } = useCurrentUser()
  const navigate = useNavigate()
  const [expense, setExpense] = useState<MedicalExpense | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [acting, setActing] = useState(false)

  const isMedicalDirector = user?.role === 'COACHING_STAFF' && user?.coachingRole === 'MEDICAL_DIRECTOR'
  const isAdmin = user?.role === 'ADMIN'
  const isAuthor = expense?.submittedById === user?.id

  useEffect(() => {
    if (!id) return
    medicalExpenseApi
      .get(id)
      .then(setExpense)
      .catch(() => { toast.error(t('expenseDetail.loadFailed')); navigate('/medical-expenses') })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const withActing = async (fn: () => Promise<MedicalExpense>) => {
    setActing(true)
    try {
      const updated = await fn()
      setExpense(updated)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('expenseDetail.actionFailed'))
    } finally {
      setActing(false)
    }
  }

  const handleSubmit = () =>
    withActing(async () => {
      const r = await medicalExpenseApi.submit(expense!.id)
      toast.success(t('expenseDetail.submitted'))
      return r
    })

  const handleLeaderApprove = () =>
    withActing(async () => {
      const r = await medicalExpenseApi.leaderApprove(expense!.id)
      toast.success(t('expenseDetail.leaderApproved'))
      return r
    })

  const handleLeaderReject = async (reason: string) => {
    const updated = await medicalExpenseApi.leaderReject(expense!.id, reason)
    setExpense(updated)
    setRejectOpen(false)
    toast.success(t('expenseDetail.leaderRejected'))
  }

  const handleApprove = () =>
    withActing(async () => {
      const r = await medicalExpenseApi.approve(expense!.id)
      toast.success(t('expenseDetail.approved'))
      return r
    })

  const handleReject = async (reason: string) => {
    const updated = await medicalExpenseApi.reject(expense!.id, reason)
    setExpense(updated)
    setRejectOpen(false)
    toast.success(t('expenseDetail.rejected'))
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    )
  }

  if (!expense) return null

  const canEdit = isAuthor && (expense.status === 'DRAFT' || expense.status === 'REJECTED')
  const canSubmit = isAuthor && (expense.status === 'DRAFT' || expense.status === 'REJECTED')
  const canLeaderAct = isMedicalDirector && expense.status === 'SUBMITTED'
  const canAdminAct = isAdmin && expense.status === 'LEADER_APPROVED'
  const rejectTitle = canLeaderAct ? t('expenseDetail.leaderRejectTitle') : t('expenseDetail.finalRejectTitle')
  const onReject = canLeaderAct ? handleLeaderReject : handleReject

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/medical-expenses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{t('expenseDetail.title')}</h1>
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs mt-0.5 ${EXPENSE_STATUS_STYLE[expense.status]}`}>
            {t(`expense.status.${expense.status}`)}
          </span>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/medical-expenses/${expense.id}/edit`)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />{t('expenseDetail.edit')}
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" onClick={handleSubmit} disabled={acting}>{t('expenseDetail.submit')}</Button>
          )}
          {(canLeaderAct || canAdminAct) && (
            <>
              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setRejectOpen(true)} disabled={acting}>
                <X className="h-3.5 w-3.5 mr-1" />{t('expenseDetail.reject')}
              </Button>
              <Button size="sm" onClick={canLeaderAct ? handleLeaderApprove : handleApprove} disabled={acting}>
                <Check className="h-3.5 w-3.5 mr-1" />{canLeaderAct ? t('expenseDetail.leaderApprove') : t('expenseDetail.finalApprove')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {expense.player && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{expense.player.playerName}</p>
                <p className="text-muted-foreground text-xs">
                  {POSITION_LABEL[expense.player.position as keyof typeof POSITION_LABEL] ?? expense.player.position}
                  {' · '}
                  {new Date(expense.player.dateOfBirth).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 생
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.receiptDate')}</p>
              <p className="font-medium">{new Date(expense.receiptDate).toLocaleDateString('ko-KR')}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.category')}</p>
              <p className="font-medium">{t(`expense.costCategory.${expense.costCategory}`)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.amount')}</p>
              <p className="font-medium tabular-nums">{formatAmount(expense.totalAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.payer')}</p>
              <p className="font-medium">{t(`expense.payerType.${expense.payerType}`)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.submitter')}</p>
              <p>{expense.submittedBy.nickname}</p>
            </div>
            {expense.submittedAt && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.submittedAt')}</p>
                <p>{formatDateTime(expense.submittedAt)}</p>
              </div>
            )}
            {expense.leaderReviewedAt && expense.leaderReviewer && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.leaderReviewedAt')}</p>
                <p>{formatDateTime(expense.leaderReviewedAt)} ({expense.leaderReviewer.nickname})</p>
              </div>
            )}
            {expense.adminReviewedAt && expense.adminReviewer && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">{t('expenseDetail.adminReviewedAt')}</p>
                <p>{formatDateTime(expense.adminReviewedAt)} ({expense.adminReviewer.nickname})</p>
              </div>
            )}
          </div>

          {expense.rejectionReason && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium mb-0.5">{t('expenseDetail.rejectionReasonLabel')}</p>
              <p className="whitespace-pre-wrap">{expense.rejectionReason}</p>
            </div>
          )}

          {expense.description && (
            <div>
              <p className="text-muted-foreground text-xs mb-1.5">{t('expenseDetail.notes')}</p>
              <div className="rounded border p-4 text-sm whitespace-pre-wrap">{expense.description}</div>
            </div>
          )}

          {expense.fileUrl && (
            <div>
              <p className="text-muted-foreground text-xs mb-1.5">{t('expenseDetail.attachment')}</p>
              <a
                href={expense.fileUrl}
                download={expense.fileName ?? true}
                className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Download className="h-4 w-4" />
                {expense.fileName ?? t('expenseDetail.attachmentDefault')}
              </a>
            </div>
          )}
        </div>
      </div>

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={onReject}
        title={rejectTitle}
      />
    </div>
  )
}
