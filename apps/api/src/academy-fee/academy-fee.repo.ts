import type { PrismaClient } from '../generated/client'
import type { CreateAcademyFeeDto, FeeListQuery } from './dto/academy-fee.dto'

const INCLUDE = {
  player: { select: { id: true, playerName: true, teamId: true, status: true } },
  guardian: { select: { id: true, username: true } },
} as const

export class AcademyFeeRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: FeeListQuery) {
    return this.prisma.academyFee.findMany({
      where: {
        ...(query.status && { status: query.status}),
        ...(query.year && { year: query.year }),
        ...(query.month && { month: query.month }),
        ...(query.teamId && { player: { teamId: query.teamId } }),
      },//TODO: 상태값 타입 수정
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  findById(id: string) {
    return this.prisma.academyFee.findUnique({ where: { id }, include: INCLUDE })
  }

  findByPlayer(playerId: string) {
    return this.prisma.academyFee.findMany({
      where: { playerId },
      include: INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
  }

  findOverdue(beforeDate: Date) {
    return this.prisma.academyFee.findMany({
      where: { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: beforeDate } },
      include: INCLUDE,
    })
  }

  findAllActiveYouthPlayers() {
    return this.prisma.player.findMany({
      where: { team: { type: 'YOUTH', isLite: false }, guardianId: { not: null } },
      select: { id: true, playerName: true, teamId: true, guardianId: true },
    })
  }

  create(data: CreateAcademyFeeDto) {
    return this.prisma.academyFee.create({ data, include: INCLUDE })
  }

  createMany(fees: CreateAcademyFeeDto[]) {
    return this.prisma.academyFee.createMany({ data: fees, skipDuplicates: true })
  }

  updateStatus(id: string, status:AcademyFee, extra?: { paidAt?: Date }) {
    return this.prisma.academyFee.update({
      where: { id },
      data: { status: status, ...extra },
      include: INCLUDE,
    })
  }

  submitPaymentProof(id: string, url: string) {
    return this.prisma.academyFee.update({
      where: { id },
      data: { status: 'SUBMITTED', paymentProofUrl: url, paymentSubmittedAt: new Date() },
      include: INCLUDE,
    })
  }

  approvePayment(id: string) {
    return this.prisma.academyFee.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), receiptIssuedAt: new Date() },
      include: INCLUDE,
    })
  }

  confirmTossPayment(id: string, pgTransactionId: string) {
    const now = new Date()
    return this.prisma.academyFee.update({
      where: { id, status: { not: 'PAID'} },
      data: {
        status: 'PAID' ,
        paidAt: now,
        paymentMethod: 'PG',
        pgTransactionId,
        receiptIssuedAt: now,
      },
      include: INCLUDE,
    })
  }

  getReceipt(id: string) {
    return this.prisma.academyFee.findUnique({
      where: { id },
      select: {
        id: true,
        year: true,
        month: true,
        amount: true,
        paidAt: true,
        paymentMethod: true,
        pgTransactionId: true,
        receiptIssuedAt: true,
        player: { select: { playerName: true } },
        guardian: { select: { username: true } },
      },
    });
  }

  adminSubmitProof(id: string, paymentProofUrl?: string) {
    return this.prisma.academyFee.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        paymentMethod: 'BANK_TRANSFER',
        paymentSubmittedAt: new Date(),
        ...(paymentProofUrl && { paymentProofUrl }),
      },
      include: INCLUDE,
    });
  }

  lockPlayer(playerId: string) {
    return this.prisma.player.update({
      where: { id: playerId },
      data: { status: 'SUSPENDED'},
    })
  }

  findByPlayerYearMonth(playerId: string, year: number, month: number) {
    return this.prisma.academyFee.findFirst({
      where: { playerId, year, month },
      select: { id: true },
    })
  }

  createWithProof(data: CreateAcademyFeeDto & { paymentProofUrl: string }) {
    return this.prisma.academyFee.create({
      data: {
        ...data,
        status: 'SUBMITTED',
        paymentMethod: 'BANK_TRANSFER',
        paymentSubmittedAt: new Date(),
      },
      include: INCLUDE,
    })
  }

  searchYouthPlayers(name: string) {
    return this.prisma.player.findMany({
      where: {
        playerName: { contains: name, mode: 'insensitive' as const },
        team: { type: 'YOUTH', isLite: false },
      },
      select: {
        id: true,
        playerName: true,
        guardianId: true,
        guardian: { select: { username: true } },
      },
      take: 10,
      orderBy: { playerName: 'asc' },
    })
  }

  getFinanceStats(year: number, month: number) {
    return this.prisma.academyFee.groupBy({
      by: ['status'],
      where: { year, month },
      _count: { id: true },
      _sum: { amount: true },
    })
  }
}
