import { Role, CoachingRole, FrontOfficeRole } from "../../generated/enums";

export interface ListUsersQuery {
  username?: string;
  role?: Role;
  coachingRole?: CoachingRole;
  frontOfficeRole?: FrontOfficeRole;
  isDeleted?: boolean;
}

export interface UpdateUserRoleDto {
  role: Role;
  coachingRole?: CoachingRole | null;
  frontOfficeRole?: FrontOfficeRole | null;
  clubId?: string | null;
}

export interface PlayerWithoutAccountDto {
  id: string;
  playerName: string;
  status: string;
  position: string | null;
}

export interface SetDemoDto {
  isDemo: boolean;
}
