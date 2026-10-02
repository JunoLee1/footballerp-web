import { Role, CoachingRole, FrontOfficeRole } from "../../generated/enums";
import { EncryptedPhoneNumberType } from "./auth.service.dto";

export interface CreateUserData {
  email: string;
  password: string;
  username: string;
  nickname: string;
  role: Role;
  coachingRole?: CoachingRole | null;
  frontOfficeRole?: FrontOfficeRole | null;
  dateOfBirth: Date;
  nationalityId: number;
  phoneNumber: { encrypted: string; iv: string; phoneHash: string };
  departmentId?: string;
}

export type SignUpInputRepoDto = {
  email: string;
  password: string;
  username: string;
  nickname: string;
  dateOfBirth: Date;
  phoneNumber: EncryptedPhoneNumberType;
  role: Role;
  nationality: {
    code: string;
  };
};

export type UpdateUserInputDTO = {
  id: string;
  username?: string;
  email?: string;
  password?: string;
  role?: Role;
  isDeleted?: boolean;
};

export type SignUpOutputDto = {
  email: string;
  username: string;
  nickname: string;
  nationality: {
    id: number;
    name: string;
    code: string;
  };
  role: Role;
  dateOfBirth: Date;
};
