import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { matchApi } from '@/services/match.service'
import { salesApi } from '@/services/sales.service'
import { formationSnapshotApi } from '@/services/formationSnapshot.service'
import type { MatchDetail, ShotEvent, ShotResult, StatSheetData } from '@/types/match'
import type { SalesRecord } from '@/types/sales'
import type { FormationSnapshot } from '@/types/formation-snapshot'
import { FormationSnapshotCard } from '@/components/match/FormationSnapshotCard'
import { SHOT_RESULT_STYLE } from '@/types/match'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table'
import { ArrowLeft, Pencil, Trash2, Plus, Users, ScanLine } from 'lucide-react'
import { playerApi } from '@/services/player.service'
import { POSITION_ABBR, POSITION_ZONE, POSITION_LABEL } from '@/types/player'
import type { Player, Position } from '@/types/player'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const ZONE_STYLE: Record<string, string> = {
  GK: 'bg-amber-100 text-amber-800 border-amber-200',
  DEF: 'bg-blue-100 text-blue-800 border-blue-200',
  MID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FWD: 'bg-rose-100 text-rose-800 border-rose-200',
}

// 성공/시도 (%) 형식 — 시도가 MIN_ATTEMPTS 미만이면 % 생략으로 착시 방지
const MIN_RATE_ATTEMPTS = 3
function fmtRate(success: number | null, attempts: number | null): string | null {
  if (success == null && attempts == null) return null
  const s = success ?? 0
  const a = attempts ?? 0
  if (a === 0) return s > 0 ? `${s}/0` : null
  const pct = Math.round((s / a) * 1000) / 10
  return a >= MIN_RATE_ATTEMPTS ? `${s}/${a} (${pct}%)` : `${s}/${a}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface StatRowProps {
  label: string
  homeVal: number
  awayVal: number | null
  homeMax?: number
  fmt?: (v: number) => string
  homeColor?: string
  awayColor?: string
  sub?: string
}

function StatRow({ label, homeVal, awayVal, homeMax, fmt, homeColor = '#2563eb', awayColor = '#dc2626', sub }: StatRowProps) {
  const total = awayVal != null ? homeVal + awayVal : (homeMax ?? homeVal)
  const homePct = total > 0 ? Math.round((homeVal / total) * 100) : 50
  const awayPct = 100 - homePct
  const display = fmt ?? ((v: number) => String(v))
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] font-bold" style={{ color: homeColor }}>{display(homeVal)}</span>
        <span className="text-[10px] text-slate-500">{label}{sub ? ` (${sub})` : ''}</span>
        {awayVal != null
          ? <span className="text-[11px] font-bold" style={{ color: awayColor }}>{display(awayVal)}</span>
          : <span className="text-[11px] text-slate-300">—</span>}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: '#e2e8f0' }}>
        <div style={{ width: `${homePct}%`, background: homeColor }} />
        {awayVal != null && <div style={{ width: `${awayPct}%`, background: awayColor }} />}
      </div>
    </div>
  )
}

type TeamStatsForm = {
  possession: string
  yellowCards: string
  redCards: string
  corners: string
  offsides: string
  oppShots: string
  oppShotsOnTarget: string
  oppCorners: string
  oppFouls: string
  oppYellowCards: string
  oppRedCards: string
  oppXG: string
  oppOffsides: string
}

const TEAM_STATS_FIELDS: { key: keyof TeamStatsForm; label: string; float?: boolean }[] = [
  { key: 'possession', label: 'teamStats.possession' },
  { key: 'yellowCards', label: 'field.yellowCards' },
  { key: 'redCards', label: 'field.redCards' },
  { key: 'corners', label: 'field.corners' },
  { key: 'offsides', label: 'teamStats.offsides' },
  { key: 'oppShots', label: 'teamStats.oppShots' },
  { key: 'oppShotsOnTarget', label: 'teamStats.oppShotsOnTarget' },
  { key: 'oppCorners', label: 'teamStats.oppCorners' },
  { key: 'oppFouls', label: 'teamStats.oppFouls' },
  { key: 'oppYellowCards', label: 'teamStats.oppYellowCards' },
  { key: 'oppRedCards', label: 'teamStats.oppRedCards' },
  { key: 'oppXG', label: 'teamStats.oppXG', float: true },
  { key: 'oppOffsides', label: 'teamStats.oppOffsides' },
]

function makeEmptyForm(ts?: MatchDetail['teamMatchStats']): TeamStatsForm {
  if (!ts) return {
    possession: '', yellowCards: '', redCards: '', corners: '', offsides: '',
    oppShots: '', oppShotsOnTarget: '', oppCorners: '', oppFouls: '',
    oppYellowCards: '', oppRedCards: '', oppXG: '', oppOffsides: '',
  }
  return {
    possession: String(ts.possession),
    yellowCards: String(ts.yellowCards),
    redCards: String(ts.redCards),
    corners: String(ts.corners),
    offsides: String(ts.offsides),
    oppShots: ts.oppShots != null ? String(ts.oppShots) : '',
    oppShotsOnTarget: ts.oppShotsOnTarget != null ? String(ts.oppShotsOnTarget) : '',
    oppCorners: ts.oppCorners != null ? String(ts.oppCorners) : '',
    oppFouls: ts.oppFouls != null ? String(ts.oppFouls) : '',
    oppYellowCards: ts.oppYellowCards != null ? String(ts.oppYellowCards) : '',
    oppRedCards: ts.oppRedCards != null ? String(ts.oppRedCards) : '',
    oppXG: ts.oppXG != null ? String(ts.oppXG) : '',
    oppOffsides: ts.oppOffsides != null ? String(ts.oppOffsides) : '',
  }
}

interface TeamStatsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  match: MatchDetail
  onSaved: () => void
}

function TeamStatsDialog({ open, onOpenChange, match, onSaved }: TeamStatsDialogProps) {
  const { t } = useTranslation('match')
  const [form, setForm] = useState<TeamStatsForm>(() => makeEmptyForm(match.teamMatchStats ?? undefined))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(makeEmptyForm(match.teamMatchStats ?? undefined))
  }, [open, match.teamMatchStats])

  const set = (key: keyof TeamStatsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await matchApi.upsertTeamStats(match.id, {
        possession: Number(form.possession),
        yellowCards: Number(form.yellowCards),
        redCards: Number(form.redCards),
        corners: Number(form.corners),
        offsides: Number(form.offsides),
        ...(form.oppShots !== '' && { oppShots: Number(form.oppShots) }),
        ...(form.oppShotsOnTarget !== '' && { oppShotsOnTarget: Number(form.oppShotsOnTarget) }),
        ...(form.oppCorners !== '' && { oppCorners: Number(form.oppCorners) }),
        ...(form.oppFouls !== '' && { oppFouls: Number(form.oppFouls) }),
        ...(form.oppYellowCards !== '' && { oppYellowCards: Number(form.oppYellowCards) }),
        ...(form.oppRedCards !== '' && { oppRedCards: Number(form.oppRedCards) }),
        ...(form.oppXG !== '' && { oppXG: Number(form.oppXG) }),
        ...(form.oppOffsides !== '' && { oppOffsides: Number(form.oppOffsides) }),
      })
      toast.success(t('teamStats.savedSuccess'))
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('scoreDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('teamStats.dialogTitle', { team: match.homeTeamName })}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 py-1 max-h-[60vh] overflow-y-auto pr-1">
          {TEAM_STATS_FIELDS.map(({ key, label, float: isFloat }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{t(label)}</Label>
              <Input
                type="number"
                min={0}
                step={isFloat ? '0.01' : '1'}
                value={form[key]}
                onChange={set(key)}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common:action.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('common:action.loading') : t('common:action.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type PlayerStatsForm = {
  playerId: string
  minutesPlayed: string
  goals: string
  assists: string
  xG: string
  xA: string
  shots: string
  passesAttempted: string
  passesCompleted: string
  keyPasses: string
  tackles: string
  tacklesAttempted: string
  interceptions: string
  clearances: string
  saves: string
  shotsAllowed: string
  shotBlocked: string
  cleanSheet: boolean
  ballRecoveries: string
  turnovers: string
  groundDuels: string
  groundDuelsAttempted: string
  aerialDuels: string
  aerialDuelsAttempted: string
  distanceCovered: string
  sprint: string
  foulsCommitted: string
  shotsOnTarget: string
  dribblesAttempted: string
  dribblesCompleted: string
  dribblesFailed: string
  longPassesAttempted: string
  longPassesCompleted: string
}

const PLAYER_STAT_FIELDS: { key: keyof Omit<PlayerStatsForm, 'playerId' | 'cleanSheet'>; label: string; float?: boolean }[] = [
  { key: 'minutesPlayed', label: 'playerStats.fields.minutesPlayed' },
  { key: 'goals', label: 'playerStats.fields.goals' },
  { key: 'assists', label: 'playerStats.fields.assists' },
  { key: 'xG', label: 'xG', float: true },
  { key: 'xA', label: 'xA', float: true },
  { key: 'shots', label: 'playerStats.fields.shots' },
  { key: 'shotsOnTarget', label: 'playerStats.fields.shotsOnTarget' },
  { key: 'passesAttempted', label: 'playerStats.fields.passesAttempted' },
  { key: 'passesCompleted', label: 'playerStats.fields.passesCompleted' },
  { key: 'keyPasses', label: 'playerStats.fields.keyPasses' },
  { key: 'tackles', label: 'playerStats.fields.tackles' },
  { key: 'tacklesAttempted', label: 'playerStats.fields.tacklesAttempted' },
  { key: 'interceptions', label: 'playerStats.fields.interceptions' },
  { key: 'clearances', label: 'playerStats.fields.clearances' },
  { key: 'saves', label: 'playerStats.fields.saves' },
  { key: 'shotsAllowed', label: 'playerStats.fields.shotsAllowed' },
  { key: 'shotBlocked', label: 'playerStats.fields.shotBlocked' },
  { key: 'ballRecoveries', label: 'playerStats.fields.ballRecoveries' },
  { key: 'turnovers', label: 'playerStats.fields.turnovers' },
  { key: 'groundDuels', label: 'playerStats.fields.groundDuels' },
  { key: 'groundDuelsAttempted', label: 'playerStats.fields.groundDuelsAttempted' },
  { key: 'aerialDuels', label: 'playerStats.fields.aerialDuels' },
  { key: 'aerialDuelsAttempted', label: 'playerStats.fields.aerialDuelsAttempted' },
  { key: 'distanceCovered', label: 'playerStats.fields.distanceCovered', float: true },
  { key: 'sprint', label: 'playerStats.fields.sprint', float: true },
  { key: 'foulsCommitted', label: 'playerStats.fields.foulsCommitted' },
  { key: 'dribblesAttempted', label: 'playerStats.fields.dribblesAttempted' },
  { key: 'dribblesCompleted', label: 'playerStats.fields.dribblesCompleted' },
  { key: 'dribblesFailed', label: 'playerStats.fields.dribblesFailed' },
  { key: 'longPassesAttempted', label: 'playerStats.fields.longPassesAttempted' },
  { key: 'longPassesCompleted', label: 'playerStats.fields.longPassesCompleted' },
]

const EMPTY_PLAYER_FORM: PlayerStatsForm = {
  playerId: '', minutesPlayed: '', goals: '', assists: '', xG: '', xA: '',
  shots: '', passesAttempted: '', passesCompleted: '', keyPasses: '',
  tackles: '', tacklesAttempted: '', interceptions: '', clearances: '', saves: '', shotsAllowed: '', shotBlocked: '', cleanSheet: false,
  ballRecoveries: '', turnovers: '', groundDuels: '', groundDuelsAttempted: '', aerialDuels: '', aerialDuelsAttempted: '', distanceCovered: '', sprint: '',
  foulsCommitted: '', shotsOnTarget: '', dribblesAttempted: '', dribblesCompleted: '', dribblesFailed: '',
  longPassesAttempted: '', longPassesCompleted: '',
}

interface PlayerStatsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  match: MatchDetail
  onSaved: () => void
}

function PlayerStatsDialog({ open, onOpenChange, match, onSaved }: PlayerStatsDialogProps) {
  const { t } = useTranslation('match')
  const [players, setPlayers] = useState<Player[]>([])
  const [form, setForm] = useState<PlayerStatsForm>(EMPTY_PLAYER_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      playerApi.list({ status: 'ACTIVE', excludeYouth: true }).then(setPlayers).catch(() => null)
      setForm(EMPTY_PLAYER_FORM)
    }
  }, [open])

  // 선수 선택 시 기존 기록 자동 채움
  const handlePlayerChange = (playerId: string) => {
    const existing = match.playerMatchStats.find((s) => s.playerId === playerId)
    if (existing) {
      setForm({
        playerId,
        minutesPlayed: existing.minutesPlayed != null ? String(existing.minutesPlayed) : '',
        goals: existing.goals != null ? String(existing.goals) : '',
        assists: existing.assists != null ? String(existing.assists) : '',
        // xG/xA=0은 미입력과 동일하게 처리 (0.00 그대로 저장 방지)
        xG: (existing.xG != null && existing.xG > 0) ? String(existing.xG) : '',
        xA: (existing.xA != null && existing.xA > 0) ? String(existing.xA) : '',
        shots: existing.shots != null ? String(existing.shots) : '',
        passesAttempted: existing.passesAttempted != null ? String(existing.passesAttempted) : '',
        passesCompleted: existing.passesCompleted != null ? String(existing.passesCompleted) : '',
        keyPasses: existing.keyPasses != null ? String(existing.keyPasses) : '',
        tackles: existing.tackles != null ? String(existing.tackles) : '',
        tacklesAttempted: existing.tacklesAttempted != null ? String(existing.tacklesAttempted) : '',
        interceptions: existing.interceptions != null ? String(existing.interceptions) : '',
        clearances: existing.clearances != null ? String(existing.clearances) : '',
        saves: existing.saves != null ? String(existing.saves) : '',
        shotsAllowed: existing.shotsAllowed != null ? String(existing.shotsAllowed) : '',
        shotBlocked: existing.shotBlocked != null ? String(existing.shotBlocked) : '',
        cleanSheet: existing.cleanSheet ?? false,
        ballRecoveries: existing.ballRecoveries != null ? String(existing.ballRecoveries) : '',
        turnovers: existing.turnovers != null ? String(existing.turnovers) : '',
        groundDuels: existing.groundDuels != null ? String(existing.groundDuels) : '',
        groundDuelsAttempted: existing.groundDuelsAttempted != null ? String(existing.groundDuelsAttempted) : '',
        aerialDuels: existing.aerialDuels != null ? String(existing.aerialDuels) : '',
        aerialDuelsAttempted: existing.aerialDuelsAttempted != null ? String(existing.aerialDuelsAttempted) : '',
        distanceCovered: existing.distanceCovered != null ? String(existing.distanceCovered) : '',
        sprint: existing.sprint != null ? String(existing.sprint) : '',
        foulsCommitted: existing.foulsCommitted != null ? String(existing.foulsCommitted) : '',
        shotsOnTarget: existing.shotsOnTarget != null ? String(existing.shotsOnTarget) : '',
        dribblesAttempted: existing.dribblesAttempted != null ? String(existing.dribblesAttempted) : '',
        dribblesCompleted: existing.dribblesCompleted != null ? String(existing.dribblesCompleted) : '',
        dribblesFailed: existing.dribblesFailed != null ? String(existing.dribblesFailed) : '',
        longPassesAttempted: existing.longPassesAttempted != null ? String(existing.longPassesAttempted) : '',
        longPassesCompleted: existing.longPassesCompleted != null ? String(existing.longPassesCompleted) : '',
      })
    } else {
      setForm({ ...EMPTY_PLAYER_FORM, playerId })
    }
  }

  const setField = (key: keyof Omit<PlayerStatsForm, 'playerId' | 'cleanSheet'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const num = (v: string) => v !== '' ? Number(v) : undefined
  const numPos = (v: string) => { const n = Number(v); return v !== '' && n > 0 ? n : undefined }

  const assistsVal  = Number(form.assists)      || 0
  const goalsVal    = Number(form.goals)        || 0
  const keyPassVal  = Number(form.keyPasses)    || 0

  const minutesVal = Number(form.minutesPlayed) || 0

  const fieldError = (key: string): boolean => {
    if (key === 'xA' && assistsVal > 0 && !form.xA) return true
    if (key === 'xG' && goalsVal   > 0 && !form.xG) return true
    if (key === 'shotsOnTarget' && goalsVal > 0 && (Number(form.shotsOnTarget) || 0) < goalsVal) return true
    if (key === 'passesAttempted' && keyPassVal > 0 && !form.passesAttempted) return true
    if (key === 'distanceCovered' && minutesVal > 0 && !form.distanceCovered) return true
    if (key === 'sprint'          && minutesVal > 0 && !form.sprint) return true
    return false
  }

  const handleSave = async () => {
    if (!form.playerId) { toast.error(t('playerStats.selectRequired')); return }
    if (goalsVal > 0 && !form.xG) {
      toast.error(t('playerStats.xgRequired'))
      return
    }
    if (goalsVal > 0 && (Number(form.shotsOnTarget) || 0) < goalsVal) {
      toast.error(t('playerStats.sotBelowGoals'))
      return
    }
    if (assistsVal > 0 && !form.xA) {
      toast.error(t('playerStats.xaRequired'))
      return
    }
    if (keyPassVal > 0 && !form.passesAttempted) {
      toast.error(t('playerStats.keyPassRequired'))
      return
    }
    if (minutesVal > 0 && (!form.distanceCovered || !form.sprint)) {
      toast.error(t('playerStats.activityRequired'))
      return
    }
    setSaving(true)
    try {
      await matchApi.upsertPlayerStats(match.id, {
        playerId: form.playerId,
        minutesPlayed: num(form.minutesPlayed),
        goals: num(form.goals),
        assists: num(form.assists),
        xG: numPos(form.xG),
        xA: numPos(form.xA),
        shots: num(form.shots),
        passesAttempted: num(form.passesAttempted),
        passesCompleted: num(form.passesCompleted),
        keyPasses: num(form.keyPasses),
        tackles: num(form.tackles),
        tacklesAttempted: num(form.tacklesAttempted),
        interceptions: num(form.interceptions),
        clearances: num(form.clearances),
        saves: num(form.saves),
        shotsAllowed: num(form.shotsAllowed),
        shotBlocked: num(form.shotBlocked),
        cleanSheet: form.cleanSheet || undefined,
        ballRecoveries: num(form.ballRecoveries),
        turnovers: num(form.turnovers),
        groundDuels: num(form.groundDuels),
        groundDuelsAttempted: num(form.groundDuelsAttempted),
        aerialDuels: num(form.aerialDuels),
        aerialDuelsAttempted: num(form.aerialDuelsAttempted),
        distanceCovered: numPos(form.distanceCovered),
        sprint: numPos(form.sprint),
        foulsCommitted: num(form.foulsCommitted),
        shotsOnTarget: num(form.shotsOnTarget),
        dribblesAttempted: num(form.dribblesAttempted),
        dribblesCompleted: num(form.dribblesCompleted),
        dribblesFailed: num(form.dribblesFailed),
        longPassesAttempted: num(form.longPassesAttempted),
        longPassesCompleted: num(form.longPassesCompleted),
      })
      toast.success(t('playerStats.savedSuccess'))
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('scoreDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('playerStats.dialogTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label className="text-xs">{t('playerStats.playerLabel')}</Label>
            <Select value={form.playerId} onValueChange={handlePlayerChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={t('playerStats.selectPlayer')} />
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.playerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {PLAYER_STAT_FIELDS.map(({ key, label, float: isFloat }) => {
              const err = fieldError(key)
              return (
                <div key={key} className="space-y-1">
                  <Label className={cn('text-xs', err && 'text-red-600')}>
                    {label.startsWith('playerStats.') ? t(label) : label}{err ? ` ${t('playerStats.required')}` : ''}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={isFloat ? '0.01' : '1'}
                    value={form[key]}
                    onChange={(e) => setField(key)(e)}
                    placeholder="—"
                    className={cn('h-8 text-sm', err && 'border-red-400 focus-visible:ring-red-400')}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              id="cleanSheet"
              type="checkbox"
              checked={form.cleanSheet}
              onChange={(e) => setForm((prev) => ({ ...prev, cleanSheet: e.target.checked }))}
              className="rounded border-border"
            />
            <Label htmlFor="cleanSheet" className="text-xs cursor-pointer">{t('playerStats.cleanSheet')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common:action.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('common:action.loading') : t('common:action.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ScoreDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  match: MatchDetail
  onSaved: () => void
}

function ScoreDialog({ open, onOpenChange, match, onSaved }: ScoreDialogProps) {
  const { t } = useTranslation('match')
  const [homeScore, setHomeScore] = useState(String(match.homeScore ?? ''))
  const [awayScore, setAwayScore] = useState(String(match.awayScore ?? ''))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await matchApi.update(match.id, {
        homeScore: homeScore !== '' ? Number(homeScore) : undefined,
        awayScore: awayScore !== '' ? Number(awayScore) : undefined,
      })
      toast.success(t('scoreDialog.savedSuccess'))
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('scoreDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>{t('scoreDialog.title')}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>{match.homeTeamName}</Label>
            <Input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>{match.awayTeamName}</Label>
            <Input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common:action.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('common:action.loading') : t('common:action.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const SHOT_RESULTS: ShotResult[] = ['GOAL', 'ON_TARGET', 'OFF_TARGET', 'BLOCKED']
const ALL_POSITIONS = [
  'STRIKER','SHADOW_STRIKER','WINGER',
  'CENTRAL_ATTACK_MIDFIELDER','RIGHT_ATTACK_MIDFIELDER','LEFT_ATTACK_MIDFIELDER',
  'CENTRAL_DEFENSIVE_MIDFIELDER','LEFT_DEFENSIVE_MIDFIELDER','RIGHT_DEFENSIVE_MIDFIELDER',
  'CENTER_BACK','LEFT_WING_BACK','LEFT_FULL_BACK','RIGHT_WING_BACK','RIGHT_FULL_BACK','GOALKEEPER',
] as const

function AddShotDialog({
  open,
  onOpenChange,
  matchId,
  players,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  matchId: number
  players: { id: string; playerName: string; position: string }[]
  onSaved: () => void
}) {
  const { t } = useTranslation('match')
  const [shooterId, setShooterId] = useState('')
  const [assisterId, setAssisterId] = useState('')
  const [assisterPositionOverride, setAssisterPositionOverride] = useState('')
  const [xG, setXg] = useState('')
  const [result, setResult] = useState<ShotResult>('ON_TARGET')
  const [minute, setMinute] = useState('')
  const [saving, setSaving] = useState(false)

  const assisterDefaultPos = players.find(p => p.id === assisterId)?.position ?? ''

  const reset = () => {
    setShooterId(''); setAssisterId(''); setAssisterPositionOverride('')
    setXg(''); setResult('ON_TARGET'); setMinute('')
  }

  const handleSave = async () => {
    if (!shooterId) { toast.error(t('shotEvent.shooterRequired')); return }
    const xgVal = parseFloat(xG)
    if (isNaN(xgVal) || xgVal < 0 || xgVal > 1) { toast.error(t('shotEvent.xgRange')); return }
    setSaving(true)
    try {
      await matchApi.createShot(matchId, {
        shooterId,
        assisterId: assisterId || undefined,
        assisterPositionOverride:
          assisterId && assisterPositionOverride && assisterPositionOverride !== assisterDefaultPos
            ? assisterPositionOverride
            : undefined,
        xG: xgVal,
        result,
        minute: minute ? Number(minute) : undefined,
      })
      toast.success(t('shotEvent.savedSuccess'))
      reset()
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(t('shotEvent.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{t('shotEvent.dialogTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('shotEvent.shooter')} *</Label>
            <Select value={shooterId} onValueChange={setShooterId}>
              <SelectTrigger className="h-8 text-sm">
                {shooterId
                  ? <span>{players.find(p => p.id === shooterId)?.playerName ?? shooterId}</span>
                  : <span className="text-muted-foreground">{t('shotEvent.selectPlayer')}</span>}
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.playerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('shotEvent.assister')}</Label>
            <Select value={assisterId} onValueChange={(v) => { setAssisterId(v); setAssisterPositionOverride('') }}>
              <SelectTrigger className="h-8 text-sm">
                {assisterId
                  ? <span>{players.find(p => p.id === assisterId)?.playerName ?? assisterId}</span>
                  : <span className="text-muted-foreground">{t('shotEvent.none')}</span>}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('shotEvent.none')}</SelectItem>
                {players.filter(p => p.id !== shooterId).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.playerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {assisterId && (
            <div className="space-y-1">
              <Label className="text-xs">
                {t('shotEvent.assisterPosOverride')}
                <span className="ml-1 text-muted-foreground font-normal">(default: {POSITION_ABBR[assisterDefaultPos as Position] ?? assisterDefaultPos})</span>
              </Label>
              <Select
                value={assisterPositionOverride || assisterDefaultPos}
                onValueChange={setAssisterPositionOverride}
              >
                <SelectTrigger className="h-8 text-sm">
                  <span>{POSITION_ABBR[(assisterPositionOverride || assisterDefaultPos) as Position] ?? (assisterPositionOverride || assisterDefaultPos)}</span>
                </SelectTrigger>
                <SelectContent>
                  {ALL_POSITIONS.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      <span><span className="font-mono text-xs">{POSITION_ABBR[pos as Position]}</span><span className="ml-2 text-muted-foreground">{POSITION_LABEL[pos as Position]}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">xG (0~1) *</Label>
              <Input
                className="h-8 text-sm"
                placeholder="0.35"
                value={xG}
                onChange={(e) => setXg(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('shotEvent.minuteLabel')}</Label>
              <Input
                className="h-8 text-sm"
                placeholder="67"
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('shotEvent.resultLabel')} *</Label>
            <Select value={result} onValueChange={(v) => setResult(v as ShotResult)}>
              <SelectTrigger className="h-8 text-sm">
                <span>{t(`shotResult.${result}`)}</span>
              </SelectTrigger>
              <SelectContent>
                {SHOT_RESULTS.map((r) => (
                  <SelectItem key={r} value={r}>{t(`shotResult.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('common:action.cancel')}</Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? t('common:action.loading') : t('common:action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatSheetDisplay({ sheet, homeTeam, awayTeam }: { sheet: StatSheetData; homeTeam: string; awayTeam: string }) {
  const { t } = useTranslation('match')
  const rows: { label: string; key: keyof Omit<StatSheetData, 'scorers'> }[] = [
    { label: t('teamStats.possession'), key: 'possession' },
    { label: t('field.shots'), key: 'shots' },
    { label: t('field.shotsOnTarget'), key: 'shotsOnTarget' },
    { label: t('field.goals'), key: 'goals' },
    { label: t('field.corners'), key: 'corners' },
    { label: t('field.fouls'), key: 'fouls' },
    { label: t('field.yellowCards'), key: 'yellowCards' },
    { label: t('field.redCards'), key: 'redCards' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 text-[10px] font-semibold text-slate-500 border-b pb-1">
        <div>{homeTeam}</div><div className="text-center">{t('detailSection.item')}</div><div className="text-right">{awayTeam}</div>
      </div>
      {rows.map(({ label, key }) => (
        <div key={key} className="grid grid-cols-3 text-xs">
          <div className="font-semibold tabular-nums">{sheet[key]?.home ?? '—'}</div>
          <div className="text-center text-muted-foreground">{label}</div>
          <div className="text-right font-semibold tabular-nums">{sheet[key]?.away ?? '—'}</div>
        </div>
      ))}
      {sheet.scorers.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('detailSection.scorers')}</div>
          {sheet.scorers.map((s, i) => (
            <div key={i} className="text-xs flex gap-2">
              <span className={s.team === 'home' ? 'text-blue-600 font-medium' : 'text-slate-500 font-medium'}>
                {s.team === 'home' ? homeTeam : awayTeam}
              </span>
              <span>{s.name}{s.minute != null ? ` (${s.minute}')` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MatchDetailPage() {
  const { t } = useTranslation('match')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [teamStatsOpen, setTeamStatsOpen] = useState(false)
  const [playerStatsOpen, setPlayerStatsOpen] = useState(false)
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null)
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([])
  const [shotOpen, setShotOpen] = useState(false)
  const [deletingShot, setDeletingShot] = useState<number | null>(null)
  const [statUploading, setStatUploading] = useState(false)
  const statFileRef = useRef<HTMLInputElement>(null)
  const [ticketSales, setTicketSales] = useState<SalesRecord[]>([])
  const [deleteSaleId, setDeleteSaleId] = useState<number | null>(null)
  const [saleQty, setSaleQty] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [saleNote, setSaleNote] = useState('')
  const [savingSale, setSavingSale] = useState(false)
  const [snapshots, setSnapshots] = useState<FormationSnapshot[]>([])

  const canWrite = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'
  const canInputStats = canWrite || user?.role === 'COACHING_STAFF'
  const canUploadOcr = user?.role === 'ADMIN' || user?.role === 'COACHING_STAFF'
  const canEditSnapshot = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'COACHING_STAFF'

  const isFO = user?.role === 'FRONT_OFFICE'
  const foRole = user?.frontOfficeRole
  const canViewSales = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'
  const canWriteSales = user?.role === 'ADMIN' || (isFO && (foRole === 'FINANCE_MANAGER' || foRole === 'FINANCE_STAFF'))
  const canDeleteSales = user?.role === 'ADMIN' || (isFO && foRole === 'FINANCE_MANAGER')

  const fetchMatch = () => {
    if (!id) return
    matchApi.get(Number(id))
      .then((data) => {
        setMatch(data)
        if (data.homeTeamName === 'FC Seoul') {
          salesApi.byMatch(data.id).then(setTicketSales).catch(() => null)
        }
      })
      .catch(() => toast.error(t('detail.loadFailed')))
      .finally(() => setLoading(false))
    formationSnapshotApi.listByMatch(Number(id)).then(setSnapshots).catch(() => {})
  }

  const fetchShots = () => {
    if (!id) return
    matchApi.getShots(Number(id))
      .then(setShotEvents)
      .catch(() => {})
  }

  const handleDeleteShot = async (eventId: number) => {
    setDeletingShot(eventId)
    try {
      await matchApi.deleteShot(Number(id), eventId)
      fetchShots()
      fetchMatch()
      toast.success(t('detail.shotDeleteSuccess'))
    } catch {
      toast.error(t('detail.shotDeleteFailed'))
    } finally {
      setDeletingShot(null)
    }
  }

  const handleStatSheetUpload = async (file: File) => {
    if (!id) return
    setStatUploading(true)
    try {
      const result = await matchApi.uploadStatSheet(Number(id), file)
      setMatch(prev => prev ? { ...prev, statSheetRaw: result.statSheetRaw, statSheetImagePath: result.statSheetImagePath } : prev)
      toast.success(t('statSheetOcr.success'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('statSheetOcr.failed'))
    } finally {
      setStatUploading(false)
      if (statFileRef.current) statFileRef.current.value = ''
    }
  }

  const handleAddTicketSale = async () => {
    if (!match || !saleQty || !salePrice) return
    setSavingSale(true)
    try {
      const newSale = await salesApi.create({
        type: 'TICKET',
        quantity: Number(saleQty),
        unitPrice: Number(salePrice),
        saleDate,
        matchId: match.id,
        ...(saleNote && { description: saleNote }),
      })
      setTicketSales((prev) => [newSale, ...prev])
      setSaleQty('')
      setSalePrice('')
      setSaleNote('')
      toast.success('티켓 판매 기록이 저장되었습니다.')
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'AWAY_MATCH_TICKET_NOT_ALLOWED') toast.error('홈경기만 티켓 판매를 기록할 수 있습니다.')
      else toast.error('저장에 실패했습니다.')
    } finally {
      setSavingSale(false)
    }
  }

  const handleDeleteTicketSale = async () => {
    if (!deleteSaleId) return
    try {
      await salesApi.delete(deleteSaleId)
      setTicketSales((prev) => prev.filter((s) => s.id !== deleteSaleId))
      toast.success('삭제되었습니다.')
    } catch {
      toast.error('삭제에 실패했습니다.')
    } finally {
      setDeleteSaleId(null)
    }
  }

  useEffect(() => { fetchMatch(); fetchShots() }, [id])

  if (loading) return (
    <div className="p-6 space-y-4 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (!match) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
      <p className="text-sm">{t('detail.notFound')}</p>
      <Button variant="ghost" size="sm" onClick={() => navigate('/matches')}>{t('detail.toList')}</Button>
    </div>
  )

  const ts = match.teamMatchStats

  const OUR_TEAM = 'FC Seoul'
  const ourIsHome = match.homeTeamName === OUR_TEAM
  const ourScore = ourIsHome ? match.homeScore : match.awayScore
  const oppScore = ourIsHome ? match.awayScore : match.homeScore
  const hasScore = ourScore != null && oppScore != null
  const resultLabel = hasScore
    ? ourScore! > oppScore! ? t('outcome.win') : ourScore! === oppScore! ? t('outcome.draw') : t('outcome.loss')
    : null
  const winLabel = t('outcome.win')
  const drawLabel = t('outcome.draw')
  const resultClass = resultLabel === winLabel ? 'text-green-400' : resultLabel === drawLabel ? 'text-slate-300' : 'text-red-400'

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/matches')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        {canInputStats && (
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/matches/${id}/lineup`)}>
              <Users className="h-3.5 w-3.5 mr-1.5" />{t('detail.manageLineup')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPlayerStatsOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />{t('detail.manageStat')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTeamStatsOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />{t('detail.manageTeamStat')}
            </Button>
          </>
        )}
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScoreOpen(true)}
            disabled={!match.hasSquad}
            title={!match.hasSquad ? t('scoreDialog.squadRequired') : undefined}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />{t('detail.manageScore')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* 스코어 헤더 */}
          <div
            className="rounded-xl text-white px-5 py-6"
            style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)' }}
          >
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="bg-white/15 text-blue-200 rounded px-2 py-0.5 text-[10px]">
                {t(`competitionType.${match.competitionType}`)}
              </span>
              <span className="text-blue-300 text-[10px]">{formatDate(match.date)}</span>
            </div>
            <div className="flex items-center justify-between px-2">
              <div className="flex-1 text-right">
                <div className="text-base font-bold">{match.homeTeamName}</div>
                <div className="text-[10px] text-blue-200 mt-0.5">{t('detailSection.home')}</div>
              </div>
              <div className="mx-5 text-center bg-white/10 rounded-xl px-5 py-2.5">
                <div className="text-[30px] font-extrabold tabular-nums leading-none tracking-wide">
                  {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'vs'}
                </div>
                {hasScore && resultLabel && (
                  <div className={cn('text-[10px] font-semibold mt-1', resultClass)}>
                    FT · {resultLabel}
                  </div>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-base font-bold">{match.awayTeamName}</div>
                <div className="text-[10px] text-blue-200 mt-0.5">{t('detailSection.away')}</div>
              </div>
            </div>
            {/* 득점자 */}
            {hasScore && match.playerMatchStats.some((s) => (s.goals ?? 0) > 0) && (
              <div className="flex justify-center gap-2 flex-wrap mt-4">
                {match.playerMatchStats
                  .filter((s) => (s.goals ?? 0) > 0)
                  .map((s) => (
                    <span key={s.id} className="text-xs bg-white/10 text-blue-100 rounded-full px-3 py-1">
                      ⚽ {s.player.playerName}{(s.goals ?? 0) > 1 ? ` ×${s.goals}` : ''}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* 팀 통계 비교 바 */}
          {ts && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center mb-3">{t('detailSection.teamStats')}</div>
              <StatRow
                label={t('teamStatsBar.possession')}
                homeVal={ts.possession}
                awayVal={100 - ts.possession}
                fmt={(v) => `${v}%`}
              />
              <StatRow
                label={t('teamStatsBar.shots')}
                homeVal={ts.shots}
                awayVal={ts.oppShots ?? null}
                homeMax={ts.oppShots == null ? ts.shots : undefined}
                sub={t('teamStatsBar.shotsOnTargetSub', { count: ts.shotsOnTarget })}
              />
              <StatRow
                label={t('teamStatsBar.passRate')}
                homeVal={ts.passAccuracy}
                awayVal={null}
                homeMax={100}
                fmt={(v) => `${v}%`}
                sub={ts.passes > 0 ? `${Math.round(ts.passes * ts.passAccuracy / 100)}/${ts.passes}` : undefined}
              />
              <StatRow
                label="xG"
                homeVal={ts.xG}
                awayVal={ts.oppXG ?? null}
                homeMax={ts.oppXG == null ? Math.max(ts.xG, 3) : undefined}
                fmt={(v) => v.toFixed(2)}
                homeColor="#10b981"
              />
            </div>
          )}

          {/* 보조 통계 칩 */}
          {ts && (
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: t('chipStats.corners'), home: ts.corners, away: ts.oppCorners, accent: false },
                { label: t('chipStats.yellowCards'), home: ts.yellowCards, away: ts.oppYellowCards, accent: true },
                { label: t('chipStats.fouls'), home: ts.fouls, away: ts.oppFouls, accent: false },
              ]).map(({ label, home, away, accent }) => (
                <div key={label} className="rounded-lg border bg-white p-3 text-center">
                  {away != null ? (
                    <div className="flex items-baseline justify-center gap-1">
                      <span className={cn('text-sm font-bold tabular-nums', accent ? 'text-amber-500' : 'text-blue-600')}>{home}</span>
                      <span className="text-[10px] text-slate-300">:</span>
                      <span className={cn('text-sm font-bold tabular-nums', accent ? 'text-amber-400' : 'text-red-500')}>{away}</span>
                    </div>
                  ) : (
                    <div className={cn('text-sm font-bold tabular-nums', accent ? 'text-amber-500' : 'text-slate-900')}>{home}</div>
                  )}
                  <div className="text-[9px] text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* 슈팅 이벤트 */}
          {(shotEvents.length > 0 || canInputStats) && (
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('shotEvent.sectionTitle')}</div>
                {canInputStats && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShotOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />{t('shotEvent.add')}
                  </Button>
                )}
              </div>
              {shotEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">{t('shotEvent.noEvents')}</p>
              ) : (
                <div className="space-y-1.5">
                  {shotEvents.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400 w-6 text-right shrink-0">
                        {e.minute != null ? `${e.minute}'` : '—'}
                      </span>
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${SHOT_RESULT_STYLE[e.result]}`}>
                        {t(`shotResult.${e.result}`)}
                      </span>
                      <span className="font-medium text-slate-800 shrink-0">{e.shooter.playerName}</span>
                      {e.assister && (
                        <span className="text-slate-400">→ {e.assister.playerName}</span>
                      )}
                      <span className="ml-auto text-slate-400 shrink-0">xG {e.xG.toFixed(2)}</span>
                      {canInputStats && (
                        <button
                          className="text-slate-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-40"
                          disabled={deletingShot === e.id}
                          onClick={() => handleDeleteShot(e.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 선수 기록 */}
          {match.playerMatchStats.length > 0 && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-3">{t('detailSection.playerStats')}</div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{t('playerStatsTable.player')}</th>
                      <th className="pb-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wide text-center w-10">{t('playerStatsTable.goals')}</th>
                      <th className="pb-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wide text-center w-10">{t('playerStatsTable.assists')}</th>
                      <th className="pb-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wide text-center w-12">xG</th>
                      <th className="pb-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wide text-center w-14">{t('playerStatsTable.minutes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.playerMatchStats.map((s) => {
                      const pos = s.player.position as Position
                      const zone = POSITION_ZONE[pos]
                      const expanded = expandedPlayerId === s.id
                      return (
                        <>
                          <tr
                            key={s.id}
                            className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => setExpandedPlayerId(expanded ? null : s.id)}
                          >
                            <td className="py-1.5 flex items-center gap-1.5">
                              <span className={`inline-flex rounded border px-1 py-0.5 text-[10px] font-mono font-semibold shrink-0 ${ZONE_STYLE[zone]}`}>
                                {POSITION_ABBR[pos]}
                              </span>
                              <span className={cn('text-[11px]', (s.goals ?? 0) > 0 ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                                {s.player.playerName}
                              </span>
                              <span className="ml-auto text-[9px] text-slate-300">{expanded ? '▲' : '▼'}</span>
                            </td>
                            <td className={cn('text-center tabular-nums text-[11px]', (s.goals ?? 0) > 0 ? 'font-bold text-slate-900' : 'text-slate-400')}>
                              {s.goals ?? '—'}
                            </td>
                            <td className={cn('text-center tabular-nums text-[11px]', (s.assists ?? 0) > 0 ? 'font-bold text-slate-900' : 'text-slate-400')}>
                              {s.assists ?? '—'}
                            </td>
                            <td className={cn('text-center tabular-nums text-[11px]',
                              s.xG != null && s.xG >= 1.5 ? 'text-emerald-600 font-semibold' : 'text-slate-400')}>
                              {(s.xG != null && s.xG > 0)
                                ? s.xG.toFixed(2)
                                : ((s.goals ?? 0) > 0)
                                  ? <span className="text-orange-500 font-bold">⚠</span>
                                  : '—'}
                            </td>
                            <td className="text-center tabular-nums text-[11px] text-slate-400">
                              {s.minutesPlayed != null ? `${s.minutesPlayed}'` : '—'}
                            </td>
                          </tr>
                          {expanded && (
                            <tr key={`${s.id}-detail`}>
                              <td colSpan={5} className="pb-2 pt-1">
                                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                                  <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                                    {([
                                      { label: t('playerStatsTable.shots'),         value: s.shots },
                                      { label: t('playerStatsTable.shotsOnTarget'), value: s.shotsOnTarget },
                                      { label: 'xG',                                value: (s.xG != null && s.xG > 0) ? s.xG.toFixed(2) : null },
                                      { label: 'xA',                                value: (s.xA != null && s.xA > 0) ? s.xA.toFixed(2) : null },
                                      { label: t('playerStatsTable.keyPasses'),     value: s.keyPasses },
                                      { label: t('playerStatsTable.passAttempted'), value: s.passesAttempted },
                                      { label: t('playerStatsTable.passCompleted'), value: s.passesCompleted },
                                      { label: t('playerStatsTable.passRate'),      value: (() => { const att = (s.passesAttempted ?? 0) + (s.longPassesAttempted ?? 0); const cmp = (s.passesCompleted ?? 0) + (s.longPassesCompleted ?? 0); return att > 0 ? `${Math.round(cmp / att * 100)}%` : null })() },
                                      { label: t('playerStatsTable.tackles'),     value: fmtRate(s.tackles, s.tacklesAttempted) },
                                      { label: t('playerStatsTable.interceptions'), value: s.interceptions },
                                      { label: t('playerStatsTable.clearances'),    value: s.clearances },
                                      { label: t('playerStatsTable.ballRecoveries'),value: s.ballRecoveries },
                                      { label: t('playerStatsTable.turnovers'),     value: s.turnovers },
                                      { label: t('playerStatsTable.groundDuels'),   value: fmtRate(s.groundDuels, s.groundDuelsAttempted) },
                                      { label: t('playerStatsTable.aerialDuels'),   value: fmtRate(s.aerialDuels, s.aerialDuelsAttempted) },
                                      { label: t('playerStatsTable.saves'),            value: s.saves },
                                      { label: t('playerStatsTable.shotsAllowed'),     value: s.shotsAllowed },
                                      { label: t('playerStatsTable.shotBlocked'),      value: s.shotBlocked },
                                      { label: t('playerStatsTable.cleanSheet'),       value: s.cleanSheet != null ? (s.cleanSheet ? '✓' : '✗') : null },
                                      { label: t('playerStatsTable.activity'),         value: (s.distanceCovered != null || s.sprint != null) ? `${s.distanceCovered != null ? s.distanceCovered.toFixed(1) + 'km' : '—'} / ${s.sprint != null ? Math.round(s.sprint) + '회' : '—'}` : null },
                                      { label: t('playerStatsTable.foulsCommitted'),   value: s.foulsCommitted },
                                      { label: t('playerStatsTable.dribblesAttempted'),value: s.dribblesAttempted },
                                      { label: t('playerStatsTable.dribblesCompleted'),value: s.dribblesCompleted },
                                      { label: t('playerStatsTable.dribblesFailed'),   value: s.dribblesFailed },
                                      { label: t('playerStatsTable.longPasses'),        value: fmtRate(s.longPassesCompleted, s.longPassesAttempted) },
                                    ] as { label: string; value: string | number | null }[]).map(({ label, value }) => (
                                      <div key={label} className="text-center">
                                        <div className="text-[12px] font-semibold text-slate-700 tabular-nums">{value ?? '—'}</div>
                                        <div className="text-[9px] text-slate-400 mt-0.5">{label}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 스탯 시트 OCR */}
          {(canInputStats || canWrite) && (
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('detailSection.statSheetOcr')}</div>
                {canUploadOcr && (
                  <div className="flex items-center gap-2">
                    {statUploading && <span className="text-xs text-muted-foreground">{t('statSheetOcr.analyzing')}</span>}
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                      onClick={() => statFileRef.current?.click()} disabled={statUploading}>
                      <ScanLine className="h-3.5 w-3.5" />
                      {match.statSheetRaw ? t('statSheetOcr.rescan') : t('statSheetOcr.upload')}
                    </Button>
                    <input ref={statFileRef} type="file" accept="image/jpeg,image/png" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleStatSheetUpload(file) }} />
                  </div>
                )}
              </div>
              {match.statSheetRaw ? (
                <StatSheetDisplay sheet={match.statSheetRaw} homeTeam={match.homeTeamName} awayTeam={match.awayTeamName} />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">{t('statSheetOcr.uploadHint')}</p>
              )}
            </div>
          )}

          {/* 대형 변화 기록 */}
          <FormationSnapshotCard
            matchId={match.id}
            snapshots={snapshots}
            canEdit={canEditSnapshot}
            onAdded={(s) => setSnapshots(prev => [...prev, s])}
            onRemoved={(id) => setSnapshots(prev => prev.filter(s => s.id !== id))}
          />

          {/* 티켓 판매 */}
          {match?.homeTeamName === 'FC Seoul' && canViewSales && (
            <div className="rounded-xl border bg-white p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                티켓 판매
              </h3>

              {canWriteSales && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">수량</Label>
                      <Input type="number" placeholder="1200" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">단가 (원)</Label>
                      <Input type="number" placeholder="15000" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">날짜</Label>
                      <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                    </div>
                  </div>
                  <Input placeholder="메모 (선택)" value={saleNote} onChange={(e) => setSaleNote(e.target.value)} />
                  <Button size="sm" onClick={handleAddTicketSale} disabled={savingSale || !saleQty || !salePrice}>
                    {savingSale ? '저장 중...' : '기록 추가'}
                  </Button>
                </div>
              )}

              {ticketSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 티켓 판매 기록이 없습니다.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">단가</TableHead>
                        <TableHead className="text-right">합계</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{new Date(s.saleDate).toLocaleDateString('ko-KR')}</TableCell>
                          <TableCell className="text-right">{s.quantity.toLocaleString()}장</TableCell>
                          <TableCell className="text-right">₩{Number(s.unitPrice).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">₩{Number(s.totalAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {canDeleteSales && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive h-7 px-2"
                                onClick={() => setDeleteSaleId(s.id)}
                              >
                                삭제
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">합계</TableCell>
                        <TableCell className="text-right font-semibold">
                          {ticketSales.reduce((s, r) => s + r.quantity, 0).toLocaleString()}장
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right font-semibold">
                          ₩{ticketSales.reduce((s, r) => s + Number(r.totalAmount), 0).toLocaleString()}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 티켓 판매 삭제 확인 */}
      <Dialog open={deleteSaleId !== null} onOpenChange={(open) => { if (!open) setDeleteSaleId(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>티켓 판매 기록 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 판매 기록을 삭제할까요? 되돌릴 수 없습니다.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteSaleId(null)}>취소</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteTicketSale}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {match && (
        <>
          {canWrite && <ScoreDialog open={scoreOpen} onOpenChange={setScoreOpen} match={match} onSaved={() => { setScoreOpen(false); fetchMatch() }} />}
          {canInputStats && <TeamStatsDialog open={teamStatsOpen} onOpenChange={setTeamStatsOpen} match={match} onSaved={() => { setTeamStatsOpen(false); fetchMatch() }} />}
          {canInputStats && <PlayerStatsDialog open={playerStatsOpen} onOpenChange={setPlayerStatsOpen} match={match} onSaved={() => { setPlayerStatsOpen(false); fetchMatch() }} />}
          {canInputStats && (
            <AddShotDialog
              open={shotOpen}
              onOpenChange={setShotOpen}
              matchId={match.id}
              players={match.playerMatchStats.map(s => ({ id: s.playerId, ...s.player }))}
              onSaved={() => { fetchShots(); fetchMatch() }}
            />
          )}
        </>
      )}
    </div>
  )
}
