import { DepartmentService } from "./department.service";
import type { DepartmentRepository } from "./department.repo";

const makeRepo = (overrides: Partial<DepartmentRepository> = {}): DepartmentRepository =>
  ({
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByName: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countActiveStaff: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as DepartmentRepository);

const fakeDept = {
  id: 1,
  name: '자산관리',
  parentId: null,
  isActive: true,
  children: [],
  parent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  staffRecords: [],
};
const fakeChild = {
  id: 2,
  name: 'HR',
  parentId: 1,
  isActive: true,
  children: [],
  parent: fakeDept,
  createdAt: new Date(),
  updatedAt: new Date(),
  staffRecords: [],
};

describe('DepartmentService', () => {
  describe('create', () => {
    it('이름 중복이면 409', async () => {
      const repo = makeRepo({ findByName: jest.fn().mockResolvedValue(fakeDept) });
      const svc = new DepartmentService(repo);
      await expect(svc.create({ name: '자산관리' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('parentId 없이 상위 부서 생성', async () => {
      const repo = makeRepo({ create: jest.fn().mockResolvedValue(fakeDept) });
      const svc = new DepartmentService(repo);
      const result = await svc.create({ name: '자산관리' });
      expect(repo.create).toHaveBeenCalledWith({ name: '자산관리' });
      expect(result.name).toBe('자산관리');
    });

    it('존재하지 않는 parentId면 404', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = new DepartmentService(repo);
      await expect(svc.create({ name: 'HR', parentId: 'dept-999' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('유효한 parentId로 하위 부서 생성', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(fakeDept),
        create: jest.fn().mockResolvedValue(fakeChild),
      });
      const svc = new DepartmentService(repo);
      const result = await svc.create({ name: 'HR', parentId: 'dept-1' });
      expect(repo.create).toHaveBeenCalledWith({ name: 'HR', parentId: 'dept-1' });
      expect(result.parentId).toBe('dept-1');
    });
  });

  describe('delete', () => {
    it('하위 부서가 있으면 삭제 불가 409', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...fakeDept, children: [fakeChild] }),
      });
      const svc = new DepartmentService(repo);
      await expect(svc.delete('dept-1')).rejects.toMatchObject({ statusCode: 409 });
    });

    it('하위 부서 없으면 삭제 가능', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...fakeDept, children: [] }),
        delete: jest.fn().mockResolvedValue(fakeDept),
      });
      const svc = new DepartmentService(repo);
      await svc.delete('dept-1');
      expect(repo.delete).toHaveBeenCalledWith('dept-1');
    });
  });
});
