import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";

declare global {
  namespace Express {
    interface User {
      id: string;
      role: Role;
      coachingRole: CoachingRole | null | undefined;
      frontOfficeRole: FrontOfficeRole | null | undefined;
      departmentCategories?: string[];
      teamId?: string | null;
      clubId?: string | null;
      isDemo?: boolean;
    }
    interface Request {
      childPlayerId?: string;
    }
  }
}
