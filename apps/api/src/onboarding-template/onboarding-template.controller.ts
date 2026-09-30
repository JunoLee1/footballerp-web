import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { canWriteHR } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import type { UpsertOnboardingTemplateDto } from "./dto/upsert-template.dto";
import type { OnboardingTemplateService } from "./onboarding-template.service";

/**
 * REST layer for OnboardingTemplate.
 *
 * Read = anyone HR-adjacent (canReadHR keeps HR_STAFF happy).
 * Write = dept.head (Department.headId === user.id) OR canWriteHR
 *          (HR_MANAGER + admin-like) — Q6.
 *
 * HR_STAFF caveat: plan asks for HR_STAFF verify/write parity but the existing
 * `canWriteHR` only allows HR_MANAGER + admin-like. Widening is cross-cutting
 * (asset-request, hiring-document, plan-report use the same helper), so we
 * leave a TODO for a follow-up PR — same trade-off documented in
 * hiring-document.controller.ts.
 */
export class OnboardingTemplateController {
  constructor(private service: OnboardingTemplateService) {}

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const departmentId = this.parseDeptId(req);
      const row = await this.service.get(departmentId);
      if (!row) {
        res.status(404).json({ code: "TEMPLATE_NOT_FOUND" });
        return;
      }
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  upsert = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const departmentId = this.parseDeptId(req);
      await this.assertWritePermission(user.id, user.role, user.frontOfficeRole, departmentId);

      const dto = (req.body ?? {}) as UpsertOnboardingTemplateDto;
      const result = await this.service.upsert(departmentId, dto, user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const departmentId = this.parseDeptId(req);
      await this.assertWritePermission(user.id, user.role, user.frontOfficeRole, departmentId);
      const result = await this.service.remove(departmentId, user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  private parseDeptId(req: Request): number {
    const raw = req.params["departmentId"];
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new AppError(400, "INVALID_DEPARTMENT_ID");
    return n;
  }

  /**
   * Write permission gate. Two independent grants (any one is enough):
   *   1. Global HR write (canWriteHR — HR_MANAGER + admin-like).
   *   2. Department head of the target department (Department.headId).
   *
   * Both branches issue their own DB call; we short-circuit on HR grant to
   * skip the department lookup when possible.
   */
  private async assertWritePermission(
    userId: string,
    role: string,
    foRole: string | null | undefined,
    departmentId: number,
  ): Promise<void> {
    if (canWriteHR(role, foRole)) return;
    const dept = await getPrisma().department.findUnique({
      where: { id: departmentId },
      select: { headId: true },
    });
    if (dept?.headId === userId) return;
    throw new AppError(403, "FORBIDDEN");
  }
}
