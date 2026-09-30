import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { incidentReportApi } from '@/services/incidentReport.service'
import { playerApi } from '@/services/player.service'
import type { IncidentReport } from '@/types/incident-report'
import { IncidentReportFormDialog } from './IncidentReportFormDialog'

const PAGE_SIZE = 10

const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'default'> = {
  DRAFT: 'outline', SUBMITTED: 'secondary', SIGNED: 'default',
}

export default function IncidentReportPage() {
  const { t } = useTranslation('youth')
  const [reports, setReports] = useState<IncidentReport[]>([])
  const [players, setPlayers] = useState<{ id: string; playerName: string; teamId: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paginated = useMemo(
    () => reports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [reports, safePage],
  )

  const load = async () => {
    setLoading(true)
    try { setReports(await incidentReportApi.getAll()) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    playerApi.list({ level: 'YOUTH' })
      .then(r => setPlayers(
        r.filter(p => p.teamId != null)
         .map(p => ({ id: p.id, playerName: p.playerName, teamId: p.teamId! }))
      ))
      .catch(() => {})
  }, [])

  const handleSign = async (id: string, role: 'SUPERVISOR' | 'MEDICAL') => {
    await incidentReportApi.sign(id, role)
    load()
  }

  const handleSubmitReport = async (id: string) => {
    await incidentReportApi.submit(id)
    load()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('incidentPage.title')}</h1>
        <Button onClick={() => setDialogOpen(true)}>{t('incidentPage.addButton')}</Button>
      </div>

      {loading ? <p className="text-muted-foreground">{t('incidentPage.loading')}</p> : (
        <div className="space-y-3">
          {paginated.map(r => (
            <div key={r.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{r.player.playerName}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    ({r.type === 'MATCH' ? t('incidentPage.typeMatch') : t('incidentPage.typeTraining')})
                  </span>
                </div>
                <Badge variant={STATUS_VARIANT[r.status]}>{t(`incidentPage.status.${r.status}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>{t('incidentPage.supervisorSigned')}: {r.supervisorSigned ? '✅' : '❌'}</span>
                <span>{t('incidentPage.medicalSigned')}: {r.medicalSigned ? '✅' : '❌'}</span>
              </div>
              {r.status === 'DRAFT' && (
                <Button size="sm" variant="outline" onClick={() => handleSubmitReport(r.id)}>{t('incidentPage.submitButton')}</Button>
              )}
              {r.status === 'SUBMITTED' && (
                <div className="flex gap-2">
                  {!r.supervisorSigned && (
                    <Button size="sm" variant="outline" onClick={() => handleSign(r.id, 'SUPERVISOR')}>{t('incidentPage.signSupervisor')}</Button>
                  )}
                  {!r.medicalSigned && (
                    <Button size="sm" variant="outline" onClick={() => handleSign(r.id, 'MEDICAL')}>{t('incidentPage.signMedical')}</Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <p className="text-muted-foreground">{t('incidentPage.noData')}</p>}
        </div>
      )}

      {!loading && reports.length > PAGE_SIZE && (
        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, reports.length)} / {reports.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums px-1">{safePage} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <IncidentReportFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={load}
        players={players}
      />
    </div>
  )
}
