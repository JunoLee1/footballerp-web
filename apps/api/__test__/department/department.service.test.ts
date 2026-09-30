import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { DepartmentService } from "../../src/department/department.service";
import { AppError } from "../../src/lib/appError";

const mockRepo = {
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  countActiveStaff: jest.fn<() => Promise<number>>().mockResolvedValue(0),
  isHead: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  findHead: jest.fn().mockResolvedValue(null),
  setHead: jest.fn().mockResolvedValue(undefined),
  findJobTitles: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  createJobTitle: jest.fn(),
  findJobTitleById: jest.fn().mockResolvedValue(null),
  updateJobTitle: jest.fn(),
  deactivateJobTitle: jest.fn().mockResolvedValue(undefined),
  updateMemberJobTitle: jest.fn().mockResolvedValue(undefined),
  findMember: jest.fn().mockResolvedValue(null),
} as any;

const service = new DepartmentService(mockRepo);

describe("DepartmentService", () => {
  beforeEach(() => jest.clearAllMocks());

  test("list: 전체 부서 목록 반환", async () => {
    mockRepo.findAll.mockResolvedValue([{ id: 1, name: "전략팀", isActive: true }]);
    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "전략팀" });
  });

  test("get: 존재하는 부서 반환", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    const result = await service.get(1);
    expect(result.id).toBe(1);
  });

  test("get: 존재하지 않으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.get(99)).rejects.toThrow(AppError);
    await expect(service.get(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("create: 정상 생성", async () => {
    mockRepo.findByName.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({ id: 2, name: "마케팅팀", isActive: true });
    const result = await service.create({ name: "마케팅팀" });
    expect(result.name).toBe("마케팅팀");
    expect(mockRepo.create).toHaveBeenCalledWith({ name: "마케팅팀" });
  });

  test("create: 중복 이름이면 409", async () => {
    mockRepo.findByName.mockResolvedValue({ id: 1, name: "전략팀" });
    await expect(service.create({ name: "전략팀" })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("update: 존재하는 부서 수정", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    mockRepo.findByName.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ id: 1, name: "전략기획팀", isActive: true });
    const result = await service.update(1, { name: "전략기획팀" });
    expect(result.name).toBe("전략기획팀");
  });

  test("update: 존재하지 않으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.update(99, { name: "X" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("update: 다른 부서와 이름 중복이면 409", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    mockRepo.findByName.mockResolvedValue({ id: 2, name: "마케팅팀" }); // different dept
    await expect(service.update(1, { name: "마케팅팀" })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("update: 같은 이름 같은 id이면 정상 수정", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    mockRepo.findByName.mockResolvedValue({ id: 1, name: "전략팀" }); // same dept
    mockRepo.update.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    const result = await service.update(1, { name: "전략팀" });
    expect(result.name).toBe("전략팀");
  });

  test("delete: 정상 삭제", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "전략팀", isActive: true });
    await service.delete(1);
    expect(mockRepo.delete).toHaveBeenCalledWith(1);
  });

  test("delete: 존재하지 않으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.delete(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("DeptJobTitle", () => {
  const adminActor = { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN" };
  const leaderActor = { id: "00000000-0000-4000-8000-000000000099", role: "FRONT_OFFICE" };

  beforeEach(() => jest.clearAllMocks());

  test("listJobTitles: 부서 없으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.listJobTitles(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("listJobTitles: 정상 반환", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000099" });
    mockRepo.findJobTitles.mockResolvedValue([{ id: 1, label: "과장" }]);
    const result = await service.listJobTitles(1);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("과장");
  });

  test("createJobTitle: headId 아닌 actor면 403", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000010" });
    await expect(service.createJobTitle(1, "과장", undefined, leaderActor))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test("createJobTitle: admin이면 정상 생성", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000010" });
    mockRepo.createJobTitle.mockResolvedValue({ id: 1, label: "과장" });
    const result = await service.createJobTitle(1, "과장", undefined, adminActor);
    expect(mockRepo.createJobTitle).toHaveBeenCalledWith(1, "과장", undefined);
    expect(result.label).toBe("과장");
  });

  test("createJobTitle: 빈 label이면 400", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000001" });
    await expect(service.createJobTitle(1, "  ", undefined, adminActor))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test("deleteJobTitle: soft delete 실행", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000001" });
    mockRepo.findJobTitleById.mockResolvedValue({ id: 5, departmentId: 1, isActive: true });
    await service.deleteJobTitle(1, 5, adminActor);
    expect(mockRepo.deactivateJobTitle).toHaveBeenCalledWith(5);
  });

  test("deleteJobTitle: 다른 부서 직급이면 404", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000001" });
    mockRepo.findJobTitleById.mockResolvedValue({ id: 5, departmentId: 99, isActive: true });
    await expect(service.deleteJobTitle(1, 5, adminActor))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test("updateMemberJobTitle: 비활성 직급이면 400", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000001" });
    mockRepo.findMember.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000002", departmentId: 1, role: "MEMBER" });
    mockRepo.findJobTitleById.mockResolvedValue({ id: 9, departmentId: 1, isActive: false });
    await expect(service.updateMemberJobTitle(1, 2, 9, adminActor))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test("updateMemberJobTitle: null이면 직급 해제", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: "00000000-0000-4000-8000-000000000001" });
    mockRepo.findMember.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000002", departmentId: 1, role: "MEMBER" });
    await service.updateMemberJobTitle(1, 2, null, adminActor);
    expect(mockRepo.updateMemberJobTitle).toHaveBeenCalledWith(1, 2, null);
  });
});
