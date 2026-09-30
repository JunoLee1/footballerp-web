import { Foot, Position, PlayerLevel, PlayerStatus, TeamType } from "../../generated/enums";

export interface CreatePlayerDto {
  playerName: string;
  dateOfBirth: string;
  preferredFoot: Foot;
  height: number;
  weight: number;
  position: Position;
  level: PlayerLevel;
  nationalityId: number;
  externalId?: string;
  userId?: string;
  agentId?: string;
  agencyId?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

export interface UpdatePlayerDto {
  playerName?: string;
  dateOfBirth?: string;
  preferredFoot?: Foot;
  height?: number;
  weight?: number;
  position?: Position;
  level?: PlayerLevel;
  nationalityId?: number;
  externalId?: string;
  agentId?: string;
  agencyId?: number | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  allergies?: string[];
  foodPreferences?: string | null;
  playStyle?: string | null;
}

export interface UpdatePlayerStatusDto {
  status: PlayerStatus;
}

export interface PlayerListQuery {
  status?: PlayerStatus;
  position?: Position;
  level?: PlayerLevel;
  nationalityId?: number;
  excludeYouth?: boolean;
  teamType?: TeamType;
}
