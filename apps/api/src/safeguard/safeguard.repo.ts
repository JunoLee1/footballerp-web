import type { PrismaClient } from '../generated/client'
import type { CreateSafeguardReportDto, UpdateSafeguardStatusDto } from './dto/safeguard.dto'

export class SafeguardRepository {
  constructor(private prisma: PrismaClient) {}

  create(dto: CreateSafeguardReportDto) {
    return this.prisma.safeguardReport.create({
      data: {
        description: dto.description,
        status: 'RECEIVED',
        ...(dto.contactInfo !== undefined && { contactInfo: dto.contactInfo }),
        ...(dto.accusedUserId !== undefined && { accusedUserId: dto.accusedUserId }),
      },
    })
  }

  findAll() {
    return this.prisma.safeguardReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: { accusedUser: { select: { id: true, username: true, role: true } } },
    })
  }

  findById(id: string) {
    return this.prisma.safeguardReport.findUnique({
      where: { id },
      include: { accusedUser: { select: { id: true, username: true, role: true } } },
    })
  }

  updateStatus(id: string, dto: UpdateSafeguardStatusDto) {
    return this.prisma.safeguardReport.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.resolvedNote !== undefined && { resolvedNote: dto.resolvedNote }),
      },
    })
  }

  suspendUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended: true, suspendedAt: new Date() },
    })
  }

  unsuspendUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended: false, suspendedAt: null },
    })
  }

  findEmergencyRecipients() {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { role: 'GM' },
          { role: 'FRONT_OFFICE', frontOfficeRole: 'TD' },
          { role: 'COACHING_STAFF', coachingRole: 'MEDICAL_DIRECTOR' },
        ],
        isDeleted: false,
        isSuspended: false,
      },
      select: { id: true },
    })
  }

  createExternalReports(safeguardReportId: string) {
    const targets = ['POLICE', 'CHILD_PROTECTION_AGENCY', 'FOOTBALL_ASSOCIATION'] as const
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 3)
    return this.prisma.externalReport.createMany({
      data: targets.map(target => ({
        safeguardReportId,
        target,
        status: 'PENDING_SUBMISSION' as const,
        reportData: { safeguardReportId, generatedAt: new Date().toISOString() },
        dueDate,
      })),
      skipDuplicates: true,
    })
  }
}
