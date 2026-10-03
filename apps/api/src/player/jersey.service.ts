import { AppError } from "../lib/appError";
import { JerseyRepository } from "./jersey.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { AssignJerseyDto } from "./dto/jersey.dto";

const CONFLICT_REASON: Record<string, "OCCUPIED" | "RETIRED" | "RESERVED"> = {
  OCCUPIED: "OCCUPIED",
  RETIRED: "RETIRED",
  RESERVED: "RESERVED",
};

export class JerseyService {
  constructor(
    private repo: JerseyRepository,
    private notifRepo?: NotificationRepository,
  ) {}

  listByTeam(teamId: string) {
    return this.repo.findByTeam(teamId);
  }

  listByPlayer(playerId: string) {
    return this.repo.findByPlayer(playerId);
  }

  async assignToPlayer(teamId: string, dto: AssignJerseyDto) {
    const existing = await this.repo.findByNumberAndTeam(dto.number, teamId);

    if (existing && CONFLICT_REASON[existing.status]) {
      // fire-and-forget: notify the player who requested the conflicting number
      if (this.notifRepo && dto.playerId) {
        void this.repo
          .findPlayerUserId(dto.playerId)
          .then((p) => {
            if (p?.userId) {
              return this.notifRepo!.createForUser(
                p.userId,
                "JERSEY_NUMBER_CONFLICT",
                () => ({
                  title: `등번호 ${dto.number}번 선택 불가`,
                  body: `요청하신 ${dto.number}번은 ${
                    existing.status === "OCCUPIED"
                      ? "이미 다른 선수가 사용 중입니다"
                      : existing.status === "RETIRED"
                      ? "구단 영구결번입니다"
                      : "계약 진행 중인 선수가 선점한 번호입니다"
                  }. 다른 번호를 선택해 주세요.`,
                }),
              );
            }
          })
          .catch(console.error);
      }
      if (existing.status === "OCCUPIED") throw new AppError(409, "JERSEY_NUMBER_OCCUPIED");
      if (existing.status === "RETIRED") throw new AppError(403, "JERSEY_NUMBER_RETIRED");
      if (existing.status === "RESERVED") throw new AppError(409, "JERSEY_NUMBER_RESERVED");
    }

    if (existing) {
      return this.repo.updateStatus(existing.id, { status: "OCCUPIED", playerId: dto.playerId ?? null });
    }
    return this.repo.create(teamId, { ...dto, status: "OCCUPIED" });
  }

  async release(teamId: string, number: number) {
    const jersey = await this.repo.findByNumberAndTeam(number, teamId);
    if (!jersey) throw new AppError(404, "JERSEY_NOT_FOUND");
    if (jersey.status !== "OCCUPIED") throw new AppError(409, "JERSEY_NOT_OCCUPIED");
    return this.repo.updateStatus(jersey.id, { status: "AVAILABLE", playerId: null });
  }

  async retire(teamId: string, number: number) {
    const jersey = await this.repo.findByNumberAndTeam(number, teamId);
    if (!jersey) {
      return this.repo.create(teamId, { number, status: "RETIRED" });
    }
    if (jersey.status !== "AVAILABLE") throw new AppError(409, "JERSEY_MUST_BE_AVAILABLE_TO_RETIRE");
    return this.repo.updateStatus(jersey.id, { status: "RETIRED", playerId: null });
  }

  async reactivate(teamId: string, number: number) {
    const jersey = await this.repo.findByNumberAndTeam(number, teamId);
    if (!jersey || jersey.status !== "RETIRED") throw new AppError(409, "JERSEY_NOT_RETIRED");
    return this.repo.updateStatus(jersey.id, { status: "AVAILABLE" });
  }
}
