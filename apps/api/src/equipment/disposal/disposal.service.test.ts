import { DisposalService } from "./disposal.service";
import { AppError } from "../../lib/appError";
import type { DisposalRepository } from "./disposal.repo";

const makeUnit = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  status: "AVAILABLE",
  isHighValue: false,
  disposedAt: null,
  ...overrides,
});

const makeVerification = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  equipmentId: 1,
  requestedById: "11111111-1111-1111-1111-111111111111",
  verifiedById: null,
  verifiedAt: null,
  photoUrl: null,
  checklistOk: false,
  notes: null,
  status: "PENDING",
  createdAt: new Date(),
  equipment: makeUnit(),
  ...overrides,
});

const makeRepo = (overrides: Partial<DisposalRepository> = {}): DisposalRepository => ({
  findUnitById:       jest.fn().mockResolvedValue(null),
  findVerification:   jest.fn().mockResolvedValue(null),
  createVerification: jest.fn(),
  fmVerify:           jest.fn(),
  gmApprove:          jest.fn(),
  rejectVerification: jest.fn(),
  updateUnitDisposed: jest.fn(),
  ...overrides,
} as unknown as DisposalRepository);

const makeService = (repo: DisposalRepository) => new DisposalService(repo);

describe("DisposalService.requestDisposal", () => {
  it("throws 404 when unit not found", async () => {
    await expect(makeService(makeRepo()).requestDisposal("cmxtestequnit0000000000099", "11111111-1111-1111-1111-111111111111"))
      .rejects.toThrow(new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND"));
  });

  it("throws 409 when already RETIRED", async () => {
    const repo = makeRepo({ findUnitById: jest.fn().mockResolvedValue(makeUnit({ status: "RETIRED" })) });
    await expect(makeService(repo).requestDisposal("cmxtestequnit0000000000001", "11111111-1111-1111-1111-111111111111"))
      .rejects.toThrow(new AppError(409, "UNIT_ALREADY_RETIRED"));
  });

  it("throws 409 when pending verification exists", async () => {
    const repo = makeRepo({
      findUnitById:     jest.fn().mockResolvedValue(makeUnit()),
      findVerification: jest.fn().mockResolvedValue(makeVerification({ status: "PENDING" })),
    });
    await expect(makeService(repo).requestDisposal("cmxtestequnit0000000000001", "11111111-1111-1111-1111-111111111111"))
      .rejects.toThrow(new AppError(409, "DISPOSAL_VERIFICATION_PENDING"));
  });

  it("calls createVerification when valid", async () => {
    const repo = makeRepo({
      findUnitById:       jest.fn().mockResolvedValue(makeUnit()),
      findVerification:   jest.fn().mockResolvedValue(null),
      createVerification: jest.fn().mockResolvedValue(makeVerification()),
    });
    await makeService(repo).requestDisposal("cmxtestequnit0000000000001", "11111111-1111-1111-1111-111111111111");
    expect(repo.createVerification).toHaveBeenCalledWith(1, "11111111-1111-1111-1111-111111111111");
  });
});

describe("DisposalService.fmVerify", () => {
  it("throws 404 when verification not found", async () => {
    await expect(makeService(makeRepo()).fmVerify("cmxtestequnit0000000000099", "22222222-2222-2222-2222-222222222222", {}))
      .rejects.toThrow(new AppError(404, "DISPOSAL_VERIFICATION_NOT_FOUND"));
  });

  it("throws 400 when not PENDING", async () => {
    const repo = makeRepo({ findVerification: jest.fn().mockResolvedValue(makeVerification({ status: "FM_VERIFIED" })) });
    await expect(makeService(repo).fmVerify("cmxtestequnit0000000000001", "22222222-2222-2222-2222-222222222222", {}))
      .rejects.toThrow(new AppError(400, "INVALID_VERIFICATION_STATUS"));
  });

  it("throws 400 when high-value and no photoUrl", async () => {
    const repo = makeRepo({
      findVerification: jest.fn().mockResolvedValue(
        makeVerification({ status: "PENDING", equipment: makeUnit({ isHighValue: true }) })
      ),
    });
    await expect(makeService(repo).fmVerify("cmxtestequnit0000000000001", "22222222-2222-2222-2222-222222222222", {}))
      .rejects.toThrow(new AppError(400, "PHOTO_REQUIRED_FOR_HIGH_VALUE"));
  });

  it("calls fmVerify and updateUnitDisposed for normal equipment", async () => {
    const repo = makeRepo({
      findVerification: jest.fn().mockResolvedValue(
        makeVerification({ status: "PENDING", equipment: makeUnit({ isHighValue: false }) })
      ),
      fmVerify:           jest.fn().mockResolvedValue(makeVerification({ status: "FM_VERIFIED" })),
      updateUnitDisposed: jest.fn(),
    });
    await makeService(repo).fmVerify("cmxtestequnit0000000000001", "22222222-2222-2222-2222-222222222222", { checklistOk: true });
    expect(repo.fmVerify).toHaveBeenCalled();
    expect(repo.updateUnitDisposed).toHaveBeenCalledWith(1, "22222222-2222-2222-2222-222222222222");
  });

  it("does NOT call updateUnitDisposed for high-value equipment (awaits GM)", async () => {
    const repo = makeRepo({
      findVerification: jest.fn().mockResolvedValue(
        makeVerification({ status: "PENDING", equipment: makeUnit({ isHighValue: true }) })
      ),
      fmVerify:           jest.fn().mockResolvedValue(makeVerification({ status: "FM_VERIFIED" })),
      updateUnitDisposed: jest.fn(),
    });
    await makeService(repo).fmVerify("cmxtestequnit0000000000001", "22222222-2222-2222-2222-222222222222", { photoUrl: "https://example.com/photo.jpg" });
    expect(repo.fmVerify).toHaveBeenCalled();
    expect(repo.updateUnitDisposed).not.toHaveBeenCalled();
  });
});
