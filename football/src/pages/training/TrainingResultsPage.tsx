import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { trainingApi } from '@/services/training.service'
import { auditLogApi } from '@/services/admin.service'
import type { TrainingResultRow, SessionType, TrainingResultFilters } from '@/types/training'
import type { AuditLogEntry } from '@/types/auditLog'
import { SESSION_TYPE_LABEL } from '@/types/training'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Download, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { Pagination } from '@/components/ui/pagination'

const PAGE_SIZE = 10

const ATTENDANCE_STATUS_KEYS = ['PRESENT', 'ABSENT_AUTHORIZED', 'ABSENT_UNAUTHORIZED', 'LATE_AUTHORIZED', 'LATE_UNAUTHORIZED'] as const

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function TrainingResultsPage() {
  const { t } = useTranslation('training')
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'ADMIN'
  const [filters, setFilters] = useState<TrainingResultFilters>({ from: '', to: '', sessionType: '', nullOnly: false })
  const [rows, setRows] = useState<TrainingResultRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [correctTarget, setCorrectTarget] = useState<TrainingResultRow | null>(null)
  const [correctAttendance, setCorrectAttendance] = useState('')
  const [correctReason, setCorrectReason] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<{
    id: number
    playerName: string
    sessionDate: string
  } | null>(null)
  const [historyLogs, setHistoryLogs] = useState<AuditLogEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)

  const handleCorrect = async () => {
    if (!correctTarget || !correctAttendance || !correctReason.trim()) return
    setCorrecting(true)
    try {
      await trainingApi.correctAttendance(correctTarget.id, correctAttendance, correctReason)
      toast.success(t('resultsPage.correctSuccess'))
      setCorrectTarget(null)
      setCorrectAttendance('')
      setCorrectReason('')
      await fetchData()
    } catch {
      toast.error(t('resultsPage.correctFailed'))
    } finally {
      setCorrecting(false)
    }
  }

  const handleOpenHistory = async (row: TrainingResultRow) => {
    setHistoryTarget({ id: row.id, playerName: row.player.playerName, sessionDate: row.session.date })
    setHistoryLoading(true)
    setHistoryLogs([])
    setHistoryError(false)
    try {
      const res = await auditLogApi.list({ targetId: row.id, action: 'ATTENDANCE_CORRECTED', limit: 50 })
      setHistoryLogs(res.logs)
    } catch {
      setHistoryError(true)
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchData = async (overrides?: Partial<TrainingResultFilters>) => {
    setLoading(true)
    setPage(1)
    try {
      const data = await trainingApi.getResults({ ...filters, ...overrides })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const data = rows.map(r => ({
      [t('resultsPage.csvDate')]: formatDate(r.session.date),
      [t('resultsPage.csvSessionType')]: t(`sessionType.${r.session.sessionType}`) || r.session.sessionType,
      [t('resultsPage.csvPlayer')]: r.player.playerName,
      [t('resultsPage.csvPosition')]: r.player.position,
      [t('resultsPage.csvAttendance')]: t(`resultsPage.attendanceLabel.${r.attendance}`) || r.attendance,
      [t('resultsPage.csvScore')]: r.performanceScore ?? '',
      [t('resultsPage.csvFeedback')]: r.feedback ?? '',
    }))
    const csv = Papa.unparse(data)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('resultsPage.csvFilename')}_${filters.from ?? ''}_${filters.to ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('resultsPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('resultsPage.total', { count: rows.length })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="w-4 h-4 mr-1" /> {t('resultsPage.exportCsv')}
        </Button>
      </div>

      <div className="border-b px-6 py-3 flex flex-wrap gap-4 items-end shrink-0 bg-muted/30">
        <div className="space-y-1">
          <Label className="text-xs">{t('resultsPage.startDate')}</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            className="w-36 h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('resultsPage.endDate')}</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            className="w-36 h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('resultsPage.sessionType')}</Label>
          <Select
            value={filters.sessionType ?? ''}
            onValueChange={v => setFilters(f => ({ ...f, sessionType: v as SessionType | '' }))}
          >
            <SelectTrigger className="w-44 h-8 text-sm bg-background">
              <SelectValue placeholder={t('resultsPage.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('resultsPage.all')}</SelectItem>
              {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(st => (
                <SelectItem key={st} value={st}>{t(`sessionType.${st}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => void fetchData()} disabled={loading} className="h-8">
          {loading ? t('resultsPage.searching') : t('resultsPage.search')}
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant={filters.nullOnly ? 'default' : 'outline'}
            className="h-8 gap-1.5"
            onClick={() => {
              const next = !filters.nullOnly
              setFilters(f => ({ ...f, nullOnly: next }))
              void fetchData({ nullOnly: next })
            }}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {t('resultsPage.missingOnly')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('resultsPage.dateCol')}</TableHead>
              <TableHead className="w-32">{t('resultsPage.sessionTypeCol')}</TableHead>
              <TableHead>{t('resultsPage.playerCol')}</TableHead>
              <TableHead className="w-24">{t('resultsPage.positionCol')}</TableHead>
              <TableHead className="w-28">{t('resultsPage.attendanceCol')}</TableHead>
              <TableHead className="w-20 text-right">{t('resultsPage.scoreCol')}</TableHead>
              {isAdmin && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">{t('resultsPage.loading')}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">{t('resultsPage.noData')}</TableCell></TableRow>
            ) : paged.map(r => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">{formatDate(r.session.date)}</TableCell>
                <TableCell>{t(`sessionType.${r.session.sessionType}`) || r.session.sessionType}</TableCell>
                <TableCell>
                  <button
                    className="font-medium hover:underline hover:text-primary text-left"
                    onClick={() => navigate(`/training/players/${r.player.id}`)}
                  >
                    {r.player.playerName}
                  </button>
                </TableCell>
                <TableCell>{r.player.position}</TableCell>
                <TableCell>
                  {t(`resultsPage.attendanceLabel.${r.attendance}`) || r.attendance}
                  {r.hasCorrectionHistory && (
                    <button
                      onClick={() => handleOpenHistory(r)}
                      className="ml-1 text-xs text-muted-foreground underline hover:text-foreground cursor-pointer"
                    >
                      {t('resultsPage.corrected')}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.performanceScore ?? '—'}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => { setCorrectTarget(r); setCorrectAttendance(r.attendance) }}
                    >
                      {t('resultsPage.correct')}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Dialog open={historyTarget !== null} onOpenChange={open => { if (!open) setHistoryTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {historyTarget?.playerName} — {historyTarget ? format(new Date(historyTarget.sessionDate), 'yyyy-MM-dd') : ''} {t('resultsPage.correctionHistory')}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('resultsPage.loading')}</p>
          ) : historyError ? (
            <p className="text-sm text-destructive py-4 text-center">{t('resultsPage.historyLoadError')}</p>
          ) : historyLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('resultsPage.noHistory')}</p>
          ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto">
              {historyLogs.map(log => {
                let detail: { before: string | null; after: string; reason?: string } | null = null
                try { if (log.detail) detail = JSON.parse(log.detail) } catch { /* ignore */ }
                return (
                  <li key={log.id} className="border rounded p-3 text-sm space-y-0.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{log.actor.nickname ?? log.actor.username}</span>
                      <span>{format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm')}</span>
                    </div>
                    {detail && (
                      <p className="font-medium">
                        {detail.before ?? t('resultsPage.noEntry')} → {detail.after}
                      </p>
                    )}
                    {detail?.reason && (
                      <p className="text-muted-foreground">{t('resultsPage.reason')}: {detail.reason}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!correctTarget} onOpenChange={(v) => !v && setCorrectTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t('resultsPage.correctTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('resultsPage.correctPlayer')}</Label>
              <p className="text-sm font-medium">{correctTarget?.player.playerName}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('resultsPage.correctStatus')}</Label>
              <Select value={correctAttendance} onValueChange={setCorrectAttendance}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ATTENDANCE_STATUS_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`resultsPage.attendanceLabel.${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('resultsPage.correctReason')} *</Label>
              <Textarea
                placeholder={t('resultsPage.correctReasonPlaceholder')}
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectTarget(null)} disabled={correcting}>{t('resultsPage.cancel')}</Button>
            <Button
              onClick={handleCorrect}
              disabled={correcting || !correctAttendance || !correctReason.trim()}
            >
              {correcting ? t('resultsPage.correcting') : t('resultsPage.correct')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
