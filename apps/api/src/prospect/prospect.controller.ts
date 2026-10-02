import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { assertCuid } from "../lib/cuidGuard";
import { canReadProspect as canRead, canWriteProspect as canWrite, canSignProspect as canSign } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { ProspectService } from "./prospect.service";
import { ProspectStatus } from "../generated/enums";
import { TransitionProspectStatusDto, SignProspectDto, ProspectMedicalResultDto, CreateProspectNegotiationLogDto } from "./dto/prospect.dto";
import { CreateProspectVideoEvaluationDto, CreateProspectEvaluationLogDto, UpdateProspectVideoEvaluationDto } from "./dto/video-evaluation.dto";

export class ProspectController {
  constructor(private service: ProspectService) {}

  checkDuplicate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const name = req.query["name"] as string;
      const currentTeam = req.query["currentTeam"] as string | undefined;
      if (!name) throw new AppError(400, "NAME_REQUIRED");
      const result = await this.service.checkDuplicate(name, currentTeam);
      res.status(200).json(result);
    } catch (err) { next(err); }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role, user.coachingRole, user.departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const status = req.query["status"] as ProspectStatus | undefined;
      res.status(200).json(await this.service.getAll(status, user.clubId));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role, user.coachingRole, user.departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getById(assertCuid(req.params["id"]), user.clubId));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const prospect = await this.service.create(req.body, user);
      res.status(201).json(prospect);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.update(assertCuid(req.params["id"]), req.body, user.clubId));
    } catch (err) { next(err); }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(
        await this.service.updateStatus(assertCuid(req.params["id"]), req.body as TransitionProspectStatusDto, user.clubId)
      );
    } catch (err) { next(err); }
  };

  sign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canSign(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(
        await this.service.sign(assertCuid(req.params["id"]), req.body as SignProspectDto, user.clubId)
      );
    } catch (err) { next(err); }
  };

  recordMedicalResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(
        await this.service.recordMedicalResult(assertCuid(req.params["id"]), req.body as ProspectMedicalResultDto, user.clubId)
      );
    } catch (err) { next(err); }
  };

  addNegotiationLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.addNegotiationLog(assertCuid(req.params["id"]), req.body as CreateProspectNegotiationLogDto, user.id, user.clubId)
      );
    } catch (err) { next(err); }
  };

  getNegotiationLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getNegotiationLogs(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  addVideoEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.addVideoEvaluation(
          assertCuid(req.params["id"]),
          req.body as CreateProspectVideoEvaluationDto,
          user.id,
          user.clubId,
        ),
      );
    } catch (err) { next(err); }
  };

  updateVideoEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, 'FORBIDDEN');
      res.status(200).json(
        await this.service.updateVideoEvaluation(
          assertCuid(req.params['id']),
          Number(req.params['evalId']),
          req.body as UpdateProspectVideoEvaluationDto,
          user.clubId,
        ),
      );
    } catch (err) { next(err); }
  };

  getVideoEvaluations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getVideoEvaluations(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  addEvaluationLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.addEvaluationLog(
          assertCuid(req.params["id"]),
          req.body as CreateProspectEvaluationLogDto,
          user.id,
          user.clubId,
        ),
      );
    } catch (err) { next(err); }
  };

  getEvaluationLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getEvaluationLogs(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  checkAcquisitionGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.checkAcquisitionGate(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  getShortlistCapacity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getShortlistCapacity());
    } catch (err) { next(err); }
  };
}
