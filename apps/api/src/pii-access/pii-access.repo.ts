import { PrismaClient, PiiAccessStatus } from "../generated/client";

const REQUEST_SELECT = {
  id: true,
  reason: true,
  status: true,
  grantedUntil: true,
  createdAt: true,
  reviewedAt: true,
  targetUser: { select: { id: true, username: true, nickname: true } },
  requester:  { select: { id: true, username: true, nickname: true } },
  reviewedBy: { select: { id: true, username: true, nickname: true } },
} as const;

export class PiiAccessRepository {
  constructor(private prisma: PrismaClient) {}

  create(targetUserId: string, requesterId: string, reason: string) {
    return this.prisma.piiAccessRequest.create({
      data: { targetUserId, requesterId, reason },
      select: REQUEST_SELECT,
    });
  }

  findPending() {
    return this.prisma.piiAccessRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: REQUEST_SELECT,
    });
  }

  findByRequester(requesterId: string) {
    return this.prisma.piiAccessRequest.findMany({
      where: { requesterId },
      orderBy: { createdAt: "desc" },
      select: REQUEST_SELECT,
    });
  }

  findById(id: string) {
    return this.prisma.piiAccessRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
  }

  review(id: string, status: PiiAccessStatus, reviewedById: string, grantedUntil?: Date) {
    return this.prisma.piiAccessRequest.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: new Date(), grantedUntil: grantedUntil ?? null },
      select: REQUEST_SELECT,
    });
  }

  hasPendingRequest(requesterId: string, targetUserId: string) {
    return this.prisma.piiAccessRequest.findFirst({
      where: { requesterId, targetUserId, status: "PENDING" },
      select: { id: true },
    });
  }
}
