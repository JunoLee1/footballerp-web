import { AppError } from '../lib/appError'
import { writeAuditLog } from '../lib/auditLog'
import type { SafeguardRepository } from './safeguard.repo'
import type { NotificationRepository } from '../notification/notification.repo'
import type { CreateSafeguardReportDto, UpdateSafeguardStatusDto } from './dto/safeguard.dto'

export class SafeguardService {
  constructor(
    private repo: SafeguardRepository,
    private notifRepo: NotificationRepository,
  ) {}

  async submit(dto: CreateSafeguardReportDto) {
    const report = await this.repo.create(dto)

    if (report.accusedUserId) {
      void this.repo.suspendUser(report.accusedUserId).catch(console.error)
    }

    void this.repo
      .findEmergencyRecipients()
      .then(recipients =>
        Promise.all(
          recipients.map(r =>
            this.notifRepo.createForUser(
              r.id,
              'SAFEGUARD_EMERGENCY',
              () => ({
                title: '[긴급] 유소년 보호 위반 신고 접수',
                body: '유소년 학대 의심 신고가 접수됐습니다. 즉시 확인이 필요합니다.',
              }),
              report.id,
            ),
          ),
        ),
      )
      .catch(console.error)

    void this.repo.createExternalReports(report.id).catch(console.error)

    return report
  }

  getAll() {
    return this.repo.findAll()
  }

  async getById(id: number) {
    const report = await this.repo.findById(id)
    if (!report) throw new AppError(404, 'SAFEGUARD_REPORT_NOT_FOUND')
    return report
  }

  async updateStatus(id: number, dto: UpdateSafeguardStatusDto, actorId: string) {
    const report = await this.repo.findById(id)
    if (!report) throw new AppError(404, 'SAFEGUARD_REPORT_NOT_FOUND')
    if (report.status === 'RESOLVED') throw new AppError(409, 'ALREADY_RESOLVED')
    const updated = await this.repo.updateStatus(id, dto)
    await writeAuditLog({
      actorId,
      action: 'SAFEGUARD_STATUS_UPDATED',
      targetId: id,
      detail: { previousStatus: report.status, newStatus: dto.status },
    })
    return updated
  }
}
