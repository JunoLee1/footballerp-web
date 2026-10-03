import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, ChevronLeft, Trash2 } from 'lucide-react'
import type { Position } from '@/types/player'

const POSITION_LABEL: Record<Position, string> = {
  GOALKEEPER: '골키퍼',
  STRIKER: '스트라이커',
  SHADOW_STRIKER: '세컨 스트라이커',
  WINGER: '윙어',
  CENTRAL_ATTACK_MIDFIELDER: '중앙 공격형 미드필더',
  RIGHT_ATTACK_MIDFIELDER: '우측 공격형 미드필더',
  LEFT_ATTACK_MIDFIELDER: '좌측 공격형 미드필더',
  CENTRAL_DEFENSIVE_MIDFIELDER: '중앙 수비형 미드필더',
  LEFT_DEFENSIVE_MIDFIELDER: '좌측 수비형 미드필더',
  RIGHT_DEFENSIVE_MIDFIELDER: '우측 수비형 미드필더',
  CENTER_BACK: '센터백',
  LEFT_WING_BACK: '좌측 윙백',
  LEFT_FULL_BACK: '좌측 풀백',
  RIGHT_WING_BACK: '우측 윙백',
  RIGHT_FULL_BACK: '우측 풀백',
}

type SurveyStatus = 'OPEN' | 'CLOSED'
type Priority = 'HIGH' | 'MEDIUM' | 'LOW'

interface Survey {
  id: number
  title: string
  status: SurveyStatus
  dueDate: string | null
  notes: string | null
  createdAt: string
  closedAt: string | null
  createdBy: { id: number; nickname: string }
}

interface ResponseItem {
  id: number
  position: string
  priority: Priority
  budgetMin: number | null
  budgetMax: number | null
  notes: string | null
}

interface SurveyResponse {
  id: number
  respondentId: string
  submittedAt: string | null
  respondent: { id: number; nickname: string; role: string }
  items: ResponseItem[]
}

const acquisitionSurveyApi = {
  list: () => api.get<Survey[]>('/acquisition-surveys'),
  get: (id: number) => api.get<Survey>(`/acquisition-surveys/${id}`),
  create: (data: { title: string; dueDate?: string; notes?: string }) =>
    api.post<Survey>('/acquisition-surveys', data),
  close: (id: number) => api.patch<Survey>(`/acquisition-surveys/${id}/close`, {}),
  getResponses: (id: number) => api.get<SurveyResponse[]>(`/acquisition-surveys/${id}/responses`),
  submitResponse: (
    id: number,
    items: Array<{
      position: string
      priority: Priority
      budgetMin?: number
      budgetMax?: number
      notes?: string
    }>,
  ) =>
    api.post(`/acquisition-surveys/${id}/responses`, { items }),
}

const STATUS_STYLE: Record<SurveyStatus, string> = {
  OPEN: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
}

const PRIORITY_STYLE: Record<Priority, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
}

const POSITIONS: Position[] = [
  'GOALKEEPER', 'STRIKER', 'SHADOW_STRIKER', 'WINGER',
  'CENTRAL_ATTACK_MIDFIELDER', 'RIGHT_ATTACK_MIDFIELDER', 'LEFT_ATTACK_MIDFIELDER',
  'CENTRAL_DEFENSIVE_MIDFIELDER', 'LEFT_DEFENSIVE_MIDFIELDER', 'RIGHT_DEFENSIVE_MIDFIELDER',
  'CENTER_BACK', 'LEFT_WING_BACK', 'LEFT_FULL_BACK', 'RIGHT_WING_BACK', 'RIGHT_FULL_BACK',
]

