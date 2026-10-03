import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { piiAccessApi, type UserProfileDto } from '@/services/pii-access.service'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ROLE_LABEL, COACHING_ROLE_LABEL, FRONT_OFFICE_ROLE_LABEL } from '@/types/auth'
import type { Role, CoachingRole, FrontOfficeRole } from '@/types/auth'
import { ArrowLeft, EyeOff, Unlock } from 'lucide-react'

function Field({ label, value, masked }: { label: string; value: string | null; masked?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 text-sm font-medium flex items-center gap-1.5 ${masked ? 'text-muted-foreground italic' : ''}`}>
        {masked && <EyeOff className="h-3.5 w-3.5" />}
        {value ?? '—'}
      </dd>
    </div>
  )
}

export function UserProfilePage() {
  const { t } = useTranslation('admin')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: me } = useCurrentUser()
  const [profile, setProfile] = useState<UserProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestOpen, setRequestOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [requesting, setRequesting] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      setProfile(await piiAccessApi.getUserProfile(id))
    } catch {
      toast.error(t('userProfile.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  const handleRequest = async () => {
    if (!reason.trim() || !profile) return
    setRequesting(true)
    try {
      await piiAccessApi.request(profile.id, reason.trim())
      toast.success(t('userProfile.requestSent'))
      setRequestOpen(false)
      setReason('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('PENDING_REQUEST_EXISTS')) toast.error(t('userProfile.pendingExists'))
      else toast.error(t('userProfile.requestFailed'))
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-lg">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!profile) return null

  const isSelf = me?.id === profile.id
  const roleLabel =
    profile.role === 'COACHING_STAFF' && profile.coachingRole
      ? `${ROLE_LABEL[profile.role as Role]} · ${COACHING_ROLE_LABEL[profile.coachingRole as CoachingRole]}`
      : profile.role === 'FRONT_OFFICE' && profile.frontOfficeRole
        ? `${ROLE_LABEL[profile.role as Role]} · ${FRONT_OFFICE_ROLE_LABEL[profile.frontOfficeRole as FrontOfficeRole]}`
        : ROLE_LABEL[profile.role as Role] ?? profile.role

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{profile.nickname}</h1>
          <p className="text-sm text-muted-foreground">{roleLabel}</p>
        </div>
        {profile.masked && !isSelf && (
          <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
            <Unlock className="h-3.5 w-3.5 mr-1.5" />
            {t('userProfile.requestAccess')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-lg mx-auto space-y-6">

          {profile.masked && (
            <div className="flex items-center gap-2 rounded-lg border border-muted px-4 py-3 text-sm text-muted-foreground">
              <EyeOff className="h-4 w-4 shrink-0" />
              <span>{t('userProfile.maskedNotice')}</span>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-sm font-semibold mb-4">{t('userProfile.basicInfo')}</h2>
            <dl className="grid sm:grid-cols-2 gap-4">
              <Field label={t('userProfile.username')} value={profile.username} />
              <Field label={t('userProfile.role')} value={roleLabel} />
              {profile.team && (
                <Field label={t('userProfile.team')} value={profile.team.type} />
              )}
            </dl>
          </div>

          {/* 소속 부서 */}
          {profile.departments.length > 0 && (
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-sm font-semibold mb-3">{t('userProfile.departments')}</h2>
              <div className="flex flex-wrap gap-2">
                {profile.departments.map(d => (
                  <span key={d.department.id} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium bg-muted">
                    {d.department.name}
                    <span className="text-muted-foreground">· {d.role}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 개인정보 (마스킹 적용 가능) */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{t('userProfile.personalInfo')}</h2>
              {profile.masked && <Badge variant="outline" className="text-xs gap-1"><EyeOff className="h-3 w-3" />{t('userProfile.masked')}</Badge>}
            </div>
            <dl className="grid sm:grid-cols-2 gap-4">
              <Field label={t('userProfile.email')} value={profile.email} masked={profile.masked} />
              <Field label={t('userProfile.phone')} value={profile.phone} masked={profile.masked} />
              {(profile.homeAddress || profile.masked) && (
                <div className="sm:col-span-2">
                  <Field label={t('userProfile.homeAddress')} value={profile.homeAddress ?? '—'} masked={profile.masked} />
                </div>
              )}
            </dl>
          </div>

        </div>
      </div>

      {/* 긴급 열람 요청 다이얼로그 */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('userProfile.requestDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{t('userProfile.requestDialog.desc', { name: profile.nickname })}</p>
            <div className="space-y-1.5">
              <Label>{t('userProfile.requestDialog.reasonLabel')} *</Label>
              <Textarea
                placeholder={t('userProfile.requestDialog.reasonPlaceholder')}
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={requesting}>{t('userProfile.requestDialog.cancel')}</Button>
            <Button onClick={() => void handleRequest()} disabled={requesting || !reason.trim()}>
              {requesting ? t('userProfile.requestDialog.sending') : t('userProfile.requestDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
