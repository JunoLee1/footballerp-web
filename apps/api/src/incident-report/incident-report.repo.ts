import type { PrismaClient } from "../generated/client";
import type { CreateIncidentReportDto, IncidentReportListQuery } from "./dto/incident-report.dto";
import { ExternalReportTarget } from "../generated/enums";
import { assertCuid } from "../lib/cuidGuard";

const INCLUDE = {
  player: { select: { id: true, playerName: true, guardianId: true } },
  team: { select: { id: true, name: true } },
  reportedBy: { select: { id: true, username: true } },
  injury: { select: { id: true, bodyPart: true } },
} as const;

export class IncidentReportRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: IncidentReportListQuery) {
    return this.prisma.incidentReport.findMany({
      where: {
        ...(query.teamId && { teamId: query.teamId }),
        ...(query.status && { status: query.status }),
        ...(query.playerId && { playerId: query.playerId }),
      },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.incidentReport.findUnique({ where: { id }, include: INCLUDE });
  }

  create(data: CreateIncidentReportDto & { reportedById: string }) {
    return this.prisma.incidentReport.create({
      data: { ...data, status: "DRAFT" },
      include: INCLUDE,
    });
  }

  submit(id: string) {
    return this.prisma.incidentReport.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: INCLUDE,
    });
  }

  sign(id: string, isSupervisor: boolean, isMedical: boolean) {
    return this.prisma.incidentReport.update({
      where: { id },
      data: {
        ...(isSupervisor && { supervisorSigned: true }),
        ...(isMedical && { medicalSigned: true }),
      },
      include: INCLUDE,
    });
  }

  markSigned(id: string) {
    return this.prisma.incidentReport.update({ where: { id }, data: { status: "SIGNED" } });
  }

  createExternalReports(
    incidentReportId: string,
    targets: { target: ExternalReportTarget; dueDate: Date }[],
    reportData: object,
  ) {
    assertCuid(incidentReportId);
    return this.prisma.externalReport.createMany({
      data: targets.map((t) => ({
        incidentReportId,
        target: t.target,
        dueDate: t.dueDate,
        reportData,
        status: "PENDING_SUBMISSION",
      })),
    });
  }
}
