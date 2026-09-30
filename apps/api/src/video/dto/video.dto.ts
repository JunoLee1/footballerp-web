import { SessionType } from "../../generated/enums";

export interface CreateVideoDto {
  title: string;
  url: string;
  tags?: string[];
  sessionType?: SessionType;
}

export interface CreateAssignmentDto {
  videoId: number;
  playerId: string;
  assignedById: string;
  dueDate?: Date;
  note?: string;
}

export interface VideoListQuery {
  sessionType?: SessionType;
  tag?: string;
}
