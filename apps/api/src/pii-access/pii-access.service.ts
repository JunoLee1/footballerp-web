import { AppError } from "../lib/appError";
import { PiiAccessRepository } from "./pii-access.repo";

const GRANT_HOURS = 24;

export class PiiAccessService {
  constructor(private repo: PiiAccessRepository) {}

  async requestAccess(requesterId: string, targetUserId: string, reason: string) {
    if (requesterId === targetUserId) throw new AppError(400, "CANNOT_REQUEST_SELF");
    if (!reason.trim()) throw new AppError(400, "REASON_REQUIRED");

    const existing = await this.repo.hasPendingRequest(requesterId, targetUserId);
    if (existing) throw new AppError(409, "PENDING_REQUEST_EXISTS");

    return this.repo.create(targetUserId, requesterId, reason.trim());
  }

  listPending() {
    return this.repo.findPending();
  }

  myRequests(requesterId: string) {
    return this.repo.findByRequester(requesterId);
  }

  async approve(id: string, reviewerId: string) {
    const req = await this.repo.findById(id);
    if (!req) throw new AppError(404, "REQUEST_NOT_FOUND");
    if (req.status !== "PENDING") throw new AppError(409, "ALREADY_REVIEWED");

    const grantedUntil = new Date();
    grantedUntil.setHours(grantedUntil.getHours() + GRANT_HOURS);

    return this.repo.review(id, "APPROVED", reviewerId, grantedUntil);
  }

  async deny(id: string, reviewerId: string) {
    const req = await this.repo.findById(id);
    if (!req) throw new AppError(404, "REQUEST_NOT_FOUND");
    if (req.status !== "PENDING") throw new AppError(409, "ALREADY_REVIEWED");

    return this.repo.review(id, "DENIED", reviewerId);
  }
}
