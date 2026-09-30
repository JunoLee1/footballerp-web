import { ClubRepository } from "./club.repo";
import { AppError } from "../lib/appError";
import { CreateClubDto, UpdateClubDto } from "./club.dto";
import Repository from "../country/country.repo";

function validateKRBusinessNumber(raw: string): boolean {
  const digits = raw.replace(/-/g, "");
  if (!/^\d{10}$/.test(digits)) return false;
  const d = digits.split("").map(Number) as [number, number, number, number, number, number, number, number, number, number];
  const weights: number[] = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i]! * weights[i]!;
  sum += Math.floor((d[8]! * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9]!;
}

function validateGBCompanyNumber(raw: string): boolean {
  return /^[A-Z0-9]{8}$/i.test(raw);
}

function validateATVatNumber(raw: string): boolean {
  return /^ATU\d{8}$/i.test(raw);
}

export class ClubService {
  constructor(
    private repo: ClubRepository,
    private countryRepo: Repository,
  ) {}

  async getAll(requesterRole: string, requesterClubId?: string | null) {
    if (requesterRole === "SUPER_ADMIN") return this.repo.findAll();
    if (requesterClubId) return this.repo.findByIds([requesterClubId]);
    return [];
  }

  async getById(id: string) {
    const club = await this.repo.findById(id);
    if (!club) throw new AppError(404, "CLUB_NOT_FOUND");
    return club;
  }

  async create(dto: CreateClubDto) {
    if (typeof dto.name !== "string" || !dto.name.trim()) {
      throw new AppError(400, "INVALID_CLUB_NAME");
    }
    if (!dto.countryId || typeof dto.countryId !== "number") {
      throw new AppError(400, "COUNTRY_REQUIRED");
    }

    const country = await this.countryRepo.findById(dto.countryId);
    if (!country) throw new AppError(404, "COUNTRY_NOT_FOUND");

    const trimmed = dto.name.trim();
    const existing = await this.repo.findByName(trimmed);
    if (existing) throw new AppError(409, "CLUB_NAME_ALREADY_EXISTS");

    if (dto.ownerEmail) {
      const emailDupe = await this.repo.findByOwnerEmail(dto.ownerEmail);
      if (emailDupe) throw new AppError(409, "OWNER_EMAIL_ALREADY_EXISTS");
    }

    const countryCode = country.code.toUpperCase();

    if (dto.businessRegNumber !== undefined) {
      if (!validateKRBusinessNumber(dto.businessRegNumber)) {
        throw new AppError(404, "INVALID_BUSINESS_REG_NUMBER");
      }
    } else if (countryCode === "KR" && dto.businessRegNumber === undefined) {
      throw new AppError(400, "BUSINESS_REG_NUMBER_REQUIRED");
    }

    if (dto.companyNumber !== undefined) {
      if (!validateGBCompanyNumber(dto.companyNumber)) {
        throw new AppError(404, "INVALID_COMPANY_NUMBER");
      }
    } else if (countryCode === "GB" && dto.companyNumber === undefined) {
      throw new AppError(400, "COMPANY_NUMBER_REQUIRED");
    }

    if (dto.vatNumber !== undefined) {
      if (!validateATVatNumber(dto.vatNumber)) {
        throw new AppError(404, "INVALID_VAT_NUMBER");
      }
    } else if (countryCode === "AT" && dto.vatNumber === undefined) {
      throw new AppError(400, "VAT_NUMBER_REQUIRED");
    }

    return this.repo.create({ ...dto, name: trimmed });
  }

  async update(id: string, dto: UpdateClubDto) {
    await this.getById(id);
    if (dto.name !== undefined) {
      if (typeof dto.name !== "string" || !dto.name.trim()) {
        throw new AppError(400, "INVALID_CLUB_NAME");
      }
      dto = { ...dto, name: dto.name.trim() };
    }
    if (dto.ownerEmail !== undefined) {
      const emailDupe = await this.repo.findByOwnerEmail(dto.ownerEmail);
      if (emailDupe) throw new AppError(409, "OWNER_EMAIL_ALREADY_EXISTS");
    }
    if (dto.businessRegNumber !== undefined && !validateKRBusinessNumber(dto.businessRegNumber)) {
      throw new AppError(404, "INVALID_BUSINESS_REG_NUMBER");
    }
    if (dto.companyNumber !== undefined && !validateGBCompanyNumber(dto.companyNumber)) {
      throw new AppError(404, "INVALID_COMPANY_NUMBER");
    }
    if (dto.vatNumber !== undefined && !validateATVatNumber(dto.vatNumber)) {
      throw new AppError(404, "INVALID_VAT_NUMBER");
    }
    if (dto.isLite !== undefined) {
      const [updatedClub] = await this.repo.cascadeIsLite(id, dto.isLite);
      const restDto = { ...dto };
      delete restDto.isLite;
      if (Object.keys(restDto).length > 0) {
        return this.repo.update(id, restDto);
      }
      return updatedClub;
    }
    return this.repo.update(id, dto);
  }
}
