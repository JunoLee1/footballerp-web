import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  departmentApi,
  departmentMemberApi,
  deptJobTitleApi,
  type Department,
  type DeptRole,
  type Member,
  type DeptJobTitle,
} from '@/services/department.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { isAdminLike } from '@/lib/permissions'

// ---- DeptRole helpers ----

const DEPT_ROLES: DeptRole[] = ['DEPT_HEAD', 'LEADER', 'MEMBER', 'INTERN']

// ---- Error code mapping ----

function messageForCode(code: string, t: (k: string) => string): string {
  const key = `deptMember.error.${code}`
  const translated = t(key)
  // If the key is not found, i18next returns the key itself
  if (translated === key) return t('deptMember.error.generic')
  return translated
}

// ---- Page component ----

export function DepartmentMembersPage() {
  const { deptId: deptIdParam } = useParams<{ deptId: string }>()
  const deptId = Number(deptIdParam)
  const { t } = useTranslation('common')
  const { user } = useCurrentUser()

  const roleLabel = (r: DeptRole) => t(`deptMember.role.${r}`)

  // ---- state ----
  const [dept, setDept] = useState<Department | null>(null)
  const [allDepts, setAllDepts] = useState<Department[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<DeptRole>('MEMBER')
  const [addSaving, setAddSaving] = useState(false)
  const [addJobTitleId, setAddJobTitleId] = useState<number | null>(null)

  // Head dialog
  const [headOpen, setHeadOpen] = useState(false)
  const [newHeadUserId, setNewHeadUserId] = useState('')
  const [headSaving, setHeadSaving] = useState(false)

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferUserId, setTransferUserId] = useState<string | null>(null)
  const [transferDeptId, setTransferDeptId] = useState<string>('')
  const [transferRole, setTransferRole] = useState<DeptRole>('MEMBER')
  const [transferSaving, setTransferSaving] = useState(false)

  // Job title
  const [jobTitles, setJobTitles] = useState<DeptJobTitle[]>([])
  const [jobTitleManageOpen, setJobTitleManageOpen] = useState(false)
  const [newTitleLabel, setNewTitleLabel] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)

  // ---- data fetch ----
  const fetchMembers = async () => {
    try {
      const [d, ms, ds, jts] = await Promise.all([
        departmentApi.get(deptId),
        departmentMemberApi.list(deptId),
        departmentApi.list(),
        deptJobTitleApi.list(deptId),
      ])
      setDept(d)
      setMembers(ms)
      setAllDepts(ds)
      setJobTitles(jts)
    } catch {
      toast.error(t('deptMember.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchMembers() }, [deptId])

  // ---- permission helpers ----
  // Management authority is granted via Department.headId (승인 권한), NOT UserDepartment.role.
  // DEPT_HEAD/LEADER are 조직도 labels only — management rights come from Department.headId.
  const canManage = !!user && (
    isAdminLike(user.role) ||
    dept?.headId === user.id
  )
  // 팀장 변경은 관리자/HR만 가능 — 팀장 본인은 불가
  const canChangeHead = !!user && (
    isAdminLike(user.role) ||
    user.departmentCategories?.includes('HR')
  )

  const headMember = dept?.headId != null
    ? members.find(m => m.userId === dept.headId)
    : null

  // ---- add member ----
  const handleAdd = async () => {
    const trimmed = addUserId.trim()
    if (!trimmed) {
      toast.error(t('deptMember.error.userIdRequired'))
      return
    }
    setAddSaving(true)
    try {
      await departmentMemberApi.add(deptId, trimmed, addRole, addJobTitleId)
      toast.success(t('deptMember.addSuccess'))
      setAddOpen(false)
      setAddUserId('')
      setAddRole('MEMBER')
      setAddJobTitleId(null)
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    } finally {
      setAddSaving(false)
    }
  }

  // ---- update role inline ----
  const handleRoleChange = async (m: Member, role: DeptRole) => {
    if (!confirm(t('deptMember.confirmRoleChange', { name: m.user.nickname, role: roleLabel(role) }))) return
    try {
      await departmentMemberApi.updateRole(deptId, m.userId, role)
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    }
  }

  // ---- update job title inline ----
  const handleJobTitleChange = async (m: Member, jobTitleId: number | null) => {
    try {
      await departmentMemberApi.updateJobTitle(deptId, m.userId, jobTitleId)
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    }
  }

  // ---- remove ----
  const handleRemove = async (m: Member) => {
    if (!confirm(t('deptMember.confirmRemove', { name: m.user.nickname }))) return
    try {
      await departmentMemberApi.remove(deptId, m.userId)
      toast.success(t('deptMember.removeSuccess'))
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'MUST_TRANSFER') {
        // auto-open transfer dialog
        setTransferUserId(m.userId)
        setTransferDeptId('')
        setTransferRole('MEMBER')
        setTransferOpen(true)
      } else {
        toast.error(messageForCode(code, t))
      }
    }
  }

  // ---- transfer ----
  const handleTransfer = async () => {
    if (!transferUserId) return
    const toDeptId = parseInt(transferDeptId, 10)
    if (!transferDeptId || isNaN(toDeptId)) {
      toast.error(t('deptMember.error.targetDeptRequired'))
      return
    }
    setTransferSaving(true)
    try {
      await departmentMemberApi.transfer(deptId, transferUserId, toDeptId, transferRole)
      toast.success(t('deptMember.transferSuccess'))
      setTransferOpen(false)
      setTransferUserId(null)
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    } finally {
      setTransferSaving(false)
    }
  }

  // ---- update head ----
  const handleUpdateHead = async () => {
    const uid = newHeadUserId === '' ? null : parseInt(newHeadUserId, 10)
    if (newHeadUserId !== '' && (isNaN(uid as number))) {
      toast.error(t('deptMember.error.userIdRequired'))
      return
    }
    setHeadSaving(true)
    try {
      await departmentMemberApi.updateHead(deptId, uid)
      toast.success(t('deptMember.headUpdateSuccess'))
      setHeadOpen(false)
      setNewHeadUserId('')
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    } finally {
      setHeadSaving(false)
    }
  }

  // ---- job title management ----
  const handleCreateJobTitle = async () => {
    if (!newTitleLabel.trim()) return
    setTitleSaving(true)
    try {
      await deptJobTitleApi.create(deptId, { label: newTitleLabel.trim() })
      setNewTitleLabel('')
      void fetchMembers()
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, t))
    } finally {
      setTitleSaving(false)
    }
  }

  const handleDeleteJobTitle = async (titleId: number) => {
    if (!confirm(t('deptMember.jobTitle.deleteConfirm'))) return
    try {
      await deptJobTitleApi.delete(deptId, titleId)
      void fetchMembers()
    } catch {
      toast.error(t('deptMember.jobTitle.deleteConfirm'))
    }
  }

  // ---- render ----

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const transferableDepts = allDepts.filter(d => d.id !== deptId && d.isActive)
  const transferMember = members.find(m => m.userId === transferUserId)

  return (
    <div className="p-6 space-y-4">
      {/* 뒤로 가기 */}
      <Link
        to="/admin/department-members"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('nav.item.myTeamMembers')}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">{dept?.name ?? '—'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('deptMember.head')}:{' '}
            {headMember
              ? `${headMember.user.nickname} (${headMember.user.email})`
              : t('deptMember.noHead')}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {canChangeHead && (
              <Button variant="outline" size="sm" onClick={() => { setNewHeadUserId(''); setHeadOpen(true) }}>
                {t('deptMember.changeHead')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setJobTitleManageOpen(true)}>
              {t('deptMember.jobTitle.manage')}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              {dept?.headId === user?.id && !isAdminLike(user?.role ?? '')
                ? t('deptMember.addMemberAsLeader')
                : t('deptMember.addMember')}
            </Button>
          </div>
        )}
      </div>

      {/* Members table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('deptMember.col.name')}</TableHead>
              <TableHead>{t('deptMember.col.email')}</TableHead>
              <TableHead>{t('deptMember.col.dept')}</TableHead>
              <TableHead>{t('deptMember.col.role')}</TableHead>
              <TableHead>{t('deptMember.jobTitle.label')}</TableHead>
              {canManage && <TableHead className="text-right">{t('deptMember.col.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="py-8 text-center text-muted-foreground text-sm">
                  {t('deptMember.empty')}
                </TableCell>
              </TableRow>
            )}
            {members.map(m => (
              <TableRow key={`${m.userId}-${m.departmentId}`}>
                <TableCell className="font-medium">
                  {m.user.nickname}
                  {dept?.headId === m.userId && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {t('deptMember.headBadge')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{m.user.email}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.department.name}</TableCell>
                <TableCell>
                  {canManage ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => void handleRoleChange(m, v as DeptRole)}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPT_ROLES.map(r => (
                          <SelectItem key={r} value={r} label={roleLabel(r)}>
                            {roleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">{roleLabel(m.role)}</span>
                  )}
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <Select
                      value={m.jobTitleId != null ? String(m.jobTitleId) : ''}
                      onValueChange={(v) => void handleJobTitleChange(m, v === '' ? null : Number(v))}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue placeholder={t('deptMember.jobTitle.none')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" label={t('deptMember.jobTitle.none')}>
                          {t('deptMember.jobTitle.none')}
                        </SelectItem>
                        {jobTitles.map(jt => (
                          <SelectItem key={jt.id} value={String(jt.id)} label={jt.label}>
                            {jt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {m.jobTitle?.label ?? '—'}
                    </span>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTransferUserId(m.userId)
                          setTransferDeptId('')
                          setTransferRole('MEMBER')
                          setTransferOpen(true)
                        }}
                      >
                        {t('deptMember.transfer')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void handleRemove(m)}
                      >
                        {t('action.delete')}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deptMember.addMember')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('deptMember.userId')}</Label>
              <Input
                type="number"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                placeholder={t('deptMember.userIdPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('deptMember.col.role')}</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as DeptRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPT_ROLES.map(r => (
                    <SelectItem key={r} value={r} label={roleLabel(r)}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('deptMember.jobTitle.label')}</Label>
              <Select
                value={addJobTitleId != null ? String(addJobTitleId) : ''}
                onValueChange={(v) => setAddJobTitleId(v === '' ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('deptMember.jobTitle.none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" label={t('deptMember.jobTitle.none')}>
                    {t('deptMember.jobTitle.none')}
                  </SelectItem>
                  {jobTitles.map(jt => (
                    <SelectItem key={jt.id} value={String(jt.id)} label={jt.label}>
                      {jt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={() => void handleAdd()} disabled={addSaving}>
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change head dialog */}
      <Dialog open={headOpen} onOpenChange={setHeadOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deptMember.changeHead')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('deptMember.newHeadUserId')}</Label>
              <Input
                type="number"
                value={newHeadUserId}
                onChange={(e) => setNewHeadUserId(e.target.value)}
                placeholder={t('deptMember.newHeadPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('deptMember.clearHeadHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeadOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={() => void handleUpdateHead()} disabled={headSaving}>
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('deptMember.transferTitle', { name: transferMember?.user.nickname ?? '' })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('deptMember.targetDept')}</Label>
              <Select value={transferDeptId} onValueChange={setTransferDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('deptMember.targetDeptPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {transferableDepts.map(d => (
                    <SelectItem key={d.id} value={String(d.id)} label={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('deptMember.col.role')}</Label>
              <Select value={transferRole} onValueChange={(v) => setTransferRole(v as DeptRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPT_ROLES.map(r => (
                    <SelectItem key={r} value={r} label={roleLabel(r)}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransferOpen(false); setTransferUserId(null) }}>
              {t('action.cancel')}
            </Button>
            <Button onClick={() => void handleTransfer()} disabled={transferSaving}>
              {t('deptMember.transfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job title management dialog */}
      <Dialog open={jobTitleManageOpen} onOpenChange={setJobTitleManageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deptMember.jobTitle.manage')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              {jobTitles.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('deptMember.jobTitle.empty')}</p>
              )}
              {jobTitles.map(jt => (
                <div key={jt.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{jt.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void handleDeleteJobTitle(jt.id)}
                  >
                    {t('deptMember.jobTitle.delete')}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTitleLabel}
                onChange={(e) => setNewTitleLabel(e.target.value)}
                placeholder={t('deptMember.jobTitle.labelPlaceholder')}
              />
              <Button
                onClick={() => void handleCreateJobTitle()}
                disabled={titleSaving || !newTitleLabel.trim()}
              >
                {t('deptMember.jobTitle.add')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobTitleManageOpen(false)}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
