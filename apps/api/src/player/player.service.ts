import { PlayerRepository } from "./player.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { CreatePlayerDto, UpdatePlayerDto, UpdatePlayerStatusDto, PlayerListQuery } from "./dto/player.dto";
import { MarketValueRepository } from "./market-value.repo";
import { UpdateMarketValueDto } from "./dto/market-value.dto";
import { getPrisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { isAdminLike } from "../lib/permissions";

export class PlayerService {
  constructor(private repo: PlayerRepository, private mvRepo?: MarketValueRepository) {}

  async getPlayers(query: PlayerListQuery, clubId?: string | null) {
    const rows = await this.repo.findAll(query, clubId);
    return rows.map((row) => {
      const { dateOfBirthEncrypted, dateOfBirthIv, ...rest } = row as typeof row & {
        dateOfBirthEncrypted?: string | null;
        dateOfBirthIv?: string | null;
      };
      return {
        ...rest,
        dateOfBirth: dateOfBirthEncrypted && dateOfBirthIv
          ? decrypt(dateOfBirthEncrypted, dateOfBirthIv)
          : null,
      };
    });
  }

  async getPlayerById(id: string, clubId?: string | null, includePrivate = false) {
    const raw = await this.repo.findById(id, clubId, includePrivate);
    if (!raw) throw new AppError(404, "PLAYER_NOT_FOUND");

    const {
      dateOfBirthEncrypted, dateOfBirthIv,
      emergencyContactNameEncrypted, emergencyContactNameIv,
      emergencyContactPhoneEncrypted, emergencyContactPhoneIv,
      emergencyContactRelationEncrypted, emergencyContactRelationIv,
      ...rest
    } = raw as typeof raw & {
      dateOfBirthEncrypted?: string | null;
      dateOfBirthIv?: string | null;
      emergencyContactNameEncrypted?: string | null;
      emergencyContactNameIv?: string | null;
      emergencyContactPhoneEncrypted?: string | null;
      emergencyContactPhoneIv?: string | null;
      emergencyContactRelationEncrypted?: string | null;
      emergencyContactRelationIv?: string | null;
    };

    return {
      ...rest,
      dateOfBirth: dateOfBirthEncrypted && dateOfBirthIv
        ? decrypt(dateOfBirthEncrypted, dateOfBirthIv)
        : null,
      ...(includePrivate && {
        emergencyContactName: emergencyContactNameEncrypted && emergencyContactNameIv
          ? decrypt(emergencyContactNameEncrypted, emergencyContactNameIv)
          : null,
        emergencyContactPhone: emergencyContactPhoneEncrypted && emergencyContactPhoneIv
          ? decrypt(emergencyContactPhoneEncrypted, emergencyContactPhoneIv)
          : null,
        emergencyContactRelation: emergencyContactRelationEncrypted && emergencyContactRelationIv
          ? decrypt(emergencyContactRelationEncrypted, emergencyContactRelationIv)
          : null,
      }),
    };
  }

  async createPlayer(dto: CreatePlayerDto, actor: Express.User) {
    const player = await this.repo.create(dto, actor.clubId ?? null);
    await writeAuditLog({ actorId: actor.id, action: "PLAYER_CREATED", targetId: player.id });
    return player;
  }

  async updatePlayer(id: string, dto: UpdatePlayerDto, actorClubId?: string | null) {
    const player = await this.repo.findById(id, actorClubId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    return this.repo.update(id, dto);
  }

  async updatePlayerStatus(id: string, { status }: UpdatePlayerStatusDto, actorId: string, actorClubId?: string | null) {
    const player = await this.repo.findById(id, actorClubId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    const result = await this.repo.updateStatus(id, status);

    if (status === "RELEASED") {
      const prisma = getPrisma();
      const activeContracts = await prisma.contract.findMany({
        where: { playerId: id, status: "ACTIVE" },
        select: { id: true },
      });
      if (activeContracts.length > 0) {
        await prisma.contract.updateMany({
          where: { playerId: id, status: "ACTIVE" },
          data: { status: "TERMINATED" },
        });
        void writeAuditLog({
          actorId,
          action: "CONTRACTS_TERMINATED_ON_RELEASE",
          targetId: id,
          detail: { playerId: id, contractIds: activeContracts.map((c) => c.id) },
        }).catch(console.error);
      }
    }

    return result;
  }

  async promotePlayer(id: string, targetTeamId: number, actorId: string, actorClubId?: string | null) {
    const player = await this.repo.findById(id, actorClubId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (!player.team || player.team.type !== "YOUTH") {
      throw new AppError(409, "PLAYER_NOT_ON_YOUTH_TEAM");
    }
    const result = await this.repo.promotePlayer(id, targetTeamId, player.teamId!);
    await writeAuditLog({
      actorId,
      action: "PLAYER_PROMOTED_TO_FIRST_TEAM",
      targetId: id,
      detail: { fromTeamId: player.teamId, toTeamId: targetTeamId },
    });
    return result;
  }

  async updateWorkPermit(id: string, dto: { workPermitStatus: string; workPermitExpiry?: string }, actorClubId?: string | null) {
    const player = await this.repo.findById(id, actorClubId);
    if (!player) throw new AppError(404, 'PLAYER_NOT_FOUND');
    if (dto.workPermitStatus === 'NOT_REQUIRED') throw new AppError(400, 'CANNOT_SET_NOT_REQUIRED');
    if (dto.workPermitStatus === 'APPROVED' && !dto.workPermitExpiry) {
      throw new AppError(400, 'EXPIRY_DATE_REQUIRED');
    }
    return this.repo.updateWorkPermit(id, {
      workPermitStatus: dto.workPermitStatus,
      ...(dto.workPermitExpiry && { workPermitExpiry: new Date(dto.workPermitExpiry) }),
    });
  }

  async deletePlayer(id: string, actorId: string, actorClubId?: string | null) {
    const player = await this.repo.findById(id, actorClubId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    await this.repo.delete(id);
    await writeAuditLog({ actorId, action: "PLAYER_DELETED", targetId: id, detail: { playerName: player.playerName } });
  }

  async getMarketValueHistory(playerId: string) {
    const player = await this.repo.findById(playerId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (!this.mvRepo) throw new AppError(500, "MARKET_VALUE_REPO_NOT_CONFIGURED");
    return this.mvRepo.getHistory(playerId);
  }

  async updateMarketValue(playerId: string, dto: UpdateMarketValueDto, recordedById: string, actorClubId?: string | null) {
    const player = await this.repo.findById(playerId, actorClubId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (!this.mvRepo) throw new AppError(500, "MARKET_VALUE_REPO_NOT_CONFIGURED");
    await this.mvRepo.updateCurrentValue(playerId, dto.value, recordedById);
    return { playerId, currentMarketValue: dto.value };
  }

  async getMatchStats(playerId: string, seasonId?: number) {
    const player = await this.repo.findById(playerId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    return this.repo.getMatchStats(playerId, seasonId);
  }

  async getTrainingResults(playerId: string, requesterId: string, requesterRole: string, from?: string, to?: string) {
    const player = await this.repo.findById(playerId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");

    // #590: allow-list guard — 훈련 개인 데이터는 admin·GM·코치 + 본인 · 자녀 담당 보호자 · 담당 에이전트만.
    // FRONT_OFFICE (HR/ASSET/FACILITY/FINANCE) 등 무관 role 은 접근 불필요.
    const canRead =
      isAdminLike(requesterRole) ||
      requesterRole === "COACHING_STAFF" ||
      (requesterRole === "PLAYER" && String(player.userId) === requesterId) ||
      (requesterRole === "GUARDIAN" && String(player.guardianId) === requesterId) ||
      (requesterRole === "AGENT" && String(player.agentId) === requesterId);
    if (!canRead) throw new AppError(403, "FORBIDDEN");

    return this.repo.getTrainingResults(playerId, from, to);
  }

  async getPositionDiversity(playerId: string) {
    const player = await this.repo.findById(playerId);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (player.team?.type !== "YOUTH") return [];
    const rows = await this.repo.getPositionDiversity(playerId);
    const totalMinutes = rows.reduce((sum, r) => sum + r.totalMinutes, 0);
    if (totalMinutes === 0) return [];
    return rows.map((r) => ({
      position: r.position,
      minutes: r.totalMinutes,
      percentage: Math.round((r.totalMinutes / totalMinutes) * 100),
    }));
  }
}
