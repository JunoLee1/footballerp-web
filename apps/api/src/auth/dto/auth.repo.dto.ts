import { Role } from "../../generated/enums";
import { EncryptedPhoneNumberType } from "./auth.service.dto";

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
