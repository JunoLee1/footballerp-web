import { PrismaClient } from "../generated/client";
import { CreateVideoDto, CreateAssignmentDto, VideoListQuery } from "./dto/video.dto";

export class VideoRepository {
  constructor(private prisma: PrismaClient) {}

  createVideo(dto: CreateVideoDto & { uploadedById: string }) {
    return this.prisma.trainingVideo.create({
      data: {
        title: dto.title,
        url: dto.url,
        tags: dto.tags ?? [],
        sessionType: dto.sessionType ?? null,
        uploadedById: dto.uploadedById,
      },
    });
  }

  findVideos(query: VideoListQuery) {
    return this.prisma.trainingVideo.findMany({
      where: {
        ...(query.sessionType && { sessionType: query.sessionType }),
        ...(query.tag && { tags: { has: query.tag } }),
      },
      include: {
        uploader: { select: { id: true, nickname: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findVideoById(id: number) {
    return this.prisma.trainingVideo.findUnique({
      where: { id },
      include: {
        uploader: { select: { id: true, nickname: true } },
        assignments: {
          include: {
            player: { select: { id: true, playerName: true, position: true } },
            assignedBy: { select: { id: true, nickname: true } },
          },
        },
      },
    });
  }

  createAssignment(dto: CreateAssignmentDto) {
    return this.prisma.videoAssignment.create({
      data: {
        videoId: dto.videoId,
        playerId: dto.playerId,
        assignedById: dto.assignedById,
        dueDate: dto.dueDate ?? null,
        note: dto.note ?? null,
      },
    });
  }

  findAssignmentsByPlayer(playerId: string) {
    return this.prisma.videoAssignment.findMany({
      where: { playerId },
      include: {
        video: { select: { id: true, title: true, url: true, tags: true, sessionType: true } },
        assignedBy: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  updateProgress(videoId: number, playerId: string, progressRate: number) {
    return this.prisma.videoAssignment.update({
      where: { videoId_playerId: { videoId, playerId } },
      data: { progressRate },
    });
  }

  findOverdueAssignments(now: Date) {
    return this.prisma.videoAssignment.findMany({
      where: {
        dueDate: { lt: now },
        progressRate: { lt: 100 },
      },
      include: {
        player: { select: { id: true, playerName: true } },
        assignedBy: { select: { id: true } },
        video: { select: { id: true, title: true } },
      },
    });
  }

  deleteVideo(id: number) {
    return this.prisma.trainingVideo.delete({ where: { id } });
  }

  updateAiSummary(id: number, aiSummary: string) {
    return this.prisma.trainingVideo.update({
      where: { id },
      data: { aiSummary },
      select: { id: true, aiSummary: true },
    });
  }
}
