import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { injuryApi } from '@/services/injury.service'
import { partnerApi } from '@/services/partner.service'
import type { Injury, InjuryStatus, InjuryCause, HospitalType, BodyPart } from '@/types/injury'
import type { Partner } from '@/types/partner'
import {
  INJURY_STATUS_STYLE,
  BODY_PARTS,
} from '@/types/injury'
import { usePlayers } from '@/hooks/usePlayers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'

const STATUSES: InjuryStatus[] = [
  'OCCURRED', 'DIAGNOSED', 'REHABILITATING', 'READY_TO_RETURN', 'RETURNED',
]
const CAUSES: InjuryCause[] = ['TRAINING', 'MATCH', 'OTHER']

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR')
}

function isReturningImminent(inj: Injury): boolean {
  if (inj.status === 'RETURNED' || !inj.expectedReturnDate) return false
  const returnDateStr = inj.expectedReturnDate.slice(0, 10)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return returnDateStr <= cutoffStr
}

interface CreateInjuryDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSaved: () => void
}

function CreateInjuryDialog({ open, onOpenChange, playerId, onSaved }: CreateInjuryDialogProps) {
  const { t } = useTranslation('medical')
  const [bodyPart, setBodyPart] = useState<BodyPart | ''>('')
  const [cause, setCause] = useState<InjuryCause>('TRAINING')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [hospitalType, setHospitalType] = useState<HospitalType | ''>('')
  const [hospitalId, setHospitalId] = useState<string>('')
  const [customHospitalName, setCustomHospitalName] = useState('')
  const [hospitals, setHospitals] = useState<Partner[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) partnerApi.list('HOSPITAL').then(setHospitals).catch(() => null)
  }, [open])

  const handleSave = async () => {
    if (!bodyPart) { toast.error(t('injuries.createDialog.requiredBodyPart')); return }
    if (hospitalType === 'ACCREDITED' && !hospitalId) { toast.error(t('injuries.createDialog.requiredAccredited')); return }
    if (hospitalType === 'GENERAL' && !customHospitalName.trim()) { toast.error(t('injuries.createDialog.requiredCustom')); return }
    setSaving(true)
    try {
      await injuryApi.create({
        playerId,
        bodyPart: bodyPart as BodyPart,
        cause,
        ...(expectedReturn && { expectedReturnDate: expectedReturn }),
        ...(hospitalType && { hospitalType }),
        ...(hospitalType === 'ACCREDITED' && hospitalId && { partnerId: Number(hospitalId) }),
        ...(hospitalType === 'GENERAL' && customHospitalName.trim() && { customHospitalName: customHospitalName.trim() }),
      })
      toast.success(t('injuries.createDialog.saved'))
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('injuries.createDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('injuries.createDialog.title')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t('injuries.createDialog.bodyPart')}</Label>
            <Select value={bodyPart} onValueChange={(v) => setBodyPart(v as BodyPart)}>
              <SelectTrigger>
                {bodyPart ? <span>{t(`injuries.bodyPart.${bodyPart}`)}</span> : <span className="text-muted-foreground">{t('injuries.createDialog.bodyPartPlaceholder')}</span>}
              </SelectTrigger>
              <SelectContent>
                {BODY_PARTS.map((bp) => (
                  <SelectItem key={bp} value={bp}>{t(`injuries.bodyPart.${bp}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('injuries.createDialog.cause')}</Label>
            <Select value={cause} onValueChange={(v) => setCause(v as InjuryCause)}>
              <SelectTrigger><span>{t(`injuries.cause.${cause}`)}</span></SelectTrigger>
              <SelectContent>
                {CAUSES.map((c) => <SelectItem key={c} value={c}>{t(`injuries.cause.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('injuries.createDialog.expectedReturn')}</Label>
            <Input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('injuries.createDialog.hospital')}</Label>
            <Select value={hospitalType} onValueChange={(v) => { setHospitalType(v as HospitalType | ''); setHospitalId(''); setCustomHospitalName('') }}>
              <SelectTrigger>
                {hospitalType ? <span>{t(`injuries.hospitalType.${hospitalType}`)}</span> : <span className="text-muted-foreground">{t('injuries.createDialog.hospitalNone')}</span>}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('injuries.createDialog.hospitalNone')}</SelectItem>
                {(['ACCREDITED', 'GENERAL'] as HospitalType[]).map((ht) => (
                  <SelectItem key={ht} value={ht}>{t(`injuries.hospitalType.${ht}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hospitalType === 'ACCREDITED' && (
            <div className="space-y-1.5">
              <Label>{t('injuries.createDialog.accreditedHospital')}</Label>
              <Select value={hospitalId} onValueChange={setHospitalId}>
                <SelectTrigger>
                  {hospitalId
                    ? <span>{hospitals.find((h) => String(h.id) === hospitalId)?.name ?? t('injuries.createDialog.hospitalPlaceholder')}</span>
                    : <span className="text-muted-foreground">{t('injuries.createDialog.hospitalPlaceholder')}</span>}
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {hospitalType === 'GENERAL' && (
            <div className="space-y-1.5">
              <Label>{t('injuries.createDialog.customHospital')}</Label>
              <Input placeholder={t('injuries.createDialog.customHospitalPlaceholder')} value={customHospitalName} onChange={(e) => setCustomHospitalName(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('injuries.createDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('injuries.createDialog.saving') : t('injuries.createDialog.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InjuriesPage() {
  const { t } = useTranslation('medical')
  const { user } = useCurrentUser()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { players, loading: playersLoading } = usePlayers()
  const selectedPlayerId = searchParams.get('p') ?? ''
  const [injuries, setInjuries] = useState<Injury[]>([])
  const [loadingInjuries, setLoadingInjuries] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const isMedical =
    user?.role === 'ADMIN' ||
    user?.coachingRole === 'MEDICAL' ||
    user?.coachingRole === 'MEDICAL_DIRECTOR'
  const canWrite = isMedical

  const fetchInjuries = (pid: string) => {
    setLoadingInjuries(true)
    injuryApi
      .byPlayer(pid)
      .then(setInjuries)
      .catch(() => toast.error(t('injuries.loadFailed')))
      .finally(() => setLoadingInjuries(false))
  }

  useEffect(() => {
    if (selectedPlayerId) fetchInjuries(selectedPlayerId)
  }, [selectedPlayerId])

  const handlePlayerChange = (pid: string) => {
    setSearchParams(pid ? { p: pid } : {}, { replace: true })
    setInjuries([])
  }

  const handleStatusChange = async (injuryId: string, status: InjuryStatus) => {
    try {
      await injuryApi.updateStatus(injuryId, status)
      toast.success(t('injuries.statusChanged'))
      fetchInjuries(selectedPlayerId)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('injuries.statusChangeFailed'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('injuries.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('injuries.subtitle')}</p>
        </div>
      </div>

      <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0 bg-muted/30">
        {playersLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : (
          <Select value={selectedPlayerId} onValueChange={(v) => v && handlePlayerChange(v)}>
            <SelectTrigger className="w-56 h-8 text-sm bg-background">
              {selectedPlayerId
                ? <span className="truncate">{players.find(p => p.id === selectedPlayerId)?.playerName ?? selectedPlayerId}</span>
                : <span className="text-muted-foreground">{t('injuries.selectPlayerPlaceholder')}</span>}
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => <SelectItem key={p.id} value={p.id}>{p.playerName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {canWrite && selectedPlayerId && (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />{t('injuries.addBtn')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!selectedPlayerId ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">{t('injuries.selectPlayer')}</div>
        ) : loadingInjuries ? (
          <div className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : injuries.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">{t('injuries.noHistory')}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('injuries.col.bodyPart')}</TableHead>
                <TableHead>{t('injuries.col.cause')}</TableHead>
                <TableHead>{t('injuries.col.occurredAt')}</TableHead>
                <TableHead>{t('injuries.col.expectedReturn')}</TableHead>
                <TableHead>{t('injuries.col.status')}</TableHead>
                {canWrite && <TableHead className="w-36">{t('injuries.col.changeStatus')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {injuries.map((inj) => (
                <TableRow key={inj.id} className="cursor-pointer" onClick={() => navigate(`/injuries/${inj.id}`)}>
                  <TableCell className="font-medium">{t(`injuries.bodyPart.${inj.bodyPart}`)}</TableCell>
                  <TableCell>{t(`injuries.cause.${inj.cause}`)}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(inj.occurredAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {inj.expectedReturnDate ? formatDate(inj.expectedReturnDate) : '—'}
                      {isReturningImminent(inj) && (
                        <span className="inline-flex items-center rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-600">
                          {t('injuries.returningImminent')}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${INJURY_STATUS_STYLE[inj.status]}`}>
                      {t(`injuries.status.${inj.status}`)}
                    </span>
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <Select
                        value={inj.status}
                        onValueChange={(v) => handleStatusChange(inj.id, v as InjuryStatus)}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <span>{t(`injuries.status.${inj.status}`)}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{t(`injuries.status.${s}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {canWrite && selectedPlayerId && (
        <CreateInjuryDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          playerId={selectedPlayerId}
          onSaved={() => { setCreateOpen(false); fetchInjuries(selectedPlayerId) }}
        />
      )}

    </div>
  )
}
