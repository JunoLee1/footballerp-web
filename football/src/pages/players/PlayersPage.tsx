import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { getCountryName } from '@/lib/countryName'
import { playerApi } from '@/services/player.service'
import type {
  Player,
  PlayerStatus,
  PlayerLevel,
  Position,
  PositionZone,
  PlayerListQuery,
} from '@/types/player'
import {
  POSITION_ABBR,
  POSITION_ZONE,
  STATUS_LABEL,
  LEVEL_LABEL,
} from '@/types/player'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PlayerFormDialog } from './PlayerFormDialog'

const ZONE_STYLE: Record<PositionZone, string> = {
  GK: 'bg-amber-100 text-amber-800 border-amber-200',
  DEF: 'bg-blue-100 text-blue-800 border-blue-200',
  MID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FWD: 'bg-rose-100 text-rose-800 border-rose-200',
}

const STATUS_STYLE: Record<PlayerStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  ON_LOAN: 'bg-purple-100 text-purple-800 border-purple-200',
  RELEASED: 'bg-gray-100 text-gray-600 border-gray-200',
  RETIRED: 'bg-gray-100 text-gray-500 border-gray-200',
}

function calcAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function PlayersPage() {
  const { t, i18n } = useTranslation('player')
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PlayerStatus | 'ALL'>('ALL')
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL')
  const [levelFilter, setLevelFilter] = useState<PlayerLevel | 'ALL'>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  const canWrite = user?.role === 'ADMIN' || user?.role === 'FRONT_OFFICE'
  const canSeeMarketValue =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && user.frontOfficeRole === 'TD')

  const fetchPlayers = () => {
    setLoading(true)
    const query: PlayerListQuery = { excludeYouth: true }
    if (statusFilter !== 'ALL') query.status = statusFilter
    if (positionFilter !== 'ALL') query.position = positionFilter
    if (levelFilter !== 'ALL') query.level = levelFilter
    playerApi
      .list(query)
      .then(setPlayers)
      .catch(() => toast.error(t('playersPage.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPlayers()
    setPage(1)
  }, [statusFilter, positionFilter, levelFilter])

  useEffect(() => {
    setPage(1)
  }, [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return players
    const q = search.toLowerCase()
    return players.filter(
      (p) =>
        p.playerName.toLowerCase().includes(q) ||
        p.nationality.name.toLowerCase().includes(q) ||
        p.nationality.code.toLowerCase().includes(q),
    )
  }, [players, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const activeCount = players.filter((p) => p.status === 'ACTIVE').length

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('playersPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('playersPage.totalCount', { count: players.length })}
            {activeCount < players.length && ` · ${t('playersPage.activeCount', { count: activeCount })}`}
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('playersPage.addPlayer')}
          </Button>
        )}
      </div>

      <div className="border-b px-6 py-3 flex flex-wrap items-center gap-3 shrink-0 bg-muted/30">
        <div className="relative flex-1 min-w-48 max-w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('playersPage.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-background"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PlayerStatus | 'ALL')}
          >
            <SelectTrigger className="h-8 text-sm w-28 bg-background">
              <span>{statusFilter === 'ALL' ? t('playersPage.statusAll') : t(`status.${statusFilter}`)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('playersPage.statusAll')}</SelectItem>
              {(Object.keys(STATUS_LABEL) as PlayerStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={positionFilter}
            onValueChange={(v) => setPositionFilter(v as Position | 'ALL')}
          >
            <SelectTrigger className="h-8 text-sm w-36 bg-background">
              <span>
                {positionFilter === 'ALL'
                  ? t('playersPage.positionAll')
                  : `${POSITION_ABBR[positionFilter]} ${t(`position.${positionFilter}`)}`}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('playersPage.positionAll')}</SelectItem>
              {(Object.keys(POSITION_ABBR) as Position[]).map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="font-mono text-xs">{POSITION_ABBR[p]}</span>
                  <span className="ml-2 text-muted-foreground">{t(`position.${p}`)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={levelFilter}
            onValueChange={(v) => setLevelFilter(v as PlayerLevel | 'ALL')}
          >
            <SelectTrigger className="h-8 text-sm w-28 bg-background">
              <span>{levelFilter === 'ALL' ? t('playersPage.levelAll') : t(`level.${levelFilter}`)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('playersPage.levelAll')}</SelectItem>
              {(Object.keys(LEVEL_LABEL) as PlayerLevel[])
                .filter((l) => l !== 'YOUTH')
                .map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`level.${l}`)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-sm">
              {search ? t('playersPage.noResults', { search }) : t('playersPage.noPlayers')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead>{t('playersPage.tableHeader.name')}</TableHead>
                <TableHead className="w-24">{t('playersPage.tableHeader.position')}</TableHead>
                <TableHead className="w-24">{t('playersPage.tableHeader.level')}</TableHead>
                <TableHead className="w-24">{t('playersPage.tableHeader.nationality')}</TableHead>
                <TableHead className="w-16 text-center">{t('playersPage.tableHeader.age')}</TableHead>
                <TableHead className="w-20 text-center">{t('playersPage.tableHeader.height')}</TableHead>
                <TableHead className="w-24">{t('playersPage.tableHeader.status')}</TableHead>
                {canSeeMarketValue && <TableHead className="w-28 text-right">{t('playersPage.tableHeader.marketValue')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((player) => {
                const zone = POSITION_ZONE[player.position]
                return (
                  <TableRow
                    key={player.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/players/${player.id}`)}
                  >
                    <TableCell className="py-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] font-medium">
                          {player.playerName.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium py-2">{player.playerName}</TableCell>
                    <TableCell className="py-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-semibold ${ZONE_STYLE[zone]}`}
                      >
                        {POSITION_ABBR[player.position]}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-sm text-muted-foreground">
                        {t(`level.${player.level}`)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-sm">{getCountryName(player.nationality.code, i18n.language)}</span>
                    </TableCell>
                    <TableCell className="py-2 text-center tabular-nums text-sm">
                      {calcAge(player.dateOfBirth)}
                    </TableCell>
                    <TableCell className="py-2 text-center tabular-nums text-sm text-muted-foreground">
                      {player.height}cm
                    </TableCell>
                    <TableCell className="py-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLE[player.status]}`}
                      >
                        {t(`status.${player.status}`)}
                      </span>
                    </TableCell>
                    {canSeeMarketValue && (
                      <TableCell className="py-2 text-right tabular-nums text-sm">
                        {player.currentMarketValue != null
                          ? player.currentMarketValue >= 100_000_000
                            ? `${(player.currentMarketValue / 100_000_000).toFixed(1)}억`
                            : `${(player.currentMarketValue / 10_000).toFixed(0)}만`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="border-t px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {t('playersPage.pagination', {
              from: (safePage - 1) * PAGE_SIZE + 1,
              to: Math.min(safePage * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums px-1">{safePage} / {totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {canWrite && (
        <PlayerFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSaved={() => {
            setCreateOpen(false)
            fetchPlayers()
          }}
        />
      )}
    </div>
  )
}
