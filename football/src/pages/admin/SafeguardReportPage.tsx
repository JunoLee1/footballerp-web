import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { safeguardApi } from '@/services/safeguard.service'
import type { SafeguardReport } from '@/types/safeguard'

const STATUS_VARIANT: Record<string, 'destructive' | 'secondary' | 'default'> = {
  RECEIVED: 'destructive',
  UNDER_REVIEW: 'secondary',
  RESOLVED: 'default',
}

export default function SafeguardReportPage() {
  const { t } = useTranslation('admin')
  const [reports, setReports] = useState<SafeguardReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setReports(await safeguardApi.getAll()) }
    catch { /* 권한 없으면 빈 목록 */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const handleReview = async (id: string) => {
    await safeguardApi.updateStatus(id, 'UNDER_REVIEW')
    void load()
  }

  const handleResolve = async (id: string) => {
    const note = prompt(t('safeguardPage.resolvePrompt'))
    if (note === null) return
    await safeguardApi.updateStatus(id, 'RESOLVED', note)
    void load()
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-red-600">🚨 {t('safeguardPage.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('safeguardPage.description')}</p>

      {loading ? (
        <p className="text-muted-foreground">{t('safeguardPage.loading')}</p>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="border rounded-lg p-4 space-y-2 border-l-4 border-l-red-400">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">#{r.id} · {new Date(r.createdAt).toLocaleString('ko-KR')}</span>
                <Badge variant={STATUS_VARIANT[r.status]}>{t(`safeguardPage.status.${r.status}`)}</Badge>
              </div>
              <p className="text-sm">{r.description}</p>
              {r.contactInfo && (
                <p className="text-xs text-muted-foreground">{t('safeguardPage.contactLabel')}: {r.contactInfo}</p>
              )}
              {r.accusedUser && (
                <p className="text-xs text-red-500 font-medium">{t('safeguardPage.accusedLabel')}: {r.accusedUser.username}</p>
              )}
              {r.resolvedNote && (
                <p className="text-xs text-muted-foreground border-t pt-2">{t('safeguardPage.resolvedNote')}: {r.resolvedNote}</p>
              )}
              <div className="flex gap-2">
                {r.status === 'RECEIVED' && (
                  <Button size="sm" variant="outline" onClick={() => void handleReview(r.id)}>{t('safeguardPage.startReview')}</Button>
                )}
                {r.status === 'UNDER_REVIEW' && (
                  <Button size="sm" variant="outline" onClick={() => void handleResolve(r.id)}>{t('safeguardPage.resolve')}</Button>
                )}
              </div>
            </div>
          ))}
          {reports.length === 0 && (
            <p className="text-muted-foreground">{t('safeguardPage.noReports')}</p>
          )}
        </div>
      )}
    </div>
  )
}
