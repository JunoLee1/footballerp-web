import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAssetRequests } from '@/hooks/useAssetRequests'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useExpenseCategories } from '@/hooks/useExpenseCategories'
import { assetRequestApi } from '@/services/asset-request.service'
import { equipmentApi } from '@/services/equipment.service'
import { softwareLicenseApi, type SoftwareLicense } from '@/services/software-license.service'
import type { EquipmentItem } from '@/types/equipment'
import {
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
  type AssetRequest,
  type AssetRequestType,
  type CreateAssetRequestPayload,
} from '@/types/asset-request'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Send, X } from 'lucide-react'

type SourceKind = 'MASTER' | 'CUSTOM'

interface FormState {
  type: AssetRequestType
  source: SourceKind
  equipmentItemId: string // stringified id for select value
  softwareLicenseId: string
  customName: string
  customDescription: string
  expenseCategoryId: string
  expectedAmount: string
  neededBy: string
  justification: string
}

const emptyForm: FormState = {
  type: 'HARDWARE',
  source: 'MASTER',
  equipmentItemId: '',
  softwareLicenseId: '',
  customName: '',
  customDescription: '',
  expenseCategoryId: '',
  expectedAmount: '',
  neededBy: '',
  justification: '',
}

function fmtWon(n: number) {
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * Maps a backend error code to a Korean UI message. Mirrors the OperatingExpense
 * pattern (page-local switch). If we add a third caller, extract to `lib/`.
 */
function messageForCode(code: string, fallback: string): string {
  switch (code) {
    case 'NO_DEPARTMENT':
      return '소속 부서 정보가 없습니다. 관리자에게 부서 배정을 요청해주세요.'
    case 'INVALID_PAYLOAD':
      return '신청 항목 조합이 올바르지 않습니다. (마스터 선택 또는 자유입력 중 하나만 채워주세요)'
    case 'INVALID_TYPE_MASTER_MISMATCH':
      return '자산 유형과 선택한 마스터 항목이 일치하지 않습니다.'
    case 'INVALID_AMOUNT':
      return '예상 금액을 확인해주세요.'
    case 'JUSTIFICATION_REQUIRED':
      return '신청 사유는 필수입니다.'
    case 'INVALID_STATUS':
      return '현재 상태에서 수행할 수 없는 동작입니다.'
    case 'NOT_LEADER':
      return '팀장 결재 권한이 없습니다.'
    case 'NOT_DEPT_HEAD':
      return '부서장 결재 권한이 없습니다.'
    case 'NOT_YOUR_REQUEST':
      return '본인의 신청만 수정할 수 있습니다.'
    case 'SELF_APPROVAL_FORBIDDEN':
      return '본인이 신청한 건은 결재할 수 없습니다.'
    case 'REASON_REQUIRED':
      return '반려 사유를 입력해주세요.'
    case 'NO_ACTIVE_SEASON':
      return '활성 시즌이 없어 지출을 생성할 수 없습니다.'
    case 'BUDGET_LINE_NOT_FOUND':
      return '해당 시즌·부서·카테고리에 승인된 예산 라인이 없습니다. 재무팀에 문의해주세요.'
    case 'BUDGET_EXCEEDED':
      return '부서 예산을 초과합니다. 예비비 배정 후 다시 시도해주세요.'
    case 'NOT_FOUND':
      return '요청을 찾을 수 없습니다.'
    default:
      return fallback
  }
}

export function AssetRequestPage() {
  const { user } = useCurrentUser()
  const { rows: categories, labelOf: categoryLabelOf } = useExpenseCategories()
  const { requests, loading, reload } = useAssetRequests('me')

  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([])
  const [softwareLicenses, setSoftwareLicenses] = useState<SoftwareLicense[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AssetRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [rowActingId, setRowActingId] = useState<number | null>(null)

  // Load master lists once — they populate the SOFTWARE/HARDWARE dropdown so
  // the requester can attach the request to a known catalog entry.
  useEffect(() => {
    void (async () => {
      try {
        const [eqs, lics] = await Promise.all([
          equipmentApi.listItems(),
          softwareLicenseApi.list(),
        ])
        setEquipmentItems(eqs)
        setSoftwareLicenses(lics)
      } catch {
        // Non-fatal — user can still submit via customName.
      }
    })()
  }, [])

  const openCreate = () => {
    // Preselect the first available category so amount+justification are the
    // only fields the user must touch for a typical hardware request.
    setForm({
      ...emptyForm,
      expenseCategoryId: categories[0]?.id != null ? String(categories[0].id) : '',
    })
    setCreateOpen(true)
  }

  const handleTypeChange = (nextType: AssetRequestType) => {
    // Swap master field when type flips — a HW request can't reference a SW
    // license and vice versa (backend rejects with INVALID_PAYLOAD otherwise).
    setForm((p) => ({
      ...p,
      type: nextType,
      equipmentItemId: '',
      softwareLicenseId: '',
    }))
  }

  const handleSubmit = async () => {
    if (!form.expenseCategoryId) {
      toast.error('카테고리를 선택해주세요')
      return
    }
    const amount = parseInt(form.expectedAmount, 10)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('예상 금액을 확인해주세요')
      return
    }
    if (!form.justification.trim()) {
      toast.error('신청 사유는 필수입니다')
      return
    }

    // Exactly one of {equipmentItemId, softwareLicenseId, customName} —
    // the backend enforces this too but a client check saves a round-trip.
    const payload: CreateAssetRequestPayload = {
      type: form.type,
      expenseCategoryId: parseInt(form.expenseCategoryId, 10),
      expectedAmount: amount,
      justification: form.justification.trim(),
      ...(form.neededBy && { neededBy: form.neededBy }),
    }

    if (form.source === 'MASTER') {
      if (form.type === 'HARDWARE') {
        if (!form.equipmentItemId) {
          toast.error('장비를 선택해주세요')
          return
        }
        payload.equipmentItemId = parseInt(form.equipmentItemId, 10)
      } else {
        if (!form.softwareLicenseId) {
          toast.error('소프트웨어 라이선스를 선택해주세요')
          return
        }
        payload.softwareLicenseId = form.softwareLicenseId
      }
    } else {
      if (!form.customName.trim()) {
        toast.error('자유입력 항목명을 입력해주세요')
        return
      }
      payload.customName = form.customName.trim()
      if (form.customDescription.trim()) {
        payload.customDescription = form.customDescription.trim()
      }
    }

    setSaving(true)
    try {
      await assetRequestApi.create(payload)
      toast.success('자산 신청이 생성됐습니다 (임시저장)')
      setCreateOpen(false)
      setForm(emptyForm)
      await reload()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '신청 생성에 실패했습니다'))
    } finally {
      setSaving(false)
    }
  }

  const runRowAction = async (
    id: number,
    action: () => Promise<AssetRequest>,
    successMsg: string,
  ) => {
    setRowActingId(id)
    try {
      await action()
      toast.success(successMsg)
      await reload()
      if (detailId === id) void loadDetail(id)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '처리에 실패했습니다'))
    } finally {
      setRowActingId(null)
    }
  }

  const loadDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      setDetail(await assetRequestApi.get(id))
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '상세 조회에 실패했습니다'))
    } finally {
      setDetailLoading(false)
    }
  }

  const openDetail = (id: number) => {
    setDetailId(id)
    setDetail(null)
    void loadDetail(id)
  }

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [requests],
  )

  const titleOf = (r: {
    equipmentItemId: number | null
    softwareLicenseId: string | null
    customName: string | null
    type: AssetRequestType
  }) => {
    if (r.customName) return r.customName
    if (r.equipmentItemId) {
      return (
        equipmentItems.find((e) => e.id === r.equipmentItemId)?.name ??
        `장비 #${r.equipmentItemId}`
      )
    }
    if (r.softwareLicenseId) {
      return (
        softwareLicenses.find((l) => l.id === r.softwareLicenseId)?.name ??
        `라이선스 #${r.softwareLicenseId}`
      )
    }
    return TYPE_LABEL[r.type]
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">자산 신청</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            소프트웨어 라이선스 또는 하드웨어 자산을 신청하고 팀장·부서장 결재를 받습니다.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!user}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />신청 작성
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sortedRequests.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            아직 작성한 신청이 없습니다.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>신청일</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>항목</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead className="text-right">예상 금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRequests.map((r) => {
                const acting = rowActingId === r.id
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(r.id)}
                  >
                    <TableCell className="tabular-nums text-sm">
                      {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                    </TableCell>
                    <TableCell className="text-sm">{TYPE_LABEL[r.type]}</TableCell>
                    <TableCell className="text-sm">{titleOf(r)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {categoryLabelOf(r.expenseCategory.code)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium text-sm text-right">
                      {fmtWon(r.expectedAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.isAutoProvisioned && (
                          <Badge
                            variant="outline"
                            className="border-blue-300 bg-blue-50 text-[10px] text-blue-700"
                            title={
                              r.provisionedFromDispatchId
                                ? `발령 #${r.provisionedFromDispatchId} 로부터 자동 생성`
                                : '신입 자동 프로비저닝'
                            }
                          >
                            자동 프로비저닝
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        {r.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={acting}
                            onClick={() =>
                              void runRowAction(
                                r.id,
                                () => assetRequestApi.submit(r.id),
                                '제출되었습니다',
                              )
                            }
                          >
                            <Send className="h-3 w-3 mr-1" />제출
                          </Button>
                        )}
                        {(r.status === 'DRAFT' || r.status === 'SUBMITTED') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground"
                            disabled={acting}
                            onClick={() =>
                              void runRowAction(
                                r.id,
                                () => assetRequestApi.cancel(r.id),
                                '신청이 취소됐습니다',
                              )
                            }
                          >
                            <X className="h-3 w-3 mr-1" />취소
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>자산 신청 작성</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>자산 유형</Label>
              <div className="flex gap-4 text-sm">
                {(['HARDWARE', 'SOFTWARE'] as AssetRequestType[]).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={form.type === t}
                      onChange={() => handleTypeChange(t)}
                    />
                    {TYPE_LABEL[t]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>신청 방식</Label>
              <div className="flex gap-4 text-sm">
                {(['MASTER', 'CUSTOM'] as SourceKind[]).map((s) => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value={s}
                      checked={form.source === s}
                      onChange={() => setForm((p) => ({ ...p, source: s }))}
                    />
                    {s === 'MASTER' ? '마스터 선택' : '자유입력'}
                  </label>
                ))}
              </div>
            </div>

            {form.source === 'MASTER' ? (
              form.type === 'HARDWARE' ? (
                <div className="space-y-1.5">
                  <Label>장비 선택</Label>
                  <select
                    className="w-full border rounded px-3 py-1.5 text-sm bg-transparent"
                    value={form.equipmentItemId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, equipmentItemId: e.target.value }))
                    }
                  >
                    <option value="">-- 장비를 선택해주세요 --</option>
                    {equipmentItems.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>소프트웨어 라이선스 선택</Label>
                  <select
                    className="w-full border rounded px-3 py-1.5 text-sm bg-transparent"
                    value={form.softwareLicenseId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, softwareLicenseId: e.target.value }))
                    }
                  >
                    <option value="">-- 라이선스를 선택해주세요 --</option>
                    {softwareLicenses.map((lic) => (
                      <option key={lic.id} value={lic.id}>
                        {lic.name} · {lic.vendor}
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>항목명 *</Label>
                  <Input
                    value={form.customName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, customName: e.target.value }))
                    }
                    placeholder="예: Figma 팀 라이선스"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>상세 설명</Label>
                  <Textarea
                    value={form.customDescription}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, customDescription: e.target.value }))
                    }
                    rows={2}
                    placeholder="공급사, 모델, 사양 등"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>지출 카테고리 *</Label>
              <select
                className="w-full border rounded px-3 py-1.5 text-sm bg-transparent"
                value={form.expenseCategoryId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, expenseCategoryId: e.target.value }))
                }
              >
                <option value="">-- 카테고리를 선택해주세요 --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>예상 금액 (원) *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={
                  form.expectedAmount
                    ? Number(form.expectedAmount).toLocaleString('ko-KR')
                    : ''
                }
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    expectedAmount: e.target.value.replace(/[^0-9]/g, ''),
                  }))
                }
                placeholder="1,000,000"
              />
            </div>

            <div className="space-y-1.5">
              <Label>사용 희망일</Label>
              <Input
                type="date"
                value={form.neededBy}
                onChange={(e) => setForm((p) => ({ ...p, neededBy: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>신청 사유 *</Label>
              <Textarea
                value={form.justification}
                onChange={(e) =>
                  setForm((p) => ({ ...p, justification: e.target.value }))
                }
                rows={3}
                placeholder="업무상 왜 필요한지 구체적으로 작성해주세요"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? '저장 중...' : '임시저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null)
            setDetail(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>자산 신청 #{detailId ?? ''}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 py-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_STYLE[detail.status]}>
                  {STATUS_LABEL[detail.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABEL[detail.type]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">항목</span>
                <span className="col-span-2">{titleOf(detail)}</span>

                <span className="text-muted-foreground">카테고리</span>
                <span className="col-span-2">{detail.expenseCategory.label}</span>

                <span className="text-muted-foreground">예상 금액</span>
                <span className="col-span-2 tabular-nums font-medium">
                  {fmtWon(detail.expectedAmount)}
                </span>

                <span className="text-muted-foreground">부서</span>
                <span className="col-span-2">
                  {detail.department.parent ? `${detail.department.parent.name} > ` : ''}
                  {detail.department.name}
                </span>

                <span className="text-muted-foreground">사용 희망일</span>
                <span className="col-span-2">
                  {detail.neededBy
                    ? new Date(detail.neededBy).toLocaleDateString('ko-KR')
                    : '—'}
                </span>

                {detail.customDescription && (
                  <>
                    <span className="text-muted-foreground">상세</span>
                    <span className="col-span-2 whitespace-pre-wrap">
                      {detail.customDescription}
                    </span>
                  </>
                )}

                <span className="text-muted-foreground">사유</span>
                <span className="col-span-2 whitespace-pre-wrap">{detail.justification}</span>
              </div>

              {detail.approvals.length > 0 && (
                <div className="border-t pt-2">
                  <p className="font-medium mb-1.5">결재 이력</p>
                  <ul className="space-y-1">
                    {detail.approvals.map((a) => (
                      <li key={a.id} className="text-xs">
                        <span className="text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString('ko-KR')} ·{' '}
                          {a.stage === 'LEADER' ? '팀장' : '부서장'} ·{' '}
                          {a.reviewer.nickname}
                        </span>
                        <span
                          className={
                            a.action === 'APPROVED'
                              ? 'ml-1 text-emerald-700'
                              : 'ml-1 text-red-700'
                          }
                        >
                          {a.action === 'APPROVED' ? '승인' : '반려'}
                        </span>
                        {a.reason && (
                          <span className="ml-1 text-muted-foreground">
                            · {a.reason}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
