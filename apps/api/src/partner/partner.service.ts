import { PartnerRepository } from "./partner.repo";
import { AppError } from "../lib/appError";
import { encrypt } from "../lib/crypto";
import { Prisma } from "../generated/client";
import { PartnerType } from "../generated/enums";
import { CreatePartnerDto, UpdatePartnerDto, CreatePartnerContractDto, UpdatePartnerContractDto } from "./dto/partner.dto";

// #593 — 평문 민감 필드를 암호화 컬럼 쌍(encrypted + iv)으로 확장.
type EncryptedPair = {
  paymentAccountNumberEncrypted?: string | null;
  paymentAccountNumberIv?: string | null;
  businessRegNumberEncrypted?: string | null;
  businessRegNumberIv?: string | null;
};

function encryptPair<T extends { paymentAccountNumber?: string | null; businessRegNumber?: string | null }>(dto: T): Omit<T, "paymentAccountNumber" | "businessRegNumber"> & EncryptedPair {
  const { paymentAccountNumber, businessRegNumber, ...rest } = dto;
  const extra: EncryptedPair = {};
  if (paymentAccountNumber !== undefined) {
    if (paymentAccountNumber === null || paymentAccountNumber === "") {
      extra.paymentAccountNumberEncrypted = null;
      extra.paymentAccountNumberIv = null;
    } else {
      const { encrypted, iv } = encrypt(paymentAccountNumber);
      extra.paymentAccountNumberEncrypted = encrypted;
      extra.paymentAccountNumberIv = iv;
    }
  }
  if (businessRegNumber !== undefined) {
    if (businessRegNumber === null || businessRegNumber === "") {
      extra.businessRegNumberEncrypted = null;
      extra.businessRegNumberIv = null;
    } else {
      const { encrypted, iv } = encrypt(businessRegNumber);
      extra.businessRegNumberEncrypted = encrypted;
      extra.businessRegNumberIv = iv;
    }
  }
  return { ...rest, ...extra };
}

export class PartnerService {
  constructor(private repo: PartnerRepository) {}

  list(type?: PartnerType) {
    return this.repo.findAll(type);
  }

  async getById(id: number) {
    const partner = await this.repo.findById(id);
    if (!partner) throw new AppError(404, "PARTNER_NOT_FOUND");
    return partner;
  }

  async create(dto: CreatePartnerDto) {
    if (!dto.name?.trim()) throw new AppError(400, "PARTNER_NAME_REQUIRED");
    const trimmed = dto.name.trim();
    if (await this.repo.findByName(trimmed)) throw new AppError(409, "PARTNER_NAME_DUPLICATE");
    const payload: Prisma.PartnerUncheckedCreateInput = encryptPair({ ...dto, name: trimmed });
    return this.repo.create(payload);
  }

  async update(id: number, dto: UpdatePartnerDto) {
    await this.getById(id);
    if (dto.name !== undefined && !dto.name.trim()) throw new AppError(400, "PARTNER_NAME_REQUIRED");
    const trimmed = dto.name !== undefined ? dto.name.trim() : undefined;
    if (trimmed && await this.repo.findByName(trimmed, id)) throw new AppError(409, "PARTNER_NAME_DUPLICATE");
    if (dto.tier === null && dto.tierReason !== undefined && dto.tierReason !== null) {
      throw new AppError(400, "TIER_REQUIRED_FOR_TIER_REASON");
    }
    const payload: Prisma.PartnerUncheckedUpdateInput = encryptPair({ ...dto, ...(trimmed !== undefined && { name: trimmed }) });
    return this.repo.update(id, payload);
  }

  async createContract(partnerId: number, dto: CreatePartnerContractDto) {
    await this.getById(partnerId);
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new AppError(400, "CONTRACT_END_BEFORE_START");
    }
    return this.repo.createContract(partnerId, dto);
  }

  async updateContract(partnerId: number, contractId: number, dto: UpdatePartnerContractDto) {
    await this.getById(partnerId);
    const contract = await this.repo.findContractById(contractId);
    if (!contract || contract.partnerId !== partnerId) throw new AppError(404, "CONTRACT_NOT_FOUND");
    return this.repo.updateContract(contractId, dto);
  }
}
