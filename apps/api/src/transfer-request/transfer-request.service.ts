import { AppError } from "../lib/appError";
import { TransferRequestRepository } from "./transfer-request.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { WageCapService } from "../contract/wage-cap.service";
import { TransferRequestStatus } from "../generated/enums";
import { CreateTransferRequestDto, UpdateTransferRequestDto, ReviewTransferRequestDto, ConfirmTransferRequestDto, MedicalResultDto, CreateNegotiationLogDto, ListTransferRequestQuery } from "./dto/transfer-request.dto";

const IN_TYPES = ["PERMANENT_IN", "LOAN_IN"] as const;

export class TransferRequestService {
  constructor(
    private repo: TransferRequestRepository,
    private notifRepo: NotificationRepository,
    private wageCapService: WageCapService,
  ) {}

  list(query: ListTransferRequestQuery) {
    return this.repo.findAll(query);
  }

  async getById(id: number) {
    const req = await this.repo.findById(id);
    if (!req) throw new AppError(404, "TRANSFER_REQUEST_NOT_FOUND");
    return req;
  }

  async create(dto: CreateTransferRequestDto, requestedById: string) {
    const inProgress = await this.repo.hasInProgress(dto.playerId);
    if (inProgress) throw new AppError(409, "TRANSFER_REQUEST_IN_PROGRESS");
    return this.repo.create(dto, requestedById);
  }

