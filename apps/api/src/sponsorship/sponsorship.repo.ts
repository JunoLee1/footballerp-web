import type { PrismaClient } from "../generated/client";
import type { CreateSponsorshipDto, UpdateSponsorshipDto, SponsorshipListQuery } from "./dto/sponsorship.dto";

const INCLUDE = {
  createdBy: { select: { id: true, username: true } },
} as const;

export class SponsorshipRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(query: SponsorshipListQuery, page = 1, pageSize = 10) {
    const where = { deletedAt: null, ...(query.type ? { type: query.type } : {}) } as any;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sponsorship.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sponsorship.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySponsorName(sponsorName: string, excludeId?: string): Promise<{ id: string } | null> {
    const normalized = sponsorName.replace(/\s+/g, '').toLowerCase()
    type Row = { id: string }
    const rows = excludeId !== undefined
      ? await this.prisma.$queryRaw<Row[]>`
          SELECT id FROM "Sponsorship"
          WHERE LOWER(REGEXP_REPLACE("sponsorName", '\\s+', '', 'g')) = ${normalized}
            AND id != ${excludeId}
            AND "deletedAt" IS NULL
          LIMIT 1`
      : await this.prisma.$queryRaw<Row[]>`
          SELECT id FROM "Sponsorship"
          WHERE LOWER(REGEXP_REPLACE("sponsorName", '\\s+', '', 'g')) = ${normalized}
            AND "deletedAt" IS NULL
          LIMIT 1`
    return rows[0] ?? null
  }

  findById(id: string) {
    return this.prisma.sponsorship.findFirst({
      where: { id, deletedAt: null } as any,
      include: {
        ...INCLUDE,
        payments: { orderBy: { dueDate: "asc" } },
      },
    });
  }

  create(data: CreateSponsorshipDto & { createdById: string }) {
    return this.prisma.sponsorship.create({
      data: {
        sponsorName: data.sponsorName,
        type: data.type,
        totalFee: data.totalFee,
        contractStart: new Date(data.contractStart),
        contractEnd: new Date(data.contractEnd),
        paymentSchedule: data.paymentSchedule,
        currency: (data.currency ?? "KRW") as any,
        createdById: data.createdById,
        ...(data.targetExposureCount !== undefined && { targetExposureCount: data.targetExposureCount }),
        ...(data.targetFanReach !== undefined && { targetFanReach: data.targetFanReach }),
        ...(data.targetMediaValue !== undefined && { targetMediaValue: data.targetMediaValue }),
        ...(data.attachedContractId && { attachedContractId: data.attachedContractId }),
        ...(data.domesticBankName && { domesticBankName: data.domesticBankName }),
        ...(data.domesticAccountNumber && { domesticAccountNumber: data.domesticAccountNumber }),
        ...(data.domesticAccountHolder && { domesticAccountHolder: data.domesticAccountHolder }),
        ...(data.ukBankName && { ukBankName: data.ukBankName }),
        ...(data.ukSortCode && { ukSortCode: data.ukSortCode }),
        ...(data.ukAccountNumber && { ukAccountNumber: data.ukAccountNumber }),
        ...(data.ukSwiftBic && { ukSwiftBic: data.ukSwiftBic }),
        isOverseas: data.isOverseas ?? false,
        ...(data.businessRegNumber && { businessRegNumber: data.businessRegNumber }),
        ...(data.postalCode && { postalCode: data.postalCode }),
        ...(data.address && { address: data.address }),
        ...(data.addressDetail && { addressDetail: data.addressDetail }),
        ...(data.taxId && { taxId: data.taxId }),
        ...(data.overseasAddress && { overseasAddress: data.overseasAddress }),
      },
    });
  }

  createPayments(data: { sponsorshipId: string; dueDate: Date; amount: number }[]) {
    return this.prisma.sponsorshipPayment.createMany({ data });
  }

