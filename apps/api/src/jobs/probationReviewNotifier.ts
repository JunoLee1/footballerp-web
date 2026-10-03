import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";

/**
 * D-7 notifier for probation reviews (issue #375).
 *
 * Runs daily at 09:00 KST (via node-cron in server.ts). For each StaffRecord
 * currently `IN_PROGRESS`, computes the 3MO and 6MO checkpoints from
 * `probationStartedAt + probationMonths` (from ClubSettings) and, when the
 * checkpoint is exactly 7 days from `today`, notifies the department head.
 *
 * Deduplication: uses Notification.type + entityId (staffRecordId) — a
 * PROBATION_REVIEW_DUE_SOON row with matching entityId means we already
 * warned. Same shape as contractExpiryAlert.ts.
 *
 * Structure mirrors quarterlyHiringSurveyDraft — pure `run…` function with a
 * dep object so the tests don't need a live Prisma. `start…` wires up the
 * cron schedule with the real deps.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type ProbationReviewType = "THREE_MO" | "SIX_MO";

export interface ProbationCandidateStaff {
  id: string;
  name?: string | null;
  probationStartedAt: Date | null;
  departmentId: string | null;
  department: { id: string; name: string; headId: string | null } | null;
}

export interface NotifyDeptHeadArgs {
  staffId: string;
  staffName: string | null;
  reviewType: ProbationReviewType;
  deptHeadId: string;
  checkpointDate: Date;
}

export interface RunDeps {
  findStaffInProbation: () => Promise<ProbationCandidateStaff[]>;
  hasSentReminder: (staffId: string, reviewType: ProbationReviewType) => Promise<boolean>;
  notifyDeptHead: (args: NotifyDeptHeadArgs) => Promise<void>;
  probationMonths: number;
  now: () => Date;
}

/** True when `date` falls on the same UTC calendar day as `today + 7 days`. */
function isDMinus7(today: Date, date: Date): boolean {
  const target = new Date(today.getTime() + 7 * ONE_DAY_MS);
  return (
    target.getUTCFullYear() === date.getUTCFullYear() &&
    target.getUTCMonth() === date.getUTCMonth() &&
    target.getUTCDate() === date.getUTCDate()
  );
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function runProbationReviewNotifier(deps: RunDeps): Promise<void> {
  const today = deps.now();
  const staffList = await deps.findStaffInProbation();

  for (const staff of staffList) {
    if (!staff.probationStartedAt) continue;
    if (!staff.department?.headId) continue;

    // Compute 3MO and 6MO checkpoints. `probationMonths` from ClubSettings
    // is the *primary* checkpoint (default 3); 6MO is always +6 months from
    // start regardless of the setting (issue #375 grill decision: both 3+6
    // are fixed).
    const threeMoCheckpoint = addMonths(staff.probationStartedAt, deps.probationMonths);
    const sixMoCheckpoint = addMonths(staff.probationStartedAt, 6);

    if (isDMinus7(today, threeMoCheckpoint)) {
      const already = await deps.hasSentReminder(staff.id, "THREE_MO");
      if (!already) {
        await deps.notifyDeptHead({
          staffId: staff.id,
          staffName: staff.name ?? null,
          reviewType: "THREE_MO",
          deptHeadId: staff.department.headId,
          checkpointDate: threeMoCheckpoint,
        });
      }
    }

    if (isDMinus7(today, sixMoCheckpoint)) {
      const already = await deps.hasSentReminder(staff.id, "SIX_MO");
      if (!already) {
        await deps.notifyDeptHead({
          staffId: staff.id,
          staffName: staff.name ?? null,
          reviewType: "SIX_MO",
          deptHeadId: staff.department.headId,
          checkpointDate: sixMoCheckpoint,
        });
      }
    }
  }
}

export function startProbationReviewNotifierJob() {
  // Daily at 09:00 (KST). Same slot as hiringSurveyReminder.
  cron.schedule("0 9 * * *", async () => {
    const prisma = getPrisma();
    const notifRepo = new NotificationRepository(prisma);

    try {
      const settings = await prisma.clubSettings.findFirst();
      const probationMonths = settings?.probationMonths ?? 3;

      await runProbationReviewNotifier({
        probationMonths,
        now: () => new Date(),
        findStaffInProbation: async () =>
          prisma.staffRecord.findMany({
            where: { probationStatus: "IN_PROGRESS", probationStartedAt: { not: null } },
            select: {
              id: true,
              name: true,
              probationStartedAt: true,
              departmentId: true,
              department: { select: { id: true, name: true, headId: true } },
            },
          }),
        hasSentReminder: async (staffId, reviewType) => {
          // Dedup key = (type + entityId). We embed reviewType in the
          // Notification.body so the same NotificationType covers both 3MO
          // and 6MO; the dedup here counts the union — good enough as long
          // as 3MO fires strictly before 6MO (which it does by design).
          //
          // TODO(follow-up): if we ever need distinct dedup per checkpoint,
          // introduce a `subtype` column on Notification or a bespoke
          // ProbationReminderLog table.
          const existing = await prisma.notification.findFirst({
            where: { type: "PROBATION_REVIEW_DUE_SOON", entityId: staffId, body: { contains: reviewType } },
            select: { id: true },
          });
          return !!existing;
        },
        notifyDeptHead: async ({ staffId, staffName, reviewType, deptHeadId, checkpointDate }) => {
          const label = reviewType === "THREE_MO" ? "3개월" : "6개월";
          const labelEn = reviewType === "THREE_MO" ? "3-month" : "6-month";
          await notifRepo
            .createForUser(
              deptHeadId,
              "PROBATION_REVIEW_DUE_SOON",
              (lang) => ({
                title:
                  lang === "en" ? `Probation ${labelEn} Review Due Soon` : `수습 ${label} 평가 D-7`,
                body:
                  lang === "en"
                    ? `${staffName ?? "Staff"}'s ${labelEn} probation review is due on ${checkpointDate.toLocaleDateString("en-GB")} — reviewType=${reviewType}`
                    : `${staffName ?? "직원"} ${label} 수습 평가가 ${checkpointDate.toLocaleDateString("ko-KR")}에 예정돼 있어요 — reviewType=${reviewType}`,
              }),
              staffId,
            )
            .catch(console.error);
        },
      });
    } catch (err) {
      console.error("[probationReviewNotifier] cron failed:", err);
    }
  });
}
