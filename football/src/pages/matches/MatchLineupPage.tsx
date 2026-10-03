import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FootballPitch } from '@/components/squad/FootballPitch'
import {
  FORMATION_LAYOUTS,
  SUPPORTED_FORMATIONS,
  type SupportedFormation,
} from '@/components/squad/formation-layouts'
import { POSITION_ABBR } from '@/types/player'
import type { Player } from '@/types/player'
import { playerApi } from '@/services/player.service'
import { lineupApi } from '@/services/lineup.service'
import { injuryApi } from '@/services/injury.service'
import { matchApi } from '@/services/match.service'
import { buildInitialPlacement } from '@/components/squad/squad-utils'
import type { LineupPlayer, LineupDragPayload } from '@/types/lineup'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLiteMode } from '@/hooks/useLiteMode'

const DRAG_KEY = 'text/lineup-player'

type SlotMap = Record<string, LineupPlayer>

function PitchSlot({
  slotDef,
  player,
  onDrop,
  onRemove,
  showMismatch,
}: {
  slotDef: { key: string; position: string; top: number; left: number }
  player: LineupPlayer | null
  onDrop: (slotKey: string, payload: LineupDragPayload) => void
  onRemove: (slotKey: string) => void
  showMismatch: boolean
}) {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${slotDef.top}%`,
    left: `${slotDef.left}%`,
    transform: 'translate(-50%, -50%)',
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_KEY)
    if (!raw) return
    onDrop(slotDef.key, JSON.parse(raw) as LineupDragPayload)
  }

  if (player) {
    const isMismatch = showMismatch && player.position !== slotDef.position
    return (
      <div
        style={style}
        draggable
        onDragStart={(e) => {
          const payload: LineupDragPayload = {
            playerId: player.id,
            playerName: player.playerName,
            position: player.position,
            src: 'POOL',
            srcSlotKey: slotDef.key,
          }
          e.dataTransfer.setData(DRAG_KEY, JSON.stringify(payload))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDoubleClick={() => onRemove(slotDef.key)}
        title={isMismatch ? `Position mismatch: player ${player.position} / slot ${slotDef.position}` : 'Double-click to remove'}
        className="relative flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing z-10"
      >
        {isMismatch && (
          <div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-900 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold z-20">
            ⚠
          </div>
        )}
        <div className="bg-green-800/90 border-2 border-green-400 rounded-full px-2 py-1 text-white text-[10px] font-bold whitespace-nowrap shadow-lg">
          {POSITION_ABBR[player.position as keyof typeof POSITION_ABBR] ?? player.position}
        </div>
        <div className="bg-green-900/80 border border-green-500/60 rounded px-1.5 py-0.5 text-white text-[9px] whitespace-nowrap max-w-[64px] truncate shadow">
          {player.playerName}
        </div>
      </div>
    )
  }

  return (
    <div
      style={style}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex flex-col items-center gap-0.5 z-10 group"
    >
      <div className="bg-white/10 border-2 border-dashed border-white/40 rounded-full w-10 h-10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
        <span className="text-white/50 text-[9px] font-bold">
          {POSITION_ABBR[slotDef.position as keyof typeof POSITION_ABBR] ?? slotDef.position}
        </span>
      </div>
      <div className="text-white/40 text-[9px]">{slotDef.key}</div>
    </div>
  )
}

export function MatchLineupPage() {
  const { t } = useTranslation('match')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const isLite = useLiteMode()
  const matchId = Number(id)

  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [injuredPlayerIds, setInjuredPlayerIds] = useState<Set<string>>(new Set())
  const [formation, setFormation] = useState<SupportedFormation>('4-3-3')
  const [slots, setSlots] = useState<SlotMap>({})
  const [bench, setBench] = useState<LineupPlayer[]>([])
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [teamType, setTeamType] = useState<'FIRST_TEAM' | 'YOUTH' | null>(null)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const showMismatch = teamType === 'FIRST_TEAM'

  const canEdit =
    user?.role === 'ADMIN' ||
    user?.role === 'COACHING_STAFF' ||
    user?.coachingRole === 'HEAD_COACH'
  const canConfirm = user?.role === 'ADMIN' || user?.coachingRole === 'HEAD_COACH'

  useEffect(() => {
    Promise.all([
      playerApi.list({ status: 'ACTIVE', excludeYouth: true }),
      lineupApi.get(matchId),
      injuryApi.active().catch(() => [] as { playerId: string }[]),
      matchApi.getSquad(matchId).catch(() => [] as { playerId: string; player: { id: string; playerName: string; position: string } }[]),
    ])
      .then(([players, lineup, injuries, squad]) => {
        setAllPlayers(players)
        setInjuredPlayerIds(new Set(injuries.map((inj) => inj.playerId)))
        if (lineup) {
          setFormation(lineup.formation)
          setIsConfirmed(lineup.isConfirmed)
          setTeamType(lineup.teamType ?? null)
          const slotMap: SlotMap = {}
          const benchList: LineupPlayer[] = []
          for (const s of lineup.slots) {
            if (s.isStarter) {
              slotMap[s.slotKey] = s.player
            } else {
              benchList.push(s.player)
            }
          }
          setSlots(slotMap)
          setBench(benchList)
        } else if (squad.length > 0) {
          // 저장된 라인업 없음 + 스쿼드 있음 → 포지션 기반 자동 배치
          const squadIds = new Set(squad.map((s) => s.playerId))
          const squadPlayers = players.filter((p) => squadIds.has(p.id))
          const defaultFormation: SupportedFormation = '4-3-3'
          const pitchSlotDefs = FORMATION_LAYOUTS[defaultFormation]
          const placement = buildInitialPlacement(pitchSlotDefs, squadPlayers)
          const slotMap: SlotMap = {}
          const placedIds = new Set<string>()
          for (const [slotKey, playerId] of Object.entries(placement)) {
            if (playerId) {
              const player = squadPlayers.find((p) => p.id === playerId)
              if (player) {
                slotMap[slotKey] = { id: player.id, playerName: player.playerName, position: player.position }
                placedIds.add(playerId)
              }
            }
          }
          const benchList: LineupPlayer[] = squadPlayers
            .filter((p) => !placedIds.has(p.id))
            .map((p) => ({ id: p.id, playerName: p.playerName, position: p.position }))
          setFormation(defaultFormation)
          setSlots(slotMap)
          setBench(benchList)
          setDirty(true)
        }
      })
      .catch(() => toast.error(t('lineupPage.loadFailed')))
      .finally(() => setLoading(false))
  }, [matchId])

  const placedIds = useMemo(() => {
    const ids = new Set(Object.values(slots).map((p) => p.id))
    bench.forEach((p) => ids.add(p.id))
    return ids
  }, [slots, bench])

  const pool = useMemo(
    () => allPlayers.filter((p) => p.status === 'ACTIVE' && !placedIds.has(p.id)),
    [allPlayers, placedIds],
  )

  const starterCount = Object.keys(slots).length

  const handleSlotDrop = (targetSlotKey: string, payload: LineupDragPayload) => {
    setSlots((prev) => {
      const next = { ...prev }
      const existing = next[targetSlotKey]
      if (payload.srcSlotKey && payload.srcSlotKey !== targetSlotKey) {
        if (existing) {
          next[payload.srcSlotKey] = existing
        } else {
          delete next[payload.srcSlotKey]
        }
      }
      next[targetSlotKey] = {
        id: payload.playerId,
        playerName: payload.playerName,
        position: payload.position,
      }
      return next
    })
    if (payload.src === 'BENCH' && payload.srcKey !== undefined) {
      setBench((prev) => prev.filter((_, i) => String(i) !== payload.srcKey))
    }
    setDirty(true)
  }

  const handleSlotRemove = (slotKey: string) => {
    setSlots((prev) => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
    setDirty(true)
  }

  const handleBenchDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_KEY)
    if (!raw) return
    const payload = JSON.parse(raw) as LineupDragPayload
    const player: LineupPlayer = {
      id: payload.playerId,
      playerName: payload.playerName,
      position: payload.position,
    }
    if (payload.srcSlotKey) {
      setSlots((prev) => {
        const next = { ...prev }
        delete next[payload.srcSlotKey!]
        return next
      })
    }
    setBench((prev) =>
      prev.some((p) => p.id === player.id) ? prev : [...prev, player],
    )
    setDirty(true)
  }

  const handleFormationChange = (f: SupportedFormation) => {
    setFormation(f)
    setSlots({})
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const slotPayloads = [
        ...Object.entries(slots).map(([slotKey, p]) => ({
          playerId: p.id,
          slotKey,
          isStarter: true,
        })),
        ...bench.map((p, i) => ({
          playerId: p.id,
          slotKey: `BENCH_${i}`,
          isStarter: false,
        })),
      ]
      const result = await lineupApi.save(matchId, { formation, slots: slotPayloads })
      setIsConfirmed(result?.isConfirmed ?? false)
      setDirty(false)
      toast.success(t('lineupPage.savedSuccess'))
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'INJURED_PLAYER_IN_LINEUP') {
        toast.error(t('lineupPage.injuredInLineup'))
      } else {
        toast.error(t('lineupPage.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await lineupApi.confirm(matchId)
      setIsConfirmed(true)
      toast.success(t('lineupPage.confirmSuccess'))
    } catch {
      toast.error(t('lineupPage.confirmFailed'))
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const pitchSlots = FORMATION_LAYOUTS[formation]

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/matches/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{t('lineupPage.title')}</span>
        <div className="flex-1" />
        <Select
          value={formation}
          onValueChange={(v) => handleFormationChange(v as SupportedFormation)}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <span>{formation}</span>
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_FORMATIONS.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLite && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs text-yellow-800">
            {t('lineupPage.liteMode')}
          </div>
        )}
        {canEdit && (
          <Button size="sm" variant="outline" disabled={!dirty || saving || isLite} onClick={handleSave}>
            {saving ? t('lineupPage.saving') : t('lineupPage.save')}
          </Button>
        )}
        {canConfirm && !isConfirmed && (
          <Button size="sm" disabled={dirty || confirming || isLite} onClick={handleConfirm}>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {confirming ? t('lineupPage.confirming') : t('lineupPage.confirm')}
          </Button>
        )}
        {isConfirmed && (
          <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
            <Check className="h-3.5 w-3.5" />{t('lineupPage.confirmed')}
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 shrink-0 border-r flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('lineupPage.playerPool')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t('lineupPage.waiting', { count: pool.length })}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {pool.map((p) => {
              const isInjured = injuredPlayerIds.has(p.id)
              return (
                <div
                  key={p.id}
                  draggable={canEdit && !isInjured}
                  onDragStart={(e) => {
                    if (isInjured) { e.preventDefault(); return }
                    const payload: LineupDragPayload = {
                      playerId: p.id,
                      playerName: p.playerName,
                      position: p.position,
                      src: 'POOL',
                    }
                    e.dataTransfer.setData(DRAG_KEY, JSON.stringify(payload))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  title={isInjured ? t('lineupPage.injuredNoAdd') : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border bg-background p-2 text-[11px]',
                    isInjured ? 'opacity-50 cursor-not-allowed' : canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                    {POSITION_ABBR[p.position as keyof typeof POSITION_ABBR] ?? '?'}
                  </div>
                  <span className="truncate font-medium">{p.playerName}</span>
                  {isInjured && <span className="ml-auto text-red-500 shrink-0">🚑</span>}
                </div>
              )
            })}
            {pool.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center pt-4">{t('lineupPage.allPlaced')}</p>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
          <div className="max-w-xs mx-auto w-full">
            <FootballPitch viewMode="formation">
              {pitchSlots.map((slotDef) => (
                <PitchSlot
                  key={slotDef.key}
                  slotDef={slotDef}
                  player={slots[slotDef.key] ?? null}
                  onDrop={canEdit ? handleSlotDrop : () => {}}
                  onRemove={canEdit ? handleSlotRemove : () => {}}
                  showMismatch={showMismatch}
                />
              ))}
            </FootballPitch>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {t('lineupPage.bench')} <span className="font-normal">({bench.length}/7)</span>
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={canEdit ? handleBenchDrop : undefined}
              className={cn(
                'min-h-12 rounded-lg border-2 border-dashed p-2 flex flex-wrap gap-1.5',
                canEdit ? 'border-muted-foreground/30' : 'border-muted/20',
              )}
            >
              {bench.map((p, i) => {
                const isInjured = injuredPlayerIds.has(p.id)
                return (
                <div
                  key={p.id}
                  draggable={canEdit && !isInjured}
                  onDragStart={(e) => {
                    if (isInjured) { e.preventDefault(); return }
                    const payload: LineupDragPayload = {
                      playerId: p.id,
                      playerName: p.playerName,
                      position: p.position,
                      src: 'BENCH',
                      srcKey: String(i),
                    }
                    e.dataTransfer.setData(DRAG_KEY, JSON.stringify(payload))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  title={isInjured ? t('lineupPage.injuredNoAdd') : undefined}
                  className={cn(
                    'flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[10px]',
                    isInjured ? 'opacity-50 cursor-not-allowed border-red-300' : 'cursor-grab',
                  )}
                >
                  {isInjured && <span className="text-red-500 text-[9px]">🚑</span>}
                  <span>{p.playerName}</span>
                  {canEdit && (
                    <button
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                      onClick={() => {
                        setBench((prev) => prev.filter((_, idx) => idx !== i))
                        setDirty(true)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
              })}
              {bench.length === 0 && (
                <span className="text-[10px] text-muted-foreground self-center">
                  {t('lineupPage.dropToBench')}
                </span>
              )}
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
            <span>{t('lineupPage.starters', { count: starterCount })}</span>
            {dirty && <span className="text-amber-600">· {t('lineupPage.unsaved')}</span>}
            {isConfirmed && !dirty && <span className="text-green-600">· {t('lineupPage.confirmed')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