function fmt(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── 응답 제출 다이얼로그 ────────────────────────────────────────────────────

interface DraftItem {
  position: Position | ''
  priority: Priority | ''
  budgetMin: string
  budgetMax: string
  notes: string
}

const emptyItem = (): DraftItem => ({ position: '', priority: '', budgetMin: '', budgetMax: '', notes: '' })

function SubmitResponseDialog({
  surveyId,
  open,
  onOpenChange,
  onSubmitted,
}: {
  surveyId: number
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmitted: () => void
}) {
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [submitting, setSubmitting] = useState(false)

  const updateItem = (i: number, patch: Partial<DraftItem>) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  const removeItem = (i: number) =>
    setItems(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    const valid = items.every(it => it.position && it.priority)
    if (!valid) { toast.error('포지션과 우선순위는 필수입니다.'); return }

    setSubmitting(true)
    try {
      await acquisitionSurveyApi.submitResponse(surveyId, items.map(it => ({
        position: it.position as Position,
        priority: it.priority as Priority,
        ...(it.budgetMin && { budgetMin: Number(it.budgetMin) }),
        ...(it.budgetMax && { budgetMax: Number(it.budgetMax) }),
        ...(it.notes && { notes: it.notes }),
      })))
      toast.success('응답이 제출됐습니다.')
      onOpenChange(false)
      onSubmitted()
    } catch (e: any) {
      const code = e?.response?.data?.code ?? e?.code
      if (code === 'ALREADY_SUBMITTED') toast.error('이미 응답을 제출했습니다.')
      else if (code === 'SURVEY_CLOSED') toast.error('마감된 수요조사입니다.')
      else toast.error('제출 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>영입 수요 응답 제출</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {items.map((item, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">항목 {i + 1}</span>
                {items.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 포지션 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">포지션 *</label>
                  <Select value={item.position} onValueChange={v => updateItem(i, { position: v as Position })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="선택">
                        {item.position ? POSITION_LABEL[item.position as Position] : '선택'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map(p => (
                        <SelectItem key={p} value={p}>{POSITION_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 우선순위 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">우선순위 *</label>
                  <Select value={item.priority} onValueChange={v => updateItem(i, { priority: v as Priority })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="선택">
                        {item.priority ? PRIORITY_LABEL[item.priority as Priority] : '선택'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(['HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 예산 최소 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">예산 최소 (원)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-9"
                    placeholder="예: 100,000,000"
                    value={item.budgetMin ? Number(item.budgetMin).toLocaleString() : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      if (raw === '' || /^\d+$/.test(raw)) updateItem(i, { budgetMin: raw })
                    }}
                  />
                </div>

                {/* 예산 최대 */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">예산 최대 (원)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-9"
                    placeholder="예: 200,000,000"
                    value={item.budgetMax ? Number(item.budgetMax).toLocaleString() : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      if (raw === '' || /^\d+$/.test(raw)) updateItem(i, { budgetMax: raw })
                    }}
                  />
                </div>
              </div>

              {/* 메모 */}
              <div className="space-y-1">
                <label className="text-xs font-medium">메모</label>
                <Textarea
                  className="h-16 resize-none text-sm"
                  placeholder="전술적 요구사항, 프로파일 조건 등"
                  value={item.notes}
                  onChange={e => updateItem(i, { notes: e.target.value })}
                />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setItems(prev => [...prev, emptyItem()])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />포지션 추가
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '제출 중...' : '제출'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function SurveyDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { user } = useCurrentUser()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [responseDialogOpen, setResponseDialogOpen] = useState(false)

  const canManage = user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && (user as any).frontOfficeRole === 'TD')

  const canRespond = !canManage && user?.role === 'COACHING_STAFF'

  const hasResponded = responses.some(r => r.respondentId === user?.id)

  const load = async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        acquisitionSurveyApi.get(id),
        acquisitionSurveyApi.getResponses(id),
      ])
      setSurvey(s)
      setResponses(r)
    } catch {
      toast.error('불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  const handleClose = async () => {
    if (!confirm('수요조사를 마감하시겠습니까?')) return
    setClosing(true)
    try {
      await acquisitionSurveyApi.close(id)
      toast.success('수요조사가 마감됐습니다.')
      void load()
    } catch {
      toast.error('마감 실패')
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />
  if (!survey) return <p className="text-sm text-muted-foreground">수요조사를 찾을 수 없습니다.</p>

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{survey.title}</h2>
          <p className="text-sm text-muted-foreground">
            생성: {fmt(survey.createdAt)} · 마감일: {fmt(survey.dueDate)} · 작성자: {survey.createdBy.nickname}
          </p>
        </div>
        <Badge className={STATUS_STYLE[survey.status]}>{survey.status === 'OPEN' ? '진행중' : '마감'}</Badge>
        {canManage && survey.status === 'OPEN' && (
          <Button variant="destructive" size="sm" onClick={handleClose} disabled={closing}>마감</Button>
        )}
        {canRespond && survey.status === 'OPEN' && !hasResponded && (
          <Button size="sm" onClick={() => setResponseDialogOpen(true)}>응답 제출</Button>
        )}
        {hasResponded && (
          <Badge variant="outline" className="text-green-700 border-green-300">응답 완료</Badge>
        )}
      </div>

      {survey.notes && <p className="text-sm text-muted-foreground border-l-2 pl-3">{survey.notes}</p>}

      {/* 응답 현황 */}
      <div>
        <h3 className="text-base font-medium mb-3">응답 현황 ({responses.length}건)</h3>
        {responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 응답이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {responses.map(r => (
              <div key={r.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{r.respondent.nickname}</span>
                  <span className="text-muted-foreground">({r.respondent.role})</span>
                  <span className="text-muted-foreground ml-auto">제출: {fmt(r.submittedAt)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>포지션</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>예산 범위</TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{POSITION_LABEL[item.position as Position] ?? item.position}</TableCell>
                        <TableCell>
                          <Badge className={PRIORITY_STYLE[item.priority as Priority]}>
                            {PRIORITY_LABEL[item.priority as Priority]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.budgetMin != null || item.budgetMax != null
                            ? `${item.budgetMin?.toLocaleString() ?? '?'} ~ ${item.budgetMax?.toLocaleString() ?? '?'}원`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.notes ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>

      <SubmitResponseDialog
        surveyId={id}
        open={responseDialogOpen}
        onOpenChange={setResponseDialogOpen}
        onSubmitted={load}
      />
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

export function AcquisitionSurveysPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')

  const canManage = user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && (user as any).frontOfficeRole === 'TD')

  const load = async () => {
    setLoading(true)
    try { setSurveys(await acquisitionSurveyApi.list()) }
    catch { toast.error('불러오기 실패') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const s = await acquisitionSurveyApi.create({ title: title.trim() })
      toast.success('수요조사가 생성됐습니다.')
      setTitle('')
      navigate(`/acquisition-surveys/${s.id}`)
    } catch {
      toast.error('생성 실패')
    } finally {
      setCreating(false)
    }
  }

  if (id) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <SurveyDetail id={Number(id)} onBack={() => navigate('/acquisition-surveys')} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">선수 영입 수요조사</h1>
        {canManage && (
          <div className="flex gap-2 items-center">
            <input
              className="border rounded px-3 py-1.5 text-sm w-64"
              placeholder="수요조사 제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleCreate()}
            />
            <Button size="sm" onClick={handleCreate} disabled={creating || !title.trim()}>
              <Plus className="h-4 w-4 mr-1" />생성
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : surveys.length === 0 ? (
        <p className="text-sm text-muted-foreground">수요조사가 없습니다.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마감일</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead>작성자</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.map(s => (
              <TableRow
                key={s.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/acquisition-surveys/${s.id}`)}
              >
                <TableCell className="font-medium">{s.title}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLE[s.status]}>{s.status === 'OPEN' ? '진행중' : '마감'}</Badge>
                </TableCell>
                <TableCell>{fmt(s.dueDate)}</TableCell>
                <TableCell>{fmt(s.createdAt)}</TableCell>
                <TableCell>{s.createdBy.nickname}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
