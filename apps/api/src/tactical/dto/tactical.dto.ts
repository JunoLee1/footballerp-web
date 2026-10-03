import { TacticalPhase, Position } from "../../generated/enums";

export interface CreateAnalysisDto {
  matchId: string;
  seasonId: number;
  phase: TacticalPhase;
  formation?: string;
  opponentAnalysis?: string;
  // PRE_MATCH
  opponentFormation?: string;
  opponentKeyThreat?: string;
  opponentWeakness?: string;
  opponentKeyPlayer?: string;
  // POST_MATCH
  tacticalCompliance?: string;
  concededAnalysis?: string;
  momPlayerId?: string;
  momNote?: string;
  improvementPlayerId?: string;
  improvementNote?: string;
}

export interface UpdateAnalysisDto {
  formation?: string;
  opponentAnalysis?: string;
  opponentFormation?: string;
  opponentKeyThreat?: string;
  opponentWeakness?: string;
  opponentKeyPlayer?: string;
  opponentPressureScore?: number | null;
  opponentSetPieceScore?: number | null;
  opponentCounterScore?: number | null;
  tacticalCompliance?: string;
  concededAnalysis?: string;
  momPlayerId?: string;
  momNote?: string;
  improvementPlayerId?: string;
  improvementNote?: string;
}

export interface AddLineupDto {
  playerId: string;
  position: Position;
}

export interface AddMediaDto {
  url: string;
  type: string;
}
