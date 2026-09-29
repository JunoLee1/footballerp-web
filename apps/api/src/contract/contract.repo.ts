import { PrismaClient } from "../generated/client";
import { ContractStatus } from "../generated/enums";
import {
  CreateContractDto,
  CreateBuyoutDto,
  CreateExtensionDto,
  CreateBonusDto,
} from "./dto/contract.dto";

const CONTRACT_DETAIL = {
  id: true,
  startDate: true,
  endDate: true,
  salary: true,
  status: true,
  playerId: true,
  managedById: true,
  agencyId: true,
  agencyCommission: true,
  signingBonus: true,
  signingBonusScheduledAt: true,
  signingBonusPaidAt: true,
  buyoutClause: true,
  extensionOptions: true,
  performanceBonuses: {
    include: { triggers: true },
  },
} as const;

export class ContractRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.contract.findMany({
      select: {
        id: true,
        startDate: true,
        endDate: true,
        salary: true,
        status: true,
        managedById: true,
        player: { select: { id: true, playerName: true } },
      },
      orderBy: { startDate: "desc" },
    });
  }

  findByPlayerId(playerId: string) {
    return this.prisma.contract.findMany({
      where: { playerId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        salary: true,
        status: true,
        managedById: true,
      },
      orderBy: { startDate: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.contract.findUnique({
      where: { id },
      select: CONTRACT_DETAIL,
    });
  }

  findPlayerOwnerUserId(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
  }

  create(dto: CreateContractDto) {
    return this.prisma.contract.create({
      data: {
        playerId: dto.playerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        salary: dto.salary,
        ...(dto.signingBonus !== undefined && dto.signingBonus > 0 && { signingBonus: BigInt(Math.round(dto.signingBonus)) }),
        ...(dto.signingBonusScheduledAt && { signingBonusScheduledAt: new Date(dto.signingBonusScheduledAt) }),
        ...(dto.managedById && { managedById: dto.managedById }),
        ...(dto.agencyId && { agencyId: dto.agencyId }),
        ...(dto.agencyCommission !== undefined && { agencyCommission: dto.agencyCommission }),
      },
      select: CONTRACT_DETAIL,
    });
  }

  updateStatus(id: number, status: ContractStatus) {
    return this.prisma.contract.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
  }

  createBuyout(contractId: number, dto: CreateBuyoutDto) {
    return this.prisma.buyoutClause.create({
      data: {
        contractId,
        amount: dto.amount,
        ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      },
    });
  }

  createExtension(contractId: number, dto: CreateExtensionDto) {
    return this.prisma.extensionOption.create({
      data: {
        contractId,
        condition: dto.condition,
        durationMonths: dto.durationMonths,
        ...(dto.conditionText !== undefined && { conditionText: dto.conditionText }),
        ...(dto.minAppearances !== undefined && { minAppearances: dto.minAppearances }),
      },
    });
  }

  findActiveBuyout(contractId: number) {
    const now = new Date();
    return this.prisma.buyoutClause.findFirst({
      where: {
        contractId,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
    });
  }

  createBonus(contractId: number, dto: CreateBonusDto) {
    return this.prisma.performanceBonus.create({
      data: {
        contractId,
        amount: dto.amount,
        description: dto.description,
        triggers: {
          create: dto.triggers.map((t) => ({
            metric: t.metric,
            threshold: t.threshold,
            period: t.period,
            ...(t.competitionType && { competitionType: t.competitionType }),
          })),
        },
      },
      include: { triggers: true },
    });
  }

  hasBuyout(contractId: number) {
    return this.prisma.buyoutClause.findUnique({
      where: { contractId },
      select: { id: true },
    });
  }

  markSigningBonusPaid(id: number, paidAt: Date) {
    return this.prisma.contract.update({
      where: { id },
      data: { signingBonusPaidAt: paidAt },
      select: CONTRACT_DETAIL,
    });
  }

  terminateActiveContracts(playerId: string) {
    return this.prisma.contract.updateMany({
      where: { playerId, status: "ACTIVE" },
      data: { status: "TERMINATED" },
    });
  }

  getSquadSalarySummary() {
    return this.prisma.contract.groupBy({
      by: ["playerId"],
      where: { status: "ACTIVE" },
      _max: { salary: true },
    });
  }

  async getSquadSalaryByPosition() {
    const activeContracts = await this.prisma.contract.findMany({
      where: { status: "ACTIVE" },
      select: {
        salary: true,
        player: { select: { id: true, playerName: true, position: true, level: true } },
      },
      orderBy: { salary: "desc" },
    });
    const positionMap = new Map<string, { total: number; count: number; players: { id: string; name: string; salary: number; level: string }[] }>();
    for (const c of activeContracts) {
      const pos = c.player.position;
      const entry = positionMap.get(pos) ?? { total: 0, count: 0, players: [] };
      entry.total += c.salary;
      entry.count++;
      entry.players.push({ id: c.player.id, name: c.player.playerName, salary: c.salary, level: c.player.level });
      positionMap.set(pos, entry);
    }
    const totalSalary = activeContracts.reduce((s: number, c: { salary: number }) => s + c.salary, 0);
    return {
      totalSalary,
      playerCount: activeContracts.length,
      byPosition: Array.from(positionMap.entries()).map(([position, data]) => ({ position, ...data, avgSalary: data.count === 0 ? 0 : Math.round(data.total / data.count) })),
    };
  }

  getContractExpirySoonWithMarketValue(daysThreshold = 180) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysThreshold);
    return this.prisma.player.findMany({
      where: {
        status: "ACTIVE",
        contracts: { some: { status: "ACTIVE", endDate: { lte: cutoff } } },
      },
      select: {
        id: true,
        playerName: true,
        position: true,
        currentMarketValue: true,
        contracts: {
          where: { status: "ACTIVE" },
          select: { id: true, endDate: true, salary: true },
          orderBy: { endDate: "asc" },
          take: 1,
        },
      },
      orderBy: { currentMarketValue: "desc" },
    });
  }

  async getTransferPnL() {
    const transfers = await this.prisma.transfer.findMany({
      select: { type: true, fee: true, date: true, fromClub: true, toClub: true },
    });
    let incoming = 0, outgoing = 0;
    for (const t of transfers) {
      const fee = t.fee ?? 0;
      if (t.type === "PERMANENT_IN" || t.type === "LOAN_IN") incoming += fee;
      else if (t.type === "PERMANENT_OUT" || t.type === "LOAN_OUT") outgoing += fee;
    }
    return { incoming, outgoing, netPnL: incoming - outgoing, transfers };
  }

  async getSalaryBenchmarkByLevel() {
    const contracts = await this.prisma.contract.findMany({
      where: { status: "ACTIVE" },
      select: {
        salary: true,
        player: { select: { level: true } },
      },
    });
    const levelMap = new Map<string, number[]>();
    for (const c of contracts) {
      const level = c.player.level;
      const arr = levelMap.get(level) ?? [];
      arr.push(c.salary);
      levelMap.set(level, arr);
    }
    return Array.from(levelMap.entries()).map(([level, salaries]) => {
      const sorted = [...salaries].sort((a, b) => a - b);
      const avg = salaries.reduce((s, v) => s + v, 0) / salaries.length;
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      return { level, count: salaries.length, avg: Math.round(avg), median, min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
    }).sort((a, b) => b.avg - a.avg);
  }

  async getProspectCostSummary() {
    const prospects = await this.prisma.prospect.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        position: true,
        convertedPlayerId: true,
      },
    });
    const byStatus = new Map<string, number>();
    for (const p of prospects) {
      byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    }
    return {
      total: prospects.length,
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      prospects: prospects.map((p) => ({ id: p.id, name: p.name, status: p.status, position: p.position, convertedPlayerId: p.convertedPlayerId })),
    };
  }
}
