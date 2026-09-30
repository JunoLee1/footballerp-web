import { VideoRepository } from "./video.repo";
import { AppError } from "../lib/appError";
import { anthropic } from "../lib/claude";
import { NotificationRepository } from "../notification/notification.repo";
import { CreateVideoDto, CreateAssignmentDto, VideoListQuery } from "./dto/video.dto";
import { getPrisma } from "../lib/prisma";

export class VideoService {
  constructor(
    private repo: VideoRepository,
    private notifRepo: NotificationRepository,
  ) {}

  getVideos(query: VideoListQuery) {
    return this.repo.findVideos(query);
  }

  async getVideoById(id: number) {
    const video = await this.repo.findVideoById(id);
    if (!video) throw new AppError(404, "VIDEO_NOT_FOUND");
    return video;
  }

  createVideo(dto: CreateVideoDto, uploadedById: string) {
    return this.repo.createVideo({ ...dto, uploadedById });
  }

  async deleteVideo(id: number, userId: string, isAdmin: boolean) {
    const video = await this.repo.findVideoById(id);
    if (!video) throw new AppError(404, "VIDEO_NOT_FOUND");
    if (!isAdmin && video.uploadedById !== userId) throw new AppError(403, "FORBIDDEN");
    return this.repo.deleteVideo(id);
  }

  async getMyAssignments(userId: string) {
    const player = await getPrisma().player.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    return this.repo.findAssignmentsByPlayer(player.id);
  }

  async createAssignment(dto: CreateAssignmentDto & { assignerTeamId?: number | null }) {
    // SH18: 선수의 팀 == 요청자의 팀 검증 (SUPER_ADMIN 제외)
    const player = await getPrisma().player.findUnique({
      where: { id: dto.playerId },
      select: { userId: true, teamId: true },
    });
    if (dto.assignerTeamId !== undefined && player && player.teamId !== dto.assignerTeamId) {
      throw new AppError(403, "FORBIDDEN");
    }
    const assignment = await this.repo.createAssignment(dto);
    if (player?.userId) {
      void this.notifRepo
        .create({
          userId: player.userId,
          type: "VIDEO_ASSIGNED",
          title: "새 영상 과제가 할당됐습니다",
          body: `영상 ID ${dto.videoId}가 과제로 할당됐습니다.`,
          entityId: assignment.id,
        })
        .catch(console.error);
    }
    return assignment;
  }

  async updateProgress(videoId: number, playerId: string, progressRate: number, requesterId: string) {
    if (progressRate < 0 || progressRate > 100) throw new AppError(400, "INVALID_PROGRESS_RATE");
    const player = await getPrisma().player.findUnique({
      where: { userId: requesterId },
      select: { id: true },
    });
    if (!player || player.id !== playerId) throw new AppError(403, "FORBIDDEN");
    return this.repo.updateProgress(videoId, playerId, progressRate);
  }

  async generateAiSummary(id: number) {
    const video = await this.repo.findVideoById(id);
    if (!video) throw new AppError(404, "VIDEO_NOT_FOUND");

    if (!process.env["ANTHROPIC_API_KEY"]) {
      throw new AppError(503, "AI_SERVICE_UNAVAILABLE");
    }

    const sessionTypeLabel: Record<string, string> = {
      INDIVIDUAL_SKILL: "개인 기술",
      TACTICAL_DEFENSIVE: "수비 전술",
      TACTICAL_ATTACKING: "공격 전술",
      TACTICAL_FULL_TEAM: "팀 전술",
      PHYSICAL: "피지컬",
      PSYCHOLOGICAL_SOCIAL: "심리·사회",
      SET_PIECE: "세트피스",
    };

    const sessionTypeKr = video.sessionType ? (sessionTypeLabel[video.sessionType] ?? video.sessionType) : "미분류";

    let aiSummary: string;
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `다음 훈련 영상 정보를 바탕으로 코치와 선수가 참고할 수 있는 2-3문장 요약을 한국어로 작성하세요. 영상 내용을 직접 분석하는 것이 아니라 제공된 메타데이터를 기반으로 영상의 목적과 활용 방법을 설명하세요.

제목: ${video.title}
세션 유형: ${sessionTypeKr}
태그: ${video.tags.length > 0 ? video.tags.join(", ") : "없음"}
URL: ${video.url}

요약만 반환하고 다른 설명은 포함하지 마세요.`,
          },
        ],
      });

      aiSummary = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      if (!aiSummary) throw new Error("empty response");
    } catch {
      throw new AppError(503, "AI_SERVICE_UNAVAILABLE");
    }

    return this.repo.updateAiSummary(id, aiSummary);
  }
}
