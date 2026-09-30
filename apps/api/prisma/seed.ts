import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const tr = (s: number, a: number) => Math.round((s / a) * 1000) / 10;

function encryptPhone(text: string) {
  const key = Buffer.from(process.env["PHONE_ENCRYPTION_KEY"]!, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex") };
}

async function seedDepartments() {
  const findOrCreate = async (name: string, extra: Record<string, unknown> = {}) => {
    const existing = await prisma.department.findFirst({ where: { name, clubId: null } });
    if (existing) {
      const updateData: Record<string, unknown> = {};
      if ('category' in extra) updateData.category = extra.category;
      if ('parentId' in extra) updateData.parentId = extra.parentId;
      if (Object.keys(updateData).length > 0) {
        return prisma.department.update({ where: { id: existing.id }, data: updateData });
      }
      return existing;
    }
    return prisma.department.create({ data: { name, ...extra } });
  };

  // ── 최상위 부서 ────────────────────────────────────────────
  const bizSupport = await findOrCreate('경영지원');
  const opsInfra   = await findOrCreate('운영/인프라');

  // ── 경영지원 하위 ──────────────────────────────────────────
  await findOrCreate('재무관리',  { parentId: bizSupport.id, category: 'FINANCE' });
  await findOrCreate('HR',        { parentId: bizSupport.id, category: 'HR' });
  await findOrCreate('마케팅',    { parentId: bizSupport.id, category: 'MARKETING' });

  // ── 운영/인프라 하위 ───────────────────────────────────────
  await findOrCreate('시설관리',      { parentId: opsInfra.id, category: 'OPERATIONS' });
  await findOrCreate('선수 장비관리', { parentId: opsInfra.id, category: 'OPERATIONS' });
  await findOrCreate('의료기기 관리', { parentId: opsInfra.id, category: 'OPERATIONS' });
  await findOrCreate('IT 자산관리',   { parentId: opsInfra.id, category: 'OPERATIONS' });

  // ── 선수단 및 기술 부문 하위 ──────────────────────────────
  const footballOps = await findOrCreate('선수단 및 기술 부문');
  await findOrCreate('코칭스태프', { parentId: footballOps.id, category: 'PERFORMANCE' });
  await findOrCreate('의무팀',     { parentId: footballOps.id, category: 'PERFORMANCE' });
  await findOrCreate('재활팀',     { parentId: footballOps.id, category: 'PERFORMANCE' });
  await findOrCreate('유소년',     { parentId: footballOps.id, category: 'PERFORMANCE' });
  await findOrCreate('스카우팅팀', { parentId: footballOps.id, category: 'SCOUTING' });

  console.log('Departments seeded: 경영지원(재무관리·HR·마케팅), 운영/인프라(시설·장비·의료기기·IT), 선수단 및 기술 부문(코칭·의무·재활·유소년·스카우팅)');
}

async function seedLeagues() {
  const leagues = [
    { name: 'K리그1 2026', level: 'K_LEAGUE_1' as const, year: 2026, isActive: true,  countryId: 1, confederation: 'AFC' as const },
    { name: 'K리그2 2026', level: 'K_LEAGUE_2' as const, year: 2026, isActive: true,  countryId: 1, confederation: 'AFC' as const },
    { name: 'K3리그 2026', level: 'K3'          as const, year: 2026, isActive: true,  countryId: 1, confederation: 'AFC' as const },
    { name: 'K리그1 2025', level: 'K_LEAGUE_1' as const, year: 2025, isActive: false, countryId: 1, confederation: 'AFC' as const },
    { name: 'K리그2 2025', level: 'K_LEAGUE_2' as const, year: 2025, isActive: false, countryId: 1, confederation: 'AFC' as const },
  ];

  for (const l of leagues) {
    await prisma.league.upsert({
      where: { level_year: { level: l.level, year: l.year } },
      create: l,
      update: {},
    });
  }

  console.log('✅ Leagues seeded: K리그1/2/3 2026 (active), K리그1/2 2025 (inactive)');
}

async function seedDepartmentHeads() {
  const finance = await prisma.department.findFirstOrThrow({ where: { name: '재무관리', clubId: null } });
  const hrDept  = await prisma.department.findFirstOrThrow({ where: { name: 'HR', clubId: null } });

  const financeUser = await prisma.user.findUnique({ where: { email: 'finance@club.com' } });
  const hrUser      = await prisma.user.findUnique({ where: { email: 'hr@club.com' } });

  await prisma.department.update({ where: { id: finance.id }, data: { headId: financeUser?.id ?? null } });
  await prisma.department.update({ where: { id: hrDept.id },  data: { headId: hrUser?.id ?? null } });

  console.log('Department heads assigned: 재무관리→finance, HR→hr');
}

async function seedHrSubDepartments() {
  const hrDept = await prisma.department.findFirstOrThrow({ where: { name: 'HR', clubId: null } });
  const hrUser = await prisma.user.findUnique({ where: { email: 'hr@club.com' } });

  const subNames = ['HRM (인사관리)', 'HRD (인재개발)', '노무·총무'];
  for (const name of subNames) {
    const existing = await prisma.department.findFirst({ where: { name, clubId: null } });
    if (!existing) await prisma.department.create({ data: { name, parentId: hrDept.id } });
  }

  // hr@club.com → HR 부서 MANAGER
  if (hrUser) {
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId: hrUser.id, departmentId: hrDept.id } },
      create: { userId: hrUser.id, departmentId: hrDept.id, role: 'DEPT_HEAD' },
      update: { role: 'DEPT_HEAD' },
    });
  }

  console.log('HR sub-departments seeded: HRM, HRD, 노무·총무');
}

/**
 * Assign leaf-department heads for HRM / HRD / 노무·총무.
 *
 * Runs AFTER seedStaffAccounts so hr.staff@club.com exists. Without leaf-
 * dept heads, the AssetRequest 2-stage approval workflow (LEADER =
 * dept.head, DEPT_HEAD = parent dept.head) cannot be exercised end-to-end
 * — the LEADER stage would have no reviewer.
 *
 * Idempotent: updates existing departments by id, safe to re-run.
 */
async function seedHrLeafDepartmentHeads() {
  const hrStaff = await prisma.user.findUnique({ where: { email: 'hr.staff@club.com' } });
  if (!hrStaff) {
    console.warn('⚠️  hr.staff@club.com not found; skipping leaf dept head assignment');
    return;
  }

  const leafNames = ['HRM (인사관리)', 'HRD (인재개발)', '노무·총무'];
  for (const name of leafNames) {
    const leafDept = await prisma.department.findFirst({ where: { name, clubId: null } });
    if (!leafDept) continue;
    await prisma.department.update({
      where: { id: leafDept.id },
      data: { headId: hrStaff.id },
    });
  }

  console.log('Leaf HR dept heads assigned: HRM/HRD/노무·총무 → hr.staff@club.com');
}

/**
 * Backfill UserDepartment for all staff users so `/auth/me` returns
 * departmentMemberships and dept-based RBAC (canReadFinance/HR 등의
 * deptCategories 파라미터) can be exercised.
 *
 * Called AFTER seedRecruitment so hr@club.com exists too.
 * Idempotent via upsert.
 *
 * Skips: admin, superadmin, gm (전사 관리자), player.
 */
async function seedStaffDepartmentMemberships() {
  type Assignment = { email: string; department: string; role: 'DEPT_HEAD' | 'LEADER' | 'MEMBER' };
  const assignments: Assignment[] = [
    // 경영지원 / HR
    { email: 'hr@club.com',              department: 'HR',           role: 'DEPT_HEAD' },
    { email: 'hr.staff@club.com',        department: 'HRM (인사관리)', role: 'DEPT_HEAD' },
    { email: 'hr.staff@club.com',        department: 'HRD (인재개발)', role: 'DEPT_HEAD' },
    { email: 'hr.staff@club.com',        department: '노무·총무',     role: 'DEPT_HEAD' },

    // 경영지원 / 재무관리
    { email: 'finance@club.com',         department: '재무관리',      role: 'DEPT_HEAD' },
    { email: 'finance.staff@club.com',   department: '재무관리',      role: 'MEMBER'    },

    // 운영/인프라 / 선수 장비관리
    { email: 'asset@club.com',           department: '선수 장비관리', role: 'DEPT_HEAD' },
    { email: 'asset.staff@club.com',     department: '선수 장비관리', role: 'MEMBER'    },

    // 운영/인프라 / 시설관리
    { email: 'facility.manager@club.com', department: '시설관리',     role: 'DEPT_HEAD' },
    { email: 'facility.staff@club.com',   department: '시설관리',     role: 'MEMBER'    },

    // 선수단 및 기술 부문 / 코칭스태프
    { email: 'coach@club.com',           department: '코칭스태프',   role: 'DEPT_HEAD' },
    { email: 'td@club.com',              department: '코칭스태프',   role: 'LEADER'    },
    { email: 'assistant@club.com',       department: '코칭스태프',   role: 'MEMBER'    },
    { email: 'defensive@club.com',       department: '코칭스태프',   role: 'MEMBER'    },
    { email: 'attacking@club.com',       department: '코칭스태프',   role: 'MEMBER'    },
    { email: 'physical@club.com',        department: '코칭스태프',   role: 'MEMBER'    },
    { email: 'setpiece@club.com',        department: '코칭스태프',   role: 'MEMBER'    },
    { email: 'gk@club.com',              department: '코칭스태프',   role: 'MEMBER'    },

    // 선수단 및 기술 부문 / 의무팀
    { email: 'meddir@club.com',          department: '의무팀',        role: 'DEPT_HEAD' },
    { email: 'medical@club.com',         department: '의무팀',        role: 'MEMBER'    },

    // 선수단 및 기술 부문 / 스카우팅팀
    { email: 'fo@club.com',              department: '스카우팅팀',   role: 'MEMBER'    },
  ];

  let attached = 0;
  let skipped = 0;
  for (const a of assignments) {
    const user = await prisma.user.findUnique({ where: { email: a.email } });
    const dept = await prisma.department.findFirst({ where: { name: a.department, clubId: null } });
    if (!user || !dept) {
      console.warn(`⚠️  skipping ${a.email} → ${a.department} (user=${!!user}, dept=${!!dept})`);
      skipped++;
      continue;
    }
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId: user.id, departmentId: dept.id } },
      create: { userId: user.id, departmentId: dept.id, role: a.role },
      update: { role: a.role },
    });
    attached++;
  }

  console.log(`✅ Staff department memberships: ${attached} attached, ${skipped} skipped`);
}

