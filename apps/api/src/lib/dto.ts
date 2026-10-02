import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";

export interface LoginDto {
  email: string;
  password: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  confirmedPassword: string;
  username: string;
  nickname: string;
  role: Role;
  coachingRole?: CoachingRole | null;
  frontOfficeRole?: FrontOfficeRole | null;
  dateOfBirth: string;
  phoneNumber: string;
  nationalityId: number;
  departmentId?: string;
}
