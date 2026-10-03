import type { Prisma, PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import type { OnboardingTemplateRepository } from "./onboarding-template.repo";
import type {
  OnboardingTemplateTask,
  UpsertOnboardingTemplateDto,
} from "./dto/upsert-template.dto";

// Bounds — plan 부록 (Task 2 DTO): title max 200, description max 2000,
// tasks max 100. Enforced service-side (no zod on this codebase).
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_TASKS = 100;
const MAX_DUE_DAYS = 365;
const MAX_NAME = 200;

/**
 * Service for Department-scoped onboarding templates.
 *
 * Design notes:
 * - Department 1:1 (Q2, DepartmentDefaultAssetKit precedent). Upsert-shaped.
 * - Task validation is manual (no zod on this codebase — same as
 *   HiringDocumentService).
 * - Permission checks live in the controller: dept.head (via Department.headId)
 *   OR canWriteHR (HR_MANAGER + admin-like). HR_STAFF wideniing is a
 *   cross-cutting follow-up (see hiring-document.controller.ts note).
 */
export class OnboardingTemplateService {
  constructor(
    private repo: OnboardingTemplateRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // Read
  // ────────────────────────────────────────────

  get(departmentId: string) {
    return this.repo.findByDepartmentId(departmentId);
  }

  // ────────────────────────────────────────────
  // Write
  // ────────────────────────────────────────────

  async upsert(
    departmentId: string,
    dto: UpsertOnboardingTemplateDto,
    actorId: string,
  ) {
    // Cheap existence check — keeps orphaned templates out even though the FK
    // would catch it. Same pattern as hiring-document.upload().
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");

    const name = dto.name?.trim();
    if (!name) throw new AppError(400, "NAME_REQUIRED");
    if (name.length > MAX_NAME) throw new AppError(400, "NAME_TOO_LONG");

    const tasks = this.validateTasks(dto.tasks);

    const created = await this.repo.upsert(departmentId, {
      name,
      // Cast is safe — validateTasks() returns POJOs with only string / number
      // / boolean fields, which satisfies Prisma's InputJsonValue.
      tasks: tasks as unknown as Prisma.InputJsonValue,
      actorId,
    });

    void writeAuditLog({
      actorId,
      action: "ONBOARDING_TEMPLATE_UPSERTED",
      targetId: created.id,
      detail: { departmentId, taskCount: tasks.length },
    }).catch(console.error);

    return created;
  }

  async remove(departmentId: string, actorId: string) {
    const existing = await this.repo.findByDepartmentId(departmentId);
    if (!existing) throw new AppError(404, "TEMPLATE_NOT_FOUND");
    const deleted = await this.repo.remove(departmentId);
    void writeAuditLog({
      actorId,
      action: "ONBOARDING_TEMPLATE_DELETED",
      targetId: deleted.id,
      detail: { departmentId },
    }).catch(console.error);
    return deleted;
  }

  // ────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────

  /**
   * Manual validation of the tasks payload. Kept as an inline pure function
   * so the service stays testable without a schema library. Returns the
   * normalized tasks (trimmed title/description) — never mutates the input.
   */
  private validateTasks(raw: unknown): OnboardingTemplateTask[] {
    if (!Array.isArray(raw)) throw new AppError(400, "TASKS_MUST_BE_ARRAY");
    if (raw.length > MAX_TASKS) throw new AppError(400, "TOO_MANY_TASKS");

    const normalized: OnboardingTemplateTask[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const t = raw[i];
      if (typeof t !== "object" || t === null) {
        throw new AppError(400, `INVALID_TASK_AT:${i}`);
      }
      const obj = t as Record<string, unknown>;

      const title =
        typeof obj["title"] === "string" ? (obj["title"] as string).trim() : "";
      if (!title) throw new AppError(400, `TASK_TITLE_REQUIRED_AT:${i}`);
      if (title.length > MAX_TITLE) throw new AppError(400, `TASK_TITLE_TOO_LONG_AT:${i}`);

      const description =
        typeof obj["description"] === "string"
          ? (obj["description"] as string).trim()
          : undefined;
      if (description && description.length > MAX_DESCRIPTION) {
        throw new AppError(400, `TASK_DESCRIPTION_TOO_LONG_AT:${i}`);
      }

      const dueDaysRaw = obj["dueDaysFromStart"];
      let dueDaysFromStart: number | undefined;
      if (dueDaysRaw != null) {
        if (typeof dueDaysRaw !== "number" || !Number.isFinite(dueDaysRaw)) {
          throw new AppError(400, `INVALID_DUE_DAYS_AT:${i}`);
        }
        if (!Number.isInteger(dueDaysRaw) || dueDaysRaw < 0 || dueDaysRaw > MAX_DUE_DAYS) {
          throw new AppError(400, `INVALID_DUE_DAYS_AT:${i}`);
        }
        dueDaysFromStart = dueDaysRaw;
      }

      const requiresVerification =
        typeof obj["requiresVerification"] === "boolean"
          ? (obj["requiresVerification"] as boolean)
          : false;
      const optional =
        typeof obj["optional"] === "boolean" ? (obj["optional"] as boolean) : false;

      const task: OnboardingTemplateTask = {
        title,
        requiresVerification,
        optional,
      };
      if (description !== undefined) task.description = description;
      if (dueDaysFromStart !== undefined) task.dueDaysFromStart = dueDaysFromStart;
      normalized.push(task);
    }
    return normalized;
  }
}
