import { PrismaClient, Prisma } from "../generated/client";
import { PartnerType } from "../generated/enums";
import { CreatePartnerContractDto, UpdatePartnerContractDto } from "./dto/partner.dto";

const PARTNER_SELECT = {
  id: true, type: true, name: true, country: true,
  website: true, address: true, phone: true, createdAt: true,
  tier: true, tierReason: true,
  // #593 — 응답 직렬화는 암호화 필드 자체가 아니라 마스킹된 hint 만 노출 (컨트롤러/serializer 에서 처리).
  // 현재는 raw select · 필요 시 후속 이슈에서 마스킹 추가.
  sla: true, contactName: true, contactPhone: true, contactEmail: true,
  paymentBankName: true, paymentTerms: true,
  paymentAccountNumberEncrypted: true, paymentAccountNumberIv: true,
  businessRegNumberEncrypted: true, businessRegNumberIv: true,
} as const;

const CONTRACT_SELECT = {
  id: true, partnerId: true, status: true, startDate: true,
  endDate: true, sponsorshipFee: true, discountRate: true, notes: true,
  responseHours: true, resolutionDays: true, penaltyPerDay: true, createdAt: true,
} as const;

export class PartnerRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(type?: PartnerType) {
    const where = type ? { type } : {};
    return this.prisma.partner.findMany({
      where,
      select: { ...PARTNER_SELECT, contracts: { select: CONTRACT_SELECT, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    });
  }

  findByName(name: string, excludeId?: string) {
    return this.prisma.partner.findFirst({
      where: { name, ...(excludeId !== undefined && { id: { not: excludeId } }) },
      select: { id: true },
    });
  }

  findById(id: string) {
    return this.prisma.partner.findUnique({
      where: { id },
      select: { ...PARTNER_SELECT, contracts: { select: CONTRACT_SELECT, orderBy: { createdAt: "desc" } } },
    });
  }

  // #593 — 서비스에서 암호화 필드로 확장 후 넘어오므로 Prisma 의 UncheckedCreateInput
  // 타입으로 받아 spread. 서비스가 name·type 필수 필드 검증.
  create(data: Prisma.PartnerUncheckedCreateInput) {
    return this.prisma.partner.create({
      data: {
        type: data.type,
        name: data.name,
        ...(data.country && { country: data.country }),
        ...(data.website && { website: data.website }),
        ...(data.address && { address: data.address }),
        ...(data.phone && { phone: data.phone }),
        ...(data.sla !== undefined && { sla: data.sla }),
        ...(data.contactName !== undefined && { contactName: data.contactName }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
        ...(data.paymentBankName !== undefined && { paymentBankName: data.paymentBankName }),
        ...(data.paymentAccountNumberEncrypted !== undefined && {
          paymentAccountNumberEncrypted: data.paymentAccountNumberEncrypted,
          paymentAccountNumberIv: data.paymentAccountNumberIv,
        }),
        ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
        ...(data.businessRegNumberEncrypted !== undefined && {
          businessRegNumberEncrypted: data.businessRegNumberEncrypted,
          businessRegNumberIv: data.businessRegNumberIv,
        }),
      },
      select: PARTNER_SELECT,
    });
  }

  update(id: string, data: Prisma.PartnerUncheckedUpdateInput) {
    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.website !== undefined && { website: data.website }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.tier !== undefined && { tier: data.tier }),
        ...(data.tierReason !== undefined && { tierReason: data.tierReason }),
        ...(data.sla !== undefined && { sla: data.sla }),
        ...(data.contactName !== undefined && { contactName: data.contactName }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
        ...(data.paymentBankName !== undefined && { paymentBankName: data.paymentBankName }),
        ...(data.paymentAccountNumberEncrypted !== undefined && {
          paymentAccountNumberEncrypted: data.paymentAccountNumberEncrypted,
          paymentAccountNumberIv: data.paymentAccountNumberIv,
        }),
        ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
        ...(data.businessRegNumberEncrypted !== undefined && {
          businessRegNumberEncrypted: data.businessRegNumberEncrypted,
          businessRegNumberIv: data.businessRegNumberIv,
        }),
      },
      select: PARTNER_SELECT,
    });
  }

  createContract(partnerId: string, dto: CreatePartnerContractDto) {
    return this.prisma.partnerContract.create({
      data: {
        partnerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        ...(dto.sponsorshipFee !== undefined && { sponsorshipFee: dto.sponsorshipFee }),
        ...(dto.discountRate !== undefined && { discountRate: dto.discountRate }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.responseHours !== undefined && { responseHours: dto.responseHours }),
        ...(dto.resolutionDays !== undefined && { resolutionDays: dto.resolutionDays }),
        ...(dto.penaltyPerDay !== undefined && { penaltyPerDay: dto.penaltyPerDay }),
      },
      select: CONTRACT_SELECT,
    });
  }

  updateContract(id: number, dto: UpdatePartnerContractDto) {
    return this.prisma.partnerContract.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.sponsorshipFee !== undefined && { sponsorshipFee: dto.sponsorshipFee }),
        ...(dto.discountRate !== undefined && { discountRate: dto.discountRate }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.responseHours !== undefined && { responseHours: dto.responseHours }),
        ...(dto.resolutionDays !== undefined && { resolutionDays: dto.resolutionDays }),
        ...(dto.penaltyPerDay !== undefined && { penaltyPerDay: dto.penaltyPerDay }),
      },
      select: CONTRACT_SELECT,
    });
  }

  findContractById(id: number) {
    return this.prisma.partnerContract.findUnique({
      where: { id },
      select: { id: true, partnerId: true },
    });
  }

  findExpiringContracts(withinDays: number) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);
    return this.prisma.partnerContract.findMany({
      where: { status: "ACTIVE", endDate: { gte: now, lte: threshold } },
      select: {
        id: true, endDate: true, sponsorshipFee: true, discountRate: true,
        partner: { select: { id: true, name: true, type: true } },
      },
      orderBy: { endDate: "asc" },
    });
  }
}
