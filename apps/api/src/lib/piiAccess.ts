import { PrismaClient } from "../generated/client";
import { isAdminLike } from "./permissions";

/**
 * viewerId 가 targetUserId 의 PII(이메일·전화·주소)를 평문으로 열람할 수 있는지 확인.
 *
 * 허용 조건:
 * 1. 본인
 * 2. ADMIN / SUPER_ADMIN / GM
 * 3. target 이 소속된 부서의 부서장(headId)
 * 4. target 과 같은 부서에서 DeptRole.LEADER 인 팀장
 * 5. APPROVED + grantedUntil 이 현재 이후인 PiiAccessRequest 보유
 */
export async function canViewPii(
  prisma: PrismaClient,
  viewerId: string,
  targetUserId: string,
  viewerRole: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true;
  if (isAdminLike(viewerRole)) return true;

  // target 의 소속 부서 목록
  const targetDepts = await prisma.userDepartment.findMany({
    where: { userId: targetUserId },
    select: { departmentId: true },
  });
  const deptIds = targetDepts.map((d) => d.departmentId);

  if (deptIds.length > 0) {
    // 부서장 체크
    const headedDept = await prisma.department.findFirst({
      where: { id: { in: deptIds }, headId: viewerId },
      select: { id: true },
    });
    if (headedDept) return true;

    // 같은 부서 내 LEADER 체크
    const leaderEntry = await prisma.userDepartment.findFirst({
      where: { userId: viewerId, departmentId: { in: deptIds }, role: "LEADER" },
      select: { departmentId: true },
    });
    if (leaderEntry) return true;
  }

  // 승인된 긴급 열람 요청 체크
  const approved = await prisma.piiAccessRequest.findFirst({
    where: {
      requesterId: viewerId,
      targetUserId,
      status: "APPROVED",
      grantedUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  return !!approved;
}