async function seedStaffAccounts() {
  const hashed = await bcrypt.hash('Password1!', 10);
  const korea = await prisma.country.findUniqueOrThrow({ where: { id: 1 } });
  const fcSeoulClub = await prisma.club.findFirstOrThrow({ orderBy: { id: 'asc' } });

  const hrStaffPhone        = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0018') });
  const assetStaffPhone     = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0019') });
  const financeStaffPhone   = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0020') });
  const facilityMgrPhone    = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0021') });
  const facilityStaffPhone  = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0022') });

  await prisma.user.upsert({
    where: { email: 'hr.staff@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'hr.staff@club.com',
      password: hashed,
      username: 'HR직원',
      nickname: 'hr-staff',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'HR_STAFF',
      dateOfBirth: new Date('1992-07-15'),
      nationalityId: korea.id,
      phoneNumberId: hrStaffPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'asset.staff@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'asset.staff@club.com',
      password: hashed,
      username: '자산관리직원',
      nickname: 'asset-staff',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'ASSET_STAFF',
      dateOfBirth: new Date('1993-04-22'),
      nationalityId: korea.id,
      phoneNumberId: assetStaffPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'finance.staff@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'finance.staff@club.com',
      password: hashed,
      username: '재무직원',
      nickname: 'finance-staff',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'FINANCE_STAFF',
      dateOfBirth: new Date('1991-09-30'),
      nationalityId: korea.id,
      phoneNumberId: financeStaffPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'facility.manager@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'facility.manager@club.com',
      password: hashed,
      username: '시설관리팀장',
      nickname: 'facility-manager',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'FACILITY_MANAGER',
      dateOfBirth: new Date('1985-03-10'),
      nationalityId: korea.id,
      phoneNumberId: facilityMgrPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'facility.staff@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'facility.staff@club.com',
      password: hashed,
      username: '시설관리직원',
      nickname: 'facility-staff',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'FACILITY_STAFF',
      dateOfBirth: new Date('1996-11-05'),
      nationalityId: korea.id,
      phoneNumberId: facilityStaffPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  console.log('✅ Staff accounts seeded: hr.staff, asset.staff, finance.staff, facility.manager, facility.staff / Password1!');
}

async function seedReports() {
  const [gm, hr, asset, finance, coach, hrStaff, assetStaff, financeStaff] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'gm@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'asset@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'finance@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'coach@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr.staff@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'asset.staff@club.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'finance.staff@club.com' } }),
  ]);

  await prisma.report.deleteMany();

  const d = (days: number) => new Date(Date.now() - days * 24 * 3600_000);

  const reports = [
    // ── HR (hr.staff → HR_MANAGER 1차 → ASSET_MANAGER 2차 → GM 최종) ──
    { type: 'HR' as const, title: '2026년 8월 인력 채용 계획', content: '8월 신규 채용 포지션 및 일정 계획 보고서입니다.', authorId: hrStaff.id, status: 'DRAFT' as const },
    { type: 'HR' as const, title: '2026년 7월 인력 현황 보고', content: '7월 기준 전체 인력 현황 및 채용 진행 상황 보고서입니다.', authorId: hrStaff.id, status: 'SUBMITTED' as const, submittedAt: d(2) },
    { type: 'HR' as const, title: '상반기 인사 평가 결과', content: '상반기 성과 평가 및 역량 평가 결과 종합 보고서입니다.', authorId: hrStaff.id, status: 'FIRST_APPROVED' as const, submittedAt: d(6), firstReviewerId: hr.id, firstReviewedAt: d(5) },
    { type: 'HR' as const, title: '2026년 하반기 교육 계획', content: '하반기 직원 역량 강화 교육 계획 보고서입니다.', authorId: hrStaff.id, status: 'SECOND_APPROVED' as const, submittedAt: d(9), firstReviewerId: hr.id, firstReviewedAt: d(8), secondReviewerId: asset.id, secondReviewedAt: d(6) },
    { type: 'HR' as const, title: '신규 채용 절차 개선 방안', content: '채용 프로세스 효율화를 위한 개선 방안 및 실행 계획입니다.', authorId: hrStaff.id, status: 'APPROVED' as const, submittedAt: d(14), firstReviewerId: hr.id, firstReviewedAt: d(13), secondReviewerId: asset.id, secondReviewedAt: d(11), reviewerId: gm.id, reviewedAt: d(9) },
    { type: 'HR' as const, title: '외주인력 활용 방안 검토', content: '외주인력 도입 필요성 및 비용 절감 효과 분석 보고서입니다.', authorId: hrStaff.id, status: 'REJECTED' as const, submittedAt: d(5), reviewerId: hr.id, reviewedAt: d(4), rejectionReason: '예산 재검토 후 재제출 바랍니다' },
    // ── ASSET (asset.staff → ASSET_MANAGER 1차 → GM 최종) ──
    { type: 'ASSET' as const, title: '구장 시설물 점검 현황 (8월)', content: '훈련 구장 및 경기장 시설물 정기 점검 결과 보고서입니다.', authorId: assetStaff.id, status: 'DRAFT' as const },
    { type: 'ASSET' as const, title: '장비 교체 및 구매 요청 보고', content: '노후 장비 현황 분석 및 신규 구매 필요 품목 정리 보고서입니다.', authorId: assetStaff.id, status: 'SUBMITTED' as const, submittedAt: d(3) },
    { type: 'ASSET' as const, title: 'IT 장비 현황 및 교체 계획', content: 'IT 인프라 노후화 현황 및 단계별 교체 계획 보고서입니다.', authorId: assetStaff.id, status: 'FIRST_APPROVED' as const, submittedAt: d(6), firstReviewerId: asset.id, firstReviewedAt: d(5) },
    { type: 'ASSET' as const, title: '2026년 자산 관리 연간 계획', content: '시설 유지보수 일정 및 자산 취득·처분 계획 보고서입니다.', authorId: assetStaff.id, status: 'APPROVED' as const, submittedAt: d(11), firstReviewerId: asset.id, firstReviewedAt: d(10), reviewerId: gm.id, reviewedAt: d(8) },
    // ── FINANCIAL (finance.staff → FINANCE_MANAGER 1차 → GM 최종) ──
    { type: 'FINANCIAL' as const, title: '2026년 8월 예산 집행 계획', content: '8월 부서별 예산 배분 및 집행 계획 보고서입니다.', authorId: financeStaff.id, status: 'DRAFT' as const },
    { type: 'FINANCIAL' as const, title: '선수단 급여 비용 분석 보고', content: '선수단 급여 지출 현황 및 리그 대비 벤치마크 분석입니다.', authorId: financeStaff.id, status: 'SUBMITTED' as const, submittedAt: d(1) },
    { type: 'FINANCIAL' as const, title: '7월 예산 집행 현황', content: '월별 예산 집행 내역 및 잔액 현황 보고서입니다.', authorId: financeStaff.id, status: 'FIRST_APPROVED' as const, submittedAt: d(6), firstReviewerId: finance.id, firstReviewedAt: d(5) },
    { type: 'FINANCIAL' as const, title: '스폰서십 수익 결산 보고 (상반기)', content: '파트너사별 스폰서십 계약 이행 및 수익 결산 내역입니다.', authorId: financeStaff.id, status: 'APPROVED' as const, submittedAt: d(15), firstReviewerId: finance.id, firstReviewedAt: d(14), reviewerId: gm.id, reviewedAt: d(12) },
    // ── TRAINING (HEAD_COACH 작성 및 승인) ──
    { type: 'TRAINING' as const, title: '주간 훈련 계획 보고 (8/4~8/10)', content: '이번 주 훈련 목표, 세션 구성, 부상자 현황 포함 보고서입니다.', authorId: coach.id, status: 'DRAFT' as const },
    { type: 'TRAINING' as const, title: '전술 훈련 성과 분석 보고', content: '4-3-3 전술 훈련 적응도 및 개인 수행 지표 분석입니다.', authorId: coach.id, status: 'SUBMITTED' as const, submittedAt: d(2) },
    { type: 'TRAINING' as const, title: '프리시즌 훈련 결산 보고', content: '프리시즌 전 기간 훈련 부하, 체력 지표, 전술 완성도 종합 분석입니다.', authorId: coach.id, status: 'APPROVED' as const, submittedAt: d(20), reviewerId: coach.id, reviewedAt: d(18) },
    // ── PERFORMANCE (GM 작성) ──
    { type: 'PERFORMANCE' as const, title: '선수단 성과 평가 보고 (2분기)', content: '2분기 경기 성과 지표 및 선수 개인 평가 종합 보고서입니다.', authorId: gm.id, status: 'APPROVED' as const, submittedAt: d(30), reviewerId: gm.id, reviewedAt: d(28) },
  ];

  await prisma.report.createMany({ data: reports as any });
  console.log(`✅ Reports seeded: ${reports.length}개 (HR×6, ASSET×4, FINANCIAL×4, TRAINING×3, PERFORMANCE×1)`);
}

async function seedQACases(adminId: string) {
  const d = (days: number) => new Date(Date.now() - days * 24 * 3600_000);
  const f = (days: number) => new Date(Date.now() + days * 24 * 3600_000);

  // ── 0. Agency ────────────────────────────────────────────
  await prisma.agency.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'SEM 스포츠 매니지먼트',
      contactName: '김대리',
      phone: '02-1234-5678',
      email: 'contact@sem-sports.kr',
      commissionRate: 5.0,
    },
  });
  await prisma.agency.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: '프로스포츠 에이전시',
      contactName: '이팀장',
      phone: '031-9876-5432',
      email: 'info@prosports-agency.kr',
      commissionRate: 4.5,
    },
  });

  // ── 1. Contract edge cases ────────────────────────────
  // p2 (이서준) 계약 만료: endDate 2026-06-30 이미 지났으므로 EXPIRED로 업데이트
  await prisma.contract.update({ where: { id: 2 }, data: { status: 'EXPIRED' } });

  // p4 (박지훈, GK) — 만료 임박 계약 (25일 후)
  await prisma.contract.upsert({
    where: { id: 4 },
    update: {},
    create: { id: 4, playerId: 'player-004', startDate: new Date('2024-01-01'), endDate: f(25), salary: 45_000_000, status: 'ACTIVE', managedById: adminId },
  });

  // p6 (최재원) — 해지된 계약
  await prisma.contract.upsert({
    where: { id: 5 },
    update: {},
    create: { id: 5, playerId: 'player-006', startDate: new Date('2023-01-01'), endDate: new Date('2025-12-31'), salary: 60_000_000, status: 'TERMINATED', managedById: adminId },
  });

  // ── 2. Player status edge cases ───────────────────────
  await prisma.player.update({ where: { id: 'player-003' }, data: { status: 'ON_LOAN' } });   // Carlos Silva 임대 중
  await prisma.player.update({ where: { id: 'player-007' }, data: { status: 'RELEASED' } });  // 한동민 방출

  // ── 3. Injury — 현재 부상 중 + 과거 완치 ────────────────
  await prisma.injury.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2, playerId: 'player-001',
      bodyPart: 'ANKLE', cause: 'MATCH',
      status: 'REHABILITATING',
      expectedReturnDate: f(14),
      medicalStaffId: 1,
    },
  });

  await prisma.injury.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3, playerId: 'player-005',
      bodyPart: 'KNEE', cause: 'TRAINING',
      status: 'RETURNED',
      medicalStaffId: 1,
    },
  });

  // ── 4. MaintenanceRequest — 전 단계 커버 ─────────────
  const facilityMgr  = await prisma.user.findUniqueOrThrow({ where: { email: 'facility.manager@club.com' }, select: { id: true } });
  const assetMgr     = await prisma.user.findUniqueOrThrow({ where: { email: 'asset@club.com' },            select: { id: true } });
  const gm           = await prisma.user.findUniqueOrThrow({ where: { email: 'gm@club.com' },              select: { id: true } });

  const mrCases: Parameters<typeof prisma.maintenanceRequest.create>[0]['data'][] = [
    {
      title: '[QA] 주차장 조명 교체 요청',
      description: '주차장 B구역 형광등 3개 교체 필요.',
      priority: 'NORMAL',
      status: 'OPEN',
      createdById: facilityMgr.id,
    },
    {
      title: '[QA] 탈의실 환기 시스템 수리',
      description: '탈의실 환기팬 이상 소음 발생, 점검 필요.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      createdById: facilityMgr.id,
    },
    {
      title: '[QA] 그라운드 잔디 보수 공사',
      description: '중앙 잔디 훼손 구간 보수. 견적 첨부.',
      priority: 'HIGH',
      status: 'PENDING_APPROVAL',
      estimatedCost: 3_500_000,
      createdById: facilityMgr.id,
    },
    {
      title: '[QA] 냉방기 교체 (APPROVED)',
      description: '훈련실 냉방기 노후화로 신규 교체 승인 완료.',
      priority: 'NORMAL',
      status: 'APPROVED',
      estimatedCost: 2_800_000,
      createdById: facilityMgr.id,
      approvedById: assetMgr.id,
      approvedAt: d(5),
      gmApprovedById: gm.id,
      gmApprovedAt: d(4),
    },
    {
      title: '[QA] 헬스장 러닝머신 수리 완료',
      description: '러닝머신 2호기 모터 교체 완료.',
      priority: 'NORMAL',
      status: 'RESOLVED',
      estimatedCost: 1_200_000,
      actualCost: 1_050_000,
      createdById: facilityMgr.id,
      approvedById: assetMgr.id,
      approvedAt: d(15),
      gmApprovedById: gm.id,
      gmApprovedAt: d(14),
      resolvedAt: d(3),
    },
    {
      title: '[QA] 관중석 좌석 교체 — 반려됨',
      description: '일부 파손 좌석 일괄 교체 요청.',
      priority: 'NORMAL',
      status: 'REJECTED',
      estimatedCost: 12_000_000,
      createdById: facilityMgr.id,
      rejectionReason: '예산 초과. 부분 교체로 재신청 바람.',
    },
  ];

  for (const data of mrCases) {
    await prisma.maintenanceRequest.create({ data: data as any });
  }

  // ── 5. EquipmentItem + EquipmentLoan — 전 단계 커버 ──
  const assetStaff = await prisma.user.findUniqueOrThrow({ where: { email: 'asset.staff@club.com' }, select: { id: true } });

  const ball = await prisma.equipmentItem.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: '훈련용 축구공', category: 'BALL_AND_TOOLS', trackedIndividually: false, quantity: 30, lowStockThreshold: 5 },
  });

  const vest = await prisma.equipmentItem.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: '훈련 조끼', category: 'CLOTHING', trackedIndividually: true, quantity: 20 },
  });

  const vestUnit = await prisma.equipmentUnit.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, equipmentItemId: vest.id, status: 'IN_USE', serialNumber: 'VEST-001', purchasedAt: new Date('2025-01-01'), purchaseValue: 50_000 },
  });

  const loanCases: Parameters<typeof prisma.equipmentLoan.create>[0]['data'][] = [
    { equipmentItemId: ball.id, requestedById: assetStaff.id, status: 'REQUESTED' },
    { equipmentItemId: ball.id, requestedById: assetStaff.id, status: 'APPROVED',  approvedById: assetMgr.id },
    { equipmentItemId: ball.id, requestedById: assetStaff.id, status: 'REJECTED',  approvedById: assetMgr.id },
    { equipmentItemId: vest.id, equipmentUnitId: vestUnit.id, requestedById: assetStaff.id, status: 'ISSUED',   approvedById: assetMgr.id, issuedAt: d(10) },
    { equipmentItemId: vest.id, requestedById: assetStaff.id, status: 'RETURNED',  approvedById: assetMgr.id, issuedAt: d(30), returnedAt: d(2) },
  ];

  for (const data of loanCases) {
    await prisma.equipmentLoan.create({ data: data as any });
  }

  // ── 6. SafeguardReport — 전 단계 커버 ────────────────
  const sgCases = [
    { description: '[QA] 훈련 중 부적절한 발언 신고 (접수됨)', status: 'RECEIVED' as const },
    { description: '[QA] 팀원 간 갈등 상황 보고 (검토 중)', status: 'UNDER_REVIEW' as const, contactInfo: '제보자 이메일: anonymous@safe.com' },
    { description: '[QA] 전 시즌 하라스먼트 신고 (처리 완료)', status: 'RESOLVED' as const, resolvedNote: '내부 징계위원회 처리 완료. 재발 방지 교육 실시.' },
  ];

  for (const data of sgCases) {
    await prisma.safeguardReport.create({ data });
  }

  console.log('✅ QA edge cases seeded:');
  console.log('   - Contracts: EXPIRED×1, 만료임박(25일)×1, TERMINATED×1');
  console.log('   - Players: ON_LOAN(Carlos Silva), RELEASED(한동민)');
  console.log('   - Injuries: ONGOING×1, RECOVERED×1 (추가)');
  console.log('   - MaintenanceRequests: OPEN/IN_PROGRESS/PENDING_APPROVAL/APPROVED/RESOLVED/REJECTED');
  console.log('   - EquipmentLoans: REQUESTED/APPROVED/REJECTED/ISSUED/RETURNED');
  console.log('   - SafeguardReports: RECEIVED/UNDER_REVIEW/RESOLVED');
}

async function seedRecruitment() {
  const hashed = await bcrypt.hash('Password1!', 10);

  const korea = await prisma.country.findUniqueOrThrow({ where: { id: 1 } });
  const fcSeoulClub = await prisma.club.findFirstOrThrow({ orderBy: { id: 'asc' } });

  // ── HR Manager user ──────────────────────────────────
  const existingHr = await prisma.user.findUnique({ where: { email: 'hr@club.com' } });
  let hr: { id: number };
  if (!existingHr) {
    const hrPhone = await prisma.phoneNumber.create({ data: encryptPhone('010-0000-0015') });
    hr = await prisma.user.create({
      data: {
        email: 'hr@club.com',
        password: hashed,
        username: 'HR매니저',
        nickname: 'hr',
        role: 'FRONT_OFFICE',
        frontOfficeRole: 'HR_MANAGER',
        dateOfBirth: new Date('1985-03-20'),
        nationalityId: korea.id,
        phoneNumberId: hrPhone.id,
        clubId: fcSeoulClub.id,
      },
    });
  } else {
    hr = existingHr;
    await prisma.user.update({ where: { id: hr.id }, data: { clubId: fcSeoulClub.id } });
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@club.com' }, select: { id: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { email: 'gm@club.com' }, select: { id: true } });
  const hrDept = await prisma.department.findFirst({ where: { name: 'HR' } });

  // ── Cleanup & recreate ───────────────────────────────
  await prisma.onboarding.deleteMany();
  await prisma.referenceCheck.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPosting.deleteMany();

  const now = new Date();

  // ── Job Postings ─────────────────────────────────────
  const posting1 = await prisma.jobPosting.create({
    data: {
      title: '피트니스 코치 채용',
      departmentId: hrDept?.id ?? null,
      headcount: 1,
      description: '1군 선수단 피지컬 트레이닝을 담당할 피트니스 코치를 채용합니다. 관련 자격증 보유자 우대.',
      status: 'OPEN',
      createdById: hr.id,
      approvedById: gm.id,
      approvedAt: new Date('2026-07-01'),
    },
  });

  const posting2 = await prisma.jobPosting.create({
    data: {
      title: '스포츠 데이터 분석가 채용',
      headcount: 1,
      description: '경기 데이터 분석 및 보고서 작성을 담당할 스포츠 데이터 분석가를 모집합니다. Python/SQL 능숙자 우대.',
      status: 'DRAFT',
      createdById: hr.id,
    },
  });

  const posting3 = await prisma.jobPosting.create({
    data: {
      title: '팀 닥터 채용',
      headcount: 1,
      description: '선수단 의료 서비스를 담당할 팀 닥터를 채용합니다. 스포츠의학 전문의 우대.',
      status: 'CLOSED',
      createdById: admin.id,
      approvedById: gm.id,
      approvedAt: new Date('2026-04-01'),
      closedAt: new Date('2026-06-30'),
    },
  });

  // ── Applications: OPEN posting (피트니스 코치) ─────────
  const app1 = await prisma.jobApplication.create({
    data: {
      postingId: posting1.id,
      applicantName: '김지원',
      email: 'jiwon.kim@email.com',
      phone: '010-1111-0001',
      status: 'OFFERED',
      offeredById: gm.id,
      offeredAt: new Date('2026-07-25'),
    },
  });
  await prisma.interview.createMany({
    data: [
      {
        applicationId: app1.id,
        round: 'ROUND_1',
        scheduledAt: new Date('2026-07-10'),
        interviewerIds: [admin.id, gm.id],
        scoreSkill: 85,
        scoreComm: 90,
        scoreCulture: 88,
        comment: '전문성 탁월, 팀 핏 좋음',
        result: 'PASS',
      },
      {
        applicationId: app1.id,
        round: 'ROUND_2',
        scheduledAt: new Date('2026-07-18'),
        interviewerIds: [gm.id],
        scoreSkill: 88,
        scoreComm: 92,
        scoreCulture: 90,
        comment: '최종 합격 추천',
        result: 'PASS',
      },
    ],
  });
  await prisma.referenceCheck.create({
    data: {
      applicationId: app1.id,
      contactName: '전 소속팀 단장',
      relationship: '전 직장 상사',
      result: 'CLEAR',
      notes: '책임감 강하고 성실한 인재로 추천함',
    },
  });

  const app2 = await prisma.jobApplication.create({
    data: {
      postingId: posting1.id,
      applicantName: '이성민',
      email: 'seongmin.lee@email.com',
      phone: '010-1111-0002',
      status: 'REFERENCE_CHECK',
    },
  });
  await prisma.interview.createMany({
    data: [
      {
        applicationId: app2.id,
        round: 'ROUND_1',
        scheduledAt: new Date('2026-07-11'),
        interviewerIds: [admin.id, gm.id],
        scoreSkill: 78,
        scoreComm: 82,
        scoreCulture: 80,
        result: 'PASS',
      },
      {
        applicationId: app2.id,
        round: 'ROUND_2',
        scheduledAt: new Date('2026-07-19'),
        interviewerIds: [gm.id],
        scoreSkill: 80,
        scoreComm: 84,
        scoreCulture: 79,
        result: 'PASS',
      },
    ],
  });

  const app3 = await prisma.jobApplication.create({
    data: {
      postingId: posting1.id,
      applicantName: '박준혁',
      email: 'junhyuk.park@email.com',
      status: 'INTERVIEW_2',
    },
  });
  await prisma.interview.create({
    data: {
      applicationId: app3.id,
      round: 'ROUND_1',
      scheduledAt: new Date('2026-07-12'),
      interviewerIds: [admin.id],
      scoreSkill: 72,
      scoreComm: 75,
      scoreCulture: 70,
      result: 'PASS',
    },
  });

  const app4 = await prisma.jobApplication.create({
    data: {
      postingId: posting1.id,
      applicantName: '최유나',
      email: 'yuna.choi@email.com',
      phone: '010-1111-0004',
      status: 'INTERVIEW_1',
    },
  });
  await prisma.interview.create({
    data: {
      applicationId: app4.id,
      round: 'ROUND_1',
      scheduledAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2일 후
      interviewerIds: [admin.id, gm.id],
      result: 'PENDING',
    },
  });

  await prisma.jobApplication.create({
    data: {
      postingId: posting1.id,
      applicantName: '정민수',
      email: 'minsu.jung@email.com',
      status: 'REJECTED',
      rejectedAt: new Date('2026-07-13'),
    },
  });

  // ── Applications: CLOSED posting (팀 닥터) ────────────
  const app6 = await prisma.jobApplication.create({
    data: {
      postingId: posting3.id,
      applicantName: '한소희',
      email: 'sohee.han@email.com',
      phone: '010-2222-0001',
      status: 'ONBOARDED',
      offeredById: gm.id,
      offeredAt: new Date('2026-06-10'),
    },
  });
  await prisma.interview.createMany({
    data: [
      {
        applicationId: app6.id,
        round: 'ROUND_1',
        scheduledAt: new Date('2026-05-15'),
        interviewerIds: [admin.id, gm.id],
        scoreSkill: 92,
        scoreComm: 88,
        scoreCulture: 91,
        result: 'PASS',
      },
      {
        applicationId: app6.id,
        round: 'ROUND_2',
        scheduledAt: new Date('2026-05-28'),
        interviewerIds: [gm.id],
        scoreSkill: 94,
        scoreComm: 90,
        scoreCulture: 93,
        result: 'PASS',
      },
    ],
  });
  await prisma.referenceCheck.create({
    data: {
      applicationId: app6.id,
      contactName: '전 병원 원장',
      relationship: '전 직장 상사',
      result: 'CLEAR',
      notes: '스포츠 의학 전문가로 강력 추천',
    },
  });
  await prisma.onboarding.create({
    data: {
      applicationId: app6.id,
      otpCode: '123456',
      otpExpiresAt: new Date('2099-12-31'),
      emailVerifiedAt: new Date('2026-06-15'),
      mfaRegisteredAt: new Date('2026-06-15'),
      completedAt: new Date('2026-06-15'),
    },
  });

  await prisma.jobApplication.create({
    data: {
      postingId: posting3.id,
      applicantName: '오태준',
      email: 'taejun.oh@email.com',
      status: 'REJECTED',
      rejectedAt: new Date('2026-05-20'),
    },
  });

  console.log(`✅ Recruitment seeded`);
  console.log(`   - Job Postings: 3 (OPEN×1, DRAFT×1, CLOSED×1)`);
  console.log(`   - Applications: 7 (OFFERED×1, REFERENCE_CHECK×1, INTERVIEW_2×1, INTERVIEW_1×1, REJECTED×2, ONBOARDED×1)`);
  console.log(`   - HR Manager: hr@club.com / Password1!`);
}

const SALARY_TABLE: Record<string, number> = {
  ADMIN: 150_000_000,
  GM: 200_000_000,
  TD: 130_000_000,
  FINANCE_MANAGER: 120_000_000,
  HR_MANAGER: 120_000_000,
  ASSET_MANAGER: 110_000_000,
  FACILITY_MANAGER: 100_000_000,
  SCOUT: 80_000_000,
  FINANCE_STAFF: 65_000_000,
  HR_STAFF: 60_000_000,
  ASSET_STAFF: 60_000_000,
  FACILITY_STAFF: 55_000_000,
  HEAD_COACH: 250_000_000,
  MEDICAL_DIRECTOR: 130_000_000,
  ASSISTANT_COACH: 120_000_000,
  ATTACKING_COACH: 100_000_000,
  DEFENSIVE_COACH: 100_000_000,
  GOALKEEPER_COACH: 95_000_000,
  PHYSICAL_COACH: 90_000_000,
  SET_PIECE_COACH: 90_000_000,
  MEDICAL: 80_000_000,
};

function resolveBaseSalary(
  role: string,
  coachingRole: string | null,
  frontOfficeRole: string | null,
): number {
  if (role === "ADMIN") return SALARY_TABLE["ADMIN"]!;
  if (role === "GM") return SALARY_TABLE["GM"]!;
  if (frontOfficeRole && SALARY_TABLE[frontOfficeRole]) return SALARY_TABLE[frontOfficeRole]!;
  if (coachingRole && SALARY_TABLE[coachingRole]) return SALARY_TABLE[coachingRole]!;
  return 50_000_000; // fallback
}

async function seedStaffSalaries(adminId: string) {
  const staffUsers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GM", "FRONT_OFFICE", "COACHING_STAFF"] } },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      coachingRole: true,
      frontOfficeRole: true,
    },
    orderBy: { id: "asc" },
  });

  const effectiveFrom = new Date("2026-01-01");
  const monthsToSeed = [0, 1, 2, 3, 4, 5]; // Jan~Jun 2026

  for (const user of staffUsers) {
    const baseSalary = resolveBaseSalary(user.role, user.coachingRole, user.frontOfficeRole);

    // 1. StaffRecord upsert (email unique key)
    const roleLabel = user.frontOfficeRole ?? user.coachingRole ?? user.role;
    const staffRecord = user.email
      ? await prisma.staffRecord.upsert({
          where: { email: user.email },
          update: {},
          create: {
            name: user.username ?? user.email,
            role: roleLabel ?? "STAFF",
            email: user.email,
            isActive: true,
            createdById: adminId, // admin id (UUID)
          },
        })
      : null;

    // 2. StaffSalary — userId + effectiveTo null 기준으로 중복 방지
    let staffSalary = await prisma.staffSalary.findFirst({
      where: { userId: user.id, effectiveTo: null },
    });
    if (!staffSalary) {
      staffSalary = await prisma.staffSalary.create({
        data: {
          userId: user.id,
          staffRecordId: staffRecord?.id,
          baseSalary,
          country: "KR",
          effectiveFrom,
        },
      });
    }

    // 3. PayrollRun 6개월치 (Jan~Jun 2026 CONFIRMED, locked)
    for (const m of monthsToSeed) {
      const month = new Date(Date.UTC(2026, m, 1));
      const gross = Math.round(baseSalary / 12);
      const ded = Math.round(gross * 0.15);
      const net = gross - ded;
      await prisma.payrollRun.upsert({
        where: {
          staffSalaryId_month: { staffSalaryId: staffSalary.id, month },
        },
        update: {},
        create: {
          staffSalaryId: staffSalary.id,
          month,
          grossPay: gross,
          totalDeductions: ded,
          netPay: net,
          status: "CONFIRMED",
          isLocked: true,
        },
      });
    }
  }

  console.log(`[seed] Staff salaries seeded for ${staffUsers.length} users`);
}

