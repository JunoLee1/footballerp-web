import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAssetRequests } from '@/hooks/useAssetRequests'
import { assetRequestApi } from '@/services/asset-request.service'
import { equipmentApi } from '@/services/equipment.service'
import { softwareLicenseApi, type SoftwareLicense } from '@/services/software-license.service'
import type { EquipmentItem } from '@/types/equipment'
import {
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
  type AssetRequest,
  type AssetRequestFilter,
  type AssetRequestListItem,
  type AssetRequestType,
} from '@/types/asset-request'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CheckCircle2, XCircle } from 'lucide-react'

function fmtWon(n: number) {
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * Maps a backend error code to a Korean UI message. Duplicated with
 * AssetRequestPage — merge into `lib/` if we add a third caller.
 */
function messageForCode(code: string, fallback: string): string {
  switch (code) {
    case 'NOT_LEADER':
      return '팀장 결재 권한이 없습니다.'
    case 'NOT_DEPT_HEAD':
      return '부서장 결재 권한이 없습니다.'
    case 'INVALID_STATUS':
      return '이미 다른 결재가 진행된 요청입니다. 새로고침 후 다시 시도해주세요.'
    case 'SELF_APPROVAL_FORBIDDEN':
      return '본인이 신청한 건은 결재할 수 없습니다.'
    case 'REASON_REQUIRED':
      return '반려 사유를 입력해주세요.'
    case 'NO_ACTIVE_SEASON':
      return '활성 시즌이 없어 지출을 생성할 수 없습니다.'
    case 'BUDGET_LINE_NOT_FOUND':
      return '해당 시즌·부서·카테고리에 승인된 예산 라인이 없습니다. 재무팀에 문의해주세요.'
    case 'BUDGET_EXCEEDED':
      return '부서 예산을 초과합니다. 신청자에게 예비비 배정을 요청해주세요.'
    case 'NOT_FOUND':
      return '요청을 찾을 수 없습니다.'
    default:
      return fallback
  }
}

/** Which stage the current tab represents — drives approve vs leaderApprove. */
type Stage = 'LEADER' | 'DEPT_HEAD'

interface ApprovalListProps {
  filter: Extract<AssetRequestFilter, 'pending-leader' | 'pending-dept-head'>
  stage: Stage
  equipmentItems: EquipmentItem[]
  softwareLicenses: SoftwareLicense[]
}

function ApprovalList({ filter, stage, equipmentItems, softwareLicenses }: ApprovalListProps) {
  const { requests, loading, reload } = useAssetRequests(filter)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AssetRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [rowActingId, setRowActingId] = useState<number | null>(null)

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

  const openDetail = async (id: number) => {
    setDetailId(id)
    setDetail(null)
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

  const approveOne = async (id: number) => {
    setRowActingId(id)
    try {
      if (stage === 'LEADER') {
        await assetRequestApi.leaderApprove(id)
      } else {
        await assetRequestApi.approve(id)
      }
      toast.success('승인되었습니다')
      await reload()
      if (detailId === id) {
        setDetailId(null)
        setDetail(null)
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '승인에 실패했습니다'))
    } finally {
      setRowActingId(null)
    }
  }

  const openReject = (id: number) => {
    setRejectingId(id)
    setRejectReason('')
  }

  const submitReject = async () => {
    if (!rejectingId) return
    const reason = rejectReason.trim()
    if (!reason) {
      toast.error('반려 사유를 입력해주세요')
      return
    }
    setRowActingId(rejectingId)
    try {
      if (stage === 'LEADER') {
        await assetRequestApi.leaderReject(rejectingId, reason)
      } else {
        await assetRequestApi.reject(rejectingId, reason)
      }
      toast.success('반려되었습니다')
      setRejectingId(null)
      setRejectReason('')
      await reload()
      if (detailId === rejectingId) {
        setDetailId(null)
        setDetail(null)
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '반려에 실패했습니다'))
    } finally {
      setRowActingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        결재 대기 중인 요청이 없습니다.
      </div>
    )
  }

  const rows: AssetRequestListItem[] = [...requests].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>신청일</TableHead>
            <TableHead>신청자</TableHead>
            <TableHead>부서</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>항목</TableHead>
            <TableHead className="text-right">예상 금액</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="w-44 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const acting = rowActingId === r.id
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => void openDetail(r.id)}
              >
                <TableCell className="tabular-nums text-sm">
                  {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                </TableCell>
                <TableCell className="text-sm">{r.requester.nickname}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.department.name}
                </TableCell>
                <TableCell className="text-sm">{TYPE_LABEL[r.type]}</TableCell>
                <TableCell className="text-sm">{titleOf(r)}</TableCell>
                <TableCell className="tabular-nums font-medium text-sm text-right">
                  {fmtWon(r.expectedAmount)}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={acting}
                      onClick={() => void approveOne(r.id)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />승인
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={acting}
                      onClick={() => openReject(r.id)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />반려
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Reject reason dialog */}
      <Dialog
        open={rejectingId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectingId(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>자산 신청 반려</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              반려 사유를 입력해주세요. 신청자에게 알림으로 전달됩니다.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="예: 이미 유사 자산이 있으니 재사용 부탁드립니다"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingId(null)
                setRejectReason('')
              }}
              disabled={rowActingId !== null}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitReject()}
              disabled={rowActingId !== null}
            >
              반려
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
                <span className="text-muted-foreground">신청자</span>
                <span className="col-span-2">{detail.requester.nickname}</span>

                <span className="text-muted-foreground">부서</span>
                <span className="col-span-2">
                  {detail.department.parent ? `${detail.department.parent.name} > ` : ''}
                  {detail.department.name}
                </span>

                <span className="text-muted-foreground">항목</span>
                <span className="col-span-2">{titleOf(detail)}</span>

                <span className="text-muted-foreground">카테고리</span>
                <span className="col-span-2">{detail.expenseCategory.label}</span>

                <span className="text-muted-foreground">예상 금액</span>
                <span className="col-span-2 tabular-nums font-medium">
                  {fmtWon(detail.expectedAmount)}
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

              <div className="border-t pt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openReject(detail.id)}
                  disabled={rowActingId === detail.id}
                >
                  <XCircle className="h-3 w-3 mr-1" />반려
                </Button>
                <Button
                  size="sm"
                  onClick={() => void approveOne(detail.id)}
                  disabled={rowActingId === detail.id}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />승인
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AssetRequestApprovalPage() {
  // Master lookups are shared between the two tabs so we fetch once here.
  // Failures are non-fatal — the title falls back to an id-based label.
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([])
  const [softwareLicenses, setSoftwareLicenses] = useState<SoftwareLicense[]>([])

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
        // Non-fatal.
      }
    })()
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">자산 결재함</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          팀장·부서장으로서 결재해야 할 자산 신청 목록입니다. 백엔드가 권한을 검증해 본인이 담당하는 신청만 노출됩니다.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="leader">
          <TabsList className="mb-4">
            <TabsTrigger value="leader">팀장 결재함</TabsTrigger>
            <TabsTrigger value="dept-head">부서장 결재함</TabsTrigger>
          </TabsList>
          <TabsContent value="leader">
            <ApprovalList
              filter="pending-leader"
              stage="LEADER"
              equipmentItems={equipmentItems}
              softwareLicenses={softwareLicenses}
            />
          </TabsContent>
          <TabsContent value="dept-head">
            <ApprovalList
              filter="pending-dept-head"
              stage="DEPT_HEAD"
              equipmentItems={equipmentItems}
              softwareLicenses={softwareLicenses}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
