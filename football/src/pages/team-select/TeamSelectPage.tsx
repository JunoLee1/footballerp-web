import { useEffect, useState } from 'react'
import { leagueApi } from '@/services/league.service'
import { clubApi } from '@/services/club.service'
import type { League, LeagueLevel } from '@/types/league'
import type { Club } from '@/types/team'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, Building2, Users, Trophy } from 'lucide-react'
import { LEAGUE_LEVEL_LABEL } from '@/types/league'

type Step = 'league' | 'club' | 'team'

const TEAM_TYPE_KO: Record<string, string> = {
  FIRST_TEAM: '1군',
  B_TEAM: 'B팀',
  YOUTH: '유소년',
}

type ClubSummary = { id: number; name: string; isLite?: boolean }

export function TeamSelectPage() {
  const [step, setStep] = useState<Step>('league')
  const [leagues, setLeagues] = useState<League[]>([])
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null)
  const [, setSelectedClubId] = useState<number | null>(null)
  const [selectedClubName, setSelectedClubName] = useState<string>('')
  const [clubs, setClubs] = useState<ClubSummary[]>([])
  const [clubDetail, setClubDetail] = useState<Club | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubLoading, setClubLoading] = useState(false)

  useEffect(() => {
    leagueApi.list()
      .then((data) => setLeagues(data.filter((l) => l.isActive)))
      .catch(() => toast.error('리그 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const handleLeagueSelect = (league: League | null) => {
    setSelectedLeague(league)
    if (league) {
      setClubs(league.clubs.map((c) => ({ id: c.clubId, name: c.club.name })))
      setStep('club')
    } else {
      setClubLoading(true)
      setStep('club')
      clubApi.list()
        .then((data) => setClubs(data.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, isLite: c.isLite }))))
        .catch(() => toast.error('구단 목록을 불러오지 못했습니다.'))
        .finally(() => setClubLoading(false))
    }
  }

  const handleClubSelect = (clubId: number, clubName: string) => {
    setSelectedClubId(clubId)
    setSelectedClubName(clubName)
    setClubDetail(null)
    setClubLoading(true)
    setStep('team')
    clubApi.getById(clubId)
      .then((data) => setClubDetail(data))
      .catch(() => toast.error('구단 정보를 불러오지 못했습니다.'))
      .finally(() => setClubLoading(false))
  }

  const handleTeamSelect = (team: { id: number; name: string; type: string }) => {
    localStorage.setItem('superAdminTeamId', String(team.id))
    localStorage.setItem('superAdminClubName', selectedClubName)
    localStorage.setItem('superAdminTeamName', team.name)
    localStorage.setItem('superAdminTeamType', team.type)
    window.location.href = '/dashboard'
  }

  const goBack = () => {
    if (step === 'team') {
      setStep('club')
      setClubDetail(null)
      setSelectedClubId(null)
    } else if (step === 'club') {
      setStep('league')
      setClubs([])
      setSelectedLeague(null)
    }
  }

  const stepMeta = {
    league: { title: '리그 / 대회 선택', desc: '관리할 리그 또는 대회를 선택하세요.' },
    club: { title: '구단 선택', desc: '관리할 구단을 선택하세요.' },
    team: { title: '운영팀 선택', desc: '관리할 팀을 선택하세요.' },
  }

  const isLoading = loading || clubLoading
  const activeTeams = clubDetail?.teams.filter((t) => t.isActive) ?? []

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-5 px-4">

        {/* Header */}
        <div className="flex items-start gap-2">
          {step !== 'league' && (
            <button
              type="button"
              onClick={goBack}
              className="mt-0.5 p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{stepMeta[step].title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{stepMeta[step].desc}</p>
          </div>
        </div>

        {/* Breadcrumb */}
        {step !== 'league' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{selectedLeague ? selectedLeague.name : '전체 구단'}</span>
            {step === 'team' && (
              <>
                <span className="text-muted-foreground/40">›</span>
                <span>{selectedClubName}</span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">

            {/* Step 1: League */}
            {step === 'league' && (
              <>
                {leagues.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    등록된 리그가 없습니다.
                  </div>
                ) : (
                  leagues.map((league) => (
                    <Button
                      key={league.id}
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 text-left"
                      onClick={() => handleLeagueSelect(league)}
                    >
                      <Trophy className="w-5 h-5 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-sm">{league.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {LEAGUE_LEVEL_LABEL[league.level as LeagueLevel]} · {league.year}년 · 구단 {league.clubs.length}개
                        </span>
                      </div>
                    </Button>
                  ))
                )}
                <Button
                  variant="ghost"
                  className="w-full h-10 text-sm text-muted-foreground"
                  onClick={() => handleLeagueSelect(null)}
                >
                  리그 무관 — 전체 구단 보기
                </Button>
              </>
            )}

            {/* Step 2: Club */}
            {step === 'club' && (
              <>
                {clubs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    이 리그에 소속된 구단이 없습니다.
                  </div>
                ) : (
                  clubs.map((club) => (
                    <Button
                      key={club.id}
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 text-left"
                      onClick={() => handleClubSelect(club.id, club.name)}
                    >
                      <Building2 className="w-5 h-5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-sm">{club.name}</span>
                      {club.isLite && (
                        <span className="ml-auto text-xs text-muted-foreground border rounded px-1.5 py-0.5">Lite</span>
                      )}
                    </Button>
                  ))
                )}
              </>
            )}

            {/* Step 3: Team */}
            {step === 'team' && (
              <>
                {activeTeams.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    활성 팀이 없습니다.
                  </div>
                ) : (
                  activeTeams.map((team) => (
                    <Button
                      key={team.id}
                      variant="outline"
                      className="w-full h-14 justify-start gap-3 text-left"
                      onClick={() => handleTeamSelect(team)}
                    >
                      <Users className="w-5 h-5 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-sm">{team.name}</span>
                        <span className="text-xs text-muted-foreground">{TEAM_TYPE_KO[team.type] ?? team.type}</span>
                      </div>
                    </Button>
                  ))
                )}
              </>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
