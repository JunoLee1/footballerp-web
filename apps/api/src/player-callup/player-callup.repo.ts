import { PrismaClient } from "../generated/client";
import { CreateCallupDto, CallupListQuery } from "./dto/player-callup.dto";

const SELECT = {
  id: true,
  status: true,
  callupType: true,
  reason: true,
  rejectionReason: true,
  requiredDocuments: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  youthCoachConfirmed: true,
  medicalConfirmed: true,
  player: { select: { id: true, playerName: true, position: true, guardianId: true } },
  fromTeam: { select: { id: true, name: true } },
  toTeam: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, nickname: true } },
  approvedBy: { select: { id: true, nickname: true } },
} as const;

export class PlayerCallupRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: CallupListQuery) {
    const where = query.status ? { status: query.status as any } : {};
    return this.prisma.playerCallup.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.playerCallup.findUnique({ where: { id }, select: SELECT });
  }

  findActiveByPlayerId(playerId: string) {
    return this.prisma.playerCallup.findFirst({
      where: { playerId, status: { in: ["REQUESTED", "DOCS_SUBMITTED", "APPROVED"] } },
      select: { id: true },
    });
  }

  findActiveContract(playerId: string) {
    const now = new Date();
    return this.prisma.contract.findFirst({
      where: {
        playerId,
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { id: true },
    });
  }

  create(dto: CreateCallupDto & { requestedById: string }) {
    return this.prisma.playerCallup.create({
      data: {
        playerId: dto.playerId,
        fromTeamId: dto.fromTeamId,
        toTeamId: dto.toTeamId,
        requestedById: dto.requestedById,
        reason: dto.reason,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        callupType: dto.callupType ?? "OFFICIAL",
      },
      select: SELECT,
    });
  }

  approve(id: number, approvedById: string) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { status: "APPROVED", approvedById },
      select: SELECT,
    });
  }

  reject(id: number, approvedById: string, rejectionReason: string) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { status: "REJECTED", approvedById, rejectionReason },
      select: SELECT,
    });
  }

  complete(id: number) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { status: "COMPLETED" },
      select: SELECT,
    });
  }

  confirmYouth(id: number) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { youthCoachConfirmed: true },
      select: SELECT,
    });
  }

  confirmMedical(id: number) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { medicalConfirmed: true },
      select: SELECT,
    });
  }

  submitDocs(id: number) {
    return this.prisma.playerCallup.update({
      where: { id },
      data: { status: "DOCS_SUBMITTED" },
      select: SELECT,
    });
  }

  updatePlayerTeam(playerId: string, teamId: number) {
    return this.prisma.player.update({
      where: { id: playerId },
      data: { teamId },
    });
  }

  findGuardianEmail(guardianId: string) {
    return this.prisma.user.findUnique({
      where: { id: guardianId },
      select: { email: true },
    });
  }
}
