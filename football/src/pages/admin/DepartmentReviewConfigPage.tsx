import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { departmentApi } from '@/services/department.service'
import type { Department } from '@/services/department.service'
import { reviewerConfigApi } from '@/services/plan-review.service'
import type { DepartmentReviewerConfig } from '@/services/plan-review.service'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function DepartmentReviewConfigPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [configs, setConfigs] = useState<DepartmentReviewerConfig[]>([])
  const [newReviewerId, setNewReviewerId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingConfigs, setLoadingConfigs] = useState(false)

  useEffect(() => {
    departmentApi.list()
      .then((list) => setDepartments(list.filter((d) => d.isActive)))
      .catch(() => toast.error('부서 목록을 불러오지 못했습니다.'))
  }, [])

  useEffect(() => {
    if (!subjectId) {
      setConfigs([])
      return
    }
    setLoadingConfigs(true)
    reviewerConfigApi.list(subjectId)
      .then(setConfigs)
      .catch(() => toast.error('검토 규칙을 불러오지 못했습니다.'))
      .finally(() => setLoadingConfigs(false))
  }, [subjectId])

  const handleAdd = async () => {
    if (!subjectId || !newReviewerId) {
      toast.error('대상 부서와 검토 부서를 모두 선택해주세요.')
      return
    }
    if (subjectId === newReviewerId) {
      toast.error('대상 부서와 검토 부서가 같을 수 없습니다.')
      return
    }
    setSaving(true)
    try {
      const created = await reviewerConfigApi.create({
        subjectDepartmentId: subjectId,
        reviewerDepartmentId: newReviewerId,
      })
      setConfigs((prev) => [...prev, created])
      setNewReviewerId(null)
      toast.success('검토 부서가 추가됐습니다.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await reviewerConfigApi.delete(id)
      setConfigs((prev) => prev.filter((c) => c.id !== id))
      toast.success('삭제됐습니다.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  // 현재 설정된 검토 부서 ID 목록 (중복 추가 방지용)
  const configuredReviewerIds = new Set(configs.map((c) => c.reviewerDepartmentId))

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">부서 검토 규칙</h1>
        <p className="text-sm text-muted-foreground mt-1">
          부서 계획서 제출 시 교차 검토를 수행할 부서를 설정합니다.
        </p>
      </div>

      {/* 대상 부서 선택 */}
      <div className="space-y-2">
        <Label>대상 부서 (계획서 작성 부서)</Label>
        <Select
          value={subjectId ? String(subjectId) : ''}
          onValueChange={(v) => { setSubjectId(Number(v)); setNewReviewerId(null) }}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="부서를 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {subjectId && (
        <>
          {/* 현재 검토 부서 목록 */}
          <section className="border rounded-lg overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-base">
                {departments.find((d) => d.id === subjectId)?.name} 검토 부서 목록
              </h2>
            </div>
            {loadingConfigs ? (
              <div className="p-4 text-sm text-muted-foreground">불러오는 중...</div>
            ) : configs.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">설정된 검토 부서가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>검토 부서</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.reviewerDepartment.name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => void handleDelete(c.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          {/* 검토 부서 추가 */}
          <div className="flex items-end gap-3">
            <div className="space-y-1 flex-1">
              <Label>검토 부서 추가</Label>
              <Select
                value={newReviewerId ? String(newReviewerId) : ''}
                onValueChange={(v) => setNewReviewerId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="검토 부서를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter((d) => d.id !== subjectId && !configuredReviewerIds.has(d.id))
                    .map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => void handleAdd()}
              disabled={saving || !newReviewerId}
            >
              {saving ? '추가 중...' : '추가'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
