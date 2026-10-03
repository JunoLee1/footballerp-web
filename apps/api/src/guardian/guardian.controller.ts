import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import type { GuardianService } from "./guardian.service";
import type { LinkBySearchDto, LinkByCodeDto, IssueInviteCodeDto } from "./dto/guardian.dto";

const INVITE_CODE_ROLES = ["ADMIN", "SUPER_ADMIN", "GM", "FRONT_OFFICE"] as const;

export class GuardianController {
  constructor(private service: GuardianService) {}

  linkBySearch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentCode, playerName, dateOfBirth } = req.body as LinkBySearchDto;
      if (!studentCode || !playerName || !dateOfBirth) throw new AppError(400, "MISSING_FIELDS");
      const result = await this.service.linkBySearch({ studentCode, playerName, dateOfBirth }, requireUser(req).id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  linkByCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body as LinkByCodeDto;
      if (!code) throw new AppError(400, "MISSING_FIELDS");
      await this.service.linkByCode({ code }, requireUser(req).id);
      res.status(200).json({ ok: true });
    } catch (e) { next(e); }
  };

  issueInviteCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.body as IssueInviteCodeDto;
      if (!playerId) throw new AppError(400, "MISSING_FIELDS");
      const user = requireUser(req);
      const role = user.role;
      if (!(INVITE_CODE_ROLES as readonly string[]).includes(role)) throw new AppError(403, "FORBIDDEN");
      const result = await this.service.issueInviteCode({ playerId }, user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  getChildren = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getChildren(requireUser(req).id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.childPlayerId!;
      const result = await this.service.getDashboard(playerId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  getChildAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.childPlayerId!;
      const { from, to } = req.query as { from?: string; to?: string };
      const result = await this.service.getChildAttendance(playerId, from, to);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  getChildInjuries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.childPlayerId!;
      const result = await this.service.getChildInjuries(playerId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  getChildFees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.childPlayerId!;
      const result = await this.service.getChildFees(playerId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };

  submitFeeProof = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feeId = String(req.params['feeId']);
      const playerId = req.childPlayerId!;
      const { url } = req.body;
      if (!url) throw new AppError(400, "MISSING_FIELDS");
      const result = await this.service.submitFeeProof(feeId, url, playerId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  };
}
