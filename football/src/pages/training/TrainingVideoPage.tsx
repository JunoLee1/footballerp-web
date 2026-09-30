import { useState, useEffect, Fragment } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { videoApi } from '@/services/video.service'
import type { TrainingVideo, CreateVideoPayload } from '@/types/video'
import type { SessionType } from '@/types/training'
import { SESSION_TYPE_LABEL } from '@/types/training'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Plus, ExternalLink, Trash2, Sparkles, RefreshCw } from 'lucide-react'

const PAGE_SIZE = 10

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

interface CreateVideoDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

function CreateVideoDialog({ open, onOpenChange, onSaved }: CreateVideoDialogProps) {
  const { t } = useTranslation('training')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [sessionType, setSessionType] = useState<SessionType | ''>('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !url.trim()) {
      toast.error(t('videoPage.createDialog.required'))
      return
    }
    setSaving(true)
    try {
      const payload: CreateVideoPayload = {
        title: title.trim(),
        url: url.trim(),
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        sessionType: sessionType || undefined,
      }
      await videoApi.create(payload)
      toast.success(t('videoPage.createDialog.saved'))
      onSaved()
      setTitle(''); setUrl(''); setTags(''); setSessionType('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('videoPage.createDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('videoPage.createDialog.title')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('videoPage.createDialog.titleLabel')} *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('videoPage.createDialog.titleLabel')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('videoPage.createDialog.urlLabel')} *</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>{t('videoPage.createDialog.tagsLabel')}</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('videoPage.createDialog.tagsPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('videoPage.createDialog.sessionTypeLabel')}</Label>
            <Select
              value={sessionType}
              onValueChange={v => setSessionType(v as SessionType | '')}
            >
              <SelectTrigger><SelectValue placeholder={t('videoPage.createDialog.noSessionType')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('videoPage.createDialog.noSessionType')}</SelectItem>
                {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(st => (
                  <SelectItem key={st} value={st}>{t(`sessionType.${st}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('videoPage.createDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('videoPage.createDialog.saving') : t('videoPage.createDialog.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TrainingVideoPage() {
  const { t } = useTranslation('training')
  const { user } = useCurrentUser()
  const [videos, setVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [filterTag, setFilterTag] = useState('')

  const canWrite = user?.role === 'ADMIN' || user?.role === 'COACHING_STAFF'
  const canDelete = (uploadedById: string) =>
    user?.role === 'ADMIN' || user?.id === uploadedById
  const [generatingSummaryId, setGeneratingSummaryId] = useState<number | null>(null)

  const fetchVideos = () => {
    setLoading(true)
    videoApi.list()
      .then(setVideos)
      .catch(() => toast.error(t('videoPage.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchVideos() }, [])

  const handleGenerateSummary = async (id: number) => {
    setGeneratingSummaryId(id)
    try {
      const result = await videoApi.generateAiSummary(id)
      setVideos(prev => prev.map(v => v.id === id ? { ...v, aiSummary: result.aiSummary } : v))
      toast.success(t('videoPage.summaryGenerated'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('videoPage.summaryFailed'))
    } finally {
      setGeneratingSummaryId(null)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await videoApi.delete(id)
      toast.success(t('videoPage.deleted'))
      setVideos(prev => prev.filter(v => v.id !== id))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('videoPage.deleteFailed'))
    }
  }

  const filtered = filterTag.trim()
    ? videos.filter(v => v.tags.some(tg => tg.includes(filterTag.trim())))
    : videos

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('videoPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('videoPage.total', { count: filtered.length })}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('videoPage.addVideo')}
          </Button>
        )}
      </div>

      <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0 bg-muted/30">
        <Input
          placeholder={t('videoPage.tagSearch')}
          value={filterTag}
          onChange={e => { setFilterTag(e.target.value); setPage(1) }}
          className="w-44 h-8 text-sm bg-background"
        />
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            {t('videoPage.noVideos')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('videoPage.titleCol')}</TableHead>
                <TableHead className="w-32">{t('videoPage.sessionTypeCol')}</TableHead>
                <TableHead>{t('videoPage.tagsCol')}</TableHead>
                <TableHead className="w-20 text-center">{t('videoPage.countCol')}</TableHead>
                <TableHead className="w-32">{t('videoPage.dateCol')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(v => (
                <Fragment key={v.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      <a href={v.url} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1 hover:underline">
                        {v.title}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    </TableCell>
                    <TableCell>
                      {v.sessionType ? (
                        <span className="text-xs border rounded px-1.5 py-0.5">
                          {t(`sessionType.${v.sessionType}`)}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.tags.map(tg => (
                          <Badge key={tg} variant="outline" className="text-xs">{tg}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {v._count?.assignments ?? 0}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(v.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {canWrite && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => handleGenerateSummary(v.id)}
                            disabled={generatingSummaryId === v.id}
                            title={v.aiSummary ? t('videoPage.regenerateSummary') : t('videoPage.generateSummary')}
                          >
                            {generatingSummaryId === v.id
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Sparkles className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {canDelete(v.uploadedById) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(v.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {v.aiSummary && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-1 pt-0 pb-2">
                        <p className="text-xs text-muted-foreground italic pl-1">{v.aiSummary}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <CreateVideoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => { setCreateOpen(false); fetchVideos() }}
      />
    </div>
  )
}
