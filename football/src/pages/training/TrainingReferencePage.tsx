import { useState, useCallback, useEffect } from 'react'
import { trainingReferenceApi } from '@/services/training-reference.service'
import type { TrainingReference, ReferenceSource } from '@/types/training-reference'
import { REFERENCE_SOURCE_LABEL } from '@/types/training-reference'
import type { SessionType } from '@/types/training'
import { SESSION_TYPE_LABEL } from '@/types/training'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useConfirm } from '@/lib/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Trash2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const SESSION_TYPES = Object.keys(SESSION_TYPE_LABEL) as SessionType[]

export function TrainingReferencePage() {
  const { user } = useCurrentUser()
  const confirm = useConfirm()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'COACHING_STAFF'

  const [refs, setRefs] = useState<TrainingReference[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionType, setSessionType] = useState<SessionType | ''>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)

  // Add dialog state
  const [form, setForm] = useState({
    title: '',
    url: '',
    sessionType: '' as SessionType | '',
    source: '' as ReferenceSource | '',
  })
  const [tagInput, setTagInput] = useState('')
  const [formTags, setFormTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async (st?: SessionType | '') => {
    setLoading(true)
    setSelectedTags([])
    try {
      const data = await trainingReferenceApi.list(st ? { sessionType: st } : undefined)
      setRefs(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData('') }, [fetchData])

  const allTags = [...new Set(refs.flatMap(r => r.tags))].sort()
  const displayedRefs = selectedTags.length > 0
    ? refs.filter(r => selectedTags.every(t => r.tags.includes(t)))
    : refs

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleDelete = async (ref: TrainingReference) => {
    const ok = await confirm({
      title: '레퍼런스 삭제',
      description: `"${ref.title}"을(를) 삭제할까요?`,
      confirmText: '삭제',
    })
    if (!ok) return
    try {
      await trainingReferenceApi.delete(ref.id)
      toast.success('삭제됐습니다.')
      setRefs(prev => prev.filter(r => r.id !== ref.id))
    } catch {
      toast.error('삭제에 실패했습니다.')
    }
  }

  const addTag = () => {
    const trimmed = tagInput.trim().replace(/,/g, '')
    if (!trimmed || formTags.includes(trimmed)) return
    setFormTags(prev => [...prev, trimmed])
    setTagInput('')
  }

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  const handleSubmit = async () => {
    if (!form.title || !form.url || !form.sessionType || !form.source) return
    setSubmitting(true)
    try {
      await trainingReferenceApi.create({
        title: form.title,
        url: form.url,
        sessionType: form.sessionType as SessionType,
        source: form.source as ReferenceSource,
        tags: formTags,
      })
      toast.success('레퍼런스가 추가됐습니다.')
      setAddOpen(false)
      setForm({ title: '', url: '', sessionType: '', source: '' })
      setFormTags([])
      setTagInput('')
      await fetchData(sessionType)
    } catch {
      toast.error('추가에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const canDelete = (ref: TrainingReference) =>
    user?.role === 'ADMIN' || String(ref.addedBy.id) === String(user?.id)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">전술 레퍼런스 라이브러리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">전체 {displayedRefs.length}건</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> 추가
          </Button>
        )}
      </div>

      <div className="border-b px-6 py-3 flex flex-col gap-3 shrink-0 bg-muted/30">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={sessionType === '' ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => { setSessionType(''); fetchData('') }}
          >
            전체
          </Button>
          {SESSION_TYPES.map(st => (
            <Button
              key={st}
              size="sm"
              variant={sessionType === st ? 'default' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => { setSessionType(st); fetchData(st) }}
            >
              {SESSION_TYPE_LABEL[st]}
            </Button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(tag => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2 mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-3 w-full mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : displayedRefs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            레퍼런스가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {displayedRefs.map(ref => (
              <Card key={ref.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm leading-snug hover:underline line-clamp-2 flex-1"
                    >
                      {ref.title}
                    </a>
                    {canDelete(ref) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(ref)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {SESSION_TYPE_LABEL[ref.sessionType]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {REFERENCE_SOURCE_LABEL[ref.source]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 flex-1 justify-between">
                  {ref.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ref.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs font-normal">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    추가: {ref.addedBy.nickname} · {formatDate(ref.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={v => !v && setAddOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>레퍼런스 추가</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">제목 *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="레퍼런스 제목"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL *</Label>
              <Input
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">세션 유형 *</Label>
              <Select value={form.sessionType} onValueChange={v => setForm(f => ({ ...f, sessionType: v as SessionType }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map(st => (
                    <SelectItem key={st} value={st}>{SESSION_TYPE_LABEL[st]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">출처 *</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v as ReferenceSource }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(REFERENCE_SOURCE_LABEL) as ReferenceSource[]).map(s => (
                    <SelectItem key={s} value={s}>{REFERENCE_SOURCE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">태그</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  placeholder="태그 입력 후 Enter"
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={addTag}>
                  추가
                </Button>
              </div>
              {formTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs gap-1">
                      #{tag}
                      <button onClick={() => setFormTags(prev => prev.filter(t => t !== tag))}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={submitting}>취소</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !form.title || !form.url || !form.sessionType || !form.source}
            >
              {submitting ? '추가 중...' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