  async update(id: number, dto: UpdateTransferRequestDto) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.DRAFT) throw new AppError(409, "CANNOT_MODIFY_NON_DRAFT");
    return this.repo.update(id, dto);
  }

  async submit(id: number, userId: string) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.DRAFT) throw new AppError(409, "CANNOT_SUBMIT_NON_DRAFT");
    if (req.requestedBy.id !== userId) throw new AppError(403, "FORBIDDEN");
    const result = await this.repo.submit(id);
    await this.notifRepo.createForStaff(
      "TRANSFER_REQUEST_SUBMITTED",
      (lang) => ({
        title: lang === "ko" ? "이적 요청 검토 필요" : "Transfer Request Review Required",
        body: lang === "ko" ? "선수 이적 요청이 접수되었습니다." : "A transfer request has been submitted.",
      }),
      id,
    );
    const isIn = IN_TYPES.includes(req.type as typeof IN_TYPES[number]);
    if (isIn && (req as any).expectedSalary) {
      const capResult = await this.wageCapService.check((req as any).expectedSalary);
      if (capResult.status !== "OK") return { ...result, wageCapWarning: capResult };
    }
    return result;
  }

  async review(id: number, dto: ReviewTransferRequestDto, reviewedById: string) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.PENDING_APPROVAL) throw new AppError(409, "CANNOT_REVIEW_NON_PENDING");
    if (dto.action === "reject" && !dto.rejectReason?.trim()) throw new AppError(400, "REJECT_REASON_REQUIRED");
    const result = await this.repo.review(id, dto.action, reviewedById, dto.rejectReason);
    const notifType = dto.action === "approve" ? "TRANSFER_REQUEST_APPROVED" : "TRANSFER_REQUEST_REJECTED";
    await this.notifRepo.createForUser(
      req.requestedBy.id,
      notifType,
      (lang) => ({
        title: lang === "ko"
          ? (dto.action === "approve" ? "이적 요청 1차 승인" : "이적 요청 반려")
          : (dto.action === "approve" ? "Transfer Request Approved (1st)" : "Transfer Request Rejected"),
        body: lang === "ko"
          ? (dto.action === "approve" ? "이적 요청이 1차 승인되었습니다." : `이적 요청이 반려되었습니다: ${dto.rejectReason}`)
          : (dto.action === "approve" ? "Your transfer request has been approved." : `Your transfer request was rejected: ${dto.rejectReason}`),
      }),
      id,
    );
    return result;
  }

  async confirmStep(id: number, dto: ConfirmTransferRequestDto, confirmedById: string) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.APPROVED) throw new AppError(409, "CANNOT_CONFIRM_NON_APPROVED");
    if (dto.action === "reject" && !dto.rejectReason?.trim()) throw new AppError(400, "REJECT_REASON_REQUIRED");
    if (dto.action === "send-to-medical") {
      const result = await this.repo.sendToMedical(id);
      await this.notifRepo.createForMedicalStaff(
        "TRANSFER_MEDICAL_REQUIRED",
        (lang?: string) => ({
          title: lang === "ko" ? "이적 메디컬 테스트 요청" : "Transfer Medical Test Required",
          body: lang === "ko" ? "이적 선수 메디컬 테스트를 진행해 주세요." : "Please conduct a medical test for the transfer candidate.",
        }),
        id,
      );
      return result;
    }
    const result = await this.repo.review(id, "reject", confirmedById, dto.rejectReason);
    await this.notifRepo.createForUser(
      req.requestedBy.id,
      "TRANSFER_REQUEST_REJECTED",
      (lang?: string) => ({
        title: lang === "ko" ? "이적 요청 최종 반려" : "Transfer Request Rejected",
        body: lang === "ko"
          ? `이적 요청이 최종 반려되었습니다: ${dto.rejectReason}`
          : `Your transfer request was rejected: ${dto.rejectReason}`,
      }),
      id,
    );
    return result;
  }

  async recordMedicalResult(id: number, dto: MedicalResultDto, updatedById: string) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.MEDICAL_PENDING) throw new AppError(409, "CANNOT_RECORD_MEDICAL_NON_PENDING");
    if (dto.result === "fail" && !dto.medicalNotes?.trim()) throw new AppError(400, "MEDICAL_NOTES_REQUIRED");
    const result = await this.repo.recordMedicalResult(id, dto);
    if (dto.result === "pass") {
      await Promise.all([
        this.notifRepo.createForUser(
          req.requestedBy.id,
          "TRANSFER_REQUEST_CONFIRMED",
          (lang?: string) => ({
            title: lang === "ko" ? "이적 최종 확정" : "Transfer Confirmed",
            body: lang === "ko" ? "메디컬 통과 후 이적이 최종 확정되었습니다." : "Transfer confirmed after passing the medical.",
          }),
          id,
        ),
        this.notifRepo.createForGM(
          "TRANSFER_REQUEST_CONFIRMED",
          (lang?: string) => ({
            title: lang === "ko" ? "이적 확정 완료" : "Transfer Confirmed",
            body: lang === "ko" ? "이적 선수가 메디컬을 통과했습니다." : "Transfer candidate passed the medical.",
          }),
          id,
        ),
      ]);
    } else {
      await this.notifRepo.createForUser(
        req.requestedBy.id,
        "TRANSFER_REQUEST_REJECTED",
        (lang?: string) => ({
          title: lang === "ko" ? "메디컬 불합격" : "Medical Test Failed",
          body: lang === "ko" ? `메디컬 테스트 불합격으로 이적이 취소되었습니다: ${dto.medicalNotes}` : `Transfer cancelled due to failed medical: ${dto.medicalNotes}`,
        }),
        id,
      );
    }
    return result;
  }

  async register(id: number) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.CONFIRMED) throw new AppError(409, "CANNOT_REGISTER_NON_CONFIRMED");
    if ((req as any).registeredAt) throw new AppError(409, "ALREADY_REGISTERED");
    const result = await this.repo.setRegistered(id);
    await this.notifRepo.createForUser(
      req.requestedBy.id,
      "TRANSFER_REGISTERED",
      (lang?: string) => ({
        title: lang === "ko" ? "리그 등록 완료" : "League Registration Complete",
        body: lang === "ko" ? "이적 선수의 리그 등록이 완료되었습니다." : "The transfer player has been registered with the league.",
      }),
      id,
    );
    return result;
  }

  async addNegotiationLog(id: number, dto: CreateNegotiationLogDto, createdById: string) {
    const req = await this.getById(id);
    const allowedStatuses = [TransferRequestStatus.APPROVED, TransferRequestStatus.MEDICAL_PENDING, TransferRequestStatus.CONFIRMED];
    if (!allowedStatuses.includes(req.status as typeof allowedStatuses[number])) {
      throw new AppError(409, "CANNOT_LOG_NEGOTIATION_ON_NON_ACTIVE");
    }
    return this.repo.addNegotiationLog(id, dto, createdById);
  }

  getNegotiationLogs(id: number) {
    return this.repo.getNegotiationLogs(id);
  }

  async delete(id: number, userId: string) {
    const req = await this.getById(id);
    if (req.status !== TransferRequestStatus.DRAFT) throw new AppError(409, "CANNOT_DELETE_NON_DRAFT");
    if (req.requestedBy.id !== userId) throw new AppError(403, "FORBIDDEN");
    return this.repo.delete(id);
  }
}
