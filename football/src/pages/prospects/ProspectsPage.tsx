import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { prospectApi } from '@/services/prospect.service'
import { api } from '@/services/api'
import type {
  Prospect, ProspectStatus, CreateProspectDto, SignProspectDto,
  VisaEligibility, WorkPermitStatus,
} from '@/types/prospect'
import {
  STATUS_STYLE, VISA_ELIGIBILITY_LABEL,
} from '@/types/prospect'
import type { Position, PlayStyle } from '@/types/player'
import { POSITION_LABEL, PLAY_STYLE_LABEL, POSITION_PLAY_STYLES } from '@/types/player'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus } from 'lucide-react'
import { ProspectDetailSheet } from './ProspectDetailSheet'

interface Country { id: number; name: string }

const STATUSES: (ProspectStatus | 'ALL')[] = ['ALL', 'LONGLIST', 'PRE_SHORTLIST', 'SHORTLIST', 'ACTIVE', 'MEDICAL_TEST', 'CONTRACT_PENDING', 'SIGNED', 'ARCHIVED']
const POSITIONS: Position[] = [
  'GOALKEEPER', 'STRIKER', 'SHADOW_STRIKER', 'WINGER',
  'CENTRAL_ATTACK_MIDFIELDER', 'RIGHT_ATTACK_MIDFIELDER', 'LEFT_ATTACK_MIDFIELDER',
  'CENTRAL_DEFENSIVE_MIDFIELDER', 'LEFT_DEFENSIVE_MIDFIELDER', 'RIGHT_DEFENSIVE_MIDFIELDER',
  'CENTER_BACK', 'LEFT_WING_BACK', 'LEFT_FULL_BACK', 'RIGHT_WING_BACK', 'RIGHT_FULL_BACK',
]
const VISA_OPTIONS: VisaEligibility[] = ['NOT_REQUIRED', 'CONFIRMED', 'UNCERTAIN']
const WORK_PERMIT_OPTIONS: WorkPermitStatus[] = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── CreateProspectDialog ───────────────────────────────────────────────────

interface CreateProspectDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

