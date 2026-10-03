import type { PrismaClient } from "../generated/client";
import type { LeagueLevel, DepartmentCategory } from "../generated/enums";
import type {
  CreateDepartmentIbiConfigDto,
  UpdateDepartmentIbiConfigDto,
  UpsertLeagueWeightDto,
  UpsertSeasonComplianceCheckDto,
  CreateComplianceDeadlineDto,
  UpdateComplianceDeadlineDto,
} from "./dto/hiring-automation.dto";

export class HiringAutomationRepository {
  constructor(private prisma: PrismaClient) {}

  // --- LeagueLevelWeightConfig ---

  listLeagueWeights() {
    return this.prisma.leagueLevelWeightConfig.findMany({
      orderBy: [{ leagueLevel: "asc" }, { category: "asc" }],
    });
  }

  upsertLeagueWeight(leagueLevel: LeagueLevel, category: DepartmentCategory, dto: UpsertLeagueWeightDto) {
    return this.prisma.leagueLevelWeightConfig.upsert({
      where: { leagueLevel_category: { leagueLevel, category } },
      create: { leagueLevel, category, weight: dto.weight },
      update: { weight: dto.weight },
    });
  }

  // --- DepartmentIbiConfig ---

  listIbiConfigs(departmentId?: string) {
    const where = departmentId !== undefined ? { departmentId } : {};
    return this.prisma.departmentIbiConfig.findMany({
      where,
      include: { department: { select: { id: true, name: true, category: true } } },
      orderBy: [{ departmentId: "asc" }, { jobTitle: "asc" }],
    });
  }

  findIbiConfigById(id: string) {
    return this.prisma.departmentIbiConfig.findUnique({
      where: { id },
      include: { department: { select: { id: true, name: true, category: true } } },
    });
  }

  createIbiConfig(data: CreateDepartmentIbiConfigDto) {
    return this.prisma.departmentIbiConfig.create({
      data: {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
      },
      include: { department: { select: { id: true, name: true, category: true } } },
    });
  }

  updateIbiConfig(id: string, data: UpdateDepartmentIbiConfigDto) {
    return this.prisma.departmentIbiConfig.update({
      where: { id },
      data,
      include: { department: { select: { id: true, name: true, category: true } } },
    });
  }

  deleteIbiConfig(id: string) {
    return this.prisma.departmentIbiConfig.delete({ where: { id } });
  }

  // --- SeasonComplianceCheck ---

  findComplianceCheck(seasonId: number) {
    return this.prisma.seasonComplianceCheck.findUnique({ where: { seasonId } });
  }

  upsertComplianceCheck(seasonId: number, data: UpsertSeasonComplianceCheckDto) {
    return this.prisma.seasonComplianceCheck.upsert({
      where: { seasonId },
      create: { seasonId, ...data },
      update: data,
    });
  }

  // --- ComplianceDeadline ---

  listComplianceDeadlines() {
    return this.prisma.complianceDeadline.findMany({
      orderBy: { deadlineDate: "asc" },
    });
  }

  findComplianceDeadlineById(id: string) {
    return this.prisma.complianceDeadline.findUnique({ where: { id } });
  }

  createComplianceDeadline(data: CreateComplianceDeadlineDto) {
    return this.prisma.complianceDeadline.create({
      data: {
        ...data,
        deadlineDate: new Date(data.deadlineDate),
        isActive: data.isActive ?? true,
      },
    });
  }

  updateComplianceDeadline(id: string, data: UpdateComplianceDeadlineDto) {
    return this.prisma.complianceDeadline.update({
      where: { id },
      data: {
        ...data,
        ...(data.deadlineDate && { deadlineDate: new Date(data.deadlineDate) }),
      },
    });
  }

  deleteComplianceDeadline(id: string) {
    return this.prisma.complianceDeadline.delete({ where: { id } });
  }

  // --- 우선순위 큐 계산용 ---

  getActiveComplianceDeadlineNearby(today: Date) {
    return this.prisma.complianceDeadline.findFirst({
      where: { isActive: true, deadlineDate: { gte: today } },
      orderBy: { deadlineDate: "asc" },
    });
  }

  getLeagueWeightMap(leagueLevel: LeagueLevel) {
    return this.prisma.leagueLevelWeightConfig.findMany({ where: { leagueLevel } });
  }

  getAllIbiConfigs() {
    return this.prisma.departmentIbiConfig.findMany({
      include: { department: { select: { id: true, name: true, category: true } } },
    });
  }

  getSeasonComplianceCheck(seasonId: number) {
    return this.prisma.seasonComplianceCheck.findUnique({ where: { seasonId } });
  }

  async checkAutoCompliance() {
    const [playerCount, coachingCount, medicalCount, youthTeamCount] = await Promise.all([
      this.prisma.player.count({ where: { status: "ACTIVE" } }),
      this.prisma.user.count({ where: { role: "COACHING_STAFF", isDeleted: false } }),
      this.prisma.user.count({ where: { role: "COACHING_STAFF", coachingRole: "MEDICAL", isDeleted: false } }),
      this.prisma.team.count({ where: { type: "YOUTH", isActive: true } }),
    ]);
    return { playerCount, coachingCount, medicalCount, youthTeamCount };
  }

  getActiveJobPostingsForDepartment(departmentId: string) {
    return this.prisma.jobPosting.findMany({
      where: { departmentId, status: { in: ["DRAFT", "OPEN"] } },
      select: { id: true, status: true },
    });
  }

  createJobPostingDraft(data: {
    title: string;
    departmentId: string;
    headcount: number;
    description: string;
    createdById: string;
  }) {
    return this.prisma.jobPosting.create({ data });
  }
}
