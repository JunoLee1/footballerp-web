import { Role } from "../../generated/enums";

export type ParamsDto = {
  id: string;
};

export type SignUpInputDto = {
  email: string;
  password: string;
  confirmedPassword: string;
  username: string;
  nickname: string;
  phoneNumber: string;
  dateOfBirth: Date;
  nationality: {
    code: string;
  };
  role: Role;
};

export type QueryType = {
  take: number;
  page: number;
  username: string | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type SignUpOutputDto = {
  email: string;
  username: string;
  nickname: string;
};
