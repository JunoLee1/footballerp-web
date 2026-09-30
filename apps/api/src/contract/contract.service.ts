import { ContractRepository } from "./contract.repo";
import { WageCapService } from "./wage-cap.service";
import { NotificationRepository } from "../notification/notification.repo";
import { AppError } from "../lib/appError";
import { isAdminLike, canReadFinance, canReadHR } from "../lib/permissions";
import { writeAuditLog } from "../lib/auditLog";
import { getPrisma } from "../lib/prisma";
import {
  CreateContractDto,
  MarkSigningBonusPaidDto,
  UpdateContractStatusDto,
  CreateBuyoutDto,
  CreateExtensionDto,
  CreateBonusDto,
} from "./dto/contract.dto";

export class ContractService {
  constructor(
    private repo: ContractRepository,
    private wageCapService: WageCapService,
    private notificationRepo: NotificationRepository,
  ) {}

  getAllContracts() {
    return this.repo.findAll();
  }

  getContractsByPlayer(playerId: string) {
    return this.repo.findByPlayerId(playerId);
  }

  // Issue #560: /contracts/:id owner-scope guard.
  // Actor 컨텍스트가 없으면 하위 호환 위해 그대로 리턴(내부 호출용). 컨트롤러는 반드시 actor 를 넘겨야 함.
  async getContractById(id: string, actor?: {
    userId: string
    role: string
    frontOfficeRole?: string | null
    departmentCategories?: string[]
  }) {
    const contract = await this.repo.findById(id);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    if (!actor) return contract;

    const isPrivileged =
      isAdminLike(actor.role) ||
      actor.role === "GM" ||
      canReadFinance(actor.role, actor.frontOfficeRole, actor.departmentCategories) ||
      canReadHR(actor.role, actor.frontOfficeRole, actor.departmentCategories);

    if (isPrivileged) return contract;

    // PLAYER 본인 계약만 조회 허용. contract.playerId → Player.userId 매핑 확인.
    const owner = await this.repo.findPlayerOwnerUserId(contract.playerId);
    if (!owner || owner.userId !== actor.userId) {
      throw new AppError(403, "FORBIDDEN");
    }
    return contract;
  }

