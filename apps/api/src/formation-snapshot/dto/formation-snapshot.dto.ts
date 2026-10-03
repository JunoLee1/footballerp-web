export interface CreateFormationSnapshotDto {
  matchId: string;
  minute?: number;
  formation: string;
  changeReason?: string;
}
