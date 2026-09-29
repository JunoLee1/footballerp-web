import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { inventoryApi, type InventoryItem, type CreateInventoryItemDto } from '@/services/inventory.service'
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
import { AlertTriangle, Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react'

function InventoryTab() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [alerts, setAlerts] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [adjustingId, setAdjustingId] = useState<number | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [form, setForm] = useState<CreateInventoryItemDto>({ name: '', unit: '', quantity: 0, minThreshold: 0 })
  const [acting, setActing] = useState(false)

  const load = async () => {
    try {
      const [all, low] = await Promise.all([inventoryApi.list(), inventoryApi.alerts()])
      setItems(all)
      setAlerts(low.map(i => i.id))
    } catch {
      toast.error('재고 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.unit.trim()) { toast.error('품명과 단위를 입력해주세요'); return }
    setActing(true)
    try {
      const created = await inventoryApi.create(form)
      setItems(prev => [...prev, created])
      setAddOpen(false)
      setForm({ name: '', unit: '', quantity: 0, minThreshold: 0 })
      toast.success('재고 항목이 추가됐습니다')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '추가에 실패했습니다')
    } finally { setActing(false) }
  }

  const handleAdjust = async () => {
    if (adjustingId === null) return
    const delta = parseInt(adjustDelta, 10)
    if (isNaN(delta) || delta === 0) { toast.error('수량을 입력해주세요'); return }
    setActing(true)
    try {
      const updated = await inventoryApi.adjust(adjustingId, delta)
      setItems(prev => prev.map(i => i.id === adjustingId ? updated : i))
      const low = await inventoryApi.alerts()
      setAlerts(low.map(i => i.id))
      setAdjustingId(null)
      setAdjustDelta('')
      toast.success('수량이 조정됐습니다')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '수량 조정에 실패했습니다')
    } finally { setActing(false) }
  }

  if (loading) return <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">총 {items.length}개 항목</p>
          {alerts.length > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />부족 {alerts.length}건
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />항목 추가</Button>
      </div>

      <div className="rounded border divide-y">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">등록된 재고가 없습니다</p>
        )}
        {items.map(item => {
          const isLow = alerts.includes(item.id)
          return (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{item.name}</p>
                  {isLow && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />부족
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  최소 {item.minThreshold}{item.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-semibold ${isLow ? 'text-red-600' : ''}`}>
                  {item.quantity}<span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setAdjustingId(item.id); setAdjustDelta('-1') }}>
                  <Minus className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setAdjustingId(item.id); setAdjustDelta('1') }}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAdjustingId(item.id); setAdjustDelta('') }}>
                  조정
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>재고 항목 추가</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>품명 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 축구공" />
            </div>
            <div className="space-y-1">
              <Label>단위 *</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="예: 개" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>초기 수량</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>최소 임계치</Label>
                <Input type="number" value={form.minThreshold} onChange={e => setForm(f => ({ ...f, minThreshold: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={acting}>취소</Button>
            <Button onClick={handleAdd} disabled={acting}>{acting ? '추가 중...' : '추가'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={adjustingId !== null} onOpenChange={v => { if (!v) { setAdjustingId(null); setAdjustDelta('') } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>수량 조정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {items.find(i => i.id === adjustingId)?.name} — 현재 {items.find(i => i.id === adjustingId)?.quantity}{items.find(i => i.id === adjustingId)?.unit}
            </p>
            <div className="space-y-1">
              <Label>조정 수량 (양수 = 증가, 음수 = 감소)</Label>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAdjustDelta(v => String((parseInt(v || '0', 10) - 1)))}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={e => setAdjustDelta(e.target.value)}
                  className="text-center"
                />
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAdjustDelta(v => String((parseInt(v || '0', 10) + 1)))}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAdjustingId(null); setAdjustDelta('') }} disabled={acting}>취소</Button>
            <Button onClick={handleAdjust} disabled={acting}>{acting ? '처리 중...' : '적용'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AssetInventoryPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">소모품 재고</h1>
        <p className="text-sm text-muted-foreground mt-0.5">소모품 재고 조정 · 최소 임계값 알림</p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <InventoryTab />
      </div>
    </div>
  )
}
