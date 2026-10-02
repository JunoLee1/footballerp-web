import { AgencyRepository } from "./agency.repo";
import { AppError } from "../lib/appError";

export class AgencyService {
  constructor(private repo: AgencyRepository) {}

  list() {
    return this.repo.findAll();
  }

  async get(id: string) {
    const agency = await this.repo.findById(id);
    if (!agency) throw new AppError(404, "AGENCY_NOT_FOUND");
    return agency;
  }

  create(data: { name: string; contactName?: string; phone?: string; email?: string; commissionRate?: number }) {
    if (!data.name?.trim()) throw new AppError(400, "NAME_REQUIRED");
    return this.repo.create(data);
  }

  async update(id: string, data: { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; commissionRate?: number | null }) {
    await this.get(id);
    return this.repo.update(id, data);
  }

  async delete(id: string) {
    await this.get(id);
    const linked = await this.repo.hasLinkedData(id);
    if (linked && (linked._count.players > 0 || linked._count.contracts > 0)) {
      throw new AppError(409, "AGENCY_HAS_LINKED_DATA");
    }
    return this.repo.delete(id);
  }
}
