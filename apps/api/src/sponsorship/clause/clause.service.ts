import { AppError } from "../../lib/appError";
import type { ClauseRepository } from "./clause.repo";
import type { CreateClauseDto } from "./dto/clause.dto";

export class ClauseService {
  constructor(private repo: ClauseRepository) {}

  list(sponsorshipId: string) {
    return this.repo.findAll(sponsorshipId);
  }

  create(sponsorshipId: string, dto: CreateClauseDto) {
    if (dto.rate === undefined && dto.fixedAmount === undefined) throw new AppError(400, "CLAUSE_AMOUNT_REQUIRED");
    return this.repo.create(sponsorshipId, dto);
  }

  async applyClause(id: number, sponsorshipId: string) {
    const clause = await this.repo.findById(id);
    if (!clause || clause.sponsorshipId !== sponsorshipId) throw new AppError(404, "CLAUSE_NOT_FOUND");
    if (clause.status !== "PENDING") throw new AppError(400, "CLAUSE_ALREADY_APPLIED");
    return this.repo.updateStatus(id, "APPLIED");
  }

  async waiveClause(id: number, sponsorshipId: string) {
    const clause = await this.repo.findById(id);
    if (!clause || clause.sponsorshipId !== sponsorshipId) throw new AppError(404, "CLAUSE_NOT_FOUND");
    if (clause.status !== "PENDING") throw new AppError(400, "CLAUSE_NOT_PENDING");
    return this.repo.updateStatus(id, "WAIVED");
  }

  async copyFrom(targetSponsorshipId: string, sourceSponsorshipId: string) {
    if (sourceSponsorshipId === targetSponsorshipId) throw new AppError(400, "SAME_SPONSORSHIP");
    const copied = await this.repo.copyPendingFrom(sourceSponsorshipId, targetSponsorshipId);
    return { copied };
  }
}
