import { PrismaClient } from "../generated/client";

export class AttendanceAppealRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: {
    trainingResultId: string;
    originalStatus: string;
    requestedStatus: string;
    reason: string;
    createdById: string;
  }) {
    return (this.prisma.attendanceAppeal as any).create({
      data,
      include: { trainingResult: { include: { session: true, player: true } }, createdBy: { select: { id: true, nickname: true } } },
    });
  }

  async findAll(status?: string) {
    return (this.prisma.attendanceAppeal as any).findMany({
      where: status ? { status } : undefined,
      include: {
        trainingResult: { include: { session: { select: { id: true, date: true } }, player: { select: { id: true, playerName: true } } } },
        createdBy: { select: { id: true, nickname: true } },
        reviewedBy: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: number) {
    return (this.prisma.attendanceAppeal as any).findUnique({
      where: { id },
      include: {
        trainingResult: { include: { session: true, player: true } },
        createdBy: { select: { id: true, nickname: true } },
        reviewedBy: { select: { id: true, nickname: true } },
      },
    });
  }

  async updateStatus(id: number, status: string, reviewedById: string, reviewNote?: string) {
    return (this.prisma.attendanceAppeal as any).update({
      where: { id },
      data: { status, reviewedById, reviewedAt: new Date(), ...(reviewNote ? { reviewNote } : {}) },
    });
  }
}
