// apps/api/src/player/player.service.test.ts
import { PlayerService } from '../../src/player/player.service';
import { AppError } from '../../src/lib/appError';
import type { PlayerRepository } from '../../src/player/player.repo';
import type { MarketValueRepository } from '../../src/player/market-value.repo';

const makeRepo = (overrides: Partial<PlayerRepository> = {}): PlayerRepository =>
  ({
    findAll: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    promotePlayer: jest.fn(),
    updateWorkPermit: jest.fn(),
    delete: jest.fn(),
    getMatchStats: jest.fn(),
    getTrainingResults: jest.fn(),
    getPositionDiversity: jest.fn(),
    ...overrides,
  } as unknown as PlayerRepository);

const makeMvRepo = (overrides: Partial<MarketValueRepository> = {}): MarketValueRepository =>
  ({
    getHistory: jest.fn(),
    updateCurrentValue: jest.fn(),
    ...overrides,
  } as unknown as MarketValueRepository);

const ACTOR_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER_USER_ID = '22222222-2222-2222-2222-222222222222';

const PLAYER_STUB = {
  id: 'p1',
  playerName: '홍길동',
  clubId: 10,
  teamId: 1,
  status: 'ACTIVE',
  team: { id: 1, type: 'FIRST_TEAM' },
  userId: PLAYER_USER_ID,
};

// ─── updatePlayer ────────────────────────────────────────────────────────────

describe('PlayerService.updatePlayer — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo);
    await expect(service.updatePlayer('p1', {}, "cmxtestclub0000000000099")).rejects.toThrow(
      new AppError(404, 'PLAYER_NOT_FOUND'),
    );
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });

  it('같은 clubId면 repo.update 호출', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(PLAYER_STUB),
      update: jest.fn().mockResolvedValue(PLAYER_STUB),
    });
    const service = new PlayerService(repo);
    await service.updatePlayer('p1', { playerName: '김철수' }, "cmxtestclub00000000000010");
    expect(repo.update).toHaveBeenCalledWith('p1', { playerName: '김철수' });
  });

  it('actorClubId 미전달(null)이면 clubId 필터 없이 처리', async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(PLAYER_STUB),
      update: jest.fn().mockResolvedValue(PLAYER_STUB),
    });
    const service = new PlayerService(repo);
    await service.updatePlayer('p1', {}, null);
    expect(repo.findById).toHaveBeenCalledWith('p1', null);
  });
});

// ─── updatePlayerStatus ──────────────────────────────────────────────────────

describe('PlayerService.updatePlayerStatus — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo);
    await expect(service.updatePlayerStatus('p1', { status: 'RELEASED' }, ACTOR_ID, "cmxtestclub0000000000099")).rejects.toThrow(
      new AppError(404, 'PLAYER_NOT_FOUND'),
    );
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });
});

// ─── promotePlayer ───────────────────────────────────────────────────────────

describe('PlayerService.promotePlayer — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo);
    await expect(service.promotePlayer('p1', 2, ACTOR_ID, "cmxtestclub0000000000099")).rejects.toThrow(
      new AppError(404, 'PLAYER_NOT_FOUND'),
    );
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });
});

// ─── updateWorkPermit ────────────────────────────────────────────────────────

describe('PlayerService.updateWorkPermit — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo);
    await expect(
      service.updateWorkPermit('p1', { workPermitStatus: 'PENDING' }, "cmxtestclub0000000000099"),
    ).rejects.toThrow(new AppError(404, 'PLAYER_NOT_FOUND'));
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });
});

// ─── deletePlayer ────────────────────────────────────────────────────────────

describe('PlayerService.deletePlayer — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo);
    await expect(service.deletePlayer('p1', ACTOR_ID, "cmxtestclub0000000000099")).rejects.toThrow(
      new AppError(404, 'PLAYER_NOT_FOUND'),
    );
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });
});

// ─── updateMarketValue ───────────────────────────────────────────────────────

describe('PlayerService.updateMarketValue — clubId 스코핑', () => {
  it('다른 clubId면 PLAYER_NOT_FOUND 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new PlayerService(repo, makeMvRepo());
    await expect(service.updateMarketValue('p1', { value: 1000000 }, ACTOR_ID, "cmxtestclub0000000000099")).rejects.toThrow(
      new AppError(404, 'PLAYER_NOT_FOUND'),
    );
    expect(repo.findById).toHaveBeenCalledWith('p1', "cmxtestclub0000000000099");
  });
});
