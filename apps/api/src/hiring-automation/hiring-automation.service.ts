import { HiringAutomationRepository } from "./hiring-automation.repo";
import { AppError } from "../lib/appError";
import type { LeagueLevel, DepartmentCategory } from "../generated/enums";
import type {
  CreateDepartmentIbiConfigDto,
  UpdateDepartmentIbiConfigDto,
  UpsertLeagueWeightDto,
  UpsertSeasonComplianceCheckDto,
  CreateComplianceDeadlineDto,
  UpdateComplianceDeadlineDto,
} from "./dto/hiring-automation.dto";

const MIN_PLAYERS = 18;
const MIN_COACHING = 5;
const MIN_MEDICAL = 1;
const MIN_YOUTH_TEAMS = 1;

export class HiringAutomationService {
  constructor(private repo: HiringAutomationRepository) {}

  // --- LeagueLevelWeightConfig ---

  listLeagueWeights() {
    return this.repo.listLeagueWeights();
  }

  async upsertLeagueWeight(leagueLevel: LeagueLevel, category: DepartmentCategory, dto: UpsertLeagueWeightDto) {
    if (dto.weight < 0 || dto.weight > 1) throw new AppError(400, "INVALID_WEIGHT");
    return this.repo.upsertLeagueWeight(leagueLevel, category, dto);
  }

  // --- DepartmentIbiConfig ---

  listIbiConfigs(departmentId?: string) {
    return this.repo.listIbiConfigs(departmentId);
  }

  async getIbiConfig(id: string) {
    const config = await this.repo.findIbiConfigById(id);
    if (!config) throw new AppError(404, "IBI_CONFIG_NOT_FOUND");
    return config;
  }

  async createIbiConfig(dto: CreateDepartmentIbiConfigDto) {
    if (dto.coreTaskRatio < 0 || dto.coreTaskRatio > 1)
      throw new AppError(400, "INVALID_CORE_TASK_RATIO");
    return this.repo.createIbiConfig(dto);
  }

  async updateIbiConfig(id: string, dto: UpdateDepartmentIbiConfigDto) {
    await this.getIbiConfig(id);
    if (dto.coreTaskRatio !== undefined && (dto.coreTaskRatio < 0 || dto.coreTaskRatio > 1))
      throw new AppError(400, "INVALID_CORE_TASK_RATIO");
    return this.repo.updateIbiConfig(id, dto);
  }

  async deleteIbiConfig(id: string) {
    await this.getIbiConfig(id);
    return this.repo.deleteIbiConfig(id);
  }

  // --- SeasonComplianceCheck ---

  getComplianceCheck(seasonId: number) {
    return this.repo.findComplianceCheck(seasonId);
  }

  upsertComplianceCheck(seasonId: number, dto: UpsertSeasonComplianceCheckDto) {
    return this.repo.upsertComplianceCheck(seasonId, dto);
  }

  // --- ComplianceDeadline ---

  listComplianceDeadlines() {
    return this.repo.listComplianceDeadlines();
  }

  async getComplianceDeadline(id: string) {
    const d = await this.repo.findComplianceDeadlineById(id);
    if (!d) throw new AppError(404, "COMPLIANCE_DEADLINE_NOT_FOUND");
    return d;
  }

  async createComplianceDeadline(dto: CreateComplianceDeadlineDto) {
    if (dto.betaMultiplier <= 0) throw new AppError(400, "INVALID_BETA_MULTIPLIER");
    return this.repo.createComplianceDeadline(dto);
  }

  async updateComplianceDeadline(id: string, dto: UpdateComplianceDeadlineDto) {
    await this.getComplianceDeadline(id);
    if (dto.betaMultiplier !== undefined && dto.betaMultiplier <= 0)
      throw new AppError(400, "INVALID_BETA_MULTIPLIER");
    return this.repo.updateComplianceDeadline(id, dto);
  }

  async deleteComplianceDeadline(id: string) {
    await this.getComplianceDeadline(id);
    return this.repo.deleteComplianceDeadline(id);
  }

  // --- HiringPriorityQueue ---

  async computePriorityQueue(currentSeason: { id: number; leagueLevel: LeagueLevel }, ibiBeta: number) {
    const today = new Date();

    const [ibiConfigs, weightConfigs, autoCompliance, manualCompliance, nearbyDeadline] =
      await Promise.all([
        this.repo.getAllIbiConfigs(),
        this.repo.getLeagueWeightMap(currentSeason.leagueLevel),
        this.repo.checkAutoCompliance(),
        this.repo.getSeasonComplianceCheck(currentSeason.id),
        this.repo.getActiveComplianceDeadlineNearby(today),
      ]);

    let betaEff = ibiBeta;
    if (nearbyDeadline) {
      const daysUntil = Math.floor(
        (nearbyDeadline.deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntil <= nearbyDeadline.triggerDaysBefore) {
        betaEff = ibiBeta * Number(nearbyDeadline.betaMultiplier);
      }
    }

    const complianceViolation =
      autoCompliance.playerCount < MIN_PLAYERS ||
      autoCompliance.coachingCount < MIN_COACHING ||
      autoCompliance.medicalCount < MIN_MEDICAL ||
      autoCompliance.youthTeamCount < MIN_YOUTH_TEAMS ||
      manualCompliance?.afcQualificationMet === false ||
      manualCompliance?.officeStaffCountMet === false;

    const deptIbiMap = new Map<
      string,
      { ibi: number; dept: { id: string; name: string; category: DepartmentCategory | null } }
    >();
    for (const cfg of ibiConfigs) {
      if (!cfg.department || cfg.coreTaskRatio == null || cfg.replacementDays == null || cfg.backupHeadcount == null)
        continue;
      const ibi = (Number(cfg.coreTaskRatio) * cfg.replacementDays) / (cfg.backupHeadcount + 1);
      const existing = deptIbiMap.get(cfg.departmentId);
      if (existing) {
        existing.ibi = (existing.ibi + ibi) / 2;
      } else {
        deptIbiMap.set(cfg.departmentId, { ibi, dept: cfg.department as any });
      }
    }

    const weightMap = new Map<DepartmentCategory, number>(
      weightConfigs.map((w) => [w.category as DepartmentCategory, Number(w.weight)]),
    );

    const results = Array.from(deptIbiMap.entries()).map(([deptId, { ibi, dept }]) => {
      const category = dept.category as DepartmentCategory | null;
      const highPriorityBonus = complianceViolation && category === "COMPLIANCE" ? 10000 : 0;
      const targetWeight = category ? (weightMap.get(category) ?? 0) : 0;
      const score = highPriorityBonus + targetWeight + betaEff * ibi;
      return {
        departmentId: deptId,
        departmentName: dept.name,
        category,
        score: Math.round(score * 100) / 100,
        ibi: Math.round(ibi * 100) / 100,
        betaEff: Math.round(betaEff * 100) / 100,
        highPriority: highPriorityBonus > 0,
      };
    });

    results.sort((a, b) => b.score - a.score);
    return {
      leagueLevel: currentSeason.leagueLevel,
      betaEff: Math.round(betaEff * 100) / 100,
      complianceViolation,
      autoCompliance,
      queue: results,
    };
  }
}