function CreateProspectDialog({ open, onOpenChange, onSaved }: CreateProspectDialogProps) {
  const { t } = useTranslation('contract')
  const [name, setName] = useState('')
  const [nationalityId, setNationalityId] = useState<string>('')
  const [position, setPosition] = useState<Position | ''>('')
  const [playStyle, setPlayStyle] = useState<PlayStyle | ''>('')
  const [currentTeam, setCurrentTeam] = useState('')
  const [notes, setNotes] = useState('')
  const [listStatus, setListStatus] = useState<'LONGLIST' | 'PRE_SHORTLIST'>('LONGLIST')
  const [visaRequired, setVisaRequired] = useState(false)
  const [visaEligibility, setVisaEligibility] = useState<VisaEligibility>('NOT_REQUIRED')
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState<Country[]>([])

  useEffect(() => {
    if (!open) return
    api.get<{ data: Country[] } | Country[]>('/countries')
      .then(res => setCountries(Array.isArray(res) ? res : res.data))
      .catch(() => null)
  }, [open])
  const [duplicates, setDuplicates] = useState<{ id: number; name: string; currentTeam: string | null; status: string }[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const doCreate = async () => {
    if (!nationalityId) { toast.error(t('prospects.form.required')); return }
    setSaving(true)
    try {
      const dto: CreateProspectDto = {
        name: name.trim(),
        nationalityId: Number(nationalityId),
        ...(position && { position }),
        ...(currentTeam.trim() && { currentTeam: currentTeam.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
        status: listStatus,
        ...(playStyle && { playStyle }),
      }
      const prospect = await prospectApi.create(dto)
      if (visaRequired) {
        await prospectApi.update(prospect.id, { visaRequired: true, visaEligibility })
      }
      toast.success(t('prospects.form.createSuccess'))
      setConfirmOpen(false)
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('prospects.form.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('prospects.form.required')); return }
    const { prospects: found, squadPlayers } = await prospectApi
      .checkDuplicate(name.trim(), currentTeam.trim() || undefined)
      .catch(() => ({ prospects: [], squadPlayers: [] }))
    if (squadPlayers.length > 0) {
      toast.error(`${name.trim()}은(는) 이미 우리 팀 스쿼드에 등록된 선수입니다.`)
      return
    }
    if (found.length > 0) {
      setDuplicates(found)
      setConfirmOpen(true)
      return
    }
    await doCreate()
  }

  return (
    <>
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>중복 선수 감지</DialogTitle>
          <DialogDescription>
            동일한 이름의 후보가 이미 리스트에 있습니다. 그래도 추가하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 py-2">
          {duplicates.map(d => (
            <div key={d.id} className="text-sm border rounded px-3 py-2 flex justify-between">
              <span className="font-medium">{d.name}</span>
              <span className="text-muted-foreground">{d.currentTeam ?? '소속 미상'} · {d.status}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button variant="destructive" onClick={doCreate} disabled={saving}>
            {saving ? '저장 중...' : '그래도 추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('prospects.form.createTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>리스트 *</Label>
            <Select value={listStatus} onValueChange={(v) => setListStatus(v as 'LONGLIST' | 'PRE_SHORTLIST')}>
              <SelectTrigger>
                <SelectValue>
                  {listStatus === 'LONGLIST' ? '롱리스트' : '적극 검토 중'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONGLIST">롱리스트</SelectItem>
                <SelectItem value="PRE_SHORTLIST">적극 검토 중</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('prospects.form.nameLabel')} *</Label>
            <Input placeholder="선수 이름" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('prospects.form.nationalityLabel')} *</Label>
            <Select value={nationalityId} onValueChange={setNationalityId}>
              <SelectTrigger>
                <SelectValue placeholder="국적 선택" />
              </SelectTrigger>
              <SelectContent>
                {countries.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('prospects.form.positionLabel')}</Label>
            <Select value={position} onValueChange={(v) => { setPosition(v as Position); setPlayStyle('') }}>
              <SelectTrigger><SelectValue placeholder="포지션 선택" /></SelectTrigger>
              <SelectContent>
                {POSITIONS.map((pos) => <SelectItem key={pos} value={pos}>{POSITION_LABEL[pos]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {position && (
            <div className="space-y-1.5">
              <Label>플레이스타일</Label>
              <Select value={playStyle} onValueChange={(v) => setPlayStyle(v as PlayStyle)}>
                <SelectTrigger>
                  <SelectValue placeholder="선택">
                    {playStyle ? PLAY_STYLE_LABEL[playStyle as PlayStyle] : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {POSITION_PLAY_STYLES[position as Position].map(ps => (
                    <SelectItem key={ps} value={ps}>{PLAY_STYLE_LABEL[ps]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('prospects.form.currentTeamLabel')}</Label>
            <Input placeholder="예: FC 서울" value={currentTeam} onChange={(e) => setCurrentTeam(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('prospects.form.notesLabel')}</Label>
            <Textarea placeholder="스카우트 노트" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="visaRequired"
              checked={visaRequired}
              onCheckedChange={(v) => setVisaRequired(!!v)}
            />
            <Label htmlFor="visaRequired" className="cursor-pointer">{t('prospects.form.visaRequiredLabel')}</Label>
          </div>
          {visaRequired && (
            <div className="space-y-1.5 pl-6">
              <Label>{t('prospects.form.visaEligibilityLabel')}</Label>
              <Select value={visaEligibility} onValueChange={(v) => setVisaEligibility(v as VisaEligibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISA_OPTIONS.map((vo) => <SelectItem key={vo} value={vo}>{VISA_ELIGIBILITY_LABEL[vo]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('prospects.form.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !nationalityId}>{saving ? t('prospects.form.saving') : t('prospects.form.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ─── SignProspectDialog ─────────────────────────────────────────────────────

interface SignProspectDialogProps {
  prospect: Prospect
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

function SignProspectDialog({ prospect, open, onOpenChange, onSaved }: SignProspectDialogProps) {
  const { t } = useTranslation('contract')
  const [dob, setDob] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [foot, setFoot] = useState<'LEFT' | 'RIGHT' | 'BOTH'>('RIGHT')
  const [position, setPosition] = useState<Position | ''>(prospect.position ?? '')
  const [contractStart, setContractStart] = useState('')
  const [contractEnd, setContractEnd] = useState('')
  const [salary, setSalary] = useState('')
  const [workPermitStatus, setWorkPermitStatus] = useState<WorkPermitStatus>(
    prospect.visaRequired ? 'PENDING' : 'NOT_REQUIRED'
  )
  const [workPermitExpiry, setWorkPermitExpiry] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!dob || !height || !weight || !contractStart || !contractEnd || !salary) {
      toast.error(t('prospects.signForm.required'))
      return
    }
    setSaving(true)
    try {
      const dto: SignProspectDto = {
        dateOfBirth: dob,
        height: Number(height),
        weight: Number(weight),
        preferredFoot: foot,
        ...(position && { position }),
        contractStartDate: contractStart,
        contractEndDate: contractEnd,
        salary: Number(salary),
        workPermitStatus,
        ...(workPermitExpiry && { workPermitExpiry }),
      }
      await prospectApi.sign(prospect.id, dto)
      toast.success(t('prospects.signForm.success'))
      onSaved()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('FOREIGN_QUOTA_EXCEEDED')) {
        toast.error('외국인 선수 등록 쿼터를 초과했습니다.')
      } else {
        toast.error(err instanceof Error ? err.message : t('prospects.signForm.failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('prospects.signForm.title', { name: prospect.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">선수 등록 및 계약 정보를 입력하면 단일 트랜잭션으로 처리됩니다.</p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">선수 기본 정보</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.dobLabel')} *</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.heightLabel')} *</Label>
                <Input type="number" placeholder="183" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.weightLabel')} *</Label>
                <Input type="number" placeholder="78" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.footLabel')}</Label>
                <Select value={foot} onValueChange={(v) => setFoot(v as typeof foot)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RIGHT">오른발</SelectItem>
                    <SelectItem value="LEFT">왼발</SelectItem>
                    <SelectItem value="BOTH">양발</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.positionLabel')}</Label>
                <Select value={position} onValueChange={(v) => setPosition(v as Position)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((pos) => <SelectItem key={pos} value={pos}>{POSITION_LABEL[pos]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">계약 정보</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.contractStartLabel')} *</Label>
                <Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prospects.signForm.contractEndLabel')} *</Label>
                <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('prospects.signForm.salaryLabel')} *</Label>
              <Input type="text" inputMode="numeric" placeholder="500,000,000" value={salary ? Number(salary).toLocaleString('ko-KR') : ''} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </div>

          {prospect.visaRequired && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">노동허가 / 비자</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t('prospects.signForm.workPermitLabel')}</Label>
                  <Select value={workPermitStatus} onValueChange={(v) => setWorkPermitStatus(v as WorkPermitStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORK_PERMIT_OPTIONS.map((wp) => <SelectItem key={wp} value={wp}>{t(`prospects.workPermit.${wp}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('prospects.signForm.workPermitExpiryLabel')}</Label>
                  <Input type="date" value={workPermitExpiry} onChange={(e) => setWorkPermitExpiry(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('prospects.signForm.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('prospects.signForm.saving') : t('prospects.signForm.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── ProspectsPage ──────────────────────────────────────────────────────────

export function ProspectsPage() {
  const { t } = useTranslation(['contract', 'player'])
  const { user } = useCurrentUser()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'ALL'>('LONGLIST')
  const [position, setPosition] = useState<Position | ''>(
    (searchParams.get('position') as Position) ?? ''
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [signTarget, setSignTarget] = useState<Prospect | null>(null)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [shortlistCapacity, setShortlistCapacity] = useState<{ capacity: number; current: number } | null>(null)

  const fetchShortlistCapacity = () => {
    prospectApi.shortlistCapacity()
      .then(setShortlistCapacity)
      .catch(() => null)
  }

  const canWrite =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && (
      user.frontOfficeRole === 'SCOUT' ||
      user.frontOfficeRole === 'TD'
    ))
  const canSign =
    user?.role === 'ADMIN' ||
    user?.role === 'GM' ||
    (user?.role === 'FRONT_OFFICE' && (user.frontOfficeRole === 'CONTRACT_MANAGER' || user.frontOfficeRole === 'TD'))
  const canRead =
    user?.role === 'ADMIN' ||
    user?.role === 'FRONT_OFFICE' ||
    (user?.role === 'COACHING_STAFF' && user.coachingRole === 'HEAD_COACH')

  const fetchProspects = (status?: ProspectStatus) => {
    setLoading(true)
    prospectApi
      .list(status)
      .then(setProspects)
      .catch(() => toast.error(t('prospects.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const status = statusFilter === 'ALL' ? undefined : statusFilter
    void fetchProspects(status)
    fetchShortlistCapacity()
  }, [statusFilter])

  const handleTransition = async (id: number, status: ProspectStatus) => {
    if (status === 'SHORTLIST') {
      try {
        const gate = await prospectApi.acquisitionGateCheck(id)
        const warnings: string[] = []
        if (!gate.positionMatched) warnings.push('활성 수요조사에 해당 포지션 요청이 없습니다')
        if (gate.budgetWarning) warnings.push('예상 시가가 수요조사 예산 범위를 초과합니다')
        if (warnings.length > 0) {
          const confirmed = window.confirm(`주의:\n${warnings.join('\n')}\n\n그래도 쇼트리스트로 승격하시겠습니까?`)
          if (!confirmed) return
        }
      } catch {
        // gate check 실패해도 전환 시도는 진행
      }
    }

    try {
      await prospectApi.transition(id, status)
      toast.success('상태가 변경되었습니다')
      const s = statusFilter === 'ALL' ? undefined : statusFilter
      void fetchProspects(s)
      fetchShortlistCapacity()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('VIDEO_EVAL_REQUIRED')) {
        toast.error('비디오 평가 PASS 필요 — 평가 탭에서 먼저 평가를 완료해주세요')
      } else if (err instanceof Error && err.message.includes('SHORTLIST_FULL')) {
        toast.error('쇼트리스트 정원(5명)이 꽉 찼습니다')
      } else if (err instanceof Error && err.message.includes('VISA_ELIGIBILITY_UNCERTAIN')) {
        toast.error('비자 취득 가능성이 불확실합니다. visaEligibility를 CONFIRMED으로 변경 후 진행하세요.')
      } else {
        toast.error(err instanceof Error ? err.message : t('prospects.deleteFailed'))
      }
    }
  }

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        {t('prospects.noData')}
      </div>
    )
  }

  const renderActions = (p: Prospect) => {
    if (!canWrite && !canSign) return null
    switch (p.status) {
      case 'LONGLIST':
        return canWrite ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => handleTransition(p.id, 'PRE_SHORTLIST')}>{t('prospects.action.startReview')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
          </div>
        ) : null
      case 'PRE_SHORTLIST':
        return canWrite ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => handleTransition(p.id, 'SHORTLIST')}>{t('prospects.action.promoteShortlist')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
          </div>
        ) : null
      case 'SHORTLIST':
        return canWrite ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => handleTransition(p.id, 'ACTIVE')}>{t('prospects.action.startNegotiation')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
          </div>
        ) : null
      case 'ACTIVE':
        return canWrite ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => handleTransition(p.id, 'MEDICAL_TEST')}>{t('prospects.status.MEDICAL_TEST')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
          </div>
        ) : null
      case 'MEDICAL_TEST':
        return canWrite ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => handleTransition(p.id, 'CONTRACT_PENDING')}>{t('prospects.status.CONTRACT_PENDING')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
          </div>
        ) : null
      case 'CONTRACT_PENDING':
        return (
          <div className="flex gap-1">
            {canSign && (
              <Button size="sm" className="h-7 text-xs"
                onClick={() => setSignTarget(p)}>{t('prospects.signButton')}</Button>
            )}
            {canWrite && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                onClick={() => handleTransition(p.id, 'ARCHIVED')}>{t('prospects.deleteButton')}</Button>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('prospects.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('prospects.description')}</p>
          {shortlistCapacity && (
            <span className={`text-xs font-medium ${shortlistCapacity.current >= shortlistCapacity.capacity ? 'text-red-600' : 'text-muted-foreground'}`}>
              쇼트리스트 {shortlistCapacity.current}/{shortlistCapacity.capacity}
            </span>
          )}
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('prospects.addButton')}
          </Button>
        )}
      </div>

      <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0 bg-muted/30">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProspectStatus | 'ALL')}>
          <SelectTrigger className="w-40 h-8 text-sm bg-background">
            <SelectValue>
              {statusFilter === 'ALL' ? t('prospects.statusAll') : t(`prospects.status.${statusFilter}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {st === 'ALL' ? t('prospects.statusAll') : t(`prospects.status.${st}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={position || 'ALL'} onValueChange={(v) => setPosition(v === 'ALL' ? '' : v as Position)}>
          <SelectTrigger className="w-40 h-8 text-sm bg-background">
            <SelectValue>
              {position ? t(`player:position.${position}`) : t('player:positionAll')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('player:positionAll')}</SelectItem>
            {POSITIONS.map((pos) => (
              <SelectItem key={pos} value={pos}>{t(`player:position.${pos}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : prospects.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            {t('prospects.noData')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('prospects.col.name')}</TableHead>
                <TableHead className="w-24">{t('prospects.col.position')}</TableHead>
                <TableHead>{t('prospects.col.currentTeam')}</TableHead>
                <TableHead className="w-20">{t('prospects.col.nationality')}</TableHead>
                <TableHead className="w-28">{t('prospects.col.status')}</TableHead>
                <TableHead className="w-20">{t('prospects.col.visa')}</TableHead>
                <TableHead className="w-28 text-muted-foreground">등록일</TableHead>
                <TableHead className="w-28 text-muted-foreground">등록자</TableHead>
                {(canWrite || canSign) && <TableHead className="w-48" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(position ? prospects.filter((p) => p.position === position) : prospects).map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => { setSelectedProspect(p); setSheetOpen(true) }}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-sm">{p.position ? POSITION_LABEL[p.position] : '—'}</TableCell>
                  <TableCell className="text-sm">{p.currentTeam ?? '—'}</TableCell>
                  <TableCell className="text-sm">{p.nationality?.name ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLE[p.status]}`}>
                      {t(`prospects.status.${p.status}`)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.visaRequired && p.visaEligibility ? (
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${
                        p.visaEligibility === 'CONFIRMED' ? 'bg-green-50 text-green-700 border-green-200' :
                        p.visaEligibility === 'UNCERTAIN' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-gray-50 text-gray-500 border-gray-200'
                      }`}>
                        {t(`prospects.visaEligibility.${p.visaEligibility}`)}
                      </span>
                    ) : p.visaRequired ? (
                      <span className="text-xs text-muted-foreground">미확인</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(p.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.createdBy?.nickname ?? '—'}
                  </TableCell>
                  {(canWrite || canSign) && (
                    <TableCell onClick={(e) => e.stopPropagation()}>{renderActions(p)}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CreateProspectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false)
          const status = statusFilter === 'ALL' ? undefined : statusFilter
          void fetchProspects(status)
        }}
      />

      {signTarget && (
        <SignProspectDialog
          prospect={signTarget}
          open={!!signTarget}
          onOpenChange={(v) => { if (!v) setSignTarget(null) }}
          onSaved={() => {
            setSignTarget(null)
            const status = statusFilter === 'ALL' ? undefined : statusFilter
            void fetchProspects(status)
          }}
        />
      )}
      <ProspectDetailSheet
        prospect={selectedProspect}
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v)
          if (!v) {
            const s = statusFilter === 'ALL' ? undefined : statusFilter
            void fetchProspects(s)
          }
        }}
        canWrite={canWrite}
        onUpdated={(updated) => {
          setSelectedProspect(updated)
          setProspects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        }}
      />
    </div>
  )
}
