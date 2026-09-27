import { Request, Response, NextFunction } from "express";
import { requireUser } from "../lib/authMiddleware";
import { AppError } from "../lib/appError";
import { cached } from "../lib/cache";
import { medicalEquipmentLoanRepo } from "./medical-equipment-loan.repo";
import * as service from "./medical-equipment-loan.service";

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string);
    const ledger = await medicalEquipmentLoanRepo.findLedgerById(id);
    if (!ledger) throw new AppError(404, "LEDGER_NOT_FOUND");
    res.json(ledger);
  } catch (e) {
    next(e);
  }
}

export async function listLoans(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, requestedById } = req.query as Record<string, string>;
    const key = `medical-equipment-loan:list:${status ?? "all"}:${requestedById ?? "any"}`;
    const result = await cached(key, 30, () =>
      medicalEquipmentLoanRepo.findAll({
        ...(status && { status }),
        ...(requestedById && { requestedById: parseInt(requestedById) }),
      }),
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function requestNormal(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const result = await service.requestNormalLoan(user.id, req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function requestEmergency(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const result = await service.requestEmergencyLoan(user.id, req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const ledgerId = parseInt(req.params.id as string);
    const result = await service.approveLoan(ledgerId, user.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const ledgerId = parseInt(req.params.id as string);
    const result = await service.rejectLoan(ledgerId, user.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
}
