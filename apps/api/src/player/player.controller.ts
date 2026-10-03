import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { PlayerService } from "./player.service";
import { PlayerListQuery } from "./dto/player.dto";
import { PlayerStatus, Position, PlayerLevel, TeamType } from "../generated/enums";
import { getPlayerRadarData } from "./radar.service";
import { SecondaryPositionRepository } from "./secondary-position.repo";
import { writeAuditLog } from "../lib/auditLog";

const WRITE_ROLES = ["ADMIN", "FRONT_OFFICE"] as const;
const SECONDARY_POS_WRITE_ROLES = ["ADMIN", "COACHING_STAFF"] as const;
const MARKET_VALUE_ROLES = ["GM", "TD", "ADMIN"] as const;

// RC7: PII 필드 — includePrivate=true 역할만 볼 수 있는 민감 정보
const EMERGENCY_CONTACT_FIELDS = [
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
] as const;

const PII_FIELDS = [...EMERGENCY_CONTACT_FIELDS, "dateOfBirth"] as const;

/** RC7: 역할에 따라 PII 필드를 제거한 플레이어 객체를 반환 */
function stripPiiFields(
  player: Record<string, unknown>,
  role: string,
  coachingRole?: string | null,
): Record<string, unknown> {
  const result = { ...player };

  // GUARDIAN, AGENT: 모든 PII 제거
  if (role === "GUARDIAN" || role === "AGENT") {
    for (const field of PII_FIELDS) {
      delete result[field];
    }
    return result;
  }

  // COACHING_STAFF 중 MEDICAL/MEDICAL_DIRECTOR 제외한 나머지: 응급연락처 제거
  if (
    role === "COACHING_STAFF" &&
    coachingRole !== "MEDICAL" &&
    coachingRole !== "MEDICAL_DIRECTOR"
  ) {
    for (const field of EMERGENCY_CONTACT_FIELDS) {
      delete result[field];
    }
    return result;
  }

  return result;
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED");
  return req.user;
}

export class PlayerController {
  constructor(private service: PlayerService, private spRepo?: SecondaryPositionRepository) {}

