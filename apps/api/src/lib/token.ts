import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { JWT_ACCESS_TOKEN_SECRET, JWT_REFRESH_TOKEN_SECRET } from "./constants";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";

interface TokenPayload {
  id: string;
  role: Role;
  coachingRole?: CoachingRole | null;
  frontOfficeRole?: FrontOfficeRole | null;
  departmentCategories?: string[];
  teamId?: number | null;
  clubId?: string | null;
  isDemo?: boolean;
}

export function generateTokens(payload: TokenPayload) {
  const accessToken = jwt.sign(payload, JWT_ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
  const jti = randomUUID();
  const refreshToken = jwt.sign({ ...payload, jti }, JWT_REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}
