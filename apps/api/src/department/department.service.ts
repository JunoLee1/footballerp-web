import { DepartmentRepository } from "./department.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { isAdminLike, canWriteHR } from "../lib/permissions";
import { cached } from "../lib/cache";
import type { DepartmentCategory, DeptRole } from "../generated/enums";

type Actor = { id: string; role: string; frontOfficeRole?: string | null | undefined; deptCategories?: string[] | undefined };

export class DepartmentService {
  constructor(private repo: DepartmentRepository) {}

  list(clubId?: string | null) {
    return cached(`departments:list:${clubId ?? "null"}`, 60, () => this.repo.findAll(clubId));
  }

  async get(id: string) {
    const dept = await this.repo.findById(id);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");
    return dept;
  }

  async create(data: { name: string; parentId?: string; category?: DepartmentCategory | null; clubId?: string | null }) {
    const existing = await this.repo.findByName(data.name, data.clubId);
    if (existing) throw new AppError(409, "DEPARTMENT_NAME_CONFLICT");
    if (data.parentId !== undefined) {
      const parent = await this.repo.findById(data.parentId);
      if (!parent) throw new AppError(404, "PARENT_DEPARTMENT_NOT_FOUND");
    }
    return this.repo.create(data);
  }

  async update(id: string, data: { name?: string; isActive?: boolean; parentId?: string | null; category?: DepartmentCategory | null }, actorId?: string, clubId?: string | null) {
    const dept = await this.get(id);
    if (data.name !== undefined) {
      const existing = await this.repo.findByName(data.name, dept.clubId);
      if (existing && existing.id !== id) throw new AppError(409, "DEPARTMENT_NAME_CONFLICT");
    }
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) throw new AppError(400, "DEPARTMENT_CIRCULAR_REFERENCE");
      const parent = await this.repo.findById(data.parentId);
      if (!parent) throw new AppError(404, "PARENT_DEPARTMENT_NOT_FOUND");
      // Walk ancestor chain to detect cycles (Y3)
      let cursor: string | null = parent.parentId ?? null;
      while (cursor !== null) {
        if (cursor === id) throw new AppError(400, "DEPARTMENT_CIRCULAR_REFERENCE");
        const ancestor = await this.repo.findById(cursor);
        cursor = ancestor?.parentId ?? null;
      }
    }
    const result = await this.repo.update(id, data);
    if (actorId != null) {
      await writeAuditLog({ actorId, action: "DEPARTMENT_UPDATED", targetId: id });
    }
    return result;
  }

  async getHeadcount(id: string) {
    const dept = await this.repo.findById(id);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");
    return this.repo.getHeadcount(id);
  }

  async delete(id: string) {
    const dept = await this.get(id);
    if (dept.children && dept.children.length > 0)
      throw new AppError(409, "DEPARTMENT_HAS_CHILDREN");
    const activeStaffCount = await this.repo.countActiveStaff(id);
    if (activeStaffCount > 0) throw new AppError(409, "DEPARTMENT_HAS_ACTIVE_STAFF");
    return this.repo.delete(id);
  }

  isHead(deptId: string, userId: string): Promise<boolean> {
    return this.repo.isHead(deptId, userId);
  }

  // ── Member CRUD ────────────────────────────────────────────

  private async assertLeaderOrAdmin(deptId: string, actor: Actor) {
    if (isAdminLike(actor.role)) return;
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");
    if (dept.headId !== actor.id) throw new AppError(403, "NOT_LEADER");
  }

  // 부서장 CRUD: GM/ADMIN만
  private assertCanManageDeptHead(actor: Actor) {
    if (!isAdminLike(actor.role)) throw new AppError(403, "FORBIDDEN");
  }

  // 팀장 CRUD: HR팀 OR 부서장
  private assertCanManageTeamLeader(actor: Actor, parentHeadId: string | null | undefined) {
    if (isAdminLike(actor.role)) return;
    if (canWriteHR(actor.role, actor.frontOfficeRole ?? null, actor.deptCategories)) return;
    if (parentHeadId != null && parentHeadId === actor.id) return;
    throw new AppError(403, "FORBIDDEN");
  }

  // 인턴→사원 승격: HR팀 OR 팀장/부서장
  private assertCanPromoteIntern(actor: Actor, deptHeadId: string | null | undefined) {
    if (isAdminLike(actor.role)) return;
    if (canWriteHR(actor.role, actor.frontOfficeRole ?? null, actor.deptCategories)) return;
    if (deptHeadId != null && deptHeadId === actor.id) return;
    throw new AppError(403, "FORBIDDEN");
  }

  async listMembers(deptId: string, actor: Actor) {
    if (!isAdminLike(actor.role)) {
      // 1) 해당 부서 또는 하위 부서의 직접 멤버
      const descendantIds = await this.repo.findDescendantIds(deptId);
      const memberships = await Promise.all(descendantIds.map(id => this.repo.findMember(id, actor.id)));
      if (memberships.some(Boolean)) return this.repo.findMembers(deptId);

      // 2) 상위 부서장 (조상 중 headId가 actor인 부서가 있으면 허용)
      let cursor = await this.repo.findById(deptId);
      while (cursor) {
        if (cursor.headId === actor.id) return this.repo.findMembers(deptId);
        cursor = cursor.parentId ? await this.repo.findById(cursor.parentId) : null;
      }

      throw new AppError(403, "FORBIDDEN");
    }
    return this.repo.findMembers(deptId);
  }

  async addMember(deptId: string, userId: string, memberRole: DeptRole, actor: Actor, jobTitleId?: number | null) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");

    if (memberRole === 'DEPT_HEAD') {
      this.assertCanManageDeptHead(actor);
    } else if (memberRole === 'LEADER') {
      const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
      this.assertCanManageTeamLeader(actor, parent?.headId);
    } else {
      await this.assertLeaderOrAdmin(deptId, actor);
    }

    const user = await this.repo.findUserById(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");
    const existing = await this.repo.findMember(deptId, userId);
    if (existing) throw new AppError(400, "ALREADY_MEMBER");
    await this.repo.addMember(deptId, userId, memberRole, jobTitleId ?? null);
    void writeAuditLog({ actorId: actor.id, action: "TEAM_MEMBER_ADDED", targetId: deptId, detail: { userId, memberRole } }).catch(console.error);
    return { ok: true };
  }

  async updateMemberRole(deptId: string, userId: string, newRole: DeptRole, actor: Actor) {
    if (userId === actor.id) throw new AppError(403, "SELF_ROLE_CHANGE_FORBIDDEN");
    const existing = await this.repo.findMember(deptId, userId);
    if (!existing) throw new AppError(404, "NOT_MEMBER");

    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");

    if (newRole === 'DEPT_HEAD' || existing.role === 'DEPT_HEAD') {
      this.assertCanManageDeptHead(actor);
    } else if (newRole === 'LEADER' || existing.role === 'LEADER') {
      const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
      this.assertCanManageTeamLeader(actor, parent?.headId);
    } else if (existing.role === 'INTERN' && newRole === 'MEMBER') {
      // 인턴→사원 승격: HR팀 OR 팀장/부서장
      this.assertCanPromoteIntern(actor, dept.headId);
    } else {
      if (!isAdminLike(actor.role)) throw new AppError(403, "FORBIDDEN");
    }

    await this.repo.updateMemberRole(deptId, userId, newRole);
    void writeAuditLog({ actorId: actor.id, action: "TEAM_MEMBER_ROLE_CHANGED", targetId: deptId, detail: { userId, newRole } }).catch(console.error);
    return { ok: true };
  }

  async removeMember(deptId: string, userId: string, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");

    const membership = await this.repo.findMember(deptId, userId);
    if (membership?.role === 'DEPT_HEAD') {
      this.assertCanManageDeptHead(actor);
    } else if (membership?.role === 'LEADER') {
      const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
      this.assertCanManageTeamLeader(actor, parent?.headId);
    } else {
      await this.assertLeaderOrAdmin(deptId, actor);
    }

    if (userId === actor.id) throw new AppError(403, "SELF_REMOVAL_FORBIDDEN");
    const deptCount = await this.repo.countUserDepartments(userId);
    if (deptCount <= 1) throw new AppError(400, "MUST_TRANSFER");
    await this.repo.removeMember(deptId, userId);
    void writeAuditLog({ actorId: actor.id, action: "TEAM_MEMBER_REMOVED", targetId: deptId, detail: { userId } }).catch(console.error);
    return { ok: true };
  }

  async transferMember(fromDeptId: string, toDeptId: string, userId: string, toRole: DeptRole, actor: Actor) {
    await this.assertLeaderOrAdmin(fromDeptId, actor);
    if (userId === actor.id) throw new AppError(403, "SELF_TRANSFER_FORBIDDEN");
    if (fromDeptId === toDeptId) throw new AppError(400, "SAME_DEPARTMENT");
    const toDept = await this.repo.findById(toDeptId);
    if (!toDept) throw new AppError(404, "TARGET_DEPT_NOT_FOUND");
    await this.repo.transferMember(fromDeptId, toDeptId, userId, toRole);
    void writeAuditLog({ actorId: actor.id, action: "TEAM_MEMBER_TRANSFERRED", targetId: fromDeptId, detail: { userId, toDeptId, toRole } }).catch(console.error);
    return { ok: true };
  }

  async updateHead(deptId: string, newHeadId: string | null, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");

    // 현재 팀장 본인은 팀장 변경 불가
    if (dept.headId === actor.id && !isAdminLike(actor.role)) {
      throw new AppError(403, "TEAM_LEADER_CANNOT_CHANGE_HEAD");
    }

    if (!dept.parentId) {
      // 최상위 부서장: GM/ADMIN만
      this.assertCanManageDeptHead(actor);
    } else {
      // 팀장: HR팀 OR 부서장
      const parent = await this.repo.findById(dept.parentId);
      this.assertCanManageTeamLeader(actor, parent?.headId);
    }

    if (newHeadId === actor.id) throw new AppError(403, "SELF_HEAD_APPOINTMENT_FORBIDDEN");
    if (newHeadId !== null) {
      const newHead = await this.repo.findUserById(newHeadId);
      if (!newHead) throw new AppError(404, "USER_NOT_FOUND");
    }
    const oldHeadId = dept.headId;
    await this.repo.updateHead(deptId, newHeadId);
    void writeAuditLog({ actorId: actor.id, action: "DEPARTMENT_HEAD_CHANGED", targetId: deptId, detail: { oldHeadId, newHeadId } }).catch(console.error);
    return { ok: true };
  }

  // ── DeptJobTitle ────────────────────────────────────────────

  async listJobTitles(deptId: string) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    return this.repo.findJobTitles(deptId);
  }

  async createJobTitle(deptId: string, label: string, sortOrder: number | undefined, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (typeof label !== 'string' || !label.trim()) throw new AppError(400, 'LABEL_REQUIRED');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    return this.repo.createJobTitle(deptId, label.trim(), sortOrder);
  }

  async updateJobTitle(deptId: string, titleId: number, data: { label?: string; sortOrder?: number }, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const title = await this.repo.findJobTitleById(titleId);
    if (!title || title.departmentId !== deptId) throw new AppError(404, 'JOB_TITLE_NOT_FOUND');
    if (data.label !== undefined && (typeof data.label !== 'string' || !data.label.trim())) {
      throw new AppError(400, 'LABEL_REQUIRED');
    }
    return this.repo.updateJobTitle(titleId, {
      ...(data.label !== undefined && { label: data.label.trim() }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    });
  }

  async deleteJobTitle(deptId: string, titleId: number, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const title = await this.repo.findJobTitleById(titleId);
    if (!title || title.departmentId !== deptId) throw new AppError(404, 'JOB_TITLE_NOT_FOUND');
    await this.repo.deactivateJobTitle(titleId);
    return { ok: true };
  }

  async updateMemberJobTitle(deptId: string, userId: string, jobTitleId: number | null, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const member = await this.repo.findMember(deptId, userId);
    if (!member) throw new AppError(404, 'NOT_MEMBER');
    if (jobTitleId !== null) {
      const title = await this.repo.findJobTitleById(jobTitleId);
      if (!title || title.departmentId !== deptId || !title.isActive) throw new AppError(400, 'JOB_TITLE_NOT_FOUND');
    }
    await this.repo.updateMemberJobTitle(deptId, userId, jobTitleId);
    return { ok: true };
  }
}
