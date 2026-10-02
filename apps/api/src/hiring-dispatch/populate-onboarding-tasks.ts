import type { Prisma } from "../generated/client";

/**
 * Shape of a single task inside `OnboardingTemplate.tasks` JSON. Mirrors
 * `OnboardingTemplateTask` from `onboarding-template/dto/upsert-template.dto`
 * — kept as a local interface here so this helper stays fully decoupled
 * from the template module (no import cycle with the service layer).
 */
interface TemplateTask {
  title: string;
  description?: string;
  dueDaysFromStart?: number;
  requiresVerification?: boolean;
  optional?: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Populate OnboardingTask rows for a freshly-created Onboarding, snapshot-
 * copied from the Department's OnboardingTemplate.
 *
 * MUST run **inside** the dispatch() $transaction (Q4) — if template read
 * or task inserts fail, the entire dispatch (User + UserDepartment +
 * StaffRecord + Onboarding) rolls back atomically. Passing `tx` (not the
 * base PrismaClient) is the contract.
 *
 * Silent no-op when:
 *   - Department has no template → dispatch still succeeds, tasks = [].
 *   - Template has an empty tasks array → same.
 *
 * `dueDate` derivation:
 *   - `dueDaysFromStart` null/undefined → no dueDate.
 *   - Otherwise dueDate = startDate + N days (UTC ms arithmetic; DST-safe
 *     because we don't cross a wall-clock boundary — we treat startDate as
 *     the epoch anchor).
 *
 * `order` is 0-based by array index, so the populate order matches the
 * template author's editor ordering.
 */
export async function populateOnboardingTasks(
  tx: Prisma.TransactionClient,
  onboardingId: number,
  departmentId: string,
  startDate: Date,
): Promise<void> {
  const template = await tx.onboardingTemplate.findUnique({
    where: { departmentId },
    select: { tasks: true },
  });
  if (!template) return;

  const raw = template.tasks;
  // Prisma `Json` widens to `JsonValue` — narrow to the shape we expect. A
  // corrupted / hand-edited template JSON is treated as "no tasks" rather
  // than blowing up the whole dispatch: the template CRUD path validates
  // strictly, so this branch only trips on bad manual edits.
  if (!Array.isArray(raw) || raw.length === 0) return;

  const tasks = raw as unknown as TemplateTask[];
  const startMs = startDate.getTime();

  await tx.onboardingTask.createMany({
    data: tasks.map((t, idx) => ({
      onboardingId,
      title: t.title,
      description: t.description ?? null,
      dueDate:
        t.dueDaysFromStart != null
          ? new Date(startMs + t.dueDaysFromStart * MS_PER_DAY)
          : null,
      requiresVerification: t.requiresVerification ?? false,
      optional: t.optional ?? false,
      order: idx,
    })),
  });
}
