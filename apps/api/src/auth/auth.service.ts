import { AuthRepository } from "./auth.repo";
import { AppError } from "../lib/appError";
import { hashPassword, comparePassword } from "../lib/hash";
import { encrypt, hashPhone, decrypt } from "../lib/crypto";
import { generateTokens } from "../lib/token";
import { LoginDto, CreateUserDto } from "../lib/dto";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import { writeAuditLog } from "../lib/auditLog";
import { isAdminLike } from "../lib/permissions";

export class AuthService {
  constructor(private repo: AuthRepository) {}

  async login({ email, password }: LoginDto) {
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      throw new AppError(401, "INVALID_CREDENTIALS");
    }
    const user = await this.repo.findByEmail(email);
    if (!user) throw new AppError(401, "INVALID_CREDENTIALS");

    const valid = await comparePassword(password, user.password);
    if (!valid) throw new AppError(401, "INVALID_CREDENTIALS");

    const departmentCategories = await this.repo.getDepartmentCategories(user.id);
    const tokens = generateTokens({ id: user.id, role: user.role, coachingRole: user.coachingRole, frontOfficeRole: user.frontOfficeRole, departmentCategories, teamId: user.teamId, clubId: user.clubId, isDemo: user.isDemo });
    return { ...tokens, userId: user.id, teamId: user.teamId };
  }

  async createUser(dto: CreateUserDto) {
    if (dto.password !== dto.confirmedPassword) throw new AppError(400, "PASSWORD_MISMATCH");

    // 공백·특수문자 완전 제거 후 숫자만 검증 (010-1234-5678 등 다양한 포맷 허용)
    const phoneDigits = dto.phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,11}$/.test(phoneDigits)) throw new AppError(400, "INVALID_PHONE_NUMBER");

    if (await this.repo.isEmailTaken(dto.email)) throw new AppError(409, "EMAIL_TAKEN");
    if (await this.repo.isNicknameTaken(dto.nickname)) throw new AppError(409, "NICKNAME_TAKEN");
    if (await this.repo.isPhoneHashTaken(hashPhone(dto.phoneNumber))) throw new AppError(409, "PHONE_TAKEN");

    const password = await hashPassword(dto.password);
    const phoneNumber = { ...encrypt(dto.phoneNumber), phoneHash: hashPhone(dto.phoneNumber) };

    return this.repo.createUser({
      email: dto.email,
      password,
      username: dto.username,
      nickname: dto.nickname,
      role: dto.role,
      coachingRole: dto.coachingRole ?? null,
      frontOfficeRole: dto.frontOfficeRole ?? null,
      dateOfBirth: new Date(dto.dateOfBirth),
      nationalityId: dto.nationalityId,
      phoneNumber,
      ...(dto.departmentId && { departmentId: dto.departmentId }),
    });
  }

  async createInvite(dto: { email: string; role: Role; coachingRole?: CoachingRole | null; frontOfficeRole?: FrontOfficeRole | null; createdById: string }) {
    if (await this.repo.isEmailTaken(dto.email)) throw new AppError(409, "EMAIL_TAKEN");
    const invite = await this.repo.createInvite(dto);
    void writeAuditLog({
      actorId: dto.createdById,
      action: 'GUARDIAN_INVITE_CREATED',
      targetId: invite.id,
      detail: { email: dto.email, role: dto.role },
    }).catch(console.error);
    const appUrl = process.env["APP_URL"] ?? "http://localhost:5173";
    const inviteUrl = `${appUrl}/invite/${invite.token}`;
    let emailSent = false;
    try {
      const { sendInviteEmail } = await import("../lib/email");
      await sendInviteEmail(dto.email, inviteUrl, dto.role);
      emailSent = true;
    } catch {
      // SMTP 미설정 또는 발송 실패 — 초대 토큰은 유효, inviteUrl로 수동 전달 가능
    }
    return { ...invite, emailSent, ...(!emailSent && { inviteUrl }) };
  }

  async getInvite(token: string) {
    const invite = await this.repo.findInviteByToken(token);
    if (!invite) throw new AppError(404, "INVITE_NOT_FOUND");
    if (invite.usedAt) throw new AppError(410, "INVITE_ALREADY_USED");
    if (invite.expiresAt < new Date()) throw new AppError(410, "INVITE_EXPIRED");
    return invite;
  }

  async acceptInvite(token: string, dto: Omit<CreateUserDto, "email" | "role" | "coachingRole" | "frontOfficeRole">) {
    const invite = await this.getInvite(token);

    if (dto.password !== dto.confirmedPassword) throw new AppError(400, "PASSWORD_MISMATCH");
    const invitePhoneDigits = dto.phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,11}$/.test(invitePhoneDigits)) throw new AppError(400, "INVALID_PHONE_NUMBER");
    if (await this.repo.isNicknameTaken(dto.nickname)) throw new AppError(409, "NICKNAME_TAKEN");
    if (await this.repo.isPhoneHashTaken(hashPhone(dto.phoneNumber))) throw new AppError(409, "PHONE_TAKEN");

    const password = await hashPassword(dto.password);
    const phoneNumber = { ...encrypt(dto.phoneNumber), phoneHash: hashPhone(dto.phoneNumber) };

    const user = await this.repo.createUser({
      email: invite.email,
      password,
      username: dto.username,
      nickname: dto.nickname,
      role: invite.role,
      coachingRole: invite.coachingRole ?? null,
      frontOfficeRole: invite.frontOfficeRole ?? null,
      dateOfBirth: new Date(dto.dateOfBirth),
      nationalityId: dto.nationalityId,
      phoneNumber,
    });
    await this.repo.markInviteUsed(invite.id);
    return user;
  }

  async updateProfile(userId: string, dto: { email?: string; homeAddress?: string | null; phoneNumber?: string }) {
    if (dto.email !== undefined) {
      if (await this.repo.isEmailTakenByOther(dto.email, userId)) throw new AppError(409, "EMAIL_TAKEN");
    }
    let phoneData: { encrypted: string; iv: string; phoneHash: string } | undefined;
    if (dto.phoneNumber !== undefined) {
      const phoneDigits = dto.phoneNumber.replace(/\D/g, '');
      if (!/^\d{10,11}$/.test(phoneDigits)) throw new AppError(400, "INVALID_PHONE_NUMBER");
      const user = await this.repo.findPasswordHash(userId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND");
      if (await this.repo.isPhoneHashTakenByOther(hashPhone(dto.phoneNumber), user.phoneNumberId)) {
        throw new AppError(409, "PHONE_TAKEN");
      }
      phoneData = { ...encrypt(dto.phoneNumber), phoneHash: hashPhone(dto.phoneNumber) };
    }
    return this.repo.updateProfile(userId, { email: dto.email, homeAddress: dto.homeAddress, phoneNumber: phoneData });
  }

  async updatePassword(userId: string, dto: { currentPassword: string; newPassword: string; confirmedPassword: string }) {
    if (dto.newPassword !== dto.confirmedPassword) throw new AppError(400, "PASSWORD_MISMATCH");

    // 복잡도: 8자 이상, 대문자, 소문자, 숫자, 특수문자 각 1개 이상
    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!pwRegex.test(dto.newPassword)) throw new AppError(400, "INVALID_PASSWORD_FORMAT");

    const user = await this.repo.findPasswordHash(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    if (!(await comparePassword(dto.currentPassword, user.password))) {
      throw new AppError(401, "INVALID_CURRENT_PASSWORD");
    }
    if (await comparePassword(dto.newPassword, user.password)) {
      throw new AppError(409, "SAME_AS_CURRENT_PASSWORD");
    }

    // 6개월 이내 사용된 비번 재사용 방지
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const recent = await this.repo.findRecentPasswordHashes(userId, sixMonthsAgo);
    for (const entry of recent) {
      if (await comparePassword(dto.newPassword, entry.passwordHash)) {
        throw new AppError(409, "PASSWORD_RECENTLY_USED");
      }
    }

    // 변경 성공 — 이전 hash 를 history 에 저장 (미래 재사용 방지용)
    await this.repo.savePasswordHistory(userId, user.password);
    return this.repo.updatePassword(userId, await hashPassword(dto.newPassword));
  }

  async blacklistToken(jti: string, expiresAt: Date) {
    await this.repo.blacklistToken(jti, expiresAt);
    // 만료 항목 정리는 fire-and-forget — 실패해도 로그아웃은 성공
    this.repo.deleteExpiredBlacklistEntries().catch((err) =>
      console.error('[auth] blacklist cleanup failed:', err)
    );
  }

  isTokenBlacklisted(jti: string) {
    return this.repo.isTokenBlacklisted(jti);
  }

  listInvites() {
    return this.repo.listInvites();
  }

  async me(id: string) {
    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");
    const phoneRaw = await this.repo.findPhoneNumber(id);
    const phone = phoneRaw ? decrypt(phoneRaw.encrypted, phoneRaw.iv) : null;
    return { ...user, phone };
  }

  async gdprErasure(targetUserId: string, actorId: string) {
    const user = await this.repo.findById(targetUserId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");
    if (user.isDeleted) throw new AppError(409, "USER_ALREADY_ERASED");

    const result = await this.repo.anonymizeUser(targetUserId);

    void writeAuditLog({
      actorId,
      action: "GDPR_ERASURE_REQUESTED",
      targetId: targetUserId,
    }).catch(console.error);

    return result;
  }

  async gdprExport(targetUserId: string, actorId: string, actorRole: string) {
    if (actorId !== targetUserId && !isAdminLike(actorRole)) {
      throw new AppError(403, "FORBIDDEN");
    }

    const data = await this.repo.exportUserData(targetUserId);
    if (!data) throw new AppError(404, "USER_NOT_FOUND");

    return data;
  }
}
