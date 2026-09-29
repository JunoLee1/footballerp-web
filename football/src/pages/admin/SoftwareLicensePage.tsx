import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { softwareLicenseApi, type SoftwareLicense, type CreateSoftwareLicenseDto } from '@/services/software-license.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const DAY = 86_400_000

type ExpiryTier = 'D-30' | 'D-60' | 'D-90' | 'EXPIRED' | null

function classifyExpiry(expiresAt: string | null, now: Date = new Date()): ExpiryTier {
  if (!expiresAt) return null
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  if (remaining < 0) return 'EXPIRED'
  if (remaining <= 30 * DAY) return 'D-30'
  if (remaining <= 60 * DAY) return 'D-60'
  if (remaining <= 90 * DAY) return 'D-90'
  return null
}

function ExpiryBadge({ tier }: { tier: ExpiryTier }) {
  if (!tier) return null
  const style: Record<Exclude<ExpiryTier, null>, string> = {
    'D-30': 'bg-red-100 text-red-800 border-red-200',
    'D-60': 'bg-orange-100 text-orange-800 border-orange-200',
    'D-90': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    EXPIRED: 'bg-gray-800 text-white border-gray-800',
  }
  const label: Record<Exclude<ExpiryTier, null>, string> = {
    'D-30': '만료 임박 (D-30)',
    'D-60': '만료 예정 (D-60)',
    'D-90': '만료 예정 (D-90)',
    EXPIRED: '만료됨',
  }
  return (
    <Badge variant="outline" className={`text-xs ${style[tier]}`}>
      {label[tier]}
    </Badge>
  )
}

function SeatUsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const isFull = used >= total
  const color = isFull ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function isAdminLike(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'GM'
}

function canManageLicense(role: string | undefined, frontOfficeRole: string | null | undefined): boolean {
  return isAdminLike(role) ||
    (role === 'FRONT_OFFICE' && frontOfficeRole === 'ASSET_MANAGER')
}

export function SoftwareLicensePage() {
  const { user } = useCurrentUser()
  const canManage = canManageLicense(user?.role, user?.frontOfficeRole)

  const [licenses, setLicenses] = useState<SoftwareLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<CreateSoftwareLicenseDto>({ name: '', vendor: '', totalSeats: 1 })
  const [acting, setActing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setLicenses(await softwareLicenseApi.list())
    } catch {
      toast.error('라이선스 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary = useMemo(() => {
    const now = new Date()
    let expired = 0
    let d30 = 0
    let d60 = 0
    let d90 = 0
    let totalSeats = 0
    let usedSeats = 0
    for (const lic of licenses) {
      totalSeats += lic.totalSeats
      usedSeats += lic.usedSeats
      const tier = classifyExpiry(lic.expiresAt, now)
      if (tier === 'EXPIRED') expired++
      else if (tier === 'D-30') d30++
      else if (tier === 'D-60') d60++
      else if (tier === 'D-90') d90++
    }
    const seatUsagePct = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0
    return { expired, d30, d60, d90, totalSeats, usedSeats, seatUsagePct }
  }, [licenses])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.vendor.trim() || form.totalSeats < 1) {
      toast.error('이름, 공급사, 시트 수를 입력해주세요')
      return
    }
    if (form.expiresAt) {
      const parsed = new Date(form.expiresAt)
      if (Number.isNaN(parsed.getTime())) {
        toast.error('만료일 형식이 올바르지 않습니다')
        return
      }
    }
    setActing(true)
    try {
      const created = await softwareLicenseApi.create(form)
      setLicenses(prev => [created, ...prev])
      setAddOpen(false)
      setForm({ name: '', vendor: '', totalSeats: 1 })
      toast.success('라이선스가 등록됐습니다')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '등록에 실패했습니다')
    } finally { setActing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">소프트웨어 라이선스</h1>
          <p className="text-sm text-muted-foreground mt-0.5">시트 사용률과 갱신 일정을 관리합니다.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />라이선스 등록
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {!loading && licenses.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="총 시트" value={`${summary.usedSeats} / ${summary.totalSeats}`} sub={`${summary.seatUsagePct}% 사용`} />
            <SummaryCard label="만료됨" value={summary.expired} tone={summary.expired > 0 ? 'danger' : 'neutral'} />
            <SummaryCard label="D-30" value={summary.d30} tone={summary.d30 > 0 ? 'danger' : 'neutral'} />
            <SummaryCard label="D-60" value={summary.d60} tone={summary.d60 > 0 ? 'warn' : 'neutral'} />
            <SummaryCard label="D-90" value={summary.d90} tone={summary.d90 > 0 ? 'warn' : 'neutral'} />
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : licenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">등록된 라이선스가 없습니다.</p>
        ) : (
          <div className="rounded border divide-y bg-white">
            {licenses.map(lic => {
              const tier = classifyExpiry(lic.expiresAt)
              const isFull = lic.usedSeats >= lic.totalSeats
              return (
                <div key={lic.id} className={`px-4 py-4 space-y-3 ${tier === 'EXPIRED' ? 'bg-gray-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{lic.name}</p>
                        {isFull && <Badge variant="destructive" className="text-xs">시트 소진</Badge>}
                        <ExpiryBadge tier={tier} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{lic.vendor}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${isFull ? 'text-red-600' : ''}`}>
                        {lic.usedSeats} / {lic.totalSeats}석
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lic.totalSeats > 0 ? Math.round((lic.usedSeats / lic.totalSeats) * 100) : 0}% 사용
                      </p>
                    </div>
                  </div>
                  <SeatUsageBar used={lic.usedSeats} total={lic.totalSeats} />
                  {(lic.expiresAt || lic.renewalCost != null) && (
                    <p className="text-xs text-muted-foreground">
                      {lic.expiresAt && `만료: ${new Date(lic.expiresAt).toLocaleDateString('ko-KR')}`}
                      {lic.expiresAt && lic.renewalCost != null && ' · '}
                      {lic.renewalCost != null && `갱신비 ${Number(lic.renewalCost).toLocaleString()}원`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>소프트웨어 라이선스 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>소프트웨어명 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: Adobe Creative Cloud" />
            </div>
            <div className="space-y-1">
              <Label>공급사 *</Label>
              <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="예: Adobe Inc." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>총 시트 수 *</Label>
                <Input type="number" min={1} value={form.totalSeats} onChange={e => setForm(f => ({ ...f, totalSeats: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>갱신 비용</Label>
                <Input type="number" placeholder="원" value={form.renewalCost ?? ''} onChange={e => setForm(f => ({ ...f, renewalCost: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>만료일</Label>
              <Input type="date" value={form.expiresAt ?? ''} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value || undefined }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={acting}>취소</Button>
            <Button onClick={handleAdd} disabled={acting}>{acting ? '등록 중...' : '등록'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'danger' | 'warn' | 'neutral' }) {
  const valueColor = tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="rounded border bg-white px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export { classifyExpiry }
