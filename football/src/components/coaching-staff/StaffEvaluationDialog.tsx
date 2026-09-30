import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { coachingStaffEvalApi } from '@/services/coaching-staff-eval.service'
import type { CoachingStaffEval } from '@/types/coaching-staff-eval'
import { COACHING_ROLE_LABEL } from '@/types/auth'
import type { CoachingRole } from '@/types/auth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  staffUserId: string
  staffNickname: string
  canCreate: boolean
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function StaffEvaluationDialog({ open, onClose, staffUserId, staffNickname, canCreate }: Props) {
  const [evals, setEvals] = useState<CoachingStaffEval[]>([])
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchEvals = () => {
    setLoading(true)
    coachingStaffEvalApi.list(staffUserId)
      .then(setEvals)
      .catch(() => toast.error('평가 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) fetchEvals()
  }, [open, staffUserId])

  const handleCreate = async () => {
    if (!score) return
    setSaving(true)
    try {
      await coachingStaffEvalApi.create(staffUserId, score, comment.trim() || undefined)
      toast.success('평가가 등록됐습니다.')
      setScore(null)
      setComment('')
      fetchEvals()
    } catch {
      toast.error('등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{staffNickname} 평가</DialogTitle>
        </DialogHeader>

        {canCreate && (
          <div className="space-y-3 pb-2">
            <div className="space-y-1.5">
              <Label className="text-xs">점수 (1–10)</Label>
              <div className="flex gap-1.5 flex-wrap">
                {SCORE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`w-8 h-8 rounded text-sm font-medium border transition-colors ${
                      score === s
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-input'
                    }`}
                    onClick={() => setScore(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">코멘트 (선택)</Label>
              <Textarea
                rows={2}
                placeholder="평가 내용을 입력하세요."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={saving || !score}
              >
                {saving ? '저장 중...' : '평가 등록'}
              </Button>
            </div>
            <Separator />
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground">평가 이력</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">불러오는 중...</p>
          ) : evals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">등록된 평가가 없습니다.</p>
          ) : (
            evals.map((e) => (
              <div key={e.id} className="rounded-md border px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tabular-nums">{e.score}</span>
                    <span className="text-xs text-muted-foreground">/ 10</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{e.evaluator.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.evaluator.coachingRole
                        ? (COACHING_ROLE_LABEL[e.evaluator.coachingRole as CoachingRole] ?? e.evaluator.coachingRole)
                        : ''}
                    </p>
                  </div>
                </div>
                {e.comment && (
                  <p className="text-xs text-muted-foreground">{e.comment}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatDate(e.evaluatedAt)}</p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
