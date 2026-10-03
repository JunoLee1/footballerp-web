import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { payrollApi, type PayrollConfig, type StaffSalary, type PayrollRun } from '@/services/payroll.service'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function PayrollPage() {
  const { t } = useTranslation('admin')
  const { user } = useCurrentUser()

  const isAdminLike = user?.role === 'ADMIN' || user?.role === 'GM' || user?.role === 'SUPER_ADMIN'
  const canConfirm = isAdminLike || (user?.role === 'FRONT_OFFICE' && user?.frontOfficeRole === 'FINANCE_MANAGER')
  const canSecondApprove = isAdminLike
  const canCreate = isAdminLike || (user?.role === 'FRONT_OFFICE' && (user?.frontOfficeRole === 'HR_MANAGER' || user?.frontOfficeRole === 'FINANCE_MANAGER'))

  const [configs, setConfigs] = useState<PayrollConfig[]>([])
  const [salaries, setSalaries] = useState<StaffSalary[]>([])
  const [selectedSalaryId, setSelectedSalaryId] = useState<string | null>(null)
  const [runs, setRuns] = useState<PayrollRun[]>([])

  useEffect(() => {
    void payrollApi.listConfigs().then(setConfigs).catch(() => {})
    void payrollApi.listSalaries().then(data => {
      setSalaries(data)
      if (data.length > 0 && !selectedSalaryId) setSelectedSalaryId(data[0]!.id)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedSalaryId) return
    void payrollApi.listRuns(selectedSalaryId).then(setRuns).catch(() => {})
  }, [selectedSalaryId])

  const handleConfirm = async (salaryId: string, runId: string) => {
    try {
      const updated = await payrollApi.confirmRun(salaryId, runId)
      setRuns(prev => prev.map(r => r.id === runId ? updated : r))
      toast.success(t('payroll.run.confirmed'))
    } catch {
      toast.error(t('payroll.run.confirmFailed'))
    }
  }

  const handleSecondApprove = async (salaryId: string, runId: string) => {
    try {
      const updated = await payrollApi.secondApproveRun(salaryId, runId)
      setRuns(prev => prev.map(r => r.id === runId ? updated : r))
      toast.success(t('payroll.run.secondApproved'))
    } catch {
      toast.error(t('payroll.run.secondApproveFailed'))
    }
  }

  // suppress unused variable warning — canCreate used for future create buttons
  void canCreate

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{t('payroll.title')}</h1>
      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">{t('payroll.tabs.config')}</TabsTrigger>
          <TabsTrigger value="salaries">{t('payroll.tabs.salaries')}</TabsTrigger>
          <TabsTrigger value="runs">{t('payroll.tabs.runs')}</TabsTrigger>
        </TabsList>

        {/* 설정 탭 */}
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('payroll.config.title')}</CardTitle></CardHeader>
            <CardContent>
              {configs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('payroll.config.empty')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 pr-4">{t('payroll.config.country')}</th>
                      <th className="pb-2 pr-4">{t('payroll.config.insuranceType')}</th>
                      <th className="pb-2 pr-4">{t('payroll.config.employeeRate')}</th>
                      <th className="pb-2 pr-4">{t('payroll.config.employerRate')}</th>
                      <th className="pb-2">{t('payroll.config.effectiveFrom')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{c.country}</td>
                        <td className="py-2 pr-4">{c.insuranceType}</td>
                        <td className="py-2 pr-4">{(c.employeeRate * 100).toFixed(2)}%</td>
                        <td className="py-2 pr-4">{(c.employerRate * 100).toFixed(2)}%</td>
                        <td className="py-2">{new Date(c.effectiveFrom).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 급여 목록 탭 */}
        <TabsContent value="salaries" className="mt-4 space-y-3">
          {salaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('payroll.salary.empty')}</p>
          ) : (
            salaries.map(s => (
              <Card key={s.id} className={`cursor-pointer transition-colors ${selectedSalaryId === s.id ? 'border-primary' : ''}`}
                onClick={() => setSelectedSalaryId(s.id)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{t('payroll.salary.base')}: {s.baseSalary.toLocaleString()}</span>
                      <span className="ml-3 text-xs text-muted-foreground">{s.country}</span>
                    </div>
                    <Badge variant={s.effectiveTo ? 'secondary' : 'default'}>
                      {s.effectiveTo ? t('payroll.salary.closed') : t('payroll.salary.active')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('payroll.salary.from')}: {new Date(s.effectiveFrom).toLocaleDateString()}
                    {s.effectiveTo && ` ~ ${new Date(s.effectiveTo).toLocaleDateString()}`}
                  </p>
                  {s.allowances.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {s.allowances.map(a => (
                        <span key={a.id} className="text-xs bg-muted px-2 py-0.5 rounded">
                          {a.type}: {a.amount.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* 급여 실행 탭 */}
        <TabsContent value="runs" className="mt-4 space-y-3">
          {!selectedSalaryId ? (
            <p className="text-sm text-muted-foreground">{t('payroll.run.selectSalary')}</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('payroll.run.empty')}</p>
          ) : (
            runs.map(r => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{new Date(r.month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
                    <Badge variant={r.isLocked ? 'default' : r.status === 'CONFIRMED' ? 'secondary' : 'outline'}>
                      {t(`payroll.run.status.${r.status}`)}
                      {r.isLocked && ' 🔒'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-muted-foreground text-xs">{t('payroll.run.gross')}</p><p>{r.grossPay.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground text-xs">{t('payroll.run.deductions')}</p><p>{r.totalDeductions.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground text-xs">{t('payroll.run.net')}</p><p className="font-semibold">{r.netPay.toLocaleString()}</p></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {canConfirm && r.status === 'PENDING' && (
                      <Button size="sm" onClick={() => void handleConfirm(selectedSalaryId, r.id)}>
                        {t('payroll.run.confirm')}
                      </Button>
                    )}
                    {canSecondApprove && r.status === 'CONFIRMED' && !r.isLocked && (
                      <Button size="sm" variant="default" onClick={() => void handleSecondApprove(selectedSalaryId, r.id)}>
                        {t('payroll.run.secondApprove')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
