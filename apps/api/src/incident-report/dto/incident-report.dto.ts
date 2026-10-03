import { IncidentType, IncidentReportStatus } from "../../generated/enums";

export interface CreateIncidentReportDto {
  playerId: string;
  teamId: string;
  type: IncidentType;
  matchId?: string;
  sessionId?: string;
  description: string;
}

export interface SignIncidentReportDto {
  role: "SUPERVISOR" | "MEDICAL";
}

export interface IncidentReportListQuery {
  teamId?: string;
  status?: IncidentReportStatus;
  playerId?: string;
}
