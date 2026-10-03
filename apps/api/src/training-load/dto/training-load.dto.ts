export type LoadUnit = "KG" | "MINUTES" | "DISTANCE_M" | "SETS";

export interface UpsertTrainingLoadDto {
  playerId: string;
  sessionId: string;
  rpe?: number;
  load?: number;
  loadUnit?: LoadUnit;
}

export interface TrainingLoadQuery {
  sessionId?: string;
  playerId?: string;
}

export interface WeeklySummaryQuery {
  playerId: string;
  weekStart: string;
}
