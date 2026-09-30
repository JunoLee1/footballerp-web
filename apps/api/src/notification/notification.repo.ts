import { PrismaClient, Prisma, $Enums } from "../generated/client";

type MsgFactory = (locale?: string) => { title: string; body: string };
type UserWhere = Prisma.UserWhereInput;

export class NotificationRepository {
  constructor(private prisma: PrismaClient) {}

  findByUserId(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  markRead(id: number, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  create(data: { userId: string; type: string; title: string; body: string; entityId?: number }) {
    return this.prisma.notification.create({ data: data as any });
  }

  private createForWhere(where: UserWhere, type: string, getMsg: MsgFactory, entityId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({ where, select: { id: true, language: true } });
      if (users.length === 0) return;
      await tx.notification.createMany({
        data: users.map((u) => {
          const { title, body } = getMsg(u.language);
          return { userId: u.id, type, title, body, entityId };
        }) as any
      });
    });
  }

  createForStaff(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: { in: ["ADMIN", "FRONT_OFFICE"] } }, type, getMsg, entityId);
  }

  createForAllStaff(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: { notIn: ["PLAYER", "AGENT"] } }, type, getMsg, entityId);
  }

  createForAdmin(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "ADMIN" }, type, getMsg, entityId);
  }

  // #574: 보안 이벤트 (로그인 브루트포스 등) 수신 담당. FrontOfficeRole = SECURITY_LEAD.
  createForSecurityLead(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "SECURITY_LEAD", isDeleted: false }, type, getMsg, entityId);
  }

  createForGM(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "GM" }, type, getMsg, entityId);
  }

  createForTD(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "TD" }, type, getMsg, entityId);
  }

  createForContractManager(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "CONTRACT_MANAGER" }, type, getMsg, entityId);
  }

  createForHrManager(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER", isDeleted: false }, type, getMsg, entityId);
  }

  createForFinanceManager(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "FINANCE_MANAGER", isDeleted: false }, type, getMsg, entityId);
  }

  /**
   * ASSET_MANAGER FrontOfficeRole 유저 전원에게 알림. #373 신입 자동
   * 프로비저닝의 재고 부족 경보(`PROVISIONING_LOW_STOCK`)에서 사용.
   * asset-request 조달 큐 대시보드 도입 전까지는 인앱 알림이 유일 통로.
   */
  createForAssetManager(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "ASSET_MANAGER", isDeleted: false }, type, getMsg, entityId);
  }

  createForHeadCoach(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF", coachingRole: "HEAD_COACH" }, type, getMsg, entityId);
  }

  createForYouthHeadCoach(fromTeamId: number, type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF", coachingRole: "HEAD_COACH", teamId: fromTeamId }, type, getMsg, entityId);
  }

  createForMedicalDirector(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF", coachingRole: "MEDICAL_DIRECTOR" }, type, getMsg, entityId);
  }

  createForMedicalStaff(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF", coachingRole: "MEDICAL" }, type, getMsg, entityId);
  }

  createForCoachingStaff(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF" }, type, getMsg, entityId);
  }

  createForFinanceStaff(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: { role: "FRONT_OFFICE", frontOfficeRole: { in: ["FINANCE_STAFF", "FINANCE_MANAGER"] }, isDeleted: false },
        select: { id: true, language: true },
      });
      if (users.length === 0) return;
      await tx.notification.createMany({
        data: users.map((u) => {
          const { title, body } = getMsg(u.language);
          return { userId: u.id, type, title, body, entityId };
        }) as any,
      });
    });
  }

  createForPhysicalCoach(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "COACHING_STAFF", coachingRole: "PHYSICAL_COACH" }, type, getMsg, entityId);
  }

  createForScout(type: string, getMsg: MsgFactory, entityId?: number) {
    return this.createForWhere({ role: "FRONT_OFFICE", frontOfficeRole: "SCOUT" }, type, getMsg, entityId);
  }

  /**
   * 특정 부서의 부서장(headId user)에게 알림.
   * 결재함 자동 라우팅용 — PlanReport.reviewerDept 등에서 사용.
   * 부서장이 없으면(headId=null) no-op.
   */
  async createForDepartmentHead(
    deptId: number,
    type: string,
    getMsg: MsgFactory,
    entityId?: number
  ) {
    const dept = await this.prisma.department.findUnique({
      where: { id: deptId },
      select: { headId: true },
    });
    if (!dept?.headId) return;
    return this.createForUser(dept.headId, type, getMsg, entityId);
  }

  async createForUser(userId: string, type: string, getMsg: MsgFactory, entityId?: number | string) {
    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const { title, body } = getMsg(userRecord?.language ?? "ko");
    const entityField: Pick<Prisma.NotificationUncheckedCreateInput, "entityId" | "entityIdStr"> =
      entityId == null
        ? {}
        : typeof entityId === "string"
          ? { entityIdStr: entityId }
          : { entityId };
    const data: Prisma.NotificationUncheckedCreateInput = {
      userId,
      type: type as $Enums.NotificationType,
      title,
      body,
      ...entityField,
    };
    return this.prisma.notification.create({ data });
  }

  createForGuardian(guardianUserId: string, type: string, getMsg: MsgFactory, entityId?: number | string) {
    return this.createForUser(guardianUserId, type, getMsg, entityId);
  }

  async createForUsers(
    userIds: string[],
    type: string,
    getMsg: MsgFactory,
    entityId?: number,
  ) {
    if (userIds.length === 0) return;
    return this.prisma.notification.createMany({
      data: userIds.map((userId) => {
        const { title, body } = getMsg();
        return { userId, type, title, body, ...(entityId !== undefined && { entityId }) } as any;
      }),
    });
  }

  findExpiringContracts(withinDays: number) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);
    return this.prisma.partnerContract.findMany({
      where: { status: "ACTIVE", endDate: { gte: now, lte: threshold } },
      select: {
        id: true, endDate: true, sponsorshipFee: true, discountRate: true,
        partner: { select: { id: true, name: true, type: true } },
      },
      orderBy: { endDate: "asc" },
    });
  }
}
