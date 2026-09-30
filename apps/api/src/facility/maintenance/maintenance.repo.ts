import type { PrismaClient } from "../../generated/client";
import type { CreateMaintenanceDto, UpdateMaintenanceDto, MaintenanceListQuery } from "./dto/maintenance.dto";

const INCLUDE = {
  createdBy: { select: { id: true, username: true } },
  sourceInspection: { select: { id: true, type: true, facilityZone: true } },
  approvedBy: { select: { id: true, username: true } },
  gmApprovedBy: { select: { id: true, username: true } },
  partner: { select: { id: true, name: true } },
} as const;

export class MaintenanceRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: MaintenanceListQuery) {
    return this.prisma.maintenanceRequest.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.priority && { priority: query.priority }),
      },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.maintenanceRequest.findUnique({ where: { id }, include: INCLUDE });
  }

  create(data: CreateMaintenanceDto & { createdById: string }) {
    return this.prisma.maintenanceRequest.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        createdById: data.createdById,
        ...(data.sourceInspectionId && { sourceInspectionId: data.sourceInspectionId }),
        ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
        ...(data.partnerId !== undefined && { partnerId: data.partnerId }),
      },
      include: INCLUDE,
    });
  }

  update(id: number, data: UpdateMaintenanceDto) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.postIncidentReport !== undefined && { postIncidentReport: data.postIncidentReport }),
        ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
        ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
      },
      include: INCLUDE,
    });
  }

  updateStatus(id: number, status: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { status: status as any },
      include: INCLUDE,
    });
  }

  approve(id: number, approverId: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date() },
      include: INCLUDE,
    });
  }

  gmApprove(id: number, gmId: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { status: "RESOLVED", gmApprovedById: gmId, gmApprovedAt: new Date(), resolvedAt: new Date() },
      include: INCLUDE,
    });
  }

  reject(id: number, reason?: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { status: "REJECTED", ...(reason && { rejectionReason: reason }) },
      include: INCLUDE,
    });
  }

  lock(id: number) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { isLocked: true },
      include: INCLUDE,
    });
  }

  submitToFinance(id: number) {
    return this.prisma.maintenanceRequest.update({
      where: { id },
      data: { financeSubmittedAt: new Date() },
      include: INCLUDE,
    });
  }
}
