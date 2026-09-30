import type { PrismaClient } from "../../generated/client";
import type { CreateInspectionDto, UpdateInspectionDto, InspectionListQuery } from "./dto/inspection.dto";

const INCLUDE = {
  inspectedBy: { select: { id: true, username: true } },
} as const;

export class InspectionRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: InspectionListQuery) {
    return this.prisma.facilityInspection.findMany({
      where: {
        ...(query.zone && { facilityZone: query.zone }),
        ...(query.type && { type: query.type }),
        ...(query.result && { result: query.result }),
      },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.facilityInspection.findUnique({ where: { id }, include: INCLUDE });
  }

  create(data: CreateInspectionDto & { inspectedById: string }) {
    return this.prisma.facilityInspection.create({
      data: {
        type: data.type,
        facilityZone: data.facilityZone,
        result: data.result,
        inspectedById: data.inspectedById,
        isStatutory: data.isStatutory ?? false,
        certificateUrl: data.certificateUrl ?? null,
        notes: data.notes ?? null,
        inspectedAt: data.inspectedAt ? new Date(data.inspectedAt) : new Date(),
        statutoryDeadline: data.statutoryDeadline ? new Date(data.statutoryDeadline) : null,
      },
      include: INCLUDE,
    });
  }

  update(id: number, data: UpdateInspectionDto) {
    return this.prisma.facilityInspection.update({
      where: { id },
      data: {
        ...data,
        ...(data.inspectedAt && { inspectedAt: new Date(data.inspectedAt) }),
        ...(data.statutoryDeadline && { statutoryDeadline: new Date(data.statutoryDeadline) }),
      },
      include: INCLUDE,
    });
  }
}
