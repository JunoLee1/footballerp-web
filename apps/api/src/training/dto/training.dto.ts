import { SessionType, ContentPhase, AttendanceStatus } from "../../generated/enums";

export interface CreateSessionDto {
  date: string;
  goal: string;
  sessionType: SessionType;
  seasonId: number;
  teamId?: string;
  contents?: { phase: ContentPhase; description: string }[];
}

export interface AddContentDto {
  phase: ContentPhase;
  description: string;
}

export interface AddParticipantsDto {
  playerIds: string[];
}

export interface UpsertResultDto {
  playerId: string;
  attendance: AttendanceStatus;
  feedback?: string;
  performanceScore?: number;
}

export interface SessionListQuery {
  seasonId?: number;
}
