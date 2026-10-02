import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import type { AcademyFeeService } from "./academy-fee.service";

export class AcademyFeeController {
  constructor(private service: AcademyFeeService) {}

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.getById(Number(req.params.id))); }
    catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as import("./dto/academy-fee.dto").CreateSingleFeeDto;
      res.status(201).json(await this.service.createSingle(dto));
    } catch (e) { next(e); }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, teamId, year, month } = req.query;
      const query: import("./dto/academy-fee.dto").FeeListQuery = {};
      if (status) query.status = status as string;
      if (teamId) query.teamId = Number(teamId);
      if (year) query.year = Number(year);
      if (month) query.month = Number(month);
      res.json(await this.service.getAll(query));
    } catch (e) { next(e); }
  };

  getByPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.getByPlayer(String(req.params.playerId ?? ""))); }
    catch (e) { next(e); }
  };

  issueMonthlyFees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { year, month, amount } = req.body as { year: number; month: number; amount: number };
      await this.service.issueMonthlyFees(year, month, amount);
      res.json({ success: true });
    } catch (e) { next(e); }
  };

  submitPaymentProof = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.submitPaymentProof(Number(req.params.id), req.body)); }
    catch (e) { next(e); }
  };

  approvePayment = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.approvePayment(Number(req.params.id), req.user!.id)); }
    catch (e) { next(e); }
  };

  tossConfirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { paymentKey, orderId, amount } = req.body as import("./dto/academy-fee.dto").TossConfirmDto;
      if (!paymentKey || !orderId || !amount) return next(new AppError(400, "INVALID_PAYMENT_DATA"));
      res.json(await this.service.confirmTossPayment(id, { paymentKey, orderId, amount }));
    } catch (e) { next(e); }
  };

  tossWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.tossWebhook(req.body);
      res.json(result);
    } catch (e) {
      // webhook은 항상 200 반환해야 Toss가 재시도 안 함
      console.error("Toss webhook error:", e);
      res.json({ ok: false });
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: requesterId, role, frontOfficeRole } = req.user!;
      res.json(await this.service.getReceipt(Number(req.params.id), requesterId, role, frontOfficeRole));
    } catch (e) { next(e); }
  };

  adminSubmit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.adminSubmitProof(Number(req.params.id), req.body));
    } catch (e) { next(e); }
  };

  getStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const month = Number(req.query.month ?? now.getMonth() + 1);
      res.json(await this.service.getFinanceStats(year, month));
    } catch (e) { next(e); }
  };
}
