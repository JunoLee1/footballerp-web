import { Request, Response, NextFunction } from "express";
import { ReservationRepository } from "./reservation.repo";
import { requireUser } from "../../lib/authMiddleware";
import { AppError } from "../../lib/appError";
import { isAdminLike } from "../../lib/permissions";
import { getPrisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/auditLog";
import { assertCuid } from "../../lib/cuidGuard";
import type { FacilityZone } from "../../generated/enums";

export class ReservationController {
  private repo = new ReservationRepository(getPrisma());

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const { facilityZone } = req.query as { facilityZone?: string };
      res.json(await this.repo.findAll(facilityZone as FacilityZone | undefined));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { facilityZone, title, startTime, endTime, notes } = req.body as {
        facilityZone: string; title: string; startTime: string; endTime: string; notes?: string;
      };
      if (!facilityZone || !title || !startTime || !endTime) throw new AppError(400, "MISSING_REQUIRED_FIELDS");
      if (new Date(startTime) >= new Date(endTime)) throw new AppError(400, "INVALID_TIME_RANGE");
      const reservation = await this.repo.create({
        facilityZone: facilityZone as FacilityZone,
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        ...(notes !== undefined ? { notes } : {}),
        reservedById: user.id,
      });
      void writeAuditLog({
        actorId: user.id,
        action: 'FACILITY_RESERVATION_CREATED',
        targetId: reservation.id,
        detail: { facilityZone, title, startTime, endTime },
      }).catch(console.error);
      res.status(201).json(reservation);
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const id = assertCuid(req.params["id"]);
      const existing = await this.repo.findById(id);
      if (!existing) throw new AppError(404, "RESERVATION_NOT_FOUND");
      if (existing.reservedBy.id !== user.id && !isAdminLike(user.role)) {
        throw new AppError(403, "FORBIDDEN");
      }
      await this.repo.delete(id);
      void writeAuditLog({
        actorId: user.id,
        action: 'FACILITY_RESERVATION_DELETED',
        targetId: id,
        detail: { facilityZone: existing.facilityZone, title: existing.title },
      }).catch(console.error);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
