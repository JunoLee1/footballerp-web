import { resolveRequesterScope, assertCategoryScopeMatch } from "../../src/budget-plan/scope";
import { AppError } from "../../src/lib/appError";
import type { PrismaClient } from "../../src/generated/client";

const makePrisma = (
  headCoach: { userId: string; teamId: number } | null,
  headOfDepartment: { headId: string; departmentId: number } | null,
): Pick<PrismaClient, "coach" | "department"> => ({
  coach: {
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      if (
        headCoach &&
        where.userId === headCoach.userId &&
        where.coachingRole === "HEAD_COACH" &&
        where.teamId !== null
      ) {
        return Promise.resolve({ id: 1, userId: headCoach.userId, teamId: headCoach.teamId });
      }
      return Promise.resolve(null);
    }),
  } as any,
  department: {
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      if (headOfDepartment && where.headId === headOfDepartment.headId) {
        return Promise.resolve({ id: headOfDepartment.departmentId, headId: headOfDepartment.headId });
      }
      return Promise.resolve(null);
    }),
  } as any,
});

describe("resolveRequesterScope", () => {
  test("HEAD_COACH 유저 → TEAM 스코프 반환", async () => {
    const prisma = makePrisma({ userId: "00000000-0000-4000-8000-000000000100", teamId: 5 }, null) as PrismaClient;

    const result = await resolveRequesterScope("00000000-0000-4000-8000-000000000100", prisma);

    expect(result).toEqual({ scope: "TEAM", ownerId: 5 });
  });

  test("Department.head 유저 → DEPARTMENT 스코프 반환", async () => {
    const prisma = makePrisma(null, { headId: "00000000-0000-4000-8000-000000000200", departmentId: 3 }) as PrismaClient;

    const result = await resolveRequesterScope("00000000-0000-4000-8000-000000000200", prisma);

    expect(result).toEqual({ scope: "DEPARTMENT", ownerId: 3 });
  });

  test("팀장·부서장 둘 다 아님 → 403 NOT_BUDGET_PLAN_REQUESTER", async () => {
    const prisma = makePrisma(null, null) as PrismaClient;

    await expect(resolveRequesterScope("00000000-0000-4000-8000-000000000999", prisma)).rejects.toThrow(AppError);
    await expect(resolveRequesterScope("00000000-0000-4000-8000-000000000999", prisma)).rejects.toMatchObject({
      statusCode: 403,
      code: "NOT_BUDGET_PLAN_REQUESTER",
    });
  });

  test("팀장·부서장 겸직 → 409 AMBIGUOUS_BUDGET_PLAN_SCOPE", async () => {
    const prisma = makePrisma({ userId: "00000000-0000-4000-8000-000000000300", teamId: 5 }, { headId: "00000000-0000-4000-8000-000000000300", departmentId: 3 }) as PrismaClient;

    await expect(resolveRequesterScope("00000000-0000-4000-8000-000000000300", prisma)).rejects.toThrow(AppError);
    await expect(resolveRequesterScope("00000000-0000-4000-8000-000000000300", prisma)).rejects.toMatchObject({
      statusCode: 409,
      code: "AMBIGUOUS_BUDGET_PLAN_SCOPE",
    });
  });
});

describe("assertCategoryScopeMatch", () => {
  test("팀 요청자 + TEAM 카테고리 → 통과 (에러 없음)", () => {
    expect(() =>
      assertCategoryScopeMatch({ scope: "TEAM", ownerId: 5 }, { scope: "TEAM" }),
    ).not.toThrow();
  });

  test("부서 요청자 + DEPARTMENT 카테고리 → 통과", () => {
    expect(() =>
      assertCategoryScopeMatch({ scope: "DEPARTMENT", ownerId: 3 }, { scope: "DEPARTMENT" }),
    ).not.toThrow();
  });

  test("팀 요청자 + DEPARTMENT 카테고리 → 403 CATEGORY_SCOPE_MISMATCH", () => {
    expect(() =>
      assertCategoryScopeMatch({ scope: "TEAM", ownerId: 5 }, { scope: "DEPARTMENT" }),
    ).toThrow(AppError);
    try {
      assertCategoryScopeMatch({ scope: "TEAM", ownerId: 5 }, { scope: "DEPARTMENT" });
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("CATEGORY_SCOPE_MISMATCH");
    }
  });

  test("부서 요청자 + TEAM 카테고리 → 403 CATEGORY_SCOPE_MISMATCH", () => {
    expect(() =>
      assertCategoryScopeMatch({ scope: "DEPARTMENT", ownerId: 3 }, { scope: "TEAM" }),
    ).toThrow(AppError);
  });
});
