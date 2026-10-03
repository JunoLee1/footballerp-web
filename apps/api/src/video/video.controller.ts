import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { VideoService } from "./video.service";

const CAN_WRITE = ["ADMIN", "SUPER_ADMIN", "COACHING_STAFF"];

export class VideoController {
  constructor(private service: VideoService) {}

  getVideos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: import("./dto/video.dto").VideoListQuery = {};
      if (req.query["sessionType"]) query.sessionType = req.query["sessionType"] as import("../generated/enums").SessionType;
      if (req.query["tag"]) query.tag = req.query["tag"] as string;
      res.json(await this.service.getVideos(query));
    } catch (err) { next(err); }
  };

  getVideoById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getVideoById(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  createVideo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!CAN_WRITE.includes(user.role)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.createVideo(req.body, user.id));
    } catch (err) { next(err); }
  };

  deleteVideo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!CAN_WRITE.includes(user.role)) throw new AppError(403, "FORBIDDEN");
      await this.service.deleteVideo(
        Number(req.params["id"]),
        user.id,
        isAdminLike(user.role),
      );
      res.status(204).send();
    } catch (err) { next(err); }
  };

  getMyAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (user.role !== "PLAYER") throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getMyAssignments(user.id));
    } catch (err) { next(err); }
  };

  createAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!CAN_WRITE.includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const dto: import("./dto/video.dto").CreateAssignmentDto & { assignerTeamId?: string | null } = {
        videoId: Number(req.params["id"]),
        playerId: req.body.playerId,
        assignedById: user.id,
      };
      // SH18: SUPER_ADMIN은 팀 제한 없음, 그 외 역할은 자신의 팀 선수에게만 배정 가능
      if (user.role !== "SUPER_ADMIN") dto.assignerTeamId = user.teamId ?? null;
      if (req.body.dueDate) dto.dueDate = new Date(req.body.dueDate);
      if (req.body.note) dto.note = req.body.note;
      res.status(201).json(await this.service.createAssignment(dto));
    } catch (err) { next(err); }
  };

  updateProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (user.role !== "PLAYER") throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.updateProgress(
        Number(req.params["id"]),
        String(req.params["playerId"]),
        Number(req.body.progressRate),
        user.id,
      ));
    } catch (err) { next(err); }
  };

  generateAiSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!CAN_WRITE.includes(user.role)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(
        await this.service.generateAiSummary(Number(req.params["id"])),
      );
    } catch (err) {
      next(err);
    }
  };
}