  update(id: string, data: UpdateSponsorshipDto) {
    return this.prisma.sponsorship.update({
      where: { id },
      data: {
        ...data,
        ...(data.contractStart && { contractStart: new Date(data.contractStart) }),
        ...(data.contractEnd && { contractEnd: new Date(data.contractEnd) }),
        ...(data.targetExposureCount !== undefined && { targetExposureCount: data.targetExposureCount }),
        ...(data.targetFanReach !== undefined && { targetFanReach: data.targetFanReach }),
        ...(data.targetMediaValue !== undefined && { targetMediaValue: data.targetMediaValue }),
      },
      include: {
        ...INCLUDE,
        payments: { orderBy: { dueDate: 'asc' } },
      },
    });
  }

  findPayments(sponsorshipId: string) {
    return this.prisma.sponsorshipPayment.findMany({
      where: { sponsorshipId },
      orderBy: { dueDate: "asc" },
    });
  }

  findPaymentById(id: string) {
    return this.prisma.sponsorshipPayment.findUnique({ where: { id } });
  }

  updatePayment(id: string, data: { status: "PAID"; paidAt: Date; adjustedAmount?: number; adjustmentReason?: string; appliedClauseId?: string }) {
    return this.prisma.sponsorshipPayment.update({
      where: { id },
      data: {
        status: data.status,
        paidAt: data.paidAt,
        ...(data.adjustedAmount !== undefined && { adjustedAmount: data.adjustedAmount }),
        ...(data.adjustmentReason !== undefined && { adjustmentReason: data.adjustmentReason }),
        ...(data.appliedClauseId !== undefined && { appliedClauseId: data.appliedClauseId }),
      },
    });
  }

  findExpiring(from: Date, to: Date) {
    return this.prisma.sponsorship.findMany({
      where: { contractEnd: { gte: from, lte: to }, deletedAt: null } as any,
      select: { id: true, sponsorName: true, contractEnd: true },
    });
  }

  // PA1: delete all pending payments so they can be regenerated
  deletePayments(sponsorshipId: string) {
    return this.prisma.sponsorshipPayment.deleteMany({
      where: { sponsorshipId, status: "PENDING" } as any,
    });
  }

  async getRoiSummary() {
    const sponsorships = await this.prisma.sponsorship.findMany({
      where: { deletedAt: null } as any,
      select: {
        id: true,
        sponsorName: true,
        type: true,
        totalFee: true,
        contractEnd: true,
        exposureCount: true,
        mediaValue: true,
        fanReach: true,
        payments: { select: { status: true, amount: true } },
      },
    });

    let totalFee = 0;
    let totalPaid = 0;
    let totalMediaValue = 0;
    let totalFanReach = 0;
    let totalExposureCount = 0;
    const now = new Date();

    const perSponsor = sponsorships.map((s) => {
      const fee = Number(s.totalFee);
      const paid = s.payments
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const mv = Number(s.mediaValue ?? 0);
      const roi = fee > 0 ? ((mv - fee) / fee) * 100 : 0;

      totalFee += fee;
      totalPaid += paid;
      totalMediaValue += mv;
      totalFanReach += s.fanReach ?? 0;
      totalExposureCount += s.exposureCount ?? 0;

      return {
        id: s.id,
        sponsorName: s.sponsorName,
        type: s.type,
        totalFee: fee,
        paid,
        mediaValue: mv,
        fanReach: s.fanReach ?? 0,
        exposureCount: s.exposureCount ?? 0,
        roi: Math.round(roi * 10) / 10,
        expiresSoon: s.contractEnd <= new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        contractEnd: s.contractEnd,
      };
    });

    const overallRoi = totalFee > 0 ? ((totalMediaValue - totalFee) / totalFee) * 100 : 0;

    return {
      totalContracts: sponsorships.length,
      totalFee,
      totalPaid,
      totalMediaValue,
      totalFanReach,
      totalExposureCount,
      overallRoi: Math.round(overallRoi * 10) / 10,
      sponsorships: perSponsor,
    };
  }

  // PB6: soft-delete a sponsorship contract
  softDelete(id: string) {
    return this.prisma.sponsorship.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
  }
}
