import { useState, useRef } from 'react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { academyFeeApi } from '@/services/academyFee.service'
import type { AcademyFee } from '@/types/academy-fee'

interface Props {
  fee: AcademyFee
  userId: string
  open: boolean
  onClose: () => void
  onPaid: (updated: AcademyFee) => void
}

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string

export function PaymentModal({ fee, userId, open, onClose, onPaid }: Props) {
  const [tab, setTab] = useState<'pg' | 'bank'>('pg')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTossPay = async () => {
    setError(null)
    setLoading(true)
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY)
      const payment = tossPayments.payment({ customerKey: String(userId) })
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: fee.amount },
        orderId: `fee-${fee.id}-${Date.now()}`,
        orderName: `${fee.year}년 ${fee.month}월 아카데미 회비`,
        successUrl: `${window.location.origin}/toss-callback`,
        failUrl: `${window.location.origin}/toss-fail`,
      })
      // successUrl 리다이렉트 발생 — 이하 코드 실행 안 됨
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code !== 'USER_CANCEL') setError('결제 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleBankUpload = async () => {
    if (!file) { setError('파일을 선택해주세요.'); return }
    setError(null)
    setLoading(true)
    try {
      const updated = await academyFeeApi.uploadProof(fee.id, file)
      onPaid(updated)
      onClose()
    } catch {
      setError('업로드 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{fee.year}년 {fee.month}월 회비 납부</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          납부금액: <span className="font-semibold text-foreground">{fee.amount.toLocaleString()}원</span>
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'pg' | 'bank')}>
          <TabsList className="w-full">
            <TabsTrigger value="pg" className="flex-1">카드 / 간편결제</TabsTrigger>
            <TabsTrigger value="bank" className="flex-1">계좌이체 증빙</TabsTrigger>
          </TabsList>

          <TabsContent value="pg" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Toss Payments로 즉시 결제됩니다. 결제 완료 후 자동으로 납부 처리됩니다.
            </p>
            <Button className="w-full" onClick={handleTossPay} disabled={loading}>
              {loading ? '처리 중...' : '카드 / 간편결제로 납부'}
            </Button>
          </TabsContent>

          <TabsContent value="bank" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              계좌이체 후 이체 확인증(이미지 또는 PDF)을 업로드하세요. 재무팀 확인 후 납부 처리됩니다.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              {file ? file.name : '파일 선택'}
            </Button>
            <Button className="w-full" onClick={handleBankUpload} disabled={loading || !file}>
              {loading ? '업로드 중...' : '증빙 제출'}
            </Button>
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
