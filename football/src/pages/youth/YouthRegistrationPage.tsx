import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { youthRegistrationApi } from '@/services/youthRegistration.service'
import { guardianApi } from '@/services/guardian.service'
import { toast } from 'sonner'
import type { YouthRegistration, YouthRegistrationStatus } from '@/types/youth-registration'
import { YouthRegistrationFormDialog } from './YouthRegistrationFormDialog'

const PAGE_SIZE = 10

const STATUS_VARIANT: Record<YouthRegistrationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  GUARDIAN_APPROVED: 'secondary',
  CONTRACTED: 'default',
  REJECTED: 'destructive',
}

export default function YouthRegistrationPage() {
  const { t } = useTranslation('youth')
  const [registrations, setRegistrations] = useState<YouthRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const data = await youthRegistrationApi.getAll()
      setRegistrations(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const uniqueTeams = useMemo(
    () => [...new Map(registrations.map(r => [r.teamId, r.team])).values()],
    [registrations],
  )

  const filtered = useMemo(() => {
    let list = registrations
    if (search) list = list.filter(r => r.playerName.toLowerCase().includes(search.toLowerCase()))
    if (teamFilter !== 'ALL') list = list.filter(r => String(r.teamId) === teamFilter)
    return list
  }, [registrations, search, teamFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  )

  const handleFilterChange = (value: string) => {
    setTeamFilter(value)
    setPage(1)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('registrationPage.title')}</h1>
        <Button onClick={() => setDialogOpen(true)}>{t('registrationPage.addButton')}</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder={t('registrationPage.searchPlaceholder')}
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={teamFilter} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('registrationPage.allTeams')}</SelectItem>
            {uniqueTeams.map(team => (
              <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t('registrationPage.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">{t('registrationPage.noData')}</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">{t('registrationPage.col.player')}</th>
              <th className="py-2 pr-4">{t('registrationPage.col.team')}</th>
              <th className="py-2 pr-4">{t('registrationPage.col.guardian')}</th>
              <th className="py-2 pr-4">{t('registrationPage.col.jerseyNumber')}</th>
              <th className="py-2">{t('registrationPage.col.status')}</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                <td className="py-2 pr-4 font-medium">{r.playerName}</td>
                <td className="py-2 pr-4">{r.team.name}</td>
                <td className="py-2 pr-4">{r.guardian?.email ?? '-'}</td>
                <td className="py-2 pr-4">{r.preferredJerseyNumber ?? '-'}</td>
                <td className="py-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{t(`registrationPage.status.${r.status}`)}</Badge>
                </td>
                <td className="py-2">
                  {(r.guardian === null || r.guardian === undefined) && (
                    <button
                      className="text-xs text-blue-500 underline"
                      onClick={() => void (async () => {
                        try {
                          const result = await guardianApi.issueInviteCode(String(r.id))
                          toast.success(`초대코드: ${result.code} (유효기간: ${new Date(result.expiresAt).toLocaleDateString('ko-KR')})`)
                        } catch {
                          toast.error('초대코드 발급에 실패했습니다.')
                        }
                      })()}
                    >
                      초대코드
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums px-1">{safePage} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <YouthRegistrationFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={load}
        teams={uniqueTeams}
      />
    </div>
  )
}
