import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { validatePhone } from '@/lib/phone'
import { partnerApi } from '@/services/partner.service'
import type { Partner, PartnerType, CreatePartnerDto, CreatePartnerContractDto } from '@/types/partner'
import { PARTNER_TYPE_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_STYLE } from '@/types/partner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'

interface CreatePartnerDialogProps {
  open: boolean
  type: PartnerType
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

function CreatePartnerDialog({ open, type, onOpenChange, onSaved }: CreatePartnerDialogProps) {
  const { t } = useTranslation('admin')
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setCountry(''); setWebsite(''); setAddress(''); setPhone('') }

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('partnersPage.nameRequired')); return }
    const phoneError = validatePhone(phone || null)
    if (phoneError) { toast.error(phoneError); return }
    setSaving(true)
    try {
      const dto: CreatePartnerDto = {
        type,
        name: name.trim(),
        ...(country && { country }),
        ...(website && { website }),
        ...(address && { address }),
        ...(phone && { phone }),
      }
      await partnerApi.create(dto)
      toast.success(t('partnersPage.registerSuccess', { type: PARTNER_TYPE_LABEL[type] }))
      reset()
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error(t('partnersPage.registerFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('partnersPage.addButton', { type: PARTNER_TYPE_LABEL[type] })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>{t('partnersPage.nameLabel')}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {type === 'MANUFACTURER' && (
            <>
              <div><Label>{t('partnersPage.countryLabel')}</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
              <div><Label>{t('partnersPage.websiteLabel')}</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
            </>
          )}
          {type === 'HOSPITAL' && (
            <>
              <div><Label>{t('partnersPage.addressLabel')}</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <div><Label>{t('partnersPage.phoneLabel')}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('partnersPage.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('partnersPage.saving') : t('partnersPage.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddContractDialog({ partner, open, onOpenChange, onSaved }: {
  partner: Partner; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sponsorshipFee, setSponsorshipFee] = useState('')
  const [discountRate, setDiscountRate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!startDate || !endDate) { toast.error(t('partnersPage.contractDialog.dateRequired')); return }
    setSaving(true)
    try {
      const dto: CreatePartnerContractDto = {
        startDate,
        endDate,
        ...(sponsorshipFee && { sponsorshipFee: Number(sponsorshipFee) }),
        ...(discountRate && { discountRate: Number(discountRate) }),
        ...(notes && { notes }),
      }
      await partnerApi.createContract(partner.id, dto)
      toast.success(t('partnersPage.contractDialog.saved'))
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error(t('partnersPage.contractDialog.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('partnersPage.contractDialog.title', { name: partner.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('partnersPage.contractDialog.startDateLabel')}</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div><Label>{t('partnersPage.contractDialog.endDateLabel')}</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div><Label>{t('partnersPage.contractDialog.sponsorshipLabel')}</Label><Input type="text" inputMode="numeric" value={sponsorshipFee ? Number(sponsorshipFee).toLocaleString('ko-KR') : ''} onChange={(e) => setSponsorshipFee(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          <div><Label>{t('partnersPage.contractDialog.discountLabel')}</Label><Input type="number" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} /></div>
          <div><Label>{t('partnersPage.contractDialog.notesLabel')}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('partnersPage.contractDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('partnersPage.contractDialog.saving') : t('partnersPage.contractDialog.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PartnerRow({ partner, isAdmin, onContractAdded }: {
  partner: Partner; isAdmin: boolean; onContractAdded: () => void
}) {
  const { t } = useTranslation('admin')
  const [expanded, setExpanded] = useState(false)
  const [addContractOpen, setAddContractOpen] = useState(false)

  const latestContract = partner.contracts?.[0]

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="font-medium">{partner.name}</TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {partner.type === 'MANUFACTURER' ? partner.country : partner.address}
        </TableCell>
        <TableCell>
          {latestContract ? (
            <Badge variant="outline" className={CONTRACT_STATUS_STYLE[latestContract.status]}>
              {CONTRACT_STATUS_LABEL[latestContract.status]}
            </Badge>
          ) : <span className="text-muted-foreground text-xs">{t('partnersPage.noContract')}</span>}
        </TableCell>
        <TableCell className="text-right">
          {expanded ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-semibold">{t('partnersPage.contractHistory')}</p>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setAddContractOpen(true) }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t('partnersPage.addContract')}
                </Button>
              )}
            </div>
            {!partner.contracts?.length ? (
              <p className="text-sm text-muted-foreground">{t('partnersPage.noContracts')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pb-1">{t('partnersPage.contractPeriod')}</th>
                    <th className="text-left pb-1">{t('partnersPage.contractSponsorship')}</th>
                    <th className="text-left pb-1">{t('partnersPage.contractDiscount')}</th>
                    <th className="text-left pb-1">{t('partnersPage.contractStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {partner.contracts?.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-1">{c.startDate.slice(0, 10)} ~ {c.endDate.slice(0, 10)}</td>
                      <td className="py-1">{c.sponsorshipFee != null ? `${c.sponsorshipFee.toLocaleString()}원` : '—'}</td>
                      <td className="py-1">{c.discountRate != null ? `${c.discountRate}%` : '—'}</td>
                      <td className="py-1">
                        <Badge variant="outline" className={CONTRACT_STATUS_STYLE[c.status]}>
                          {CONTRACT_STATUS_LABEL[c.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AddContractDialog
              partner={partner}
              open={addContractOpen}
              onOpenChange={setAddContractOpen}
              onSaved={onContractAdded}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function PartnersPage() {
  const { t } = useTranslation('admin')
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'ADMIN'
  const [tab, setTab] = useState<PartnerType>('HOSPITAL')
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const load = () => {
    setLoading(true)
    partnerApi.list(tab).then(setPartners).catch(() => toast.error(t('partnersPage.loadFailed'))).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tab])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('partnersPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('partnersPage.description')}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t('partnersPage.addButton', { type: PARTNER_TYPE_LABEL[tab] })}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PartnerType)}>
          <TabsList className="mb-4">
            <TabsTrigger value="HOSPITAL">{t('partnersPage.hospital')}</TabsTrigger>
            <TabsTrigger value="MANUFACTURER">{t('partnersPage.manufacturer')}</TabsTrigger>
          </TabsList>

          {(['HOSPITAL', 'MANUFACTURER'] as PartnerType[]).map((tp) => (
            <TabsContent key={tp} value={tp}>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('partnersPage.colName')}</TableHead>
                      <TableHead>{t('partnersPage.colLocation')}</TableHead>
                      <TableHead>{t('partnersPage.colLatestContract')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t('partnersPage.noPartners', { type: PARTNER_TYPE_LABEL[tp] })}</TableCell></TableRow>
                    ) : (
                      partners.map((p) => (
                        <PartnerRow key={p.id} partner={p} isAdmin={isAdmin} onContractAdded={load} />
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <CreatePartnerDialog
        open={createOpen}
        type={tab}
        onOpenChange={setCreateOpen}
        onSaved={load}
      />
    </div>
  )
}
