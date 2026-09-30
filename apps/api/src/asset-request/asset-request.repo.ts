import {
  PrismaClient,
  AssetRequestStatus,
  AssetRequestApprovalStage,
  AssetRequestApprovalAction,
} from "../generated/client";
import { CreateAssetRequestDto } from "./dto/asset-request.dto";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const detailInclude = {
  requester: { select: { id: true, username: true, nickname: true } },
  department: {
    select: {
      id: true,
      name: true,
      headId: true,
      parent: { select: { id: true, name: true, headId: true } },
    },
  },
  expenseCategory: { select: { id: true, code: true, label: true } },
  equipmentItem: { select: { id: true, name: true, category: true } },
  softwareLicense: { select: { id: true, name: true, vendor: true } },
  operatingExpense: {
    select: { id: true, status: true, amount: true, budgetLineId: true },
  },
  approvals: {
    orderBy: { createdAt: "asc" as const },
    include: {
      reviewer: { select: { id: true, username: true, nickname: true } },
    },
  },
} as const;

const listInclude = {
  requester: { select: { id: true, username: true, nickname: true } },
  department: { select: { id: true, name: true, headId: true, parentId: true } },
  expenseCategory: { select: { id: true, code: true, label: true } },
} as const;

export class AssetRequestRepository {
  constructor(private prisma: PrismaClient) {}

  create(dto: CreateAssetRequestDto, requesterId: string, departmentId: number, actorClubId?: string) {
    return this.prisma.assetRequest.create({
      data: {
        requesterId,
        departmentId,
        type: dto.type,
        status: "DRAFT",
        expenseCategoryId: dto.expenseCategoryId,
        expectedAmount: dto.expectedAmount,
        justification: dto.justification,
        clubId: actorClubId ?? null,
        ...(dto.equipmentItemId !== undefined && { equipmentItemId: dto.equipmentItemId }),
        ...(dto.softwareLicenseId !== undefined && { softwareLicenseId: dto.softwareLicenseId }),
        ...(dto.customName !== undefined && { customName: dto.customName }),
        ...(dto.customDescription !== undefined && { customDescription: dto.customDescription }),
        ...(dto.neededBy !== undefined && { neededBy: new Date(dto.neededBy) }),
      },
      include: listInclude,
    });
  }

  findById(id: string, actorClubId?: string) {
    return this.prisma.assetRequest.findFirst({
      where: { id, ...(actorClubId !== undefined ? { clubId: actorClubId } : {}) },
      include: detailInclude,
    });
  }

  findByRequester(requesterId: string, status?: AssetRequestStatus, actorClubId?: string) {
    return this.prisma.assetRequest.findMany({
      where: {
        requesterId,
        ...(status !== undefined && { status }),
        ...(actorClubId !== undefined ? { clubId: actorClubId } : {}),
      },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findByDepartment(departmentId: number, status?: AssetRequestStatus, actorClubId?: string) {
    return this.prisma.assetRequest.findMany({
      where: {
        departmentId,
        ...(status !== undefined && { status }),
        ...(actorClubId !== undefined ? { clubId: actorClubId } : {}),
      },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * SUBMITTED requests where the user is the leaf department's head (팀장).
   */
  findPendingForLeader(userId: string, actorClubId?: string) {
    return this.prisma.assetRequest.findMany({
      where: {
        status: "SUBMITTED",
        department: { headId: userId },
        ...(actorClubId !== undefined ? { clubId: actorClubId } : {}),
      },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * LEADER_APPROVED requests where the user is the parent department's head (부서장).
   */
  findPendingForDeptHead(userId: string, actorClubId?: string) {
    return this.prisma.assetRequest.findMany({
      where: {
        status: "LEADER_APPROVED",
        department: { parent: { headId: userId } },
        ...(actorClubId !== undefined ? { clubId: actorClubId } : {}),
      },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findAll(status?: AssetRequestStatus, actorClubId?: string) {
    return this.prisma.assetRequest.findMany({
      where: {
        ...(status !== undefined && { status }),
        ...(actorClubId !== undefined ? { clubId: actorClubId } : {}),
      },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  updateStatus(
    id: string,
    patch: { status: AssetRequestStatus; operatingExpenseId?: string },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.assetRequest.update({
      where: { id },
      data: {
        status: patch.status,
        ...(patch.operatingExpenseId !== undefined && {
          operatingExpenseId: patch.operatingExpenseId,
        }),
      },
      include: detailInclude,
    });
  }

  addApproval(
    id: string,
    data: {
      stage: AssetRequestApprovalStage;
      action: AssetRequestApprovalAction;
      reviewerId: string;
      reason?: string;
    },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.assetRequestApproval.create({
      data: {
        assetRequestId: id,
        stage: data.stage,
        action: data.action,
        reviewerId: data.reviewerId,
        ...(data.reason !== undefined && { reason: data.reason }),
      },
    });
  }

  linkEquipmentItem(id: string, equipmentItemId: string) {
    return this.prisma.assetRequest.update({
      where: { id },
      data: { equipmentItemId },
    });
  }

  linkSoftwareLicense(id: string, softwareLicenseId: string) {
    return this.prisma.assetRequest.update({
      where: { id },
      data: { softwareLicenseId },
    });
  }
}
