import { PrismaClient } from "../generated/client";
import type { DepartmentCategory, DeptRole } from "../generated/enums";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export class DepartmentRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(clubId?: number | null) {
    return this.prisma.department.findMany({
      where: {
        parentId: null,
        ...(clubId != null
          ? { OR: [{ clubId }, { clubId: null }] }
          : {}),
      },
      orderBy: { name: "asc" },
      include: { children: { orderBy: { name: "asc" } } },
    });
  }

  findById(id: number) {
    return this.prisma.department.findUnique({
      where: { id },
      include: { children: { orderBy: { name: "asc" } }, parent: true },
    });
  }

  findByName(name: string, clubId?: number | null) {
    return this.prisma.department.findUnique({
      where: { name_clubId: { name, clubId: clubId ?? (null as unknown as number) } },
    });
  }

  create(data: { name: string; parentId?: number; category?: DepartmentCategory | null; clubId?: number | null }) {
    return this.prisma.department.create({
      data,
      include: { children: { orderBy: { name: "asc" } }, parent: true },
    });
  }

  update(id: number, data: { name?: string; isActive?: boolean; parentId?: number | null; category?: DepartmentCategory | null }) {
    return this.prisma.department.update({
      where: { id },
      data,
      include: { children: { orderBy: { name: "asc" } }, parent: true },
    });
  }

  countActiveStaff(departmentId: number) {
    return this.prisma.staffRecord.count({ where: { departmentId, isActive: true } });
  }

  async getHeadcount(departmentId: number) {
    const [activeStaff, totalStaff] = await Promise.all([
      this.prisma.staffRecord.count({ where: { departmentId, isActive: true } }),
      this.prisma.staffRecord.count({ where: { departmentId } }),
    ]);
    return { activeStaff, totalStaff, inactive: totalStaff - activeStaff };
  }

  delete(id: number) {
    return this.prisma.department.delete({ where: { id } });
  }

  // ── Member CRUD ────────────────────────────────────────────

  async findDescendantIds(deptId: number): Promise<number[]> {
    const result = await this.prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "Department" WHERE id = ${deptId}
        UNION ALL
        SELECT d.id FROM "Department" d
        INNER JOIN subtree s ON d."parentId" = s.id
      )
      SELECT id FROM subtree
    `;
    return result.map(r => r.id);
  }

  async findMembers(deptId: number) {
    const ids = await this.findDescendantIds(deptId);
    return this.prisma.userDepartment.findMany({
      where: { departmentId: { in: ids } },
      select: {
        userId: true,
        departmentId: true,
        role: true,
        jobTitleId: true,
        joinedAt: true,
        user: { select: { id: true, username: true, nickname: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
        jobTitle: { select: { id: true, label: true } },
      },
      orderBy: [{ departmentId: "asc" }, { joinedAt: "asc" }],
    });
  }

  findMember(deptId: number, userId: string) {
    return this.prisma.userDepartment.findUnique({
      where: { userId_departmentId: { userId, departmentId: deptId } },
    });
  }

  isHead(deptId: number, userId: string): Promise<boolean> {
    return this.prisma.userDepartment.findFirst({
      where: { departmentId: deptId, userId, role: { in: ['DEPT_HEAD', 'LEADER'] } },
    }).then(m => m !== null);
  }

  findHead(deptId: number) {
    return this.prisma.userDepartment.findFirst({
      where: { departmentId: deptId, role: { in: ['DEPT_HEAD', 'LEADER'] } },
    });
  }

  async setHead(deptId: number, newUserId: string | null, targetRole: DeptRole): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userDepartment.updateMany({
        where: { departmentId: deptId, role: targetRole },
        data: { role: 'MEMBER' },
      });
      if (newUserId !== null) {
        await tx.userDepartment.update({
          where: { userId_departmentId: { userId: newUserId, departmentId: deptId } },
          data: { role: targetRole },
        });
      }
    });
  }

  findUserById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  addMember(deptId: number, userId: string, role: DeptRole, jobTitleId?: number | null, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.userDepartment.create({
      data: { departmentId: deptId, userId, role, ...(jobTitleId != null && { jobTitleId }) },
    });
  }

  updateMemberRole(deptId: number, userId: string, role: DeptRole, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.userDepartment.update({
      where: { userId_departmentId: { userId, departmentId: deptId } },
      data: { role },
    });
  }

  removeMember(deptId: number, userId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.userDepartment.delete({
      where: { userId_departmentId: { userId, departmentId: deptId } },
    });
  }

  transferMember(fromDeptId: number, toDeptId: number, userId: string, toRole: DeptRole) {
    return this.prisma.$transaction(async (tx) => {
      await tx.userDepartment.delete({
        where: { userId_departmentId: { userId, departmentId: fromDeptId } },
      });
      await tx.userDepartment.create({
        data: { departmentId: toDeptId, userId, role: toRole },
      });
    });
  }

  countUserDepartments(userId: string) {
    return this.prisma.userDepartment.count({ where: { userId } });
  }

  updateHead(deptId: number, newHeadId: string | null, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.department.update({
      where: { id: deptId },
      data: { headId: newHeadId },
    });
  }

  // ── DeptJobTitle CRUD ──────────────────────────────────────

  findJobTitles(departmentId: number) {
    return this.prisma.deptJobTitle.findMany({
      where: { departmentId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createJobTitle(departmentId: number, label: string, sortOrder?: number) {
    return this.prisma.deptJobTitle.create({
      data: { departmentId, label, ...(sortOrder !== undefined && { sortOrder }) },
    });
  }

  findJobTitleById(id: number) {
    return this.prisma.deptJobTitle.findUnique({ where: { id } });
  }

  updateJobTitle(id: number, data: { label?: string; sortOrder?: number }) {
    return this.prisma.deptJobTitle.update({ where: { id }, data });
  }

  deactivateJobTitle(id: number) {
    return this.prisma.deptJobTitle.update({ where: { id }, data: { isActive: false } });
  }

  updateMemberJobTitle(deptId: number, userId: string, jobTitleId: number | null) {
    return this.prisma.userDepartment.update({
      where: { userId_departmentId: { userId, departmentId: deptId } },
      data: { jobTitleId },
    });
  }
}
