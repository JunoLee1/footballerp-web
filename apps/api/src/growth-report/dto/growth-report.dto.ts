import { BadgeType } from "../../generated/enums";

export interface CreateGrowthEvaluationDto {
  playerId: string;
  year: number;
  month: number;
  attitudeScore: number;
  attitudeComment: string;
  fundamentalsScore: number;
  fundamentalsComment: string;
  spatialScore: number;
  spatialComment: string;
  physicalScore: number;
  physicalComment: string;
}

export interface AwardBadgeDto {
  playerId: string;
  sessionId?: string;
  badgeType: BadgeType;
  note?: string;
}

export interface GrowthEvaluationListQuery {
  playerId?: string;
  year?: number;
  isPublished?: boolean;
}
