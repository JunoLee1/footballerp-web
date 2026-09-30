import { AppError } from "../../lib/appError";
import type { ContactLogRepository } from "./contact-log.repo";
import type { PartnerRepository } from "../partner.repo";
import type { CreateContactLogDto } from "./dto/contact-log.dto";

export class ContactLogService {
  constructor(
    private repo: ContactLogRepository,
    private partnerRepo: PartnerRepository,
  ) {}

  async list(partnerId: string) {
    const partner = await this.partnerRepo.findById(partnerId);
    if (!partner) throw new AppError(404, "PARTNER_NOT_FOUND");
    return this.repo.findAll(partnerId);
  }

  async create(partnerId: string, dto: CreateContactLogDto, actorId: string) {
    const partner = await this.partnerRepo.findById(partnerId);
    if (!partner) throw new AppError(404, "PARTNER_NOT_FOUND");
    if (dto.nextActionDate && !dto.nextActionNote) {
      throw new AppError(400, "NEXT_ACTION_NOTE_REQUIRED");
    }
    return this.repo.create(partnerId, { ...dto, actorId });
  }
}