  getPlayers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const q = req.query;
      const query: PlayerListQuery = {};
      if (q["status"]) query.status = q["status"] as PlayerStatus;
      if (q["position"]) query.position = q["position"] as Position;
      if (q["level"]) query.level = q["level"] as PlayerLevel;
      if (q["nationalityId"]) query.nationalityId = Number(q["nationalityId"]);
      if (q["excludeYouth"] === "true") query.excludeYouth = true;
      if (q["teamType"]) query.teamType = q["teamType"] as TeamType;
      const scopedClubId = user.frontOfficeRole === 'SCOUT' ? undefined : (user.clubId ?? null);
      res.status(200).json(await this.service.getPlayers(query, scopedClubId));
    } catch (err) {
      next(err);
    }
  };

  getPlayerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const includePrivate = isAdminLike(user.role) || user.role === "GM" || user.frontOfficeRole === "TD";
      const scopedClubId = user.frontOfficeRole === 'SCOUT' ? undefined : user.clubId;
      const player = await this.service.getPlayerById(String(req.params["id"]), scopedClubId, includePrivate);

      // RC7: 역할별 PII 마스킹 적용
      const masked = stripPiiFields(
        player as Record<string, unknown>,
        user.role,
        user.coachingRole,
      );

      if (user.role === "PLAYER") {
        const { currentMarketValue: _mv, ...safePlayer } = masked;
        return res.status(200).json(safePlayer);
      }
      res.status(200).json(masked);
    } catch (err) {
      next(err);
    }
  };

  createPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(WRITE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const player = await this.service.createPlayer(req.body, user);
      res.status(201).json(player);
    } catch (err) {
      next(err);
    }
  };

  updatePlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(WRITE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const player = await this.service.updatePlayer(String(req.params["id"]), req.body, user.clubId);
      res.status(200).json(player);
    } catch (err) {
      next(err);
    }
  };

  updatePlayerStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!isAdminLike(user.role)) throw new AppError(403, "FORBIDDEN");
      const result = await this.service.updatePlayerStatus(String(req.params["id"]), req.body, user.id, user.clubId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  promotePlayer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      if (!isAdminLike(user.role)) {
        res.status(403).json({ code: "FORBIDDEN" }); return;
      }
      const { targetTeamId } = req.body as { targetTeamId: string };
      if (!targetTeamId || typeof targetTeamId !== 'string' || targetTeamId.length === 0) {
        res.status(400).json({ code: "TARGET_TEAM_REQUIRED" }); return;
      }
      const result = await this.service.promotePlayer(String(req.params["id"]), targetTeamId, user.id, user.clubId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  deletePlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!isAdminLike(user.role)) throw new AppError(403, "FORBIDDEN");
      await this.service.deletePlayer(String(req.params["id"]), user.id, user.clubId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getMarketValueHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(MARKET_VALUE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      void writeAuditLog({ actorId: user.id, action: "PLAYER_MARKET_VALUE_READ", targetId: String(req.params["id"]) }).catch(console.error);
      const history = await this.service.getMarketValueHistory(String(req.params["id"]));
      res.json(history);
    } catch (err) { next(err); }
  };

  updateMarketValue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(MARKET_VALUE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      // SH11: TD role은 자신의 팀 선수만 수정 가능
      if (user.frontOfficeRole === "TD") {
        const player = await this.service.getPlayerById(String(req.params["id"]));
        if (!player || player.teamId !== user.teamId) throw new AppError(403, "FORBIDDEN");
      }
      const result = await this.service.updateMarketValue(
        String(req.params["id"]),
        req.body,
        user.id,
        user.clubId,
      );
      res.json(result);
    } catch (err) { next(err); }
  };

  getMatchStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seasonId = req.query["seasonId"] ? Number(req.query["seasonId"]) : undefined;
      res.json(await this.service.getMatchStats(String(req.params["id"]), seasonId));
    } catch (err) { next(err); }
  };

  getTrainingResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { from, to } = req.query as Record<string, string | undefined>;
      res.json(await this.service.getTrainingResults(String(req.params["id"]), String(user.id), user.role, from, to));
    } catch (err) { next(err); }
  };

  getPositionDiversity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getPositionDiversity(String(req.params["id"])));
    } catch (err) { next(err); }
  };

  getRadar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = String(req.params["id"]);
      const player = await this.service.getPlayerById(playerId);
      const stats = await this.service.getMatchStats(playerId);
      const radar = await getPlayerRadarData(player.position, stats);
      if (!radar) return res.json({ scores: {}, strengths: [], weaknesses: [], message: "데이터 부족" });
      res.json(radar);
    } catch (err) { next(err); }
  };

  listSecondaryPositions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.spRepo) throw new AppError(500, "SECONDARY_POSITION_REPO_NOT_CONFIGURED");
      res.json(await this.spRepo.list(String(req.params["playerId"])));
    } catch (err) { next(err); }
  };

  upsertSecondaryPosition = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!this.spRepo) throw new AppError(500, "SECONDARY_POSITION_REPO_NOT_CONFIGURED");
      if (!(SECONDARY_POS_WRITE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const { position, fitnessTarget } = req.body as { position: Position; fitnessTarget: number };
      res.json(await this.spRepo.upsert(String(req.params["playerId"]), position, fitnessTarget));
    } catch (err) { next(err); }
  };

  deleteSecondaryPosition = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!this.spRepo) throw new AppError(500, "SECONDARY_POSITION_REPO_NOT_CONFIGURED");
      if (!(SECONDARY_POS_WRITE_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      await this.spRepo.delete(String(req.params["playerId"]), String(req.params["position"]) as Position);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  updateWorkPermit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const canUpdate =
        isAdminLike(user.role) ||
        user.role === 'GM' ||
        (user.role === 'FRONT_OFFICE' && (user.frontOfficeRole === 'TD' || user.frontOfficeRole === 'CONTRACT_MANAGER'));
      if (!canUpdate) throw new AppError(403, 'FORBIDDEN');
      res.json(await this.service.updateWorkPermit(String(req.params['id']), req.body, user.clubId));
   } catch (err) { next(err); }
  };

  // RC18: PLAYER 본인만 응급연락처 필드 수정 가능
  updateMyInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const playerId = String(req.params["id"]);

      const player = await this.service.getPlayerById(playerId);
      if (player.userId !== user.id) throw new AppError(403, "FORBIDDEN");

      const { emergencyContactName, emergencyContactPhone, emergencyContactRelation } = req.body as {
        emergencyContactName?: string;
        emergencyContactPhone?: string;
        emergencyContactRelation?: string;
      };

      const result = await this.service.updatePlayer(playerId, {
        ...(emergencyContactName !== undefined && { emergencyContactName }),
        ...(emergencyContactPhone !== undefined && { emergencyContactPhone }),
        ...(emergencyContactRelation !== undefined && { emergencyContactRelation }),
      }, user.clubId);

      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
