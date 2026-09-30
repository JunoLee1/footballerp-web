import { AppError } from "../lib/appError";
import type { SoftwareLicenseRepository } from "./software-license.repo";
import type { CreateSoftwareLicenseDto, UpdateSoftwareLicenseDto } from "./dto/software-license.dto";

export class SoftwareLicenseService {
  constructor(private repo: SoftwareLicenseRepository) {}

  findAll() { return this.repo.findAll(); }
  findById(id: number) { return this.repo.findById(id); }

  create(dto: CreateSoftwareLicenseDto, createdById: string) {
    return this.repo.create({ ...dto, createdById });
  }

  update(id: number, dto: UpdateSoftwareLicenseDto) {
    return this.repo.update(id, dto);
  }

  async assign(id: number, _userId: number) {
    const license = await this.repo.findById(id);
    if (!license) throw new AppError(404, "LICENSE_NOT_FOUND");
    if (license.usedSeats >= license.totalSeats) {
      throw new AppError(400, "LICENSE_SEAT_EXCEEDED");
    }
    return this.repo.incrementSeats(id, +1);
  }

  async revoke(id: number, _userId: number) {
    const license = await this.repo.findById(id);
    if (!license) throw new AppError(404, "LICENSE_NOT_FOUND");
    const delta = license.usedSeats > 0 ? -1 : 0;
    if (delta === 0) return license;
    return this.repo.incrementSeats(id, delta);
  }
}
