import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { adminApi } from '@/services/admin.service'
import { departmentApi, type Department } from '@/services/department.service'
import type { AdminUserDto, ListUsersQuery, UpdateUserRoleDto, PlayerWithoutAccountDto } from '@/types/admin'
import type { Role, CoachingRole, FrontOfficeRole } from '@/types/auth'
import {
  ROLE_LABEL,
  COACHING_ROLE_LABEL,
  FRONT_OFFICE_ROLE_LABEL,
} from '@/types/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { MoreHorizontal, UserPlus, ChevronDown, Mail } from 'lucide-react'
import { useConfirm } from '@/lib/confirm-dialog'

const ALL_ROLES: Role[] = ['FRONT_OFFICE', 'COACHING_STAFF', 'PLAYER', 'AGENT']
const SUPER_ADMIN_ROLES: Role[] = ['GM', 'ADMIN', ...ALL_ROLES]
const COACHING_ROLES: CoachingRole[] = [
  'HEAD_COACH', 'ASSISTANT_COACH', 'DEFENSIVE_COACH', 'ATTACKING_COACH',
  'PHYSICAL_COACH', 'SET_PIECE_COACH', 'GOALKEEPER_COACH', 'MEDICAL', 'MEDICAL_DIRECTOR',
]
const FRONT_OFFICE_ROLES: FrontOfficeRole[] = [
  'TD', 'CONTRACT_MANAGER', 'SCOUT', 'EQUIPMENT_MANAGER', 'TACTICAL_ANALYST', 'FINANCE_MANAGER',
]

function subRoleLabel(user: AdminUserDto): string {
  if (user.role === 'COACHING_STAFF' && user.coachingRole) return COACHING_ROLE_LABEL[user.coachingRole]
  if (user.role === 'FRONT_OFFICE' && user.frontOfficeRole) return FRONT_OFFICE_ROLE_LABEL[user.frontOfficeRole]
  return ''
}

