import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { playerApi } from '@/services/player.service'
import type { JerseyNumber, TeamJerseyEntry } from '@/types/player'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT: Record<string, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  AVAILABLE: 'secondary',
  OCCUPIED: 'default',
  RETIRED: 'destructive',
  RESERVED: 'outline',
}

const CELL_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100 cursor-pointer',
  OCCUPIED:  'bg-blue-50 border-blue-200 text-blue-800 cursor-default opacity-70',
  RETIRED:   'bg-red-50 border-red-200 text-red-800 cursor-default opacity-60',
  RESERVED:  'bg-yellow-50 border-yellow-200 text-yellow-800 cursor-default opacity-70',
}

interface Props {
  playerId: string
  teamId: number | null
  canAssign: boolean
  canRetire: boolean
  canReactivate: boolean
}

export function JerseyTab({ playerId, teamId, canAssign, canRetire: _canRetire, canReactivate: _canReactivate }: Props) {
  const { t } = useTranslation('player')
  const [jerseys, setJerseys] = useState<JerseyNumber[]>([])
  const [teamJerseys, setTeamJerseys] = useState<TeamJerseyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [assignNumber, setAssignNumber] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      playerApi.getJerseyNumbers(playerId),
      teamId ? playerApi.getTeamJerseys(teamId) : Promise.resolve<TeamJerseyEntry[]>([]),
    ])
      .then(([myJerseys, team]) => {
        setJerseys(myJerseys)
        setTeamJerseys(team)
      })
      .catch(() => toast.error(t('jerseyTab.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [playerId, teamId])

  const handleAssign = async (num: number) => {
    if (!teamId || !num || num < 1 || num > 99) {
      toast.error(t('jerseyTab.invalidNumber'))
      return
    }
    setSaving(true)
    try {
      await playerApi.assignJersey(playerId, { number: num, teamId })
      toast.success(t('jerseyTab.assigned', { number: num }))
      setAssignNumber('')
      load()
    } catch (err: unknown) {
      const code = (err as any)?.response?.data?.code
      if (code === 'JERSEY_NUMBER_OCCUPIED') toast.error(t('jerseyTab.occupied'))
      else if (code === 'JERSEY_NUMBER_RETIRED') toast.error(t('jerseyTab.retired'))
      else toast.error(t('jerseyTab.assignFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleRelease = async (jersey: JerseyNumber) => {
    if (!teamId) return
    setSaving(true)
    try {
      await playerApi.releaseJersey(playerId, { teamId, number: jersey.number })
      toast.success(t('jerseyTab.released', { number: jersey.number }))
      load()
    } catch {
      toast.error(t('jerseyTab.releaseFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('jerseyTab.loading')}</div>

  const teamMap = new Map<number, TeamJerseyEntry>()
  teamJerseys.forEach((j) => teamMap.set(j.number, j))

  return (
    <div className="space-y-6 max-w-2xl">

      {/* current jerseys */}
      <div>
        {jerseys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('jerseyTab.noJersey')}</p>
        ) : (
          <div className="space-y-2">
            {jerseys.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-md border px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold font-mono">{j.number}</span>
                  <Badge variant={STATUS_VARIANT[j.status] ?? 'secondary'} className="text-xs">
                    {t(`jerseyStatus.${j.status}`, j.status)}
                  </Badge>
                </div>
                {canAssign && j.status === 'OCCUPIED' && (
                  <Button variant="outline" size="sm" onClick={() => void handleRelease(j)} disabled={saving}>
                    {t('jerseyTab.release')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* team jersey grid */}
      {teamId && (
        <div>
          <h3 className="text-sm font-semibold mb-1">{t('jerseyTab.teamTitle')}</h3>
          <div className="flex flex-wrap gap-3 mb-2 text-xs text-muted-foreground">
            {(['AVAILABLE', 'OCCUPIED', 'RETIRED', 'RESERVED'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded border ${CELL_CLASS[s].split(' ').slice(0, 2).join(' ')}`} />
                {t(`jerseyStatus.${s}`)}
              </span>
            ))}
            {canAssign && <span className="ml-1">{t('jerseyTab.clickToAssign')}</span>}
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 99 }, (_, i) => i + 1).map((num) => {
              const entry = teamMap.get(num)
              const status = entry?.status ?? 'AVAILABLE'
              const isClickable = canAssign && status === 'AVAILABLE'
              const label = entry?.player?.playerName ?? (status === 'RESERVED' ? t('jerseyTab.reserved') : undefined)
              return (
                <button
                  key={num}
                  type="button"
                  title={label}
                  disabled={!isClickable || saving}
                  onClick={() => isClickable && void handleAssign(num)}
                  className={[
                    'w-8 h-8 text-xs font-mono rounded border text-center leading-none transition-colors',
                    CELL_CLASS[status] ?? CELL_CLASS['AVAILABLE'],
                  ].join(' ')}
                >
                  {num}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* manual number input */}
      {canAssign && teamId && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{t('jerseyTab.manualTitle')}</h3>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={99}
              placeholder="1–99"
              value={assignNumber}
              onChange={(e) => setAssignNumber(e.target.value)}
              className="w-24"
            />
            <Button
              onClick={() => void handleAssign(Number(assignNumber))}
              disabled={saving || !assignNumber}
            >
              {t('jerseyTab.assign')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
