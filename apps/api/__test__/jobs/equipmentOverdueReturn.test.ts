jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../src/lib/prisma', () => ({ getPrisma: jest.fn().mockReturnValue({}) }));

import { runEquipmentOverdueReturnJob } from '../../src/jobs/equipmentOverdueReturn';

describe('runEquipmentOverdueReturnJob', () => {
  let repo: any;
  let notifRepo: any;

  beforeEach(() => {
    repo = {
      findLoansToNotifyOverdue: jest.fn(),
      findEquipmentManagers: jest.fn().mockResolvedValue([]),
      markOverdueNotified: jest.fn().mockResolvedValue({ count: 0 }),
    };
    notifRepo = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };
  });

  it('연체 대여 없으면 아무것도 안 함', async () => {
    repo.findLoansToNotifyOverdue.mockResolvedValue([]);

    const result = await runEquipmentOverdueReturnJob(new Date(), { repo, notifRepo });

    expect(result.notified).toBe(0);
    expect(notifRepo.create).not.toHaveBeenCalled();
    expect(repo.markOverdueNotified).not.toHaveBeenCalled();
  });

  it('연체 대여 → 신청자·승인자·장비관리자에게 알림 + overdueNotifiedAt 세팅', async () => {
    const now = new Date('2026-10-01T08:00:00Z');
    const dueDate = new Date('2026-09-25T00:00:00Z'); // 6 days late
    repo.findLoansToNotifyOverdue.mockResolvedValue([
      {
        id: 100,
        dueDate,
        requestedById: "00000000-0000-4000-8000-000000000005",
        approvedById: "00000000-0000-4000-8000-000000000010",
        equipmentItem: { name: '훈련화' },
      },
    ]);
    repo.findEquipmentManagers.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000020" }, { id: "00000000-0000-4000-8000-000000000021" }]);

    const result = await runEquipmentOverdueReturnJob(now, { repo, notifRepo });

    expect(result.notified).toBe(1);
    // 4 recipients: borrower(5) + approver(10) + managers(20, 21)
    expect(notifRepo.create).toHaveBeenCalledTimes(4);
    const recipients = notifRepo.create.mock.calls.map((c: any[]) => c[0].userId).sort();
    expect(recipients).toEqual([
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000020",
      "00000000-0000-4000-8000-000000000021",
    ]);
    expect(notifRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EQUIPMENT_RETURN_OVERDUE',
        entityId: 100,
        body: expect.stringContaining('6일'),
      }),
    );
    expect(repo.markOverdueNotified).toHaveBeenCalledWith([100], now);
  });

  it('승인자 없으면 중복 없이 신청자·매니저만 알림', async () => {
    repo.findLoansToNotifyOverdue.mockResolvedValue([
      {
        id: 101,
        dueDate: new Date('2026-09-30T00:00:00Z'),
        requestedById: "00000000-0000-4000-8000-000000000005",
        approvedById: null,
        equipmentItem: { name: '공' },
      },
    ]);
    repo.findEquipmentManagers.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000020" }]);

    await runEquipmentOverdueReturnJob(new Date('2026-10-01T08:00:00Z'), { repo, notifRepo });

    expect(notifRepo.create).toHaveBeenCalledTimes(2);
    const recipients = notifRepo.create.mock.calls.map((c: any[]) => c[0].userId).sort();
    expect(recipients).toEqual([
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000020",
    ]);
  });

  it('신청자가 매니저 겸직이어도 중복 발송 안 함', async () => {
    repo.findLoansToNotifyOverdue.mockResolvedValue([
      {
        id: 102,
        dueDate: new Date('2026-09-30T00:00:00Z'),
        requestedById: "00000000-0000-4000-8000-000000000020", // 매니저 겸직
        approvedById: null,
        equipmentItem: { name: '공' },
      },
    ]);
    repo.findEquipmentManagers.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000020" }]);

    await runEquipmentOverdueReturnJob(new Date('2026-10-01T08:00:00Z'), { repo, notifRepo });

    expect(notifRepo.create).toHaveBeenCalledTimes(1);
    expect(notifRepo.create.mock.calls[0][0].userId).toBe("00000000-0000-4000-8000-000000000020");
  });
});
