import { AppError } from "../lib/appError";
import type { IncidentReportRepository } from "./incident-report.repo";
import type { NotificationRepository } from "../notification/notification.repo";
import type { CreateIncidentReportDto, IncidentReportListQuery } from "./dto/incident-report.dto";
import { ExternalReportTarget } from "../generated/enums";

const YOUTH_EXTERNAL_TARGETS = [
  { target: ExternalReportTarget.EDUCATION_OFFICE, daysUntilDue: 3 },
  { target: ExternalReportTarget.SCHOOL_SAFETY, daysUntilDue: 7 },
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export class IncidentReportService {
  constructor(
    private repo: IncidentReportRepository,
    private notifRepo: NotificationRepository,
  ) {}

  getAll(query: IncidentReportListQuery) {
    return this.repo.findAll(query);
  }

  async getById(id: number) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "INCIDENT_REPORT_NOT_FOUND");
    return report;
  }

  create(dto: CreateIncidentReportDto, reportedById: string) {
    return this.repo.create({ ...dto, reportedById });
  }

  async submit(id: number) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "INCIDENT_REPORT_NOT_FOUND");
    if (report.status !== "DRAFT") throw new AppError(409, "INVALID_STATUS");

    const updated = await this.repo.submit(id);

    if (report.player.guardianId) {
      void this.notifRepo
        .createForGuardian(
          report.player.guardianId,
          "INCIDENT_REPORT_SUBMITTED",
          () => ({
            title: "사고 보고서 접수",
            body: `${report.player.playerName} 선수의 사고 보고서가 접수됐습니다.`,
          }),
          id,
        )
        .catch(console.error);
    }

    return updated;
  }

  async sign(id: number, role: "SUPERVISOR" | "MEDICAL") {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "INCIDENT_REPORT_NOT_FOUND");
    if (report.status !== "SUBMITTED") throw new AppError(409, "INVALID_STATUS");

    const isSupervisor = role === "SUPERVISOR";
    const isMedical = role === "MEDICAL";

    const updated = await this.repo.sign(id, isSupervisor, isMedical);

    const bothSigned =
      (isSupervisor ? true : report.supervisorSigned) &&
      (isMedical ? true : report.medicalSigned);

    if (bothSigned) {
      const now = new Date();
      const [signed] = await Promise.all([
        this.repo.markSigned(id),
        this.repo.createExternalReports(
          id,
          YOUTH_EXTERNAL_TARGETS.map((t) => ({ target: t.target, dueDate: addDays(now, t.daysUntilDue) })),
          { incidentReportId: id, playerName: report.player.playerName, description: report.description },
        ),
      ]);
      return signed;
    }

    return updated;
  }
}