async function main() {
  console.log("🌱 Seeding...");

  // ── Club ──────────────────────────────────────────────
  const fcSeoulClub = await prisma.club.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "FC Seoul", isActive: true, isLite: false },
  });

  // ── Team ─────────────────────────────────────────────
  const firstTeam = await prisma.team.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: '1군',
      type: 'FIRST_TEAM',
      ageGroup: null,
      isActive: true,
      trackStats: true,
      requiresContract: true,
      clubId: fcSeoulClub.id,
    },
  });
  console.log('Seeded FIRST_TEAM:', firstTeam.id);

  // ── Country ──────────────────────────────────────────
  const korea = await prisma.country.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "대한민국", code: "KR" },
  });
  const brazil = await prisma.country.upsert({
    where: { id: 2 },
    update: {},
    create: { name: "브라질", code: "BR" },
  });

  // ── Additional Countries ──────────────────────────────
  const extraCountries = [
    { id: 3,  name: "일본",          code: "JP" },
    { id: 4,  name: "미국",          code: "US" },
    { id: 5,  name: "영국",          code: "GB" },
    { id: 6,  name: "독일",          code: "DE" },
    { id: 7,  name: "프랑스",        code: "FR" },
    { id: 8,  name: "스페인",        code: "ES" },
    { id: 9,  name: "이탈리아",      code: "IT" },
    { id: 10, name: "포르투갈",      code: "PT" },
    { id: 11, name: "네덜란드",      code: "NL" },
    { id: 12, name: "벨기에",        code: "BE" },
    { id: 13, name: "오스트리아",    code: "AT" },
    { id: 14, name: "호주",          code: "AU" },
    { id: 15, name: "중국",          code: "CN" },
    { id: 16, name: "아르헨티나",    code: "AR" },
    { id: 17, name: "콜롬비아",      code: "CO" },
    { id: 18, name: "나이지리아",    code: "NG" },
    { id: 19, name: "가나",          code: "GH" },
    { id: 20, name: "세네갈",        code: "SN" },
  ];
  for (const c of extraCountries) {
    await prisma.country.upsert({ where: { id: c.id }, update: {}, create: c });
  }

  // ── Club Settings (singleton — plan-report submit uses reviewerDeptMap etc.)
  await prisma.clubSettings.upsert({
    where: { id: 1 },
    create: {},   // all fields have defaults
    update: {},
  });

  // ── Departments ───────────────────────────────────────
  await seedDepartments();

  // ── Users ─────────────────────────────────────────────
  const adminPhone    = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0001") });
  const coachPhone    = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0002") });
  const foPhone       = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0003") });
  const playerPhone   = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0004") });
  const assistPhone   = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0005") });
  const defPhone      = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0006") });
  const atkPhone      = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0007") });
  const physPhone     = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0008") });
  const setPhone      = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0009") });
  const gkPhone       = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0010") });
  const medPhone      = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0011") });
  const meddirPhone   = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0012") });
  const gmPhone         = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0013") });
  const tdPhone         = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0014") });
  const assetPhone      = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0016") });
  const financePhone    = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0017") });
  const superAdminPhone = await prisma.phoneNumber.create({ data: encryptPhone("010-0000-0099") });

  const hashed = await bcrypt.hash("Password1!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "admin@club.com",
      password: hashed,
      username: "관리자",
      nickname: "admin",
      role: "ADMIN",
      dateOfBirth: new Date("1980-01-01"),
      nationalityId: korea.id,
      phoneNumberId: adminPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "superadmin@platform.com" },
    update: {},
    create: {
      email: "superadmin@platform.com",
      password: hashed,
      username: "플랫폼관리자",
      nickname: "superadmin",
      role: "SUPER_ADMIN",
      dateOfBirth: new Date("1980-01-01"),
      nationalityId: korea.id,
      phoneNumberId: superAdminPhone.id,
    },
  });

  const coach = await prisma.user.upsert({
    where: { email: "coach@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "coach@club.com",
      password: hashed,
      username: "수석코치",
      nickname: "headcoach",
      role: "COACHING_STAFF",
      coachingRole: "HEAD_COACH",
      dateOfBirth: new Date("1975-06-15"),
      nationalityId: korea.id,
      phoneNumberId: coachPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "assistant@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "assistant@club.com",
      password: hashed,
      username: "수석코치보",
      nickname: "assistant",
      role: "COACHING_STAFF",
      coachingRole: "ASSISTANT_COACH",
      dateOfBirth: new Date("1978-03-10"),
      nationalityId: korea.id,
      phoneNumberId: assistPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "defensive@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "defensive@club.com",
      password: hashed,
      username: "수비코치",
      nickname: "defcoach",
      role: "COACHING_STAFF",
      coachingRole: "DEFENSIVE_COACH",
      dateOfBirth: new Date("1976-08-22"),
      nationalityId: korea.id,
      phoneNumberId: defPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "attacking@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "attacking@club.com",
      password: hashed,
      username: "공격코치",
      nickname: "atkcoach",
      role: "COACHING_STAFF",
      coachingRole: "ATTACKING_COACH",
      dateOfBirth: new Date("1979-05-14"),
      nationalityId: korea.id,
      phoneNumberId: atkPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "physical@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "physical@club.com",
      password: hashed,
      username: "피지컬코치",
      nickname: "physcoach",
      role: "COACHING_STAFF",
      coachingRole: "PHYSICAL_COACH",
      dateOfBirth: new Date("1982-11-03"),
      nationalityId: korea.id,
      phoneNumberId: physPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "setpiece@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "setpiece@club.com",
      password: hashed,
      username: "세트피스코치",
      nickname: "setcoach",
      role: "COACHING_STAFF",
      coachingRole: "SET_PIECE_COACH",
      dateOfBirth: new Date("1981-02-28"),
      nationalityId: korea.id,
      phoneNumberId: setPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "gk@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "gk@club.com",
      password: hashed,
      username: "골키퍼코치",
      nickname: "gkcoach",
      role: "COACHING_STAFF",
      coachingRole: "GOALKEEPER_COACH",
      dateOfBirth: new Date("1977-09-17"),
      nationalityId: korea.id,
      phoneNumberId: gkPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "medical@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "medical@club.com",
      password: hashed,
      username: "의료진",
      nickname: "medical",
      role: "COACHING_STAFF",
      coachingRole: "MEDICAL",
      dateOfBirth: new Date("1983-06-05"),
      nationalityId: korea.id,
      phoneNumberId: medPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "meddir@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "meddir@club.com",
      password: hashed,
      username: "메디컬팀장",
      nickname: "meddir",
      role: "COACHING_STAFF",
      coachingRole: "MEDICAL_DIRECTOR",
      dateOfBirth: new Date("1974-12-20"),
      nationalityId: korea.id,
      phoneNumberId: meddirPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  const frontOffice = await prisma.user.upsert({
    where: { email: "fo@club.com" },
    update: { frontOfficeRole: "SCOUT", clubId: fcSeoulClub.id },
    create: {
      email: "fo@club.com",
      password: hashed,
      username: "프런트",
      nickname: "frontoffice",
      role: "FRONT_OFFICE",
      frontOfficeRole: "SCOUT",
      dateOfBirth: new Date("1985-03-20"),
      nationalityId: korea.id,
      phoneNumberId: foPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "gm@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "gm@club.com",
      password: hashed,
      username: "단장",
      nickname: "gm",
      role: "GM",
      frontOfficeRole: null,
      dateOfBirth: new Date("1970-01-01"),
      nationalityId: korea.id,
      phoneNumberId: gmPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "td@club.com" },
    update: { frontOfficeRole: "TD", clubId: fcSeoulClub.id },
    create: {
      email: "td@club.com",
      password: hashed,
      username: "기술이사",
      nickname: "td",
      role: "FRONT_OFFICE",
      frontOfficeRole: "TD",
      dateOfBirth: new Date("1972-09-25"),
      nationalityId: korea.id,
      phoneNumberId: tdPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'asset@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'asset@club.com',
      password: hashed,
      username: '자산관리팀장',
      nickname: 'asset',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'ASSET_MANAGER',
      dateOfBirth: new Date('1980-06-10'),
      nationalityId: korea.id,
      phoneNumberId: assetPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'finance@club.com' },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: 'finance@club.com',
      password: hashed,
      username: '재무관리팀장',
      nickname: 'finance',
      role: 'FRONT_OFFICE',
      frontOfficeRole: 'FINANCE_MANAGER',
      dateOfBirth: new Date('1978-11-25'),
      nationalityId: korea.id,
      phoneNumberId: financePhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  const playerUser = await prisma.user.upsert({
    where: { email: "player@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "player@club.com",
      password: hashed,
      username: "선수",
      nickname: "player",
      role: "PLAYER",
      dateOfBirth: new Date("1998-07-01"),
      nationalityId: korea.id,
      phoneNumberId: playerPhone.id,
      clubId: fcSeoulClub.id,
    },
  });

  // ── Season ────────────────────────────────────────────
  const season = await prisma.season.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "2026 시즌",
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-11-30"),
      status: "ACTIVE",
    },
  });

  // ── FinancialReport (편성 워크플로우 baseline for loadtest / dashboard) ──
  await prisma.financialReport.upsert({
    where: { seasonId: season.id },
    update: {},
    create: {
      seasonId: season.id,
      totalRevenue: 10_000_000_000,
      plannedRevenueTicket: 3_000_000_000,
      plannedRevenueSponsorship: 4_000_000_000,
      plannedRevenueBroadcast: 1_500_000_000,
      plannedRevenueMerchandise: 800_000_000,
      plannedRevenueSubsidy: 300_000_000,
      plannedRevenueParentCompany: 300_000_000,
      plannedRevenueAcademyFee: 80_000_000,
      plannedRevenueOther: 20_000_000,
      totalOperatingBudget: 300_000_000,
      contingencyReserve: 20_000_000,
      playerSalaryBudget: 500_000_000,
      carryOverFromPrev: 0,
      planStatus: "FINALIZED",
    },
  });

  // ── Players ───────────────────────────────────────────
  const p1 = await prisma.player.upsert({
    where: { id: "player-001" },
    update: {},
    create: {
      id: "player-001",
      playerName: "김민준",
      preferredFoot: "RIGHT",
      height: 183,
      weight: 76,
      position: "STRIKER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p2 = await prisma.player.upsert({
    where: { id: "player-002" },
    update: {},
    create: {
      id: "player-002",
      playerName: "이서준",
      preferredFoot: "LEFT",
      height: 179,
      weight: 72,
      position: "CENTRAL_ATTACK_MIDFIELDER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p3 = await prisma.player.upsert({
    where: { id: "player-003" },
    update: {},
    create: {
      id: "player-003",
      playerName: "Carlos Silva",
      preferredFoot: "RIGHT",
      height: 176,
      weight: 70,
      position: "WINGER",
      level: "ROOKIE",
      status: "ACTIVE",
      nationalityId: brazil.id,
    },
  });

  const p4 = await prisma.player.upsert({
    where: { id: "player-004" },
    update: {},
    create: {
      id: "player-004",
      playerName: "박지훈",
      preferredFoot: "RIGHT",
      height: 188,
      weight: 82,
      position: "GOALKEEPER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p5 = await prisma.player.upsert({
    where: { id: "player-005" },
    update: {},
    create: {
      id: "player-005",
      playerName: "정현우",
      preferredFoot: "BOTH",
      height: 181,
      weight: 74,
      position: "CENTER_BACK",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p6 = await prisma.player.upsert({
    where: { id: "player-006" },
    update: {},
    create: {
      id: "player-006",
      playerName: "최재원",
      preferredFoot: "RIGHT",
      height: 187,
      weight: 81,
      position: "CENTER_BACK",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p7 = await prisma.player.upsert({
    where: { id: "player-007" },
    update: {},
    create: {
      id: "player-007",
      playerName: "한동민",
      preferredFoot: "LEFT",
      height: 176,
      weight: 70,
      position: "LEFT_FULL_BACK",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p8 = await prisma.player.upsert({
    where: { id: "player-008" },
    update: {},
    create: {
      id: "player-008",
      playerName: "오승환",
      preferredFoot: "RIGHT",
      height: 178,
      weight: 73,
      position: "RIGHT_FULL_BACK",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p9 = await prisma.player.upsert({
    where: { id: "player-009" },
    update: {},
    create: {
      id: "player-009",
      playerName: "김태영",
      preferredFoot: "RIGHT",
      height: 182,
      weight: 78,
      position: "CENTRAL_DEFENSIVE_MIDFIELDER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p10 = await prisma.player.upsert({
    where: { id: "player-010" },
    update: {},
    create: {
      id: "player-010",
      playerName: "류현진",
      preferredFoot: "RIGHT",
      height: 180,
      weight: 75,
      position: "CENTRAL_DEFENSIVE_MIDFIELDER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p11 = await prisma.player.upsert({
    where: { id: "player-011" },
    update: {},
    create: {
      id: "player-011",
      playerName: "박상원",
      preferredFoot: "RIGHT",
      height: 177,
      weight: 71,
      position: "LEFT_ATTACK_MIDFIELDER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p12 = await prisma.player.upsert({
    where: { id: "player-012" },
    update: {},
    create: {
      id: "player-012",
      playerName: "윤대성",
      preferredFoot: "BOTH",
      height: 174,
      weight: 68,
      position: "RIGHT_ATTACK_MIDFIELDER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p13 = await prisma.player.upsert({
    where: { id: "player-013" },
    update: {},
    create: {
      id: "player-013",
      playerName: "이강인",
      preferredFoot: "LEFT",
      height: 173,
      weight: 66,
      position: "WINGER",
      level: "ROOKIE",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p14 = await prisma.player.upsert({
    where: { id: "player-014" },
    update: {},
    create: {
      id: "player-014",
      playerName: "황희찬",
      preferredFoot: "RIGHT",
      height: 177,
      weight: 72,
      position: "SHADOW_STRIKER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  const p15 = await prisma.player.upsert({
    where: { id: "player-015" },
    update: {},
    create: {
      id: "player-015",
      playerName: "조현우",
      preferredFoot: "RIGHT",
      height: 189,
      weight: 83,
      position: "GOALKEEPER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  await prisma.player.upsert({
    where: { id: "player-016" },
    update: {},
    create: {
      id: "player-016",
      playerName: "권창훈",
      preferredFoot: "RIGHT",
      height: 175,
      weight: 70,
      position: "WINGER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  await prisma.player.upsert({
    where: { id: "player-017" },
    update: {},
    create: {
      id: "player-017",
      playerName: "이재성",
      preferredFoot: "RIGHT",
      height: 178,
      weight: 74,
      position: "CENTRAL_ATTACK_MIDFIELDER",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  await prisma.player.upsert({
    where: { id: "player-018" },
    update: {},
    create: {
      id: "player-018",
      playerName: "송민규",
      preferredFoot: "BOTH",
      height: 174,
      weight: 68,
      position: "STRIKER",
      level: "SENIOR",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  await prisma.player.upsert({
    where: { id: "player-019" },
    update: {},
    create: {
      id: "player-019",
      playerName: "Mateus Costa",
      preferredFoot: "LEFT",
      height: 171,
      weight: 65,
      position: "LEFT_DEFENSIVE_MIDFIELDER",
      level: "ROOKIE",
      status: "ACTIVE",
      nationalityId: brazil.id,
    },
  });

  await prisma.player.upsert({
    where: { id: "player-020" },
    update: {},
    create: {
      id: "player-020",
      playerName: "김영권",
      preferredFoot: "RIGHT",
      height: 185,
      weight: 80,
      position: "CENTER_BACK",
      level: "VETERAN",
      status: "ACTIVE",
      nationalityId: korea.id,
    },
  });

  // Backfill encrypted DOB for every 1군 player. Player.dateOfBirth was moved
  // to encrypted columns (dateOfBirthEncrypted/Iv) but the seeded players were
  // left null, so the list endpoint returned null → frontend calcAge → NaN.
  const playerDobs: Array<{ id: string; dob: string }> = [
    { id: "player-001", dob: "1996-03-14" }, // 김민준 SENIOR ST
    { id: "player-002", dob: "1991-09-02" }, // 이서준 VETERAN CAM
    { id: "player-003", dob: "2002-05-20" }, // Carlos ROOKIE WING
    { id: "player-004", dob: "1995-11-08" }, // 박지훈 SENIOR GK
    { id: "player-005", dob: "1996-07-01" }, // 정현우 SENIOR CB
    { id: "player-006", dob: "1990-12-25" }, // 최재원 VETERAN CB
    { id: "player-007", dob: "1994-04-11" }, // 한동민 SENIOR LB
    { id: "player-008", dob: "1996-08-19" }, // 오승환 SENIOR RB
    { id: "player-009", dob: "1990-02-05" }, // 김태영 VETERAN CDM
    { id: "player-010", dob: "1996-06-17" }, // 류현진 SENIOR CDM
    { id: "player-011", dob: "1995-10-30" }, // 박상원 SENIOR LAM
    { id: "player-012", dob: "1997-01-22" }, // 윤대성 SENIOR RAM
    { id: "player-013", dob: "2003-02-19" }, // 이강인 ROOKIE WING
    { id: "player-014", dob: "1992-08-04" }, // 황희찬 VETERAN SS
    { id: "player-015", dob: "1991-03-27" }, // 조현우 VETERAN GK
    { id: "player-016", dob: "1990-11-14" }, // 권창훈 VETERAN WING
    { id: "player-017", dob: "1991-05-21" }, // 이재성 VETERAN CAM
    { id: "player-018", dob: "1996-01-08" }, // 송민규 SENIOR ST
    { id: "player-019", dob: "2003-09-15" }, // Mateus ROOKIE LDM
    { id: "player-020", dob: "1990-06-10" }, // 김영권 VETERAN CB
  ];
  for (const { id, dob } of playerDobs) {
    const enc = encryptPhone(dob);
    await prisma.player.update({
      where: { id },
      data: { dateOfBirthEncrypted: enc.encrypted, dateOfBirthIv: enc.iv },
    });
  }

  // ── Contracts ─────────────────────────────────────────
  // (Contract.id 는 CUID 이므로 upsert(id) 대신 create — playerId + status 로 idempotency 는 seed 재실행 시 accept)
  const contract1 = await prisma.contract.create({
    data: {
      playerId: p1.id,
      startDate: new Date("2025-01-01"),
      endDate: new Date("2027-12-31"),
      salary: 50_000_000,
      status: "ACTIVE",
      managedById: frontOffice.id,
    },
  });

  await prisma.contract.create({
    data: {
      playerId: p2.id,
      startDate: new Date("2024-07-01"),
      endDate: new Date("2026-06-30"),
      salary: 80_000_000,
      status: "ACTIVE",
      managedById: frontOffice.id,
    },
  });

  await prisma.contract.create({
    data: {
      playerId: p3.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2028-12-31"),
      salary: 30_000_000,
      status: "ACTIVE",
      managedById: frontOffice.id,
    },
  });

  // BuyoutClause for contract1
  await prisma.buyoutClause.create({
    data: { contractId: contract1.id, amount: BigInt(5_000_000_000) },
  });

  // Contracts for remaining 15 senior-team players (p5, p7~p20).
  // Salary by position × level; p7 is RELEASED so its contract is TERMINATED.
  const restContracts: Array<{
    id: number; playerId: string; salary: number;
    startYear: number; years: number; status?: "ACTIVE" | "TERMINATED";
  }> = [
    { id: 6,  playerId: "player-005", salary: 50_000_000, startYear: 2025, years: 3 }, // 정현우 CB SENIOR
    { id: 7,  playerId: "player-007", salary: 45_000_000, startYear: 2023, years: 2, status: "TERMINATED" }, // 한동민 RELEASED
    { id: 8,  playerId: "player-008", salary: 50_000_000, startYear: 2025, years: 3 }, // 오승환 RB SENIOR
    { id: 9,  playerId: "player-009", salary: 80_000_000, startYear: 2024, years: 4 }, // 김태영 CDM VETERAN
    { id: 10, playerId: "player-010", salary: 55_000_000, startYear: 2025, years: 3 }, // 류현진 CDM SENIOR
    { id: 11, playerId: "player-011", salary: 55_000_000, startYear: 2025, years: 3 }, // 박상원 LAM SENIOR
    { id: 12, playerId: "player-012", salary: 55_000_000, startYear: 2026, years: 3 }, // 윤대성 RAM SENIOR
    { id: 13, playerId: "player-013", salary: 30_000_000, startYear: 2026, years: 2 }, // 이강인 WING ROOKIE
    { id: 14, playerId: "player-014", salary: 100_000_000, startYear: 2024, years: 4 }, // 황희찬 SS VETERAN
    { id: 15, playerId: "player-015", salary: 65_000_000, startYear: 2024, years: 3 }, // 조현우 GK VETERAN
    { id: 16, playerId: "player-016", salary: 100_000_000, startYear: 2024, years: 3 }, // 권창훈 WING VETERAN
    { id: 17, playerId: "player-017", salary: 80_000_000, startYear: 2025, years: 4 }, // 이재성 CAM VETERAN
    { id: 18, playerId: "player-018", salary: 60_000_000, startYear: 2025, years: 3 }, // 송민규 ST SENIOR
    { id: 19, playerId: "player-019", salary: 28_000_000, startYear: 2026, years: 2 }, // Mateus LDM ROOKIE
    { id: 20, playerId: "player-020", salary: 70_000_000, startYear: 2025, years: 3 }, // 김영권 CB VETERAN
  ];

  for (const c of restContracts) {
    await prisma.contract.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        playerId: c.playerId,
        startDate: new Date(`${c.startYear}-01-01`),
        endDate: new Date(`${c.startYear + c.years - 1}-12-31`),
        salary: c.salary,
        status: c.status ?? "ACTIVE",
        managedById: frontOffice.id,
      },
    });
  }

  // ── Match 데이터 전체 클린 리셋 (idempotent) ─────────────
  await prisma.salesRecord.deleteMany();
  await prisma.seatZone.deleteMany();
  await prisma.fanPurchase.deleteMany();
  await prisma.shotEvent.deleteMany();
  await prisma.incidentReport.deleteMany();
  await prisma.matchLineup.deleteMany();
  await prisma.tacticalLineup.deleteMany();
  await prisma.tacticalAnalysis.deleteMany();
  await prisma.teamMatchStats.deleteMany();
  await prisma.playerMatchStats.deleteMany();
  await prisma.matchSquad.deleteMany();
  await prisma.match.deleteMany();
  await prisma.$executeRaw`ALTER SEQUENCE "Match_id_seq" RESTART WITH 1`;

  // ── Matches ───────────────────────────────────────────
  const match1 = await prisma.match.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      date: new Date("2026-04-05T15:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Busan IPark",
      homeScore: 3,
      awayScore: 1,
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      actualAttendance: 29500, capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  const match2 = await prisma.match.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      date: new Date("2026-04-19T14:00:00"),
      homeTeamName: "Incheon United",
      awayTeamName: "FC Seoul",
      homeScore: 0,
      awayScore: 2,
      competitionType: "LEAGUE",
      venue: "AWAY",
      seasonId: season.id,
    },
  });

  // ── Additional Matches (2026 시즌 일정) ───────────────
  await prisma.match.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      date: new Date("2026-05-03T14:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Suwon Samsung Bluewings",
      homeScore: 1,
      awayScore: 1,
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      actualAttendance: 22000, capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  await prisma.match.upsert({
    where: { id: 4 },
    update: {},
    create: {
      id: 4,
      date: new Date("2026-05-17T16:00:00"),
      homeTeamName: "Jeonbuk Hyundai Motors",
      awayTeamName: "FC Seoul",
      homeScore: 2,
      awayScore: 0,
      competitionType: "LEAGUE",
      venue: "AWAY",
      seasonId: season.id,
    },
  });

  await prisma.match.upsert({
    where: { id: 5 },
    update: {},
    create: {
      id: 5,
      date: new Date("2026-06-07T19:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Daegu FC",
      homeScore: 2,
      awayScore: 1,
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      actualAttendance: 18500, capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  await prisma.match.upsert({
    where: { id: 6 },
    update: {},
    create: {
      id: 6,
      date: new Date("2026-06-21T19:00:00"),
      homeTeamName: "Ulsan HD",
      awayTeamName: "FC Seoul",
      homeScore: 3,
      awayScore: 1,
      competitionType: "LEAGUE",
      venue: "AWAY",
      seasonId: season.id,
    },
  });

  await prisma.match.upsert({
    where: { id: 7 },
    update: {},
    create: {
      id: 7,
      date: new Date("2026-07-05T19:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Pohang Steelers",
      homeScore: 0,
      awayScore: 0,
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      actualAttendance: 17000, capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  await prisma.match.upsert({
    where: { id: 8 },
    update: {},
    create: {
      id: 8,
      date: new Date("2026-07-12T14:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Gangwon FC",
      homeScore: 3,
      awayScore: 0,
      competitionType: "DOMESTIC_CUP",
      venue: "HOME",
      seasonId: season.id,
      actualAttendance: 15000, capacity: 40000, priceRegular: 15000, priceVip: 60000,
    },
  });

  await prisma.match.upsert({
    where: { id: 9 },
    update: {},
    create: {
      id: 9,
      date: new Date("2026-07-26T19:00:00"),
      homeTeamName: "Seongnam FC",
      awayTeamName: "FC Seoul",
      competitionType: "LEAGUE",
      venue: "AWAY",
      seasonId: season.id,
    },
  });

  await prisma.match.upsert({
    where: { id: 10 },
    update: {},
    create: {
      id: 10,
      date: new Date("2026-08-09T19:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Gimcheon Sangmu",
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  await prisma.match.upsert({
    where: { id: 11 },
    update: {},
    create: {
      id: 11,
      date: new Date("2026-08-23T16:00:00"),
      homeTeamName: "Jeju United",
      awayTeamName: "FC Seoul",
      competitionType: "LEAGUE",
      venue: "AWAY",
      seasonId: season.id,
    },
  });

  await prisma.match.upsert({
    where: { id: 12 },
    update: {},
    create: {
      id: 12,
      date: new Date("2026-09-06T19:00:00"),
      homeTeamName: "FC Seoul",
      awayTeamName: "Jeonbuk Hyundai Motors",
      competitionType: "LEAGUE",
      venue: "HOME",
      seasonId: season.id,
      capacity: 40000, priceRegular: 20000, priceVip: 80000,
    },
  });

  // MatchSquad — match1 (스코어 있는 경기는 일괄 처리)
  await prisma.matchSquad.createMany({
    data: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15].map((p) => ({
      matchId: match1.id,
      playerId: p.id,
      isConfirmed: true,
    })),
    skipDuplicates: true,
  });

  // PlayerMatchStats — match1
  await prisma.playerMatchStats.upsert({
    where: { id: 1 },
    update: { passesAttempted: 32, passesCompleted: 26, xA: 0.65, shotsOnTarget: 3 },
    create: {
      matchId: match1.id,
      playerId: p1.id,
      goals: 2,
      assists: 1,
      xG: 2.3,
      xA: 0.65,
      shots: 5,
      shotsOnTarget: 3,
      passesAttempted: 32,
      passesCompleted: 26,
      minutesPlayed: 90,
    },
  });

  await prisma.playerMatchStats.upsert({
    where: { id: 2 },
    update: { passesAttempted: 72, passesCompleted: 64, shotsOnTarget: 1 },
    create: {
      matchId: match1.id,
      playerId: p2.id,
      goals: 1,
      assists: 2,
      keyPasses: 4,
      shotsOnTarget: 1,
      passesAttempted: 72,
      passesCompleted: 64,
      minutesPlayed: 90,
    },
  });

  // match2: Incheon 0-2 FC Seoul (원정승) — p1 2골
  await prisma.playerMatchStats.upsert({
    where: { id: 3 },
    update: { passesAttempted: 29, passesCompleted: 23, shotsOnTarget: 3 },
    create: { matchId: 2, playerId: p1.id, goals: 2, assists: 0, xG: 1.9, shots: 4, shotsOnTarget: 3, passesAttempted: 29, passesCompleted: 23, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 4 },
    update: { passesAttempted: 30, passesCompleted: 25, xA: 0.9 },
    create: { matchId: 2, playerId: p3.id, goals: 0, assists: 2, xG: 0.4, xA: 0.9, shots: 2, shotsOnTarget: 1, passesAttempted: 30, passesCompleted: 25, minutesPlayed: 90 },
  });

  // match3: FC Seoul 1-1 Suwon — p2 1골
  await prisma.playerMatchStats.upsert({
    where: { id: 5 },
    update: { passesAttempted: 68, passesCompleted: 59, shotsOnTarget: 2 },
    create: { matchId: 3, playerId: p2.id, goals: 1, assists: 0, xG: 1.1, shots: 3, shotsOnTarget: 2, passesAttempted: 68, passesCompleted: 59, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 6 },
    update: { passesAttempted: 28, passesCompleted: 22, xA: 0.55 },
    create: { matchId: 3, playerId: p1.id, goals: 0, assists: 1, xG: 0.6, xA: 0.55, shots: 3, shotsOnTarget: 1, passesAttempted: 28, passesCompleted: 22, minutesPlayed: 82 },
  });

  // match4: Jeonbuk 2-0 FC Seoul (원정패) — 무득점
  await prisma.playerMatchStats.upsert({
    where: { id: 7 },
    update: { passesAttempted: 31, passesCompleted: 24 },
    create: { matchId: 4, playerId: p1.id, goals: 0, assists: 0, xG: 0.5, shots: 2, shotsOnTarget: 1, passesAttempted: 31, passesCompleted: 24, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 8 },
    update: { passesAttempted: 49, passesCompleted: 43 },
    create: { matchId: 4, playerId: p5.id, goals: 0, assists: 0, xG: 0.2, shots: 1, shotsOnTarget: 0, passesAttempted: 49, passesCompleted: 43, minutesPlayed: 90 },
  });

  // match5: FC Seoul 2-1 Daegu — p1 1골, p3 1골
  await prisma.playerMatchStats.upsert({
    where: { id: 9 },
    update: { passesAttempted: 30, passesCompleted: 24, shotsOnTarget: 2 },
    create: { matchId: 5, playerId: p1.id, goals: 1, assists: 0, xG: 1.4, shots: 4, shotsOnTarget: 2, passesAttempted: 30, passesCompleted: 24, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 10 },
    update: { passesAttempted: 28, passesCompleted: 23, shotsOnTarget: 2 },
    create: { matchId: 5, playerId: p3.id, goals: 1, assists: 0, xG: 0.9, shots: 3, shotsOnTarget: 2, passesAttempted: 28, passesCompleted: 23, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 11 },
    update: { passesAttempted: 70, passesCompleted: 62 },
    create: { matchId: 5, playerId: p2.id, goals: 0, assists: 2, xG: 0.3, keyPasses: 5, shotsOnTarget: 1, passesAttempted: 70, passesCompleted: 62, minutesPlayed: 90 },
  });

  // match6: Ulsan 3-1 FC Seoul (원정패) — p2 1골
  await prisma.playerMatchStats.upsert({
    where: { id: 12 },
    update: { passesAttempted: 60, passesCompleted: 52, shotsOnTarget: 1 },
    create: { matchId: 6, playerId: p2.id, goals: 1, assists: 0, xG: 0.8, shots: 2, shotsOnTarget: 1, passesAttempted: 60, passesCompleted: 52, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 13 },
    update: { passesAttempted: 27, passesCompleted: 21, xA: 0.5 },
    create: { matchId: 6, playerId: p1.id, goals: 0, assists: 1, xG: 0.7, xA: 0.5, shots: 3, shotsOnTarget: 1, passesAttempted: 27, passesCompleted: 21, minutesPlayed: 90 },
  });

  // match7: FC Seoul 0-0 Pohang — 무득점
  await prisma.playerMatchStats.upsert({
    where: { id: 14 },
    update: { passesAttempted: 33, passesCompleted: 26 },
    create: { matchId: 7, playerId: p1.id, goals: 0, assists: 0, xG: 0.4, shots: 2, shotsOnTarget: 0, passesAttempted: 33, passesCompleted: 26, minutesPlayed: 90 },
  });

  // match8: FC Seoul 3-0 Gangwon FA컵 — p1 2골, p2 1골
  await prisma.playerMatchStats.upsert({
    where: { id: 15 },
    update: { passesAttempted: 35, passesCompleted: 29, shotsOnTarget: 3 },
    create: { matchId: 8, playerId: p1.id, goals: 2, assists: 0, xG: 2.1, shots: 5, shotsOnTarget: 3, passesAttempted: 35, passesCompleted: 29, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 16 },
    update: { passesAttempted: 73, passesCompleted: 65, shotsOnTarget: 2 },
    create: { matchId: 8, playerId: p2.id, goals: 1, assists: 1, xG: 1.0, shots: 3, shotsOnTarget: 2, passesAttempted: 73, passesCompleted: 65, minutesPlayed: 90 },
  });
  await prisma.playerMatchStats.upsert({
    where: { id: 17 },
    update: { passesAttempted: 32, passesCompleted: 27 },
    create: { matchId: 8, playerId: p3.id, goals: 0, assists: 2, xG: 0.5, shots: 2, shotsOnTarget: 1, passesAttempted: 32, passesCompleted: 27, minutesPlayed: 90 },
  });

  // ── PlayerMatchStats (추가 — 스타팅 XI 전원) ─────────────

  // match1 additions: 3-1 홈승
  await prisma.playerMatchStats.upsert({ where: { id: 18 }, update: {}, create: { matchId: match1.id, playerId: p3.id,  shots: 3, xG: 0.7,  keyPasses: 2, shotsOnTarget: 1, passesAttempted: 28, passesCompleted: 23, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 19 }, update: { passesAttempted: 52, passesCompleted: 46 }, create: { matchId: match1.id, playerId: p5.id,  tackles: 4, interceptions: 2, clearances: 5, passesAttempted: 52, passesCompleted: 46, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 20 }, update: { passesAttempted: 55, passesCompleted: 49 }, create: { matchId: match1.id, playerId: p6.id,  tackles: 5, interceptions: 3, clearances: 7, passesAttempted: 55, passesCompleted: 49, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 21 }, update: {}, create: { matchId: match1.id, playerId: p7.id,  tackles: 3, interceptions: 2, clearances: 2, passesAttempted: 51, passesCompleted: 44, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 22 }, update: {}, create: { matchId: match1.id, playerId: p8.id,  tackles: 2, interceptions: 1, clearances: 1, passesAttempted: 46, passesCompleted: 39, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 23 }, update: {}, create: { matchId: match1.id, playerId: p9.id,  tackles: 6, interceptions: 4, passesAttempted: 70, passesCompleted: 62, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 24 }, update: {}, create: { matchId: match1.id, playerId: p10.id, tackles: 4, interceptions: 3, passesAttempted: 58, passesCompleted: 50, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 25 }, update: { passesAttempted: 24, passesCompleted: 20 }, create: { matchId: match1.id, playerId: p13.id, shots: 2, xG: 0.4, keyPasses: 1, shotsOnTarget: 1, passesAttempted: 24, passesCompleted: 20, minutesPlayed: 72 } });
  await prisma.playerMatchStats.upsert({ where: { id: 26 }, update: { passesAttempted: 7, passesCompleted: 5 }, create: { matchId: match1.id, playerId: p14.id, shots: 1, xG: 0.3, shotsOnTarget: 0, passesAttempted: 7, passesCompleted: 5, minutesPlayed: 18 } });
  await prisma.playerMatchStats.upsert({ where: { id: 27 }, update: { passesAttempted: 32, passesCompleted: 29 }, create: { matchId: match1.id, playerId: p15.id, saves: 3, cleanSheet: false, passesAttempted: 32, passesCompleted: 29, minutesPlayed: 90 } });

  // match2 additions: Incheon 0-2 FC Seoul 원정승
  await prisma.playerMatchStats.upsert({ where: { id: 28 }, update: {}, create: { matchId: 2, playerId: p2.id,  shots: 1, xG: 0.3, keyPasses: 3, shotsOnTarget: 1, passesAttempted: 64, passesCompleted: 56, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 29 }, update: { passesAttempted: 48, passesCompleted: 43 }, create: { matchId: 2, playerId: p5.id,  tackles: 5, interceptions: 4, clearances: 6, passesAttempted: 48, passesCompleted: 43, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 30 }, update: { passesAttempted: 51, passesCompleted: 46 }, create: { matchId: 2, playerId: p6.id,  tackles: 6, interceptions: 5, clearances: 8, passesAttempted: 51, passesCompleted: 46, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 31 }, update: {}, create: { matchId: 2, playerId: p7.id,  tackles: 3, interceptions: 2, passesAttempted: 47, passesCompleted: 40, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 32 }, update: {}, create: { matchId: 2, playerId: p8.id,  tackles: 2, interceptions: 2, passesAttempted: 43, passesCompleted: 37, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 33 }, update: {}, create: { matchId: 2, playerId: p9.id,  tackles: 7, interceptions: 5, passesAttempted: 65, passesCompleted: 57, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 34 }, update: {}, create: { matchId: 2, playerId: p10.id, tackles: 5, interceptions: 4, passesAttempted: 54, passesCompleted: 47, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 35 }, update: { passesAttempted: 22, passesCompleted: 18 }, create: { matchId: 2, playerId: p13.id, shots: 1, xG: 0.3, shotsOnTarget: 0, passesAttempted: 22, passesCompleted: 18, minutesPlayed: 85 } });
  await prisma.playerMatchStats.upsert({ where: { id: 36 }, update: { passesAttempted: 28, passesCompleted: 25 }, create: { matchId: 2, playerId: p15.id, saves: 5, cleanSheet: true, passesAttempted: 28, passesCompleted: 25, minutesPlayed: 90 } });

  // match3 additions: FC Seoul 1-1 Suwon 홈무
  await prisma.playerMatchStats.upsert({ where: { id: 37 }, update: { passesAttempted: 26, passesCompleted: 22 }, create: { matchId: 3, playerId: p3.id,  shots: 2, xG: 0.5, keyPasses: 2, shotsOnTarget: 1, passesAttempted: 26, passesCompleted: 22, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 38 }, update: { passesAttempted: 50, passesCompleted: 44 }, create: { matchId: 3, playerId: p5.id,  tackles: 4, interceptions: 3, clearances: 6, passesAttempted: 50, passesCompleted: 44, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 39 }, update: { passesAttempted: 53, passesCompleted: 47 }, create: { matchId: 3, playerId: p6.id,  tackles: 5, interceptions: 4, clearances: 7, passesAttempted: 53, passesCompleted: 47, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 40 }, update: {}, create: { matchId: 3, playerId: p7.id,  tackles: 3, interceptions: 2, passesAttempted: 48, passesCompleted: 41, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 41 }, update: {}, create: { matchId: 3, playerId: p8.id,  tackles: 2, interceptions: 1, passesAttempted: 44, passesCompleted: 38, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 42 }, update: {}, create: { matchId: 3, playerId: p9.id,  tackles: 5, interceptions: 4, passesAttempted: 63, passesCompleted: 55, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 43 }, update: {}, create: { matchId: 3, playerId: p10.id, tackles: 4, interceptions: 3, passesAttempted: 52, passesCompleted: 45, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 44 }, update: { passesAttempted: 8, passesCompleted: 6 }, create: { matchId: 3, playerId: p11.id, shots: 1, xG: 0.2, keyPasses: 1, shotsOnTarget: 0, passesAttempted: 8, passesCompleted: 6, minutesPlayed: 20 } });
  await prisma.playerMatchStats.upsert({ where: { id: 45 }, update: { passesAttempted: 20, passesCompleted: 17 }, create: { matchId: 3, playerId: p13.id, shots: 2, xG: 0.4, shotsOnTarget: 1, passesAttempted: 20, passesCompleted: 17, minutesPlayed: 70 } });
  await prisma.playerMatchStats.upsert({ where: { id: 46 }, update: { passesAttempted: 30, passesCompleted: 27 }, create: { matchId: 3, playerId: p15.id, saves: 3, cleanSheet: false, passesAttempted: 30, passesCompleted: 27, minutesPlayed: 90 } });

  // match4 additions: Jeonbuk 2-0 FC Seoul 원정패
  await prisma.playerMatchStats.upsert({ where: { id: 47 }, update: {}, create: { matchId: 4, playerId: p2.id,  shots: 1, xG: 0.2, keyPasses: 2, shotsOnTarget: 0, passesAttempted: 58, passesCompleted: 48, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 48 }, update: { passesAttempted: 20, passesCompleted: 16 }, create: { matchId: 4, playerId: p3.id,  shots: 1, xG: 0.3, shotsOnTarget: 1, passesAttempted: 20, passesCompleted: 16, minutesPlayed: 75 } });
  await prisma.playerMatchStats.upsert({ where: { id: 49 }, update: { passesAttempted: 46, passesCompleted: 40 }, create: { matchId: 4, playerId: p6.id,  tackles: 5, interceptions: 4, clearances: 8, passesAttempted: 46, passesCompleted: 40, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 50 }, update: {}, create: { matchId: 4, playerId: p7.id,  tackles: 3, interceptions: 2, clearances: 3, passesAttempted: 44, passesCompleted: 37, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 51 }, update: {}, create: { matchId: 4, playerId: p8.id,  tackles: 2, interceptions: 2, clearances: 2, passesAttempted: 40, passesCompleted: 34, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 52 }, update: {}, create: { matchId: 4, playerId: p9.id,  tackles: 6, interceptions: 5, passesAttempted: 61, passesCompleted: 52, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 53 }, update: {}, create: { matchId: 4, playerId: p10.id, tackles: 5, interceptions: 3, passesAttempted: 50, passesCompleted: 43, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 54 }, update: { passesAttempted: 18, passesCompleted: 14 }, create: { matchId: 4, playerId: p13.id, shots: 1, xG: 0.2, shotsOnTarget: 0, passesAttempted: 18, passesCompleted: 14, minutesPlayed: 65 } });
  await prisma.playerMatchStats.upsert({ where: { id: 55 }, update: { passesAttempted: 25, passesCompleted: 22 }, create: { matchId: 4, playerId: p15.id, saves: 6, cleanSheet: false, passesAttempted: 25, passesCompleted: 22, minutesPlayed: 90 } });

  // match5 additions: FC Seoul 2-1 Daegu 홈승
  await prisma.playerMatchStats.upsert({ where: { id: 56 }, update: { passesAttempted: 51, passesCompleted: 45 }, create: { matchId: 5, playerId: p5.id,  tackles: 4, interceptions: 3, clearances: 5, passesAttempted: 51, passesCompleted: 45, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 57 }, update: { passesAttempted: 54, passesCompleted: 48 }, create: { matchId: 5, playerId: p6.id,  tackles: 5, interceptions: 3, clearances: 6, passesAttempted: 54, passesCompleted: 48, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 58 }, update: {}, create: { matchId: 5, playerId: p7.id,  tackles: 3, interceptions: 2, passesAttempted: 50, passesCompleted: 43, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 59 }, update: {}, create: { matchId: 5, playerId: p8.id,  tackles: 2, interceptions: 1, passesAttempted: 45, passesCompleted: 39, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 60 }, update: {}, create: { matchId: 5, playerId: p9.id,  tackles: 5, interceptions: 4, passesAttempted: 66, passesCompleted: 58, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 61 }, update: {}, create: { matchId: 5, playerId: p10.id, tackles: 4, interceptions: 3, passesAttempted: 55, passesCompleted: 48, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 62 }, update: { passesAttempted: 22, passesCompleted: 19 }, create: { matchId: 5, playerId: p13.id, shots: 1, xG: 0.3, shotsOnTarget: 0, passesAttempted: 22, passesCompleted: 19, minutesPlayed: 80 } });
  await prisma.playerMatchStats.upsert({ where: { id: 63 }, update: { passesAttempted: 31, passesCompleted: 28 }, create: { matchId: 5, playerId: p15.id, saves: 3, cleanSheet: false, passesAttempted: 31, passesCompleted: 28, minutesPlayed: 90 } });

  // match6 additions: Ulsan 3-1 FC Seoul 원정패
  await prisma.playerMatchStats.upsert({ where: { id: 64 }, update: { passesAttempted: 19, passesCompleted: 15 }, create: { matchId: 6, playerId: p3.id,  shots: 1, xG: 0.3, shotsOnTarget: 1, passesAttempted: 19, passesCompleted: 15, minutesPlayed: 75 } });
  await prisma.playerMatchStats.upsert({ where: { id: 65 }, update: { passesAttempted: 44, passesCompleted: 38 }, create: { matchId: 6, playerId: p5.id,  tackles: 5, interceptions: 3, clearances: 9, passesAttempted: 44, passesCompleted: 38, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 66 }, update: { passesAttempted: 47, passesCompleted: 41 }, create: { matchId: 6, playerId: p6.id,  tackles: 6, interceptions: 4, clearances: 10, passesAttempted: 47, passesCompleted: 41, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 67 }, update: {}, create: { matchId: 6, playerId: p7.id,  tackles: 4, interceptions: 3, clearances: 3, passesAttempted: 42, passesCompleted: 35, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 68 }, update: {}, create: { matchId: 6, playerId: p8.id,  tackles: 3, interceptions: 2, clearances: 2, passesAttempted: 38, passesCompleted: 32, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 69 }, update: {}, create: { matchId: 6, playerId: p9.id,  tackles: 7, interceptions: 5, passesAttempted: 60, passesCompleted: 51, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 70 }, update: {}, create: { matchId: 6, playerId: p10.id, tackles: 5, interceptions: 4, passesAttempted: 49, passesCompleted: 42, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 71 }, update: { passesAttempted: 17, passesCompleted: 13 }, create: { matchId: 6, playerId: p13.id, shots: 1, xG: 0.2, shotsOnTarget: 0, passesAttempted: 17, passesCompleted: 13, minutesPlayed: 60 } });
  await prisma.playerMatchStats.upsert({ where: { id: 72 }, update: { passesAttempted: 11, passesCompleted: 8 }, create: { matchId: 6, playerId: p14.id, shots: 2, xG: 0.5, shotsOnTarget: 1, passesAttempted: 11, passesCompleted: 8, minutesPlayed: 30 } });
  await prisma.playerMatchStats.upsert({ where: { id: 73 }, update: { passesAttempted: 26, passesCompleted: 23 }, create: { matchId: 6, playerId: p15.id, saves: 7, cleanSheet: false, passesAttempted: 26, passesCompleted: 23, minutesPlayed: 90 } });

  // match7 additions: FC Seoul 0-0 Pohang 홈무
  await prisma.playerMatchStats.upsert({ where: { id: 74 }, update: {}, create: { matchId: 7, playerId: p2.id,  shots: 1, xG: 0.3, keyPasses: 3, shotsOnTarget: 0, passesAttempted: 65, passesCompleted: 58, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 75 }, update: { passesAttempted: 27, passesCompleted: 23 }, create: { matchId: 7, playerId: p3.id,  shots: 2, xG: 0.5, shotsOnTarget: 1, passesAttempted: 27, passesCompleted: 23, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 76 }, update: { passesAttempted: 52, passesCompleted: 47 }, create: { matchId: 7, playerId: p5.id,  tackles: 5, interceptions: 4, clearances: 6, passesAttempted: 52, passesCompleted: 47, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 77 }, update: { passesAttempted: 55, passesCompleted: 50 }, create: { matchId: 7, playerId: p6.id,  tackles: 6, interceptions: 4, clearances: 7, passesAttempted: 55, passesCompleted: 50, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 78 }, update: {}, create: { matchId: 7, playerId: p7.id,  tackles: 4, interceptions: 3, passesAttempted: 50, passesCompleted: 44, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 79 }, update: {}, create: { matchId: 7, playerId: p8.id,  tackles: 3, interceptions: 2, passesAttempted: 46, passesCompleted: 40, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 80 }, update: {}, create: { matchId: 7, playerId: p9.id,  tackles: 6, interceptions: 5, passesAttempted: 68, passesCompleted: 61, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 81 }, update: {}, create: { matchId: 7, playerId: p10.id, tackles: 5, interceptions: 4, passesAttempted: 57, passesCompleted: 51, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 82 }, update: { passesAttempted: 25, passesCompleted: 22 }, create: { matchId: 7, playerId: p13.id, shots: 1, xG: 0.3, shotsOnTarget: 0, passesAttempted: 25, passesCompleted: 22, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 83 }, update: { passesAttempted: 33, passesCompleted: 30 }, create: { matchId: 7, playerId: p15.id, saves: 4, cleanSheet: true, passesAttempted: 33, passesCompleted: 30, minutesPlayed: 90 } });

  // match8 additions: FC Seoul 3-0 Gangwon FA컵 홈승
  await prisma.playerMatchStats.upsert({ where: { id: 84 }, update: { passesAttempted: 55, passesCompleted: 50 }, create: { matchId: 8, playerId: p5.id,  tackles: 3, interceptions: 2, clearances: 4, passesAttempted: 55, passesCompleted: 50, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 85 }, update: { passesAttempted: 58, passesCompleted: 53 }, create: { matchId: 8, playerId: p6.id,  tackles: 4, interceptions: 3, clearances: 5, passesAttempted: 58, passesCompleted: 53, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 86 }, update: {}, create: { matchId: 8, playerId: p7.id,  tackles: 2, interceptions: 1, passesAttempted: 53, passesCompleted: 47, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 87 }, update: {}, create: { matchId: 8, playerId: p8.id,  tackles: 2, interceptions: 1, passesAttempted: 49, passesCompleted: 43, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 88 }, update: {}, create: { matchId: 8, playerId: p9.id,  tackles: 5, interceptions: 3, passesAttempted: 72, passesCompleted: 65, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 89 }, update: {}, create: { matchId: 8, playerId: p10.id, tackles: 4, interceptions: 2, passesAttempted: 60, passesCompleted: 54, minutesPlayed: 90 } });
  await prisma.playerMatchStats.upsert({ where: { id: 90 }, update: { passesAttempted: 26, passesCompleted: 23 }, create: { matchId: 8, playerId: p13.id, shots: 1, xG: 0.4, shotsOnTarget: 0, passesAttempted: 26, passesCompleted: 23, minutesPlayed: 85 } });
  await prisma.playerMatchStats.upsert({ where: { id: 91 }, update: { passesAttempted: 35, passesCompleted: 32 }, create: { matchId: 8, playerId: p15.id, saves: 2, cleanSheet: true, passesAttempted: 35, passesCompleted: 32, minutesPlayed: 90 } });

  // ── TrainingSession ───────────────────────────────────
  const ts1 = await prisma.trainingSession.upsert({
    where: { id: 1 },
    update: {},
    create: {
      date: new Date("2026-04-07T10:00:00"),
      goal: "압박 수비 조직력 강화",
      sessionType: "TACTICAL_DEFENSIVE",
      isApproved: true,
      seasonId: season.id,
      createdById: coach.id,
      approvedById: admin.id,
      contents: {
        create: [
          { phase: "WARMUP", description: "10분 조깅 + 동적 스트레칭" },
          { phase: "TACTICAL", description: "4-4-2 압박 블록 훈련" },
          { phase: "GAME", description: "11v11 압박 적용 실전 게임" },
        ],
      },
    },
  });

  // Participants
  await prisma.trainingParticipant.createMany({
    data: [
      { sessionId: ts1.id, playerId: p1.id },
      { sessionId: ts1.id, playerId: p2.id },
      { sessionId: ts1.id, playerId: p3.id },
      { sessionId: ts1.id, playerId: p4.id },
      { sessionId: ts1.id, playerId: p5.id },
    ],
    skipDuplicates: true,
  });

  // Results
  await prisma.trainingResult.createMany({
    data: [
      { sessionId: ts1.id, playerId: p1.id, attendance: "PRESENT", performanceScore: 8, feedback: "전방 압박 적극적" },
      { sessionId: ts1.id, playerId: p2.id, attendance: "PRESENT", performanceScore: 9, feedback: "패스 연계 탁월" },
      { sessionId: ts1.id, playerId: p3.id, attendance: "LATE_UNAUTHORIZED", performanceScore: 6 },
      { sessionId: ts1.id, playerId: p4.id, attendance: "PRESENT", performanceScore: 8 },
      { sessionId: ts1.id, playerId: p5.id, attendance: "PRESENT", performanceScore: 7, feedback: "수비 라인 조율 필요" },
    ],
    skipDuplicates: true,
  });

  // ── Injury ────────────────────────────────────────────
  await prisma.injury.upsert({
    where: { id: 1 },
    update: {},
    create: {
      playerId: p3.id,
      bodyPart: "THIGH_BACK",
      cause: "TRAINING",
      status: "REHABILITATING",
      expectedReturnDate: new Date("2026-05-15"),
      medicalStaffId: coach.id,
    },
  });

  // MatchSquad — match2~8 (스코어 있는 나머지 경기, 동일 15명)
  for (const matchId of [match2.id, 3, 4, 5, 6, 7, 8]) {
    await prisma.matchSquad.createMany({
      data: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15].map((p) => ({
        matchId,
        playerId: p.id,
        isConfirmed: true,
      })),
      skipDuplicates: true,
    });
  }

  // ── TeamMatchStats ────────────────────────────────────
  // match1: FC Seoul 3-1 Busan (홈승)
  await prisma.teamMatchStats.upsert({
    where: { matchId: match1.id },
    update: {},
    create: {
      matchId: match1.id,
      possession: 62, shots: 14, shotsOnTarget: 6,
      passes: 487, passAccuracy: 87,
      fouls: 9, yellowCards: 2, redCards: 0,
      xG: 2.8, corners: 7, offsides: 2, tackles: 18, interceptions: 11, clearances: 8,
    },
  });
  // match2: Incheon 0-2 FC Seoul (원정승)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 2 },
    update: {},
    create: {
      matchId: 2,
      possession: 58, shots: 12, shotsOnTarget: 5,
      passes: 421, passAccuracy: 83,
      fouls: 11, yellowCards: 1, redCards: 0,
      xG: 2.1, corners: 5, offsides: 3, tackles: 22, interceptions: 14, clearances: 12,
    },
  });
  // match3: FC Seoul 1-1 Suwon (홈무)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 3 },
    update: {},
    create: {
      matchId: 3,
      possession: 54, shots: 10, shotsOnTarget: 4,
      passes: 398, passAccuracy: 81,
      fouls: 12, yellowCards: 3, redCards: 0,
      xG: 1.4, corners: 4, offsides: 1, tackles: 16, interceptions: 9, clearances: 15,
    },
  });
  // match4: Jeonbuk 2-0 FC Seoul (원정패)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 4 },
    update: {},
    create: {
      matchId: 4,
      possession: 41, shots: 7, shotsOnTarget: 2,
      passes: 312, passAccuracy: 76,
      fouls: 14, yellowCards: 2, redCards: 0,
      xG: 0.9, corners: 3, offsides: 2, tackles: 25, interceptions: 17, clearances: 22,
    },
  });
  // match5: FC Seoul 2-1 Daegu (홈승)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 5 },
    update: {},
    create: {
      matchId: 5,
      possession: 59, shots: 13, shotsOnTarget: 5,
      passes: 443, passAccuracy: 85,
      fouls: 10, yellowCards: 1, redCards: 0,
      xG: 2.3, corners: 6, offsides: 1, tackles: 19, interceptions: 12, clearances: 9,
    },
  });
  // match6: Ulsan 3-1 FC Seoul (원정패)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 6 },
    update: {},
    create: {
      matchId: 6,
      possession: 38, shots: 8, shotsOnTarget: 3,
      passes: 287, passAccuracy: 74,
      fouls: 15, yellowCards: 3, redCards: 1,
      xG: 1.1, corners: 3, offsides: 4, tackles: 28, interceptions: 19, clearances: 26,
    },
  });
  // match7: FC Seoul 0-0 Pohang (홈무)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 7 },
    update: {},
    create: {
      matchId: 7,
      possession: 52, shots: 9, shotsOnTarget: 2,
      passes: 411, passAccuracy: 82,
      fouls: 11, yellowCards: 2, redCards: 0,
      xG: 0.7, corners: 5, offsides: 2, tackles: 20, interceptions: 13, clearances: 14,
    },
  });
  // match8: FC Seoul 3-0 Gangwon FA컵 (홈승)
  await prisma.teamMatchStats.upsert({
    where: { matchId: 8 },
    update: {},
    create: {
      matchId: 8,
      possession: 67, shots: 16, shotsOnTarget: 8,
      passes: 521, passAccuracy: 89,
      fouls: 7, yellowCards: 1, redCards: 0,
      xG: 3.2, corners: 9, offsides: 1, tackles: 14, interceptions: 8, clearances: 5,
    },
  });

  // ── TacticalAnalysis ──────────────────────────────────
  await prisma.tacticalAnalysis.upsert({
    where: { id: 1 },
    update: {},
    create: {
      matchId: match1.id,
      seasonId: season.id,
      phase: "PRE_MATCH",
      formation: "4-2-3-1",
      opponentAnalysis: "부산은 측면 공격 위주. 윙백 압박 집중 필요.",
      createdById: coach.id,
      lineup: {
        create: [
          { playerId: p4.id, position: "GOALKEEPER" },
          { playerId: p5.id, position: "CENTER_BACK" },
          { playerId: p2.id, position: "CENTRAL_ATTACK_MIDFIELDER" },
          { playerId: p1.id, position: "STRIKER" },
          { playerId: p3.id, position: "WINGER" },
        ],
      },
    },
  });

  await prisma.tacticalAnalysis.upsert({
    where: { id: 2 },
    update: {},
    create: {
      matchId: match1.id,
      seasonId: season.id,
      phase: "POST_MATCH",
      formation: "4-2-3-1",
      opponentAnalysis: "2선 압박 성공. 측면 전환 속도 개선 필요.",
      createdById: coach.id,
      status: "CONFIRMED",
    },
  });

  await prisma.tacticalAnalysis.upsert({
    where: { id: 3 },
    update: {},
    create: {
      matchId: match2.id,
      seasonId: season.id,
      phase: "PRE_MATCH",
      formation: "4-3-3",
      opponentAnalysis: "인천은 빌드업 회피, 롱볼 의존. 세컨볼 경합 중요.",
      createdById: coach.id,
    },
  });

  // ── Jersey Numbers ───────────────────────────────────
  await prisma.jerseyNumber.createMany({
    data: [
      { number: 9,  teamId: firstTeam.id, playerId: p1.id, status: "OCCUPIED" },
      { number: 10, teamId: firstTeam.id, playerId: p2.id, status: "OCCUPIED" },
      { number: 11, teamId: firstTeam.id, playerId: p3.id, status: "OCCUPIED" },
      { number: 1,  teamId: firstTeam.id, playerId: p4.id, status: "OCCUPIED" },
      { number: 5,  teamId: firstTeam.id, playerId: p5.id, status: "OCCUPIED" },
      { number: 4,  teamId: firstTeam.id, playerId: p6.id, status: "OCCUPIED" },
      { number: 3,  teamId: firstTeam.id, playerId: p7.id, status: "OCCUPIED" },
      { number: 7,  teamId: firstTeam.id, status: "RESERVED" },
    ],
    skipDuplicates: true,
  });

  // ── YOUTH Teams ──────────────────────────────────────
  const u15Team = await prisma.team.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'U-15',
      type: 'YOUTH',
      ageGroup: 'U15',
      isActive: true,
      trackStats: false,
      requiresContract: false,
      clubId: fcSeoulClub.id,
    },
  });

  const u18Team = await prisma.team.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'U-18',
      type: 'YOUTH',
      ageGroup: 'U18',
      isActive: true,
      trackStats: false,
      requiresContract: false,
      clubId: fcSeoulClub.id,
    },
  });

  // ── YOUTH Coaching Staff ──────────────────────────────
  const yc1Phone = await prisma.phoneNumber.create({ data: encryptPhone("010-0001-0001") });
  const yc2Phone = await prisma.phoneNumber.create({ data: encryptPhone("010-0001-0002") });

  const youthCoach1 = await prisma.user.upsert({
    where: { email: "youth.coach1@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "youth.coach1@club.com",
      password: hashed,
      username: "유소년감독",
      nickname: "youthhead",
      role: "COACHING_STAFF",
      coachingRole: "HEAD_COACH",
      dateOfBirth: new Date("1982-04-10"),
      nationalityId: korea.id,
      phoneNumberId: yc1Phone.id,
      clubId: fcSeoulClub.id,
    },
  });

  const youthCoach2 = await prisma.user.upsert({
    where: { email: "youth.coach2@club.com" },
    update: { clubId: fcSeoulClub.id },
    create: {
      email: "youth.coach2@club.com",
      password: hashed,
      username: "유소년코치",
      nickname: "youthcoach",
      role: "COACHING_STAFF",
      coachingRole: "ASSISTANT_COACH",
      dateOfBirth: new Date("1985-08-22"),
      nationalityId: korea.id,
      phoneNumberId: yc2Phone.id,
      clubId: fcSeoulClub.id,
    },
  });

  // ── GUARDIAN Users ────────────────────────────────────
  const guardianPhones = await Promise.all([
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0001") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0002") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0003") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0004") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0005") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0006") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0007") }),
    prisma.phoneNumber.create({ data: encryptPhone("010-0002-0008") }),
  ]);

  const guardianData = [
    { email: "guardian1@club.com", username: "김부모", nickname: "guardian1", dob: "1975-03-15" },
    { email: "guardian2@club.com", username: "이부모", nickname: "guardian2", dob: "1977-07-20" },
    { email: "guardian3@club.com", username: "박부모", nickname: "guardian3", dob: "1976-11-05" },
    { email: "guardian4@club.com", username: "최부모", nickname: "guardian4", dob: "1978-02-28" },
    { email: "guardian5@club.com", username: "정부모", nickname: "guardian5", dob: "1974-09-12" },
    { email: "guardian6@club.com", username: "한부모", nickname: "guardian6", dob: "1979-06-03" },
    { email: "guardian7@club.com", username: "오부모", nickname: "guardian7", dob: "1973-12-18" },
    { email: "guardian8@club.com", username: "윤부모", nickname: "guardian8", dob: "1980-04-25" },
  ];

  const guardians = await Promise.all(
    guardianData.map((g, i) =>
      prisma.user.upsert({
        where: { email: g.email },
        update: { clubId: fcSeoulClub.id },
        create: {
          email: g.email,
          password: hashed,
          username: g.username,
          nickname: g.nickname,
          role: "GUARDIAN",
          dateOfBirth: new Date(g.dob),
          nationalityId: korea.id,
          phoneNumberId: guardianPhones[i]!.id,
          clubId: fcSeoulClub.id,
        },
      }),
    ),
  );

  // ── YOUTH Players (U-15) ──────────────────────────────
  const yp1 = await prisma.player.upsert({
    where: { id: "youth-u15-001" },
    update: {},
    create: {
      id: "youth-u15-001",
      playerName: "김유스",
      preferredFoot: "RIGHT",
      height: 165,
      weight: 55,
      position: "GOALKEEPER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u15Team.id,
      guardianId: guardians[0]!.id,
    },
  });

  const yp2 = await prisma.player.upsert({
    where: { id: "youth-u15-002" },
    update: {},
    create: {
      id: "youth-u15-002",
      playerName: "이소년",
      preferredFoot: "RIGHT",
      height: 168,
      weight: 57,
      position: "CENTER_BACK",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u15Team.id,
      guardianId: guardians[1]!.id,
    },
  });

  const yp3 = await prisma.player.upsert({
    where: { id: "youth-u15-003" },
    update: {},
    create: {
      id: "youth-u15-003",
      playerName: "박청소년",
      preferredFoot: "LEFT",
      height: 162,
      weight: 53,
      position: "CENTER_BACK",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u15Team.id,
      guardianId: guardians[2]!.id,
    },
  });

  const yp4 = await prisma.player.upsert({
    where: { id: "youth-u15-004" },
    update: {},
    create: {
      id: "youth-u15-004",
      playerName: "최미드",
      preferredFoot: "RIGHT",
      height: 164,
      weight: 56,
      position: "CENTRAL_ATTACK_MIDFIELDER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u15Team.id,
      guardianId: guardians[3]!.id,
    },
  });

  const yp5 = await prisma.player.upsert({
    where: { id: "youth-u15-005" },
    update: {},
    create: {
      id: "youth-u15-005",
      playerName: "정공격수",
      preferredFoot: "RIGHT",
      height: 167,
      weight: 58,
      position: "STRIKER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u15Team.id,
      guardianId: guardians[4]!.id,
    },
  });

  // ── YOUTH Players (U-18) ──────────────────────────────
  const yp6 = await prisma.player.upsert({
    where: { id: "youth-u18-001" },
    update: {},
    create: {
      id: "youth-u18-001",
      playerName: "한골키퍼",
      preferredFoot: "RIGHT",
      height: 182,
      weight: 72,
      position: "GOALKEEPER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u18Team.id,
      guardianId: guardians[5]!.id,
    },
  });

  const yp7 = await prisma.player.upsert({
    where: { id: "youth-u18-002" },
    update: {},
    create: {
      id: "youth-u18-002",
      playerName: "오수비수",
      preferredFoot: "RIGHT",
      height: 178,
      weight: 68,
      position: "LEFT_FULL_BACK",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u18Team.id,
      guardianId: guardians[6]!.id,
    },
  });

  const yp8 = await prisma.player.upsert({
    where: { id: "youth-u18-003" },
    update: {},
    create: {
      id: "youth-u18-003",
      playerName: "윤센터백",
      preferredFoot: "RIGHT",
      height: 180,
      weight: 70,
      position: "CENTER_BACK",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u18Team.id,
      guardianId: guardians[7]!.id,
    },
  });

  const yp9 = await prisma.player.upsert({
    where: { id: "youth-u18-004" },
    update: {},
    create: {
      id: "youth-u18-004",
      playerName: "강미드필더",
      preferredFoot: "BOTH",
      height: 174,
      weight: 65,
      position: "CENTRAL_DEFENSIVE_MIDFIELDER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u18Team.id,
      guardianId: guardians[5]!.id,
    },
  });

  const yp10 = await prisma.player.upsert({
    where: { id: "youth-u18-005" },
    update: {},
    create: {
      id: "youth-u18-005",
      playerName: "임스트라이커",
      preferredFoot: "LEFT",
      height: 176,
      weight: 67,
      position: "STRIKER",
      level: "YOUTH",
      status: "ACTIVE",
      nationalityId: korea.id,
      teamId: u18Team.id,
      guardianId: guardians[6]!.id,
    },
  });

  // ── YouthRegistrations ────────────────────────────────
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@club.com" }, select: { id: true } });

  await prisma.youthRegistration.createMany({
    data: [
      {
        playerName: yp1.playerName,
        birthDate: new Date("2011-03-12"),
        preferredJerseyNumber: 1,
        teamId: u15Team.id,
        guardianId: guardians[0]!.id,
        status: "CONTRACTED",
        requestedById: adminUser!.id,
      },
      {
        playerName: yp2.playerName,
        birthDate: new Date("2011-07-22"),
        preferredJerseyNumber: 4,
        teamId: u15Team.id,
        guardianId: guardians[1]!.id,
        status: "CONTRACTED",
        requestedById: adminUser!.id,
      },
      {
        playerName: yp3.playerName,
        birthDate: new Date("2012-01-05"),
        teamId: u15Team.id,
        guardianId: guardians[2]!.id,
        status: "GUARDIAN_APPROVED",
        requestedById: adminUser!.id,
      },
      {
        playerName: yp4.playerName,
        birthDate: new Date("2011-09-18"),
        preferredJerseyNumber: 10,
        teamId: u15Team.id,
        guardianId: guardians[3]!.id,
        status: "PENDING",
        requestedById: adminUser!.id,
      },
      {
        playerName: yp6.playerName,
        birthDate: new Date("2008-04-14"),
        preferredJerseyNumber: 1,
        teamId: u18Team.id,
        guardianId: guardians[5]!.id,
        status: "CONTRACTED",
        requestedById: adminUser!.id,
      },
      {
        playerName: yp8.playerName,
        birthDate: new Date("2009-02-19"),
        teamId: u18Team.id,
        guardianId: guardians[7]!.id,
        status: "PENDING",
        requestedById: adminUser!.id,
      },
    ],
    skipDuplicates: false,
  });

  // Mock distanceCovered + sprint for all players who played (distanceCovered/sprint 미입력 레코드만)
  const playedStats = await prisma.playerMatchStats.findMany({
    where: { minutesPlayed: { gt: 0 }, distanceCovered: null },
    select: { id: true, minutesPlayed: true, saves: true },
  });
  for (const s of playedStats) {
    const mins = s.minutesPlayed ?? 0;
    const ratio = mins / 90;
    const isGK = (s.saves ?? 0) > 0;
    // GK: 5.5~6.5 km / 10~18 스프린트, 필드: 9.5~11.5 km / 35~55 스프린트
    const baseKm     = isGK ? 5.5  : 9.5;
    const rangeKm    = isGK ? 1.0  : 2.0;
    const baseSprint = isGK ? 10   : 35;
    const rangeSprint = isGK ? 8   : 20;
    const distanceCovered = Math.round((baseKm + Math.random() * rangeKm) * ratio * 10) / 10;
    const sprint          = Math.round((baseSprint + Math.random() * rangeSprint) * ratio);
    await prisma.playerMatchStats.update({ where: { id: s.id }, data: { distanceCovered, sprint } });
  }
  if (playedStats.length) console.log(`   - Activity mock: ${playedStats.length}개 레코드 패치 완료`);

  // ── Leagues ───────────────────────────────────────────
  await seedLeagues();

  // ── Department Heads ─────────────────────────────────
  await seedDepartmentHeads();

  // ── HR Sub-Departments & Memberships ─────────────────
  await seedHrSubDepartments();

  // ── Staff Accounts ────────────────────────────────────
  await seedStaffAccounts();

  // ── Leaf HR Dept Heads (needs hr.staff from seedStaffAccounts) ──
  await seedHrLeafDepartmentHeads();

  // ── Recruitment ───────────────────────────────────────
  await seedRecruitment();

  // ── Staff Department Memberships (needs hr@club.com from seedRecruitment) ──
  await seedStaffDepartmentMemberships();

  // ── Reports ───────────────────────────────────────────
  await seedReports();

  // ── QA edge cases ─────────────────────────────────────
  await seedQACases(admin.id);

  // ── 2025 시즌 홈 경기 & 티켓 판매 ─────────────────────
  await seedTicketSales2025(admin.id);

  // ── 2025 유소년 회비 (전년도 실적) ────────────────────
  await seedAcademyFees2025(admin.id);

  // ── Staff Salaries + Payroll (2026 Jan~Jun) ───────────
  await seedStaffSalaries(admin.id);

  // ── 편성 워크플로우 (ExpenseCategory + BudgetPlanRequest + BudgetOverrideLog) ──
  await seedBudgetPlanWorkflow();

  // ── Sponsorship + SponsorshipPayment (2025 실적 + 2026 in-flight) ──
  await seedSponsorships(admin.id);

  // ── 운영비 실적 (2025 CLOSED 시즌 12개월 + 2026 부분) ──
  // BudgetHeader/Line APPROVED 승격 + OperatingExpense (부서/팀 매핑) 실적
  await seedOperatingExpenses(admin.id);

  console.log("✅ Seed complete");
  console.log(`   - Countries: 2`);
  console.log(`   - Users: 21 + 10 유소년 / pw: Password1!`);
  console.log(`     SUPER_ADMIN : superadmin@platform.com`);
  console.log(`     ADMIN       : admin@club.com`);
  console.log(`     GM          : gm@club.com`);
  console.log(`     FRONT_OFFICE: td@club.com (TD)`);
  console.log(`     FRONT_OFFICE: fo@club.com (SCOUT)`);
  console.log(`     FRONT_OFFICE: hr@club.com (HR_MANAGER)`);
  console.log(`     FRONT_OFFICE: hr.staff@club.com (HR_STAFF)`);
  console.log(`     FRONT_OFFICE: asset@club.com (ASSET_MANAGER)`);
  console.log(`     FRONT_OFFICE: asset.staff@club.com (ASSET_STAFF)`);
  console.log(`     FRONT_OFFICE: finance@club.com (FINANCE_MANAGER)`);
  console.log(`     FRONT_OFFICE: finance.staff@club.com (FINANCE_STAFF)`);
  console.log(`     PLAYER      : player@club.com`);
  console.log(`     HEAD_COACH  : coach@club.com`);
  console.log(`     YOUTH COACH : youth.coach1@club.com (감독)`);
  console.log(`     YOUTH COACH : youth.coach2@club.com (코치)`);
  console.log(`     GUARDIAN    : guardian1~8@club.com`);
  console.log(`   - Season: ${season.name}`);
  console.log(`   - Players: 20 (1군) + 10 (유소년: U15×5, U18×5)`);
  console.log(`   - Youth Teams: U-15 (id:${u15Team.id}), U-18 (id:${u18Team.id})`);
  console.log(`   - YouthRegistrations: 6 (CONTRACTED×3, GUARDIAN_APPROVED×1, PENDING×2)`);
}

async function seedAcademyFees2025(adminId: number) {
  // 유소년 선수 + 보호자 조회
  const players = await prisma.player.findMany({
    where: { id: { in: [
      "youth-u15-001", "youth-u15-002", "youth-u15-003", "youth-u15-004", "youth-u15-005",
      "youth-u18-001", "youth-u18-002", "youth-u18-003", "youth-u18-004", "youth-u18-005",
    ] } },
    select: { id: true, playerName: true, guardianId: true, teamId: true },
  });

  const u15Amount = 150_000;
  const u18Amount = 200_000;
  const u15Ids = new Set(["youth-u15-001","youth-u15-002","youth-u15-003","youth-u15-004","youth-u15-005"]);

  // 월별 status 테이블 (player index 0-4: U15, 5-9: U18)
  // PAID(p) / FIRST_APPROVED(f) / SUBMITTED(s) / OVERDUE(o) / LOCKED(l) / PENDING(n)
  const playerOrder = [
    "youth-u15-001","youth-u15-002","youth-u15-003","youth-u15-004","youth-u15-005",
    "youth-u18-001","youth-u18-002","youth-u18-003","youth-u18-004","youth-u18-005",
  ];
  type MonthStatus = "PAID"|"FIRST_APPROVED"|"SUBMITTED"|"OVERDUE"|"LOCKED"|"PENDING";
  // 12개월(1-12) × 10선수
  const statusTable: MonthStatus[][] = [
    // 1    2      3      4      5      6      7      8      9      10     11        12
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","OVERDUE","PENDING"],       // U15-001
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","SUBMITTED","PENDING","PENDING"],  // U15-002
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","OVERDUE","OVERDUE","LOCKED","PENDING"], // U15-003
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","FIRST_APPROVED","PENDING","PENDING"], // U15-004
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PENDING","PENDING"],       // U15-005
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PENDING"],          // U18-001
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","OVERDUE","PENDING"],      // U18-002
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","FIRST_APPROVED","PENDING","PENDING"], // U18-003
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","SUBMITTED","PENDING"],    // U18-004
    ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","PAID","OVERDUE"],         // U18-005
  ];

  let feeCount = 0;
  let ledgerCount = 0;

  for (let pi = 0; pi < playerOrder.length; pi++) {
    const playerId = playerOrder[pi]!;
    const player = players.find(p => p.id === playerId);
    if (!player || !player.guardianId) continue;

    const amount = u15Ids.has(playerId) ? u15Amount : u18Amount;

    for (let month = 1; month <= 12; month++) {
      const status = statusTable[pi]![month - 1]!;
      const dueDate = new Date(2025, month - 1, 25);
      const isPaid = status === "PAID";
      const paidAt = isPaid ? new Date(2025, month - 1, Math.floor(10 + Math.random() * 12)) : undefined;

      const fee = await prisma.academyFee.upsert({
        where: { playerId_year_month: { playerId, year: 2025, month } },
        update: {},
        create: {
          playerId,
          guardianId: player.guardianId,
          amount,
          dueDate,
          year: 2025,
          month,
          status: status as any,
          paidAt: paidAt ?? null,
          paymentMethod: isPaid ? ("BANK_TRANSFER" as any) : null,
          paymentSubmittedAt: (isPaid || status === "SUBMITTED" || status === "FIRST_APPROVED")
            ? new Date(2025, month - 1, Math.floor(5 + Math.random() * 10))
            : null,
          paymentProofUrl: (isPaid || status === "SUBMITTED" || status === "FIRST_APPROVED")
            ? `/uploads/academy-fee-proofs/seed-${playerId}-2025-${month}.jpg`
            : null,
          receiptIssuedAt: isPaid ? paidAt! : null,
        },
      });
      feeCount++;

      // PAID → LedgerEntry 생성 (autoFillRevenue 집계 대상)
      if (isPaid) {
        const existing = await prisma.ledgerEntry.findFirst({
          where: { relatedModule: "AcademyFee", relatedId: fee.id },
          select: { id: true },
        });
        if (!existing) {
          await prisma.ledgerEntry.create({
            data: {
              type: "INCOME",
              category: "ACADEMY_FEE",
              amount,
              currency: "KRW",
              exchangeRate: 1,
              amountKrw: amount,
              isRefund: false,
              description: `[아카데미 회비] ${player.playerName} 2025년 ${month}월`,
              relatedModule: "AcademyFee",
              relatedId: fee.id,
              createdById: adminId,
              createdAt: paidAt,
            } as any,
          });
          ledgerCount++;
        }
      }
    }
  }

  const totalPaid = playerOrder.reduce((sum, pid, pi) => {
    const amt = u15Ids.has(pid) ? u15Amount : u18Amount;
    const paidMonths = statusTable[pi]!.filter(s => s === "PAID").length;
    return sum + amt * paidMonths;
  }, 0);

  console.log(`✅ 2025 유소년 회비 시드: ${feeCount}건, PAID 원장 ${ledgerCount}건, 총 ${(totalPaid / 1e6).toFixed(1)}백만원`);
}

async function seedTicketSales2025(adminId: number) {
  const season2025 = await prisma.season.upsert({
    where: { id: 2 },
    update: {},
    create: { name: "2025 시즌", startDate: new Date("2025-03-01"), endDate: new Date("2025-11-30"), status: "CLOSED" },
  });

  // 2026 홈경기: 종료된 경기 + 예매 완료 예정 경기
  const homeMatches2026 = [
    { matchId: 1,  date: "2026-04-05T15:00:00", priceReg: 20000, priceVip: 80000, att: 29500 },
    { matchId: 3,  date: "2026-05-03T14:00:00", priceReg: 20000, priceVip: 80000, att: 22000 },
    { matchId: 5,  date: "2026-06-07T19:00:00", priceReg: 20000, priceVip: 80000, att: 18500 },
    { matchId: 7,  date: "2026-07-05T19:00:00", priceReg: 20000, priceVip: 80000, att: 17000 },
    { matchId: 8,  date: "2026-07-12T14:00:00", priceReg: 15000, priceVip: 60000, att: 15000 },
    { matchId: 10, date: "2026-08-09T19:00:00", priceReg: 20000, priceVip: 80000, att: 24000 },
    { matchId: 12, date: "2026-09-06T19:00:00", priceReg: 20000, priceVip: 80000, att: 31000 },
  ];

  for (const m of homeMatches2026) {
    const genQty = Math.round(m.att * 0.85);
    const vipQty = m.att - genQty;
    const saleDate = new Date(m.date);

    const genZone = await prisma.seatZone.create({
      data: { name: "일반석", capacity: 34000, unitPrice: m.priceReg, matchId: m.matchId },
    });
    const vipZone = await prisma.seatZone.create({
      data: { name: "VIP석", capacity: 6000, unitPrice: m.priceVip, matchId: m.matchId },
    });
    await prisma.salesRecord.createMany({
      data: [
        { type: "TICKET",     quantity: genQty, unitPrice: m.priceReg, totalAmount: genQty * m.priceReg, currency: "KRW", saleDate, matchId: m.matchId, seatZoneId: genZone.id, status: "COMPLETED", channel: "ONLINE",   createdById: adminId },
        { type: "VIP_TICKET", quantity: vipQty, unitPrice: m.priceVip, totalAmount: vipQty * m.priceVip, currency: "KRW", saleDate, matchId: m.matchId, seatZoneId: vipZone.id, status: "COMPLETED", channel: "PARTNER",  createdById: adminId },
      ] as any[],
    });
  }
  const rev2026 = homeMatches2026.reduce((s, m) => {
    const g = Math.round(m.att * 0.85); const v = m.att - g;
    return s + g * m.priceReg + v * m.priceVip;
  }, 0);
  console.log(`✅ 2026 시즌 홈경기 티켓 시드: ${homeMatches2026.length}경기, ${(rev2026 / 1e8).toFixed(1)}억원`);

  // 2025 홈경기
  const homeMatches2025 = [
    { id: 13, date: "2025-03-15T15:00:00", away: "Jeonbuk Hyundai Motors", hs: 2, as: 1, att: 28000 },
    { id: 14, date: "2025-04-05T15:00:00", away: "Ulsan HD",                hs: 1, as: 0, att: 22500 },
    { id: 15, date: "2025-05-03T14:00:00", away: "Daegu FC",                hs: 3, as: 0, att: 19500 },
    { id: 16, date: "2025-06-07T19:00:00", away: "Busan IPark",             hs: 2, as: 2, att: 25000 },
    { id: 17, date: "2025-07-12T19:00:00", away: "Incheon United",          hs: 1, as: 1, att: 18000 },
    { id: 18, date: "2025-08-16T19:00:00", away: "Suwon Samsung Bluewings", hs: 2, as: 0, att: 30000 },
    { id: 19, date: "2025-09-20T16:00:00", away: "Jeju United",             hs: 3, as: 1, att: 21000 },
    { id: 20, date: "2025-10-25T16:00:00", away: "Seongnam FC",             hs: 1, as: 0, att: 16000 },
  ];

  for (const m of homeMatches2025) {
    const matchData = {
      date: new Date(m.date),
      homeTeamName: "FC Seoul",
      awayTeamName: m.away,
      homeScore: m.hs,
      awayScore: m.as,
      competitionType: "LEAGUE" as const,
      venue: "HOME" as const,
      seasonId: season2025.id,
      actualAttendance: m.att,
      capacity: 40000,
      priceRegular: 20000,
      priceVip: 80000,
    };
    const match = await prisma.match.upsert({
      where: { id: m.id },
      update: matchData,
      create: { id: m.id, ...matchData },
    });

    const genZone = await prisma.seatZone.create({
      data: { name: "일반석", capacity: 34000, unitPrice: 20000, matchId: match.id },
    });
    const vipZone = await prisma.seatZone.create({
      data: { name: "VIP석",  capacity: 6000,  unitPrice: 80000, matchId: match.id },
    });

    const genQty = Math.round(m.att * 0.85);
    const vipQty = m.att - genQty;
    const saleDate = new Date(m.date);

    await prisma.salesRecord.createMany({
      data: [
        { type: "TICKET",     quantity: genQty, unitPrice: 20000, totalAmount: genQty * 20000, currency: "KRW", saleDate, matchId: match.id, seatZoneId: genZone.id, status: "COMPLETED", channel: "ONLINE",  createdById: adminId },
        { type: "VIP_TICKET", quantity: vipQty, unitPrice: 80000, totalAmount: vipQty * 80000, currency: "KRW", saleDate, matchId: match.id, seatZoneId: vipZone.id, status: "COMPLETED", channel: "PARTNER", createdById: adminId },
      ] as any[],
    });
  }

  const totalRev2025 = homeMatches2025.reduce((s, m) => {
    const g = Math.round(m.att * 0.85); const v = m.att - g;
    return s + g * 20000 + v * 80000;
  }, 0);
  console.log(`✅ 2025 시즌 홈경기 티켓 시드: ${homeMatches2025.length}경기, ${(totalRev2025 / 1e8).toFixed(1)}억원`);
}

// 편성 워크플로우 seed (ExpenseCategory + BudgetPlanRequest + BudgetOverrideLog) — #433
// 기존 12개 카테고리(MEDICAL, HOME_MATCH_SUPPORT 등)는 재활용, 편성 spec 트리거(ADR 0019)
// 매핑용 4개만 신규 추가 (PUBLIC_UTILITY_KRW, MULTI_LOCATION_MGMT, DIRECT_BUSINESS_EXP, WEEKEND_OVERTIME_PAY).
async function seedBudgetPlanWorkflow() {
  const financialReport = await prisma.financialReport.findFirstOrThrow({
    orderBy: { id: "asc" },
  });

  const newCategorySeeds = [
    { code: "PUBLIC_UTILITY_KRW",   label: "공공요금",       sortOrder: 30, scope: "DEPARTMENT" as const },
    { code: "MULTI_LOCATION_MGMT",  label: "다중거점 관리",  sortOrder: 31, scope: "DEPARTMENT" as const },
    { code: "DIRECT_BUSINESS_EXP",  label: "사업 직접비",    sortOrder: 32, scope: "DEPARTMENT" as const },
    { code: "WEEKEND_OVERTIME_PAY", label: "주말 야근 수당", sortOrder: 33, scope: "DEPARTMENT" as const },
  ];
  for (const c of newCategorySeeds) {
    await prisma.expenseCategory.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  const codes = [
    "MEDICAL", "HOME_MATCH_SUPPORT", "AWAY_TRAVEL_TEAM", "TEAM_TRAINING_GEAR",
    "SPORTS_EQUIPMENT",
    "PUBLIC_UTILITY_KRW", "MULTI_LOCATION_MGMT", "DIRECT_BUSINESS_EXP", "WEEKEND_OVERTIME_PAY",
  ];
  const cats = await prisma.expenseCategory.findMany({ where: { code: { in: codes } } });
  const catId = (code: string) => {
    const c = cats.find((x) => x.code === code);
    if (!c) throw new Error(`[seed] ExpenseCategory not found: ${code}`);
    return c.id;
  };

  const financeUser = await prisma.user.findUniqueOrThrow({ where: { email: "finance@club.com" } });
  const youthCoach  = await prisma.user.findUniqueOrThrow({ where: { email: "youth.coach1@club.com" } });
  const headCoach   = await prisma.user.findUniqueOrThrow({ where: { email: "coach@club.com" } });
  const gm          = await prisma.user.findUniqueOrThrow({ where: { email: "gm@club.com" } });

  const firstTeam   = await prisma.team.findFirstOrThrow({ where: { name: "1군" } });
  const u18Team     = await prisma.team.findFirstOrThrow({ where: { name: "U-18" } });
  const financeDept = await prisma.department.findFirstOrThrow({ where: { name: "재무관리", clubId: null } });

  const teamReq = await prisma.budgetPlanRequest.upsert({
    where: {
      financialReportId_ownerType_ownerId: {
        financialReportId: financialReport.id,
        ownerType: "TEAM",
        ownerId: u18Team.id,
      },
    },
    update: {},
    create: {
      financialReportId: financialReport.id,
      requestedById: youthCoach.id,
      scope: "TEAM",
      ownerType: "TEAM",
      ownerId: u18Team.id,
      status: "SUBMITTED",
      submittedAt: new Date("2026-08-25T10:00:00Z"),
    },
  });
  const teamReqLines = [
    { requestId: teamReq.id, categoryId: catId("HOME_MATCH_SUPPORT"),  triggers: ["HOME_MATCH" as const], standardDelta: 3_000_000, premiumDelta: 0,         comment: "홈 경기 지원 인원 증가 반영" },
    { requestId: teamReq.id, categoryId: catId("AWAY_TRAVEL_TEAM"),    triggers: [],                       standardDelta: 5_000_000, premiumDelta: 2_000_000, comment: "원정 K리그2 경기 확대" },
    { requestId: teamReq.id, categoryId: catId("TEAM_TRAINING_GEAR"),  triggers: [],                       standardDelta: 1_500_000, premiumDelta: 0,         comment: "GPS 장비 노후 교체" },
  ];
  for (const l of teamReqLines) {
    await prisma.budgetPlanRequestLine.upsert({
      where: { requestId_categoryId: { requestId: l.requestId, categoryId: l.categoryId } },
      update: {},
      create: l,
    });
  }

  const deptReq = await prisma.budgetPlanRequest.upsert({
    where: {
      financialReportId_ownerType_ownerId: {
        financialReportId: financialReport.id,
        ownerType: "DEPARTMENT",
        ownerId: financeDept.id,
      },
    },
    update: {},
    create: {
      financialReportId: financialReport.id,
      requestedById: financeUser.id,
      scope: "DEPARTMENT",
      ownerType: "DEPARTMENT",
      ownerId: financeDept.id,
      status: "SUBMITTED",
      submittedAt: new Date("2026-08-26T09:30:00Z"),
    },
  });
  const deptReqLines = [
    { requestId: deptReq.id, categoryId: catId("PUBLIC_UTILITY_KRW"),  triggers: ["PUBLIC_UTILITY" as const],   standardDelta: 8_000_000, premiumDelta: 0,         comment: "전기·가스 요금 인상 반영" },
    { requestId: deptReq.id, categoryId: catId("MULTI_LOCATION_MGMT"), triggers: ["MULTI_LOCATION" as const],   standardDelta: 4_000_000, premiumDelta: 1_000_000, comment: "2 지점 유지 관리 비용" },
    { requestId: deptReq.id, categoryId: catId("MEDICAL"),             triggers: [],                             standardDelta: 2_500_000, premiumDelta: 0,         comment: "선수·직원 건강검진 확대" },
  ];
  for (const l of deptReqLines) {
    await prisma.budgetPlanRequestLine.upsert({
      where: { requestId_categoryId: { requestId: l.requestId, categoryId: l.categoryId } },
      update: {},
      create: l,
    });
  }

  const draftReq = await prisma.budgetPlanRequest.upsert({
    where: {
      financialReportId_ownerType_ownerId: {
        financialReportId: financialReport.id,
        ownerType: "TEAM",
        ownerId: firstTeam.id,
      },
    },
    update: {},
    create: {
      financialReportId: financialReport.id,
      requestedById: headCoach.id,
      scope: "TEAM",
      ownerType: "TEAM",
      ownerId: firstTeam.id,
      status: "DRAFT",
    },
  });
  await prisma.budgetPlanRequestLine.upsert({
    where: { requestId_categoryId: { requestId: draftReq.id, categoryId: catId("SPORTS_EQUIPMENT") } },
    update: {},
    create: {
      requestId: draftReq.id,
      categoryId: catId("SPORTS_EQUIPMENT"),
      triggers: [],
      standardDelta: 2_000_000,
      premiumDelta: 0,
      comment: "홈/원정 유니폼 추가 세트",
    },
  });

  const existingPending = await prisma.budgetOverrideLog.findFirst({
    where: { financialReportId: financialReport.id, categoryId: catId("PUBLIC_UTILITY_KRW"), status: "PENDING" },
  });
  if (!existingPending) {
    await prisma.budgetOverrideLog.create({
      data: {
        financialReportId: financialReport.id,
        categoryId: catId("PUBLIC_UTILITY_KRW"),
        amount: 3_000_000,
        reason: "8월 폭염 냉방비 초과 — 실사용량 근거 첨부",
        createdById: financeUser.id,
        status: "PENDING",
      },
    });
  }

  const existingApproved = await prisma.budgetOverrideLog.findFirst({
    where: { financialReportId: financialReport.id, categoryId: catId("MEDICAL"), status: "APPROVED" },
  });
  if (!existingApproved) {
    await prisma.budgetOverrideLog.create({
      data: {
        financialReportId: financialReport.id,
        categoryId: catId("MEDICAL"),
        amount: 4_500_000,
        reason: "선수 부상 의료 지출 추가 승인 요청",
        createdById: headCoach.id,
        status: "APPROVED",
        reviewedById: gm.id,
        reviewedAt: new Date("2026-08-27T14:00:00Z"),
        reviewNote: "긴급 사안 승인",
      },
    });
  }

  console.log(
    `[seed] BudgetPlan workflow — ${newCategorySeeds.length} new categories, 3 requests (SUBMITTED×2, DRAFT×1), 2 override logs (PENDING+APPROVED)`,
  );
}

// Sponsorship seed — 2025 실적 + 2026 in-flight 로 FinancialReport 스폰서십 revenue 집계 데이터 확보.
// getSeasonRevenueActuals 는 status=PAID + paidAt in season window 만 count (cash basis, #325 참조).
async function seedSponsorships(adminId: number) {
  const s2025 = new Date("2025-01-01");
  const e2025 = new Date("2025-12-31");
  const s2026 = new Date("2026-01-01");
  const e2026 = new Date("2026-12-31");

  const sponsors = [
    {
      key: "TITLE-2025-KOREA",
      data: {
        sponsorName: "코리아텔레콤",
        type: "TITLE" as const,
        totalFee: 3_000_000_000,
        contractStart: s2025,
        contractEnd: e2025,
        paymentSchedule: "QUARTERLY" as const,
        currency: "KRW" as const,
        isOverseas: false,
        businessRegNumber: "104-81-12345",
      },
      payments: [
        { dueDate: new Date("2025-03-31"), amount: 750_000_000, paidAt: new Date("2025-03-28"), status: "PAID" as const },
        { dueDate: new Date("2025-06-30"), amount: 750_000_000, paidAt: new Date("2025-06-30"), status: "PAID" as const },
        { dueDate: new Date("2025-09-30"), amount: 750_000_000, paidAt: new Date("2025-09-25"), status: "PAID" as const },
        { dueDate: new Date("2025-12-31"), amount: 750_000_000, paidAt: new Date("2025-12-22"), status: "PAID" as const },
      ],
    },
    {
      key: "KIT-2025-SEOUL",
      data: {
        sponsorName: "서울스포츠",
        type: "KIT" as const,
        totalFee: 800_000_000,
        contractStart: s2025,
        contractEnd: e2025,
        paymentSchedule: "ANNUAL" as const,
        currency: "KRW" as const,
        isOverseas: false,
        businessRegNumber: "220-88-45678",
      },
      payments: [
        { dueDate: new Date("2025-01-31"), amount: 800_000_000, paidAt: new Date("2025-01-30"), status: "PAID" as const },
      ],
    },
    {
      key: "TITLE-2026-KOREA",
      data: {
        sponsorName: "코리아텔레콤",
        type: "TITLE" as const,
        totalFee: 3_600_000_000,
        contractStart: s2026,
        contractEnd: e2026,
        paymentSchedule: "QUARTERLY" as const,
        currency: "KRW" as const,
        isOverseas: false,
        businessRegNumber: "104-81-12345",
      },
      payments: [
        { dueDate: new Date("2026-03-31"), amount: 900_000_000, paidAt: new Date("2026-03-30"), status: "PAID" as const },
        { dueDate: new Date("2026-06-30"), amount: 900_000_000, paidAt: new Date("2026-06-29"), status: "PAID" as const },
        { dueDate: new Date("2026-09-30"), amount: 900_000_000, paidAt: null, status: "PENDING" as const },
        { dueDate: new Date("2026-12-31"), amount: 900_000_000, paidAt: null, status: "PENDING" as const },
      ],
    },
    {
      key: "DIGITAL-2026-LONDON",
      data: {
        sponsorName: "London Digital Ltd.",
        type: "DIGITAL" as const,
        totalFee: 500_000_000,
        contractStart: s2026,
        contractEnd: e2026,
        paymentSchedule: "MONTHLY" as const,
        currency: "GBP" as const,
        isOverseas: true,
        taxId: "GB123456789",
        overseasAddress: "10 Downing Street, London",
      },
      payments: [
        { dueDate: new Date("2026-02-28"), amount: 41_667_000, paidAt: new Date("2026-02-27"), status: "PAID" as const },
        { dueDate: new Date("2026-03-31"), amount: 41_667_000, paidAt: new Date("2026-03-29"), status: "PAID" as const },
        { dueDate: new Date("2026-04-30"), amount: 41_667_000, paidAt: null, status: "OVERDUE" as const },
      ],
    },
  ];

  let sponsorshipCount = 0;
  let paymentCount = 0;

  for (const s of sponsors) {
    // key = (sponsorName + contractStart) 조합으로 idempotent 판별
    const existing = await prisma.sponsorship.findFirst({
      where: { sponsorName: s.data.sponsorName, contractStart: s.data.contractStart },
      select: { id: true },
    });
    if (existing) continue;

    const created = await prisma.sponsorship.create({
      data: { ...s.data, createdById: adminId },
    });
    sponsorshipCount++;

    for (const p of s.payments) {
      await prisma.sponsorshipPayment.create({
        data: { sponsorshipId: created.id, ...p },
      });
      paymentCount++;
    }
  }

  console.log(
    `[seed] Sponsorships — ${sponsorshipCount} contracts, ${paymentCount} payments (2025 4+1 PAID, 2026 2 PAID + 2 PENDING + 3 OVERSEAS)`,
  );
}

// 운영비 실적 seed — 부서·팀별 지출 데이터로 BudgetAutoPage expense CAGR 예측 활성화.
// budget-automation.getExpenseActualsByCategory 는 status ∈ {APPROVED, PAID} + deletedAt=null 만 집계.
// getLatestApprovedBudgetLines 는 BudgetHeader status ∈ {APPROVED, LOCKED} 만 lookup.
async function seedOperatingExpenses(adminId: number) {
  // 2024 CLOSED 시즌 (CAGR 계산용 이전 시즌). 2025/2026 은 별도 로직에서 이미 생성됨.
  // Season.name 은 unique 아니라 findFirst 후 conditional create.
  let season2024 = await prisma.season.findFirst({ where: { name: "2024 시즌" } });
  if (!season2024) {
    season2024 = await prisma.season.create({
      data: {
        name: "2024 시즌",
        startDate: new Date("2024-03-01"),
        endDate: new Date("2024-11-30"),
        status: "CLOSED",
      },
    });
  }
  const season2025 = await prisma.season.findFirst({ where: { name: "2025 시즌" } });
  const season2026 = await prisma.season.findFirst({ where: { name: "2026 시즌" } });
  if (!season2025 || !season2026) {
    console.log("[seed] Skipped OperatingExpense — 2025/2026 시즌 미존재");
    return;
  }

  // 카테고리 코드별 연간 예산 규모 (원). scope=TEAM 은 팀 스코프, DEPARTMENT 는 부서 스코프.
  // 실적치는 예산 대비 85%~110% 범위에서 realistic 하게 분포.
  const categoryBudget: Record<string, { annual: number; departmentName?: string | null; teamName?: string | null }> = {
    MEDICAL:            { annual: 120_000_000, departmentName: "의료기기 관리" },
    MEAL:               { annual:  80_000_000, departmentName: "재무관리" },
    TRAVEL:             { annual: 200_000_000, departmentName: "재무관리" },
    SPORTS_EQUIPMENT:   { annual:  90_000_000, departmentName: "선수 장비관리" },
    SCOUTING:           { annual:  60_000_000, departmentName: "재무관리" },
    YOUTH:              { annual:  50_000_000, departmentName: "재무관리" },
    IT_SECURITY:        { annual:  45_000_000, departmentName: "IT 자산관리" },
    FACILITY_EQUIPMENT: { annual:  70_000_000, departmentName: "시설관리" },
    STAFF_RECRUITMENT:  { annual:  30_000_000, departmentName: "HR" },
    HOME_MATCH_SUPPORT: { annual: 150_000_000, teamName: "1군" },
    AWAY_TRAVEL_TEAM:   { annual: 180_000_000, teamName: "1군" },
    TEAM_TRAINING_GEAR: { annual:  55_000_000, teamName: "1군" },
  };

  // 부서/팀 조회 (id 해석)
  const departments = await prisma.department.findMany({ where: { clubId: null } });
  const teams = await prisma.team.findMany();
  const deptIdByName = new Map(departments.map((d) => [d.name, d.id]));
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));

  const categories = await prisma.expenseCategory.findMany({
    where: { code: { in: Object.keys(categoryBudget) } },
  });
  const catIdByCode = new Map(categories.map((c) => [c.code, c.id]));

  // BudgetHeader/Line APPROVED 승격 — 시즌별로 1개 APPROVED header + 카테고리별 line
  // (기존 DRAFT/SUBMITTED header 는 유지, 신규 APPROVED header 를 별도 seed 로 추가)
  async function ensureApprovedBudgetHeader(seasonId: number, year: number, seasonMultiplier = 1.0): Promise<Map<number, number>> {
    const existing = await prisma.budgetHeader.findFirst({
      where: { seasonId, status: "APPROVED", name: `${year} 시즌 확정 예산 (seed)` },
      include: { lines: true },
    });
    if (existing) {
      return new Map(existing.lines.map((l) => [l.categoryId, l.id]));
    }

    // seasonId+version unique — 기존 header 회피용 seed version 99 사용
    const nextVersion = 99;

    const linesData = Object.entries(categoryBudget).map(([code, info]) => ({
      categoryId: catIdByCode.get(code)!,
      originalAmount: Math.round(info.annual * seasonMultiplier),
      departmentId: info.departmentName ? deptIdByName.get(info.departmentName) ?? null : null,
      year,
    }));
    const totalBudget = linesData.reduce((sum, l) => sum + l.originalAmount, 0);

    const header = await prisma.budgetHeader.create({
      data: {
        seasonId,
        version: nextVersion,
        status: "APPROVED",
        name: `${year} 시즌 확정 예산 (seed)`,
        totalBudget,
        createdById: adminId,
        approvedById: adminId,
        approvedAt: new Date(`${year}-01-15`),
      },
    });

    const lineMap = new Map<number, number>();
    for (const l of linesData) {
      const line = await prisma.budgetLine.create({
        data: {
          budgetHeaderId: header.id,
          categoryId: l.categoryId,
          originalAmount: l.originalAmount,
          year: l.year,
          departmentId: l.departmentId,
        },
      });
      lineMap.set(l.categoryId, line.id);
    }
    return lineMap;
  }

  // 2024 는 2025 대비 -8% (실적 성장세 반영), 2025 는 base, 2026 은 in-flight
  const lines2024 = await ensureApprovedBudgetHeader(season2024.id, 2024, 0.92);
  const lines2025 = await ensureApprovedBudgetHeader(season2025.id, 2025);
  const lines2026 = await ensureApprovedBudgetHeader(season2026.id, 2026);

  // 2024/2025: 12개월 모두 지출. 카테고리별 월평균 = annual/12, ±15% 변동.
  // 2026: 1~8월까지만 (in-flight)
  const currentMonth2026 = 8;

  const financeStaff = await prisma.user.findFirst({ where: { email: "finance.staff@club.com" } });
  const approverId = financeStaff?.id ?? adminId;

  let expenseCount = 0;
  let skippedCount = 0;

  async function seedForSeason(seasonId: number, year: number, months: number, lineMap: Map<number, number>, seasonMultiplier = 1.0) {
    for (const [code, info] of Object.entries(categoryBudget)) {
      const catId = catIdByCode.get(code);
      const budgetLineId = lineMap.get(catId ?? -1);
      if (!catId || !budgetLineId) continue;
      const departmentId = info.departmentName ? deptIdByName.get(info.departmentName) ?? null : null;

      const monthly = Math.round((info.annual * seasonMultiplier) / 12);

      for (let m = 1; m <= months; m++) {
        // 월별 realistic 지출 (±15% 변동, 시드로 결정론적)
        const seed = (catId * 31 + m) % 30 - 15; // -15 ~ +14
        const amount = Math.max(1_000_000, Math.round(monthly * (1 + seed / 100)));

        const date = new Date(Date.UTC(year, m - 1, 15));
        const paidAt = new Date(Date.UTC(year, m - 1, 25));

        // 중복 방지: (budgetLineId + date) 조합 unique
        const exists = await prisma.operatingExpense.findFirst({
          where: { budgetLineId, date, deletedAt: null },
          select: { id: true },
        });
        if (exists) { skippedCount++; continue; }

        await prisma.operatingExpense.create({
          data: {
            seasonId,
            categoryId: catId,
            budgetLineId,
            amount,
            date,
            note: `${year}-${String(m).padStart(2, "0")} ${code} 실적 (seed)`,
            createdById: adminId,
            departmentId,
            status: "PAID",
            firstApprovedById: approverId,
            firstApprovedAt: date,
            approvedById: approverId,
            approvedAt: date,
            paidAt,
            paidById: approverId,
          },
        });
        expenseCount++;
      }
    }
  }

  await seedForSeason(season2024.id, 2024, 12, lines2024, 0.92);
  await seedForSeason(season2025.id, 2025, 12, lines2025);
  await seedForSeason(season2026.id, 2026, currentMonth2026, lines2026);

  const total2025 = Object.values(categoryBudget).reduce((s, i) => s + i.annual, 0);
  console.log(
    `[seed] OperatingExpense — 2024/2025 12개월 + 2026 ${currentMonth2026}개월. ${expenseCount} rows (${skippedCount} skipped), 2025 예산 ${(total2025 / 1e8).toFixed(1)}억`,
  );
  console.log(`[seed] BudgetHeader APPROVED (2024 -8% / 2025 base / 2026) + 12 lines/season, departmentId 매핑 완료`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
