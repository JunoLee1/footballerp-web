import { PrismaClient } from "../generated/client";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import crypto from "crypto";

interface CreateUserData {
  email: string;
  password: string;
  username: string;
  nickname: string;
  role: Role;
  coachingRole?: CoachingRole | null;
  frontOfficeRole?: FrontOfficeRole | null;
  dateOfBirth: Date;
  nationalityId: number;
  phoneNumber: { encrypted: string; iv: string; phoneHash: string };
  departmentId?: number;
}

export class AuthRepository {
  constructor(private prisma: PrismaClient) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true, nickname: true, role: true, coachingRole: true, frontOfficeRole: true, teamId: true, clubId: true, password: true, isDemo: true },
    });
  }

  isEmailTaken(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  isNicknameTaken(nickname: string) {
    return this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
  }

  isPhoneHashTaken(phoneHash: string) {
    return this.prisma.phoneNumber.findUnique({ where: { phoneHash }, select: { id: true } });
  }

  async findPhoneNumber(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: { select: { encrypted: true, iv: true } } },
    });
    return user?.phoneNumber ?? null;
  }

  isEmailTakenByOther(email: string, excludeUserId: number) {
    return this.prisma.user.findFirst({ where: { email, id: { not: excludeUserId } }, select: { id: true } });
  }

  isPhoneHashTakenByOther(phoneHash: string, excludePhoneNumberId: number) {
    return this.prisma.phoneNumber.findFirst({ where: { phoneHash, id: { not: excludePhoneNumberId } }, select: { id: true } });
  }

  findPasswordHash(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { password: true, passwordChangedAt: true, phoneNumberId: true } });
  }

  async updateProfile(userId: number, data: { email?: string; homeAddress?: string | null; phoneNumber?: { encrypted: string; iv: string; phoneHash: string } }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phoneNumberId: true } });
    if (data.phoneNumber) {
      await this.prisma.phoneNumber.update({
        where: { id: user.phoneNumberId },
        data: { encrypted: data.phoneNumber.encrypted, iv: data.phoneNumber.iv, phoneHash: data.phoneNumber.phoneHash },
      });
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.email !== undefined && { email: data.email }),
        ...(data.homeAddress !== undefined && { homeAddress: data.homeAddress }),
      },
      select: { id: true, email: true, username: true, homeAddress: true },
    });
  }

  updatePassword(userId: number, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, passwordChangedAt: new Date() },
      select: { id: true },
    });
  }

  // 이전 비번 hash 를 이력에 기록 (변경 성공 후 호출).
  savePasswordHistory(userId: number, passwordHash: string) {
    return this.prisma.passwordHistory.create({
      data: { userId, passwordHash },
    });
  }

  // 지정 시점 이후 (기본 6개월) 사용된 이력 조회. bcrypt.compare 로 재사용 판정.
  findRecentPasswordHashes(userId: number, since: Date) {
    return this.prisma.passwordHistory.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { passwordHash: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, username: true, nickname: true, role: true,
        coachingRole: true, frontOfficeRole: true, teamId: true, clubId: true,
        language: true, isDeleted: true, homeAddress: true, passwordChangedAt: true,
        team: { select: { id: true, type: true } },
        club: { select: { id: true, name: true } },
        departmentMemberships: {
          select: {
            role: true,
            department: { select: { id: true, name: true } },
            jobTitle: { select: { id: true, label: true } },
          },
        },
      },
    });
  }

  updateLanguage(id: number, language: string) {
    return this.prisma.user.update({
      where: { id },
      data: { language },
      select: { id: true, language: true },
    });
  }

  createLoginHistory(data: { userId?: number; email: string; ip: string; userAgent: string; success: boolean }) {
    const userAgentHash = crypto.createHash('sha256').update(data.userAgent).digest('hex');
    return this.prisma.loginHistory.create({
      data: {
        userId: data.userId ?? null,
        email: data.email,
        ip: data.ip,
        userAgent: userAgentHash,
        success: data.success,
      },
    });
  }

  listLoginHistory(userId: number, limit = 50) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, email: true, ip: true, userAgent: true, success: true, createdAt: true },
    });
  }

  listAllLoginHistory(limit = 100) {
    return this.prisma.loginHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, email: true, ip: true, userAgent: true, success: true, createdAt: true,
        user: { select: { id: true, nickname: true } },
      },
    });
  }

  createInvite(data: { email: string; role: Role; coachingRole?: CoachingRole | null; frontOfficeRole?: FrontOfficeRole | null; createdById: number }) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.userInvite.create({
      data: {
        token,
        email: data.email,
        role: data.role,
        coachingRole: data.coachingRole ?? null,
        frontOfficeRole: data.frontOfficeRole ?? null,
        expiresAt,
        createdById: data.createdById,
      },
    });
  }

  findInviteByToken(token: string) {
    return this.prisma.userInvite.findUnique({ where: { token } });
  }

  markInviteUsed(id: number) {
    return this.prisma.userInvite.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  blacklistToken(jti: string, expiresAt: Date) {
    return this.prisma.refreshTokenBlacklist.create({ data: { jti, expiresAt } });
  }

  isTokenBlacklisted(jti: string) {
    return this.prisma.refreshTokenBlacklist.findUnique({ where: { jti }, select: { jti: true } });
  }

  deleteExpiredBlacklistEntries() {
    return this.prisma.refreshTokenBlacklist.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  async getDepartmentCategories(userId: number): Promise<string[]> {
    const rows = await this.prisma.userDepartment.findMany({
      where: { userId },
      select: { department: { select: { category: true } } },
    });
    const categories = rows.map((r) => r.department.category).filter((c) => c !== null) as string[];
    return [...new Set(categories)];
  }

  listInvites(limit = 50) {
    return this.prisma.userInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, email: true, role: true, coachingRole: true, frontOfficeRole: true,
        expiresAt: true, usedAt: true, createdAt: true,
        createdBy: { select: { id: true, nickname: true } },
      },
    });
  }

  async createUser(data: CreateUserData) {
    return this.prisma.$transaction(async (tx) => {
      const phone = await tx.phoneNumber.create({
        data: { encrypted: data.phoneNumber.encrypted, iv: data.phoneNumber.iv, phoneHash: data.phoneNumber.phoneHash },
      });
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: data.password,
          username: data.username,
          nickname: data.nickname,
          role: data.role,
          coachingRole: data.coachingRole ?? null,
          frontOfficeRole: data.frontOfficeRole ?? null,
          dateOfBirth: data.dateOfBirth,
          nationalityId: data.nationalityId,
          phoneNumberId: phone.id,
        },
        select: { id: true, email: true, username: true, nickname: true, role: true, coachingRole: true, frontOfficeRole: true },
      });
      if (data.departmentId) {
        await tx.userDepartment.create({ data: { userId: user.id, departmentId: data.departmentId } });
      }
      return user;
    });
  }

  anonymizeUser(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: {
        email: `deleted_${id}@deleted.com`,
        username: `deleted_${id}`,
        nickname: `deleted_${id}`,
        password: "",
        isDeleted: true,
      },
      select: { id: true, email: true, isDeleted: true },
    });
  }

  async exportUserData(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        language: true,
        player: {
          select: {
            id: true,
            playerName: true,
            position: true,
            level: true,
            status: true,
            contracts: {
              select: { id: true, startDate: true, endDate: true, status: true },
              orderBy: { startDate: "desc" as const },
            },
            injuries: {
              select: { id: true, bodyPart: true, cause: true, status: true, occurredAt: true },
              orderBy: { occurredAt: "desc" as const },
            },
          },
        },
        loginHistory: {
          select: { ip: true, success: true, createdAt: true },
          orderBy: { createdAt: "desc" as const },
          take: 100,
        },
      },
    });

    if (!user) return null;

    const { player, ...profile } = user;
    return { profile, player: player ?? null };
  }
}
