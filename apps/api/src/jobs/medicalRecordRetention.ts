import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/auditLog";

const RETENTION_YEARS = parseInt(process.env["MEDICAL_RECORD_RETENTION_YEARS"] ?? "7", 10);

export function startMedicalRecordRetentionJob() {
  // Run daily at 2:30 AM
  cron.schedule("30 2 * * *", async () => {
    const prisma = getPrisma();
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - RETENTION_YEARS);

    try {
      const flagged = await (prisma.injury as any).updateMany({
        where: {
          occurredAt: { lt: cutoffDate },
          dataRetentionFlaggedAt: null,
        },
        data: {
          dataRetentionFlaggedAt: new Date(),
          dataRetentionReason: `Exceeded ${RETENTION_YEARS}-year medical record retention period`,
        },
      });

      if (flagged.count > 0) {
        console.log(`[MedicalRecordRetention] Flagged ${flagged.count} injury records past ${RETENTION_YEARS}-year retention`);
        void writeAuditLog({
          actorId: "",
          action: "MEDICAL_RECORDS_RETENTION_FLAGGED",
          detail: { count: flagged.count, cutoffDate: cutoffDate.toISOString(), retentionYears: RETENTION_YEARS },
        }).catch(console.error);
      }
    } catch (err) {
      console.error("[MedicalRecordRetention] Job failed:", err);
    }
  });
}