  async createContract(dto: CreateContractDto, actorId: string) {
    if (dto.salary <= 0) throw new AppError(400, "INVALID_SALARY");
    // SH17: salary 최대값 10억 KRW
    if (!Number.isInteger(dto.salary) || dto.salary > 1_000_000_000) {
      throw new AppError(400, "SALARY_EXCEEDS_LIMIT");
    }

    if (dto.signingBonus !== undefined && dto.signingBonus < 0) {
      throw new AppError(400, "INVALID_SIGNING_BONUS");
    }
    if (dto.signingBonusScheduledAt && (dto.signingBonus === undefined || dto.signingBonus === 0)) {
      throw new AppError(400, "SIGNING_BONUS_SCHEDULED_WITHOUT_AMOUNT");
    }

    const player = await getPrisma().player.findUnique({
      where: { id: dto.playerId },
      select: { status: true },
    });
    if (player?.status === "RELEASED") {
      throw new AppError(409, "PLAYER_RELEASED_CANNOT_CONTRACT");
    }

    const capResult = await this.wageCapService.check(dto.salary);

    if (capResult.status === "BLOCKED") {
      throw new AppError(400, "WAGE_CAP_EXCEEDED");
    }

    const contract = await this.repo.create(dto);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_CREATED",
      targetId: contract.id,
      detail: { playerId: dto.playerId, salary: dto.salary, startDate: dto.startDate, endDate: dto.endDate },
    });
    await this.notificationRepo.createForGM(
      "CONTRACT_CREATED",
      (locale) => ({
        title: locale === "ko" ? "계약 생성됨" : "Contract Created",
        body: locale === "ko" ? `선수 계약이 생성되었습니다.` : `A player contract has been created.`,
      }),
      contract.id,
    );

    if (capResult.status === "WARNING") {
      return { ...contract, wageCapWarning: { percentOver: capResult.percentOver } };
    }

    return contract;
  }

  async updateStatus(id: string, dto: UpdateContractStatusDto, actorId: string) {
    const contract = await this.repo.findById(id);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    const updated = await this.repo.updateStatus(id, dto.status);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_STATUS_CHANGED",
      targetId: id,
      detail: { before: contract.status, after: dto.status },
    });
    await Promise.all([
      this.notificationRepo.createForGM(
        "CONTRACT_STATUS_CHANGED",
        (locale) => ({
          title: locale === "ko" ? "계약 상태 변경됨" : "Contract Status Changed",
          body: locale === "ko" ? `계약 상태가 변경되었습니다.` : `A contract status has changed.`,
        }),
        id,
      ),
      this.notificationRepo.createForTD(
        "CONTRACT_STATUS_CHANGED",
        (locale) => ({
          title: locale === "ko" ? "계약 상태 변경됨" : "Contract Status Changed",
          body: locale === "ko" ? `계약 상태가 변경되었습니다.` : `A contract status has changed.`,
        }),
        id,
      ),
    ]);
    return updated;
  }

  getActiveBuyout(contractId: string) {
    return this.repo.findActiveBuyout(contractId);
  }

  async addBuyout(contractId: string, dto: CreateBuyoutDto, actorId: string) {
    const contract = await this.repo.findById(contractId);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    const existing = await this.repo.hasBuyout(contractId);
    if (existing) throw new AppError(409, "BUYOUT_ALREADY_EXISTS");
    const buyout = await this.repo.createBuyout(contractId, dto);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_BUYOUT_ADDED",
      targetId: contractId,
      detail: { amount: dto.amount },
    });
    await this.notificationRepo.createForGM(
      "CONTRACT_BUYOUT_ADDED",
      (locale) => ({
        title: locale === "ko" ? "바이아웃 조항 추가됨" : "Buyout Clause Added",
        body: locale === "ko" ? `계약에 바이아웃 조항이 추가되었습니다.` : `A buyout clause has been added to a contract.`,
      }),
      contractId,
    );
    return buyout;
  }

  async addExtension(contractId: string, dto: CreateExtensionDto, actorId: string) {
    const contract = await this.repo.findById(contractId);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    const extension = await this.repo.createExtension(contractId, dto);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_EXTENSION_ADDED",
      targetId: contractId,
      detail: { condition: dto.condition, durationMonths: dto.durationMonths },
    });
    await this.notificationRepo.createForGM(
      "CONTRACT_EXTENSION_ADDED",
      (locale) => ({
        title: locale === "ko" ? "연장옵션 추가됨" : "Extension Option Added",
        body: locale === "ko" ? `계약에 연장옵션이 추가되었습니다.` : `An extension option has been added to a contract.`,
      }),
      contractId,
    );
    return extension;
  }

  async addBonus(contractId: string, dto: CreateBonusDto, actorId: string) {
    const contract = await this.repo.findById(contractId);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    const bonus = await this.repo.createBonus(contractId, dto);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_BONUS_ADDED",
      targetId: contractId,
      detail: { amount: dto.amount, description: dto.description },
    });
    await this.notificationRepo.createForGM(
      "CONTRACT_BONUS_ADDED",
      (locale) => ({
        title: locale === "ko" ? "성과보너스 조항 추가됨" : "Performance Bonus Added",
        body: locale === "ko" ? `계약에 성과보너스 조항이 추가되었습니다.` : `A performance bonus clause has been added to a contract.`,
      }),
      contractId,
    );
    return bonus;
  }

  async markSigningBonusPaid(id: string, dto: MarkSigningBonusPaidDto, actorId: string) {
    const contract = await this.repo.findById(id);
    if (!contract) throw new AppError(404, "CONTRACT_NOT_FOUND");
    if (contract.signingBonus == null || contract.signingBonus === 0n) {
      throw new AppError(400, "NO_SIGNING_BONUS");
    }
    if (contract.signingBonusPaidAt) {
      throw new AppError(409, "ALREADY_PAID");
    }
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const updated = await this.repo.markSigningBonusPaid(id, paidAt);
    await writeAuditLog({
      actorId,
      action: "CONTRACT_SIGNING_BONUS_PAID",
      targetId: id,
      detail: { paidAt: paidAt.toISOString() },
    });
    return updated;
  }

  getSquadSalaryOverview() {
    return this.repo.getSquadSalaryByPosition();
  }

  getExpiringContractsWithValue(days?: number) {
    return this.repo.getContractExpirySoonWithMarketValue(days);
  }

  getTransferPnL() {
    return this.repo.getTransferPnL();
  }

  getSalaryBenchmark() {
    return this.repo.getSalaryBenchmarkByLevel();
  }

  getProspectSummary() {
    return this.repo.getProspectCostSummary();
  }
}