export function UsersPage() {
  const { t } = useTranslation('admin')
  const confirm = useConfirm()
  const { user: currentUser } = useCurrentUser()
  const navigate = useNavigate()
  const availableRoles = currentUser?.role === 'SUPER_ADMIN' ? SUPER_ADMIN_ROLES : ALL_ROLES

  const [users, setUsers] = useState<AdminUserDto[]>([])
  const [playersWithoutAccounts, setPlayersWithoutAccounts] = useState<PlayerWithoutAccountDto[]>([])
  const [loading, setLoading] = useState(false)
  const [filterRole, setFilterRole] = useState<Role | ''>('')
  const [filterCoachingRole, setFilterCoachingRole] = useState<CoachingRole | ''>('')
  const [filterFrontOfficeRole, setFilterFrontOfficeRole] = useState<FrontOfficeRole | ''>('')
  const [filterUsername, setFilterUsername] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null)
  const [editRole, setEditRole] = useState<Role>('FRONT_OFFICE')
  const [editCoachingRole, setEditCoachingRole] = useState<CoachingRole | ''>('')
  const [editFrontOfficeRole, setEditFrontOfficeRole] = useState<FrontOfficeRole | ''>('')
  const [editSaving, setEditSaving] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [iEmail, setIEmail] = useState('')
  const [iRole, setIRole] = useState<Role>('FRONT_OFFICE')
  const [iCoachingRole, setICoachingRole] = useState<CoachingRole | ''>('')
  const [iFrontOfficeRole, setIFrontOfficeRole] = useState<FrontOfficeRole | ''>('')
  const [iSending, setISending] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [cEmail, setCEmail] = useState('')
  const [cUsername, setCUsername] = useState('')
  const [cNickname, setCNickname] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cRole, setCRole] = useState<Role>('FRONT_OFFICE')
  const [cCoachingRole, setCCoachingRole] = useState<CoachingRole | ''>('')
  const [cFrontOfficeRole, setCFrontOfficeRole] = useState<FrontOfficeRole | ''>('')
  const [cDepartmentId, setCDepartmentId] = useState<number | ''>('')
  const [cSaving, setCsaving] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const query: ListUsersQuery = {}
      if (filterUsername.trim()) query.username = filterUsername.trim()
      if (filterRole) query.role = filterRole as Role
      if (filterRole === 'COACHING_STAFF' && filterCoachingRole) query.coachingRole = filterCoachingRole as CoachingRole
      if (filterRole === 'FRONT_OFFICE' && filterFrontOfficeRole) query.frontOfficeRole = filterFrontOfficeRole as FrontOfficeRole
      if (showDeleted) query.isDeleted = true

      const [data, playersData] = await Promise.all([
        adminApi.listUsers(query),
        (!filterRole || filterRole === 'PLAYER') && !showDeleted
          ? adminApi.listPlayersWithoutAccounts(filterUsername.trim() || undefined)
          : Promise.resolve([]),
      ])
      setUsers(data)
      setPlayersWithoutAccounts(playersData)
    } catch {
      toast.error(t('usersPage.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchUsers() }, [filterRole, filterCoachingRole, filterFrontOfficeRole, showDeleted])

  useEffect(() => {
    departmentApi.list().then(setDepartments).catch(() => {})
  }, [])

  const handleDeactivate = async (user: AdminUserDto) => {
    const ok = await confirm({ title: t('usersPage.deactivateTitle'), description: t('usersPage.deactivateDesc'), confirmText: t('usersPage.deactivateConfirm') })
    if (!ok) return
    try {
      await adminApi.deactivate(user.id)
      toast.success(t('usersPage.deactivateSuccess'))
      void fetchUsers()
    } catch { toast.error(t('usersPage.deactivateFailed')) }
  }

  const handleReactivate = async (user: AdminUserDto) => {
    try {
      await adminApi.reactivate(user.id)
      toast.success(t('usersPage.reactivateSuccess'))
      void fetchUsers()
    } catch { toast.error(t('usersPage.reactivateFailed')) }
  }

  const handleDelete = async (user: AdminUserDto) => {
    const ok = await confirm({ title: t('usersPage.deleteTitle'), description: t('usersPage.deleteDesc'), confirmText: t('usersPage.deleteConfirm'), variant: 'destructive' })
    if (!ok) return
    try {
      await adminApi.deleteUser(user.id)
      toast.success(t('usersPage.deleteSuccess'))
      void fetchUsers()
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'USER_HAS_LINKED_DATA') {
        toast.error(t('usersPage.hasLinkedData'))
      } else {
        toast.error(t('usersPage.deleteFailed'))
      }
    }
  }

  const openEditModal = (user: AdminUserDto) => {
    setEditingUser(user)
    setEditRole(user.role)
    setEditCoachingRole(user.coachingRole ?? '')
    setEditFrontOfficeRole(user.frontOfficeRole ?? '')
  }

  const handleEditSave = async () => {
    if (!editingUser) return
    setEditSaving(true)
    try {
      const dto: UpdateUserRoleDto = {
        role: editRole,
        ...(editRole === 'COACHING_STAFF' && editCoachingRole && { coachingRole: editCoachingRole as CoachingRole }),
        ...(editRole === 'FRONT_OFFICE' && editFrontOfficeRole && { frontOfficeRole: editFrontOfficeRole as FrontOfficeRole }),
      }
      await adminApi.updateRole(editingUser.id, dto)
      toast.success(t('usersPage.roleSaved'))
      setEditingUser(null)
      void fetchUsers()
    } catch { toast.error(t('usersPage.roleSaveFailed')) } finally { setEditSaving(false) }
  }

  const handleSendInvite = async () => {
    if (!iEmail.trim()) { toast.error('이메일을 입력하세요.'); return }
    if (iRole === 'COACHING_STAFF' && !iCoachingRole) { toast.error('코칭 세부 역할을 선택하세요.'); return }
    if (iRole === 'FRONT_OFFICE' && !iFrontOfficeRole) { toast.error('프런트 세부 역할을 선택하세요.'); return }
    setISending(true)
    try {
      await api.post('/auth/invites', {
        email: iEmail.trim(),
        role: iRole,
        ...(iRole === 'COACHING_STAFF' && iCoachingRole && { coachingRole: iCoachingRole }),
        ...(iRole === 'FRONT_OFFICE' && iFrontOfficeRole && { frontOfficeRole: iFrontOfficeRole }),
      })
      toast.success(`${iEmail}로 초대 이메일을 발송했습니다.`)
      setIEmail(''); setIRole('FRONT_OFFICE'); setICoachingRole(''); setIFrontOfficeRole('')
      setShowInvite(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('EMAIL_TAKEN')) toast.error('이미 가입된 이메일입니다.')
      else toast.error('초대 발송에 실패했습니다.')
    } finally { setISending(false) }
  }

  const handleCreate = async () => {
    if (!cEmail.trim() || !cUsername.trim() || !cNickname.trim() || !cPassword) {
      toast.error(t('usersPage.createCard.required'))
      return
    }
    if (cRole === 'COACHING_STAFF' && !cCoachingRole) { toast.error(t('usersPage.createCard.coachingRoleRequired')); return }
    if (cRole === 'FRONT_OFFICE' && !cFrontOfficeRole) { toast.error(t('usersPage.createCard.frontOfficeRoleRequired')); return }
    setCsaving(true)
    try {
      await api.post('/auth/users', {
        email: cEmail.trim(),
        username: cUsername.trim(),
        nickname: cNickname.trim(),
        password: cPassword,
        role: cRole,
        ...(cRole === 'COACHING_STAFF' && cCoachingRole && { coachingRole: cCoachingRole }),
        ...(cRole === 'FRONT_OFFICE' && cFrontOfficeRole && { frontOfficeRole: cFrontOfficeRole }),
        ...(cDepartmentId && { departmentId: cDepartmentId }),
      })
      toast.success(t('usersPage.createCard.createSuccess'))
      setCEmail(''); setCUsername(''); setCNickname(''); setCPassword('')
      setCRole('FRONT_OFFICE'); setCCoachingRole(''); setCFrontOfficeRole(''); setCDepartmentId('')
      void fetchUsers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('usersPage.createCard.createFailed'))
    } finally { setCsaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">{t('usersPage.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('usersPage.description')}</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('usersPage.searchLabel')}</Label>
            <Input
              placeholder={t('usersPage.searchPlaceholder')}
              className="h-8 w-44 text-sm"
              value={filterUsername}
              onChange={(e) => setFilterUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void fetchUsers()}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('usersPage.roleFilterLabel')}</Label>
            <Select value={filterRole} onValueChange={(v) => { setFilterRole(v as Role | ''); setFilterCoachingRole(''); setFilterFrontOfficeRole('') }}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder={t('usersPage.allRoles')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('usersPage.allRoles')}</SelectItem>
                {availableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filterRole === 'COACHING_STAFF' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('usersPage.coachingRoleLabel')}</Label>
              <Select value={filterCoachingRole} onValueChange={(v) => setFilterCoachingRole(v as CoachingRole | '')}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder={t('usersPage.allRoles')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('usersPage.allRoles')}</SelectItem>
                  {COACHING_ROLES.map((r) => <SelectItem key={r} value={r}>{COACHING_ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {filterRole === 'FRONT_OFFICE' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('usersPage.frontOfficeRoleLabel')}</Label>
              <Select value={filterFrontOfficeRole} onValueChange={(v) => setFilterFrontOfficeRole(v as FrontOfficeRole | '')}>
                <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder={t('usersPage.allRoles')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('usersPage.allRoles')}</SelectItem>
                  {FRONT_OFFICE_ROLES.map((r) => <SelectItem key={r} value={r}>{FRONT_OFFICE_ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? t('usersPage.showActive') : t('usersPage.showInactive')}
          </Button>
          <Button size="sm" className="h-8" onClick={() => void fetchUsers()}>{t('usersPage.searchButton')}</Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('usersPage.table.nickname')}</TableHead>
                <TableHead>{t('usersPage.table.username')}</TableHead>
                <TableHead>{t('usersPage.table.email')}</TableHead>
                <TableHead>{t('usersPage.table.role')}</TableHead>
                <TableHead>{t('usersPage.table.subRole')}</TableHead>
                <TableHead>{t('usersPage.table.playerName')}</TableHead>
                <TableHead>{t('usersPage.table.status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t('usersPage.loading')}</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t('usersPage.noUsers')}</TableCell></TableRow>
              ) : users.map((user) => (
                <TableRow key={user.id} className={`cursor-pointer ${user.isDeleted ? 'opacity-50' : ''}`} onClick={() => navigate(`/admin/users/${user.id}/profile`)}>
                  <TableCell className="font-medium">{user.nickname}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.username}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell><Badge variant="outline">{ROLE_LABEL[user.role]}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{subRoleLabel(user)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.player?.playerName ?? '—'}
                  </TableCell>
                  <TableCell>
                    {user.isDeleted
                      ? <Badge variant="destructive">{t('usersPage.statusInactive')}</Badge>
                      : <Badge variant="secondary">{t('usersPage.statusActive')}</Badge>}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(user)}>{t('usersPage.changeRole')}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.isDeleted ? (
                          <DropdownMenuItem onClick={() => void handleReactivate(user)}>{t('usersPage.reactivate')}</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void handleDeactivate(user)} className="text-destructive">{t('usersPage.deactivate')}</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => void handleDelete(user)} className="text-destructive">{t('usersPage.permanentDelete')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {playersWithoutAccounts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t('usersPage.playersWithoutAccounts')} ({playersWithoutAccounts.length}명)</h2>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('usersPage.noAccountPlayers.name')}</TableHead>
                    <TableHead>{t('usersPage.noAccountPlayers.position')}</TableHead>
                    <TableHead>{t('usersPage.noAccountPlayers.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersWithoutAccounts.map((p) => (
                    <TableRow key={p.id} className="opacity-60">
                      <TableCell className="font-medium">{p.playerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.position ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-muted-foreground">{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { setShowInvite((v) => !v); setShowCreate(false) }}
          >
            <Mail className="h-4 w-4" />
            초대 링크 발송
            <ChevronDown className={`h-3 w-3 transition-transform ${showInvite ? 'rotate-180' : ''}`} />
          </Button>

          {showInvite && (
            <Card className="max-w-lg p-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>이메일 *</Label>
                  <Input type="email" placeholder="user@example.com" value={iEmail} onChange={(e) => setIEmail(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.roleLabel')} *</Label>
                    <Select value={iRole} onValueChange={(v) => { setIRole(v as Role); setICoachingRole(''); setIFrontOfficeRole('') }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {iRole === 'COACHING_STAFF' && (
                    <div className="space-y-1.5">
                      <Label>{t('usersPage.createCard.coachingRoleLabel')} *</Label>
                      <Select value={iCoachingRole} onValueChange={(v) => setICoachingRole(v as CoachingRole)}>
                        <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                        <SelectContent>
                          {COACHING_ROLES.map((r) => <SelectItem key={r} value={r}>{COACHING_ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {iRole === 'FRONT_OFFICE' && (
                    <div className="space-y-1.5">
                      <Label>{t('usersPage.createCard.frontOfficeRoleLabel')} *</Label>
                      <Select value={iFrontOfficeRole} onValueChange={(v) => setIFrontOfficeRole(v as FrontOfficeRole)}>
                        <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                        <SelectContent>
                          {FRONT_OFFICE_ROLES.map((r) => <SelectItem key={r} value={r}>{FRONT_OFFICE_ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">초대 링크는 24시간 동안 유효합니다.</p>
                <Button className="w-full gap-2" onClick={() => void handleSendInvite()} disabled={iSending}>
                  <Mail className="h-4 w-4" />
                  {iSending ? '발송 중...' : '초대 이메일 발송'}
                </Button>
              </div>
            </Card>
          )}
        </div>

        <div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { setShowCreate((v) => !v); setShowInvite(false) }}
          >
            <UserPlus className="h-4 w-4" />
            {t('usersPage.createAccountButton')}
            <ChevronDown className={`h-3 w-3 transition-transform ${showCreate ? 'rotate-180' : ''}`} />
          </Button>

          {showCreate && (
            <Card className="max-w-lg p-6 mt-3">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.emailLabel')} *</Label>
                    <Input type="email" placeholder={t('usersPage.createCard.emailPlaceholder')} value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.usernameLabel')} *</Label>
                    <Input placeholder={t('usersPage.createCard.usernamePlaceholder')} value={cUsername} onChange={(e) => setCUsername(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.nicknameLabel')} *</Label>
                    <Input placeholder={t('usersPage.createCard.nicknamePlaceholder')} value={cNickname} onChange={(e) => setCNickname(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.passwordLabel')} *</Label>
                    <Input type="password" placeholder="••••••••" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('usersPage.createCard.roleLabel')} *</Label>
                    <Select value={cRole} onValueChange={(v) => { setCRole(v as Role); setCCoachingRole(''); setCFrontOfficeRole('') }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {cRole === 'COACHING_STAFF' && (
                    <div className="space-y-1.5">
                      <Label>{t('usersPage.createCard.coachingRoleLabel')} *</Label>
                      <Select value={cCoachingRole} onValueChange={(v) => setCCoachingRole(v as CoachingRole)}>
                        <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                        <SelectContent>
                          {COACHING_ROLES.map((r) => <SelectItem key={r} value={r}>{COACHING_ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {cRole === 'FRONT_OFFICE' && (
                    <div className="space-y-1.5">
                      <Label>{t('usersPage.createCard.frontOfficeRoleLabel')} *</Label>
                      <Select value={cFrontOfficeRole} onValueChange={(v) => setCFrontOfficeRole(v as FrontOfficeRole)}>
                        <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                        <SelectContent>
                          {FRONT_OFFICE_ROLES.map((r) => <SelectItem key={r} value={r}>{FRONT_OFFICE_ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('usersPage.createCard.departmentLabel')}</Label>
                  <Select value={cDepartmentId === '' ? '' : String(cDepartmentId)} onValueChange={(v) => setCDepartmentId(v ? Number(v) : '')}>
                    <SelectTrigger><SelectValue placeholder="부서 선택 (선택)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">선택 안 함</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full mt-2" onClick={() => void handleCreate()} disabled={cSaving}>
                  {cSaving ? t('usersPage.createCard.creating') : t('usersPage.createCard.create')}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser?.nickname} {t('usersPage.roleDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('usersPage.roleLabel')}</Label>
              <Select value={editRole} onValueChange={(v) => { setEditRole(v as Role); setEditCoachingRole(''); setEditFrontOfficeRole('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editRole === 'COACHING_STAFF' && (
              <div className="space-y-1.5">
                <Label>{t('usersPage.coachingRoleLabel')}</Label>
                <Select value={editCoachingRole} onValueChange={(v) => setEditCoachingRole(v as CoachingRole)}>
                  <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {COACHING_ROLES.map((r) => <SelectItem key={r} value={r}>{COACHING_ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editRole === 'FRONT_OFFICE' && (
              <div className="space-y-1.5">
                <Label>{t('usersPage.frontOfficeRoleLabel')}</Label>
                <Select value={editFrontOfficeRole} onValueChange={(v) => setEditFrontOfficeRole(v as FrontOfficeRole)}>
                  <SelectTrigger><SelectValue placeholder={t('usersPage.roleSelectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {FRONT_OFFICE_ROLES.map((r) => <SelectItem key={r} value={r}>{FRONT_OFFICE_ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t('usersPage.cancel')}</Button>
            <Button onClick={() => void handleEditSave()} disabled={editSaving}>
              {editSaving ? t('usersPage.saving') : t('usersPage.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
