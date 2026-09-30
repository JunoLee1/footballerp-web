import { PrismaClient } from "../generated/client";
import { CreateTransferDto, CreateRecallDto } from "./dto/transfer.dto";
import { RecallStatus } from "../generated/enums";

const n = <T>(v: T | undefined): T | null => v ?? null;

export class TransferRepository {
  constructor(private prisma: PrismaClient) {}

  findByPlayer(playerId: string) {
    return this.prisma.transfer.findMany({
      where: { playerId },
      select: {
        id: true,
        type: true,
        date: true,
        startDate: true,
        endDate: true,
        fee: true,
        fromClub: true,
        toClub: true,
        recall: { select: { id: true, status: true } },
      },
      orderBy: { date: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.transfer.findUnique({
      where: { id },
      include: { recall: true },
    });
  }

  createTransfer(dto: CreateTransferDto) {
    return this.prisma.transfer.create({
      data: {
        playerId: dto.playerId,
        type: dto.type,
        date: new Date(dto.date),
        startDate: n(dto.startDate ? new Date(dto.startDate) : undefined),
        endDate: n(dto.endDate ? new Date(dto.endDate) : undefined),
        fee: n(dto.fee),
        fromClub: n(dto.fromClub),
        toClub: n(dto.toClub),
      },
    });
  }

  findRecallById(id: number) {
    return this.prisma.recall.findUnique({ where: { id } });
  }

  createRecall(dto: CreateRecallDto, requestedById: string) {
    return this.prisma.recall.create({
      data: { transferId: dto.transferId, requestedById },
    });
  }

  updateRecallStatus(id: number, status: RecallStatus, approvedById: string) {
    return this.prisma.recall.update({
      where: { id },
      data: {
        status,
        ...(status === RecallStatus.APPROVED && {
          approvedById,
          approvedAt: new Date(),
        }),
      },
    });
  }

  findRecallsByStatus(status?: RecallStatus) {
    return this.prisma.recall.findMany({
      where: { ...(status && { status }) },
      include: {
        transfer: { select: { playerId: true, type: true, fromClub: true, toClub: true } },
        requestedBy: { select: { username: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
  }

  async exportLoanInData(transferId: number) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: { id: true, type: true, fromClub: true, toClub: true, startDate: true, endDate: true, playerId: true },
    });
    if (!transfer || transfer.type !== "LOAN_IN") return null;

    const [player, trainingResults, injuries, matchStats] = await Promise.all([
      this.prisma.player.findUnique({
        where: { id: transfer.playerId },
        select: { id: true, playerName: true, position: true, nationality: true, dateOfBirthEncrypted: true, dateOfBirthIv: true },
      }),
      this.prisma.trainingResult.findMany({
        where: { playerId: transfer.playerId },
        select: {
          session: { select: { date: true, sessionType: true } },
          attendance: true, performanceScore: true, feedback: true,
        },
        orderBy: { session: { date: "asc" } },
      }),
      this.prisma.injury.findMany({
        where: { playerId: transfer.playerId },
        select: { bodyPart: true, cause: true, status: true, occurredAt: true, expectedReturnDate: true },
        orderBy: { occurredAt: "asc" },
      }),
      this.prisma.playerMatchStats.findMany({
        where: { playerId: transfer.playerId },
        select: {
          match: { select: { date: true, homeTeamName: true, awayTeamName: true, homeScore: true, awayScore: true } },
          goals: true, assists: true, minutesPlayed: true, xG: true, xA: true,
        },
        orderBy: { match: { date: "asc" } },
      }),
    ]);

    return { transfer, player, trainingResults, injuries, matchStats };
  }
}
