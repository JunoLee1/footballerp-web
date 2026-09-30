import { SoftwareLicenseService } from "./software-license.service";
import { AppError } from "../lib/appError";
import type { SoftwareLicenseRepository } from "./software-license.repo";

const makeRepo = (overrides: Partial<SoftwareLicenseRepository> = {}): SoftwareLicenseRepository => ({
  findById: jest.fn().mockResolvedValue(null),
  incrementSeats: jest.fn().mockResolvedValue({}),
  ...overrides,
} as unknown as SoftwareLicenseRepository);

describe("SoftwareLicenseService.assign", () => {
  it("throws 400 when all seats are used", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({ id: "cmxtestlicense0000000001", totalSeats: 5, usedSeats: 5 }),
    });
    const service = new SoftwareLicenseService(repo);
    await expect(service.assign("cmxtestlicense0000000001", 99))
      .rejects.toThrow(new AppError(400, "LICENSE_SEAT_EXCEEDED"));
  });

  it("increments usedSeats when a seat is available", async () => {
    const incrementSeats = jest.fn().mockResolvedValue({ id: "cmxtestlicense0000000001", usedSeats: 3 });
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({ id: "cmxtestlicense0000000001", totalSeats: 5, usedSeats: 2 }),
      incrementSeats,
    });
    const service = new SoftwareLicenseService(repo);
    await service.assign("cmxtestlicense0000000001", 99);
    expect(incrementSeats).toHaveBeenCalledWith("cmxtestlicense0000000001", 1);
  });
});
