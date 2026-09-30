jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../src/lib/prisma', () => ({ getPrisma: jest.fn().mockReturnValue({}) }));

import { runInspectionDueAlert } from '../../src/jobs/inspectionDueAlert';

describe('runInspectionDueAlert', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      equipmentUnit: { findMany: jest.fn() },
      notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      user: { findMany: jest.fn() },
    };
  });

  it('creates notifications for units due within 7 days', async () => {
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    mockPrisma.equipmentUnit.findMany.mockResolvedValue([
      { id: 10, item: { name: 'Training Vest' }, nextInspectionDue: dueDate },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000001" }]);

    await runInspectionDueAlert(mockPrisma);

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000001" }) })
    );
  });

  it('does nothing when no units are due', async () => {
    mockPrisma.equipmentUnit.findMany.mockResolvedValue([]);

    await runInspectionDueAlert(mockPrisma);

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
