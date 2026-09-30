import { ContactLogService } from "./contact-log.service";
import { AppError } from "../../lib/appError";
import type { ContactLogRepository } from "./contact-log.repo";
import type { PartnerRepository } from "../partner.repo";

const ACTOR_ID = "55555555-5555-5555-5555-555555555555";

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  partnerId: 10,
  channel: "CALL",
  contactedAt: new Date("2026-08-17"),
  actorId: ACTOR_ID,
  summary: "계약 갱신 논의",
  nextActionDate: null,
  nextActionNote: null,
  createdAt: new Date(),
  ...overrides,
});

const makeContactLogRepo = (overrides: Partial<ContactLogRepository> = {}): ContactLogRepository => ({
  create: jest.fn().mockResolvedValue(makeLog()),
  findAll: jest.fn().mockResolvedValue([]),
  ...overrides,
} as unknown as ContactLogRepository);

const makePartnerRepo = (overrides: Partial<PartnerRepository> = {}): PartnerRepository => ({
  findById: jest.fn().mockResolvedValue(null),
  findByName: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  createContract: jest.fn(),
  updateContract: jest.fn(),
  findContractById: jest.fn(),
  findExpiringContracts: jest.fn(),
  ...overrides,
} as unknown as PartnerRepository);

const makeService = (logRepo: ContactLogRepository, partnerRepo: PartnerRepository) =>
  new ContactLogService(logRepo, partnerRepo);

describe("ContactLogService.create", () => {
  it("throws 404 when partner not found", async () => {
    const service = makeService(makeContactLogRepo(), makePartnerRepo());
    await expect(
      service.create(99, { channel: "CALL", contactedAt: "2026-08-17", summary: "test" }, ACTOR_ID),
    ).rejects.toThrow(new AppError(404, "PARTNER_NOT_FOUND"));
  });

  it("throws 400 when nextActionDate provided without nextActionNote", async () => {
    const partnerRepo = makePartnerRepo({ findById: jest.fn().mockResolvedValue({ id: 10 }) });
    const service = makeService(makeContactLogRepo(), partnerRepo);
    await expect(
      service.create(10, { channel: "EMAIL", contactedAt: "2026-08-17", summary: "test", nextActionDate: "2026-08-20" }, ACTOR_ID),
    ).rejects.toThrow(new AppError(400, "NEXT_ACTION_NOTE_REQUIRED"));
  });

  it("creates log when valid", async () => {
    const partnerRepo = makePartnerRepo({ findById: jest.fn().mockResolvedValue({ id: 10 }) });
    const logRepo = makeContactLogRepo({ create: jest.fn().mockResolvedValue(makeLog()) });
    const service = makeService(logRepo, partnerRepo);
    await service.create(10, { channel: "CALL", contactedAt: "2026-08-17", summary: "논의" }, ACTOR_ID);
    expect(logRepo.create).toHaveBeenCalledWith(10, expect.objectContaining({ channel: "CALL", actorId: ACTOR_ID }));
  });
});

describe("ContactLogService.list", () => {
  it("throws 404 when partner not found", async () => {
    const service = makeService(makeContactLogRepo(), makePartnerRepo());
    await expect(service.list(99)).rejects.toThrow(new AppError(404, "PARTNER_NOT_FOUND"));
  });

  it("returns logs when partner exists", async () => {
    const partnerRepo = makePartnerRepo({ findById: jest.fn().mockResolvedValue({ id: 10 }) });
    const logRepo = makeContactLogRepo({ findAll: jest.fn().mockResolvedValue([makeLog()]) });
    const result = await makeService(logRepo, partnerRepo).list(10);
    expect(result).toHaveLength(1);
  });
});
