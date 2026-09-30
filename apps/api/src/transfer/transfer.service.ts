import { TransferRepository } from "./transfer.repo";
import { ContractRepository } from "../contract/contract.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { CreateTransferDto, CreateRecallDto, UpdateRecallStatusDto } from "./dto/transfer.dto";
import { RecallStatus } from "../generated/enums";

export class TransferService {
  constructor(
    private repo: TransferRepository,
    private contractRepo: ContractRepository,
  ) {}

  getByPlayer(playerId: string) {
    return this.repo.findByPlayer(playerId);
  }

  async getById(id: number) {
    const transfer = await this.repo.findById(id);
    if (!transfer) throw new AppError(404, "TRANSFER_NOT_FOUND");
    return transfer;
  }

  async createTransfer(dto: CreateTransferDto, actorId: string) {
    const transfer = await this.repo.createTransfer(dto);
    await writeAuditLog({ actorId, action: "TRANSFER_CREATED", targetId: transfer.id, detail: { playerId: dto.playerId, type: dto.type } });

    // D4: auto-terminate active contracts when player is permanently transferred or released
    const contractTerminatingTypes = ["PERMANENT_IN", "PERMANENT_OUT", "FREE", "RELEASE"];
    if (contractTerminatingTypes.includes(dto.type)) {
      const terminated = await this.contractRepo.terminateActiveContracts(dto.playerId);
      if (terminated.count > 0) {
        void writeAuditLog({
          actorId: actorId ?? 0,
          action: "CONTRACTS_AUTO_TERMINATED",
          targetId: transfer.id,
          detail: { count: terminated.count, reason: `Transfer type: ${dto.type}`, playerId: dto.playerId },
        }).catch(console.error);
      }
    }

    return transfer;
  }

  getRecalls(status?: RecallStatus) {
    return this.repo.findRecallsByStatus(status);
  }

  async createRecall(dto: CreateRecallDto, requestedById: string) {
    const transfer = await this.repo.findById(dto.transferId);
    if (!transfer) throw new AppError(404, "TRANSFER_NOT_FOUND");
    if (transfer.recall) throw new AppError(409, "RECALL_ALREADY_EXISTS");
    return this.repo.createRecall(dto, requestedById);
  }

  async updateRecallStatus(id: number, dto: UpdateRecallStatusDto, approvedById: string) {
    const recall = await this.repo.findRecallById(id);
    if (!recall) throw new AppError(404, "RECALL_NOT_FOUND");
    if (recall.status !== RecallStatus.PENDING) throw new AppError(409, "RECALL_ALREADY_PROCESSED");
    return this.repo.updateRecallStatus(id, dto.status, approvedById);
  }

  async exportLoanIn(transferId: number) {
    const data = await this.repo.exportLoanInData(transferId);
    if (!data) throw new AppError(404, "TRANSFER_NOT_FOUND_OR_NOT_LOAN_IN");
    return data;
  }
}
