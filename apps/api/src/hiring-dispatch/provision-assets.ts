import type { PrismaClient } from "../generated/client";
import type { NotificationRepository } from "../notification/notification.repo";

/**
 * #373 신입 자동 자산 프로비저닝.
 *
 * `HiringDispatch.dispatch()` 성공 후 fire-and-forget 훅으로 호출됨.
 *   - **Fire-and-forget:** 예외가 밖으로 새어 dispatch 트랜잭션을 되돌리는 일이
 *     없도록 호출부에서 `.catch(console.error)` 로 감쌈 (Q9-C, grill c1).
 *   - **재고 무시:** grill Q1 결정에 따라 draft 는 재고와 무관하게 항상 생성.
 *     재고 부족 시 `ASSET_MANAGER` 알림만 발송하고 draft 는 그대로 살려둠.
 *   - **kit 없는 부서:** 조용히 no-op (에러 아님). 기본 자산 자동 지급이
 *     선택 사양이라는 grill a1 의 결정을 반영.
 *
 * Draft AssetRequest 는 신입 계정(`dispatch.createdUserId`)으로 생성되고
 * (`requesterId = 신입.userId`, `status = DRAFT`, `isAutoProvisioned = true`)
 * 신입이 최초 로그인 후 편집 → SUBMIT 하면 기존 asset-request 워크플로우
 * (LEADER → DEPT_HEAD → APPROVED → FULFILLED) 를 그대로 탐. 예산 검증은
 * submit 시점(기존 로직 재사용, grill f1) — provisioning 은 순수한 draft
 * 생성기.
 *
 * DI 시그니처: `(prisma, notifRepo)` 를 인자로 받아 훅 위치에서 조립. 별도
 * 클래스로 감싸지 않은 이유는 이 함수가 상태를 갖지 않고, 테스트에서
 * `PrismaClient` mock 을 그대로 밀어넣을 수 있기 때문.
 */

interface KitItem {
  equipmentItemId: string;
  quantity: number;
  note?: string;
}

interface ShortageReport {
  equipmentItemId: string;
  name: string;
  requested: number;
  available: number;
}

export async function provisionNewEmployeeAssets(
  prisma: PrismaClient,
  notifRepo: NotificationRepository,
  dispatchId: number,
): Promise<void> {
  // 1. Dispatch 컨텍스트 로드 — 신입 유저 id + 부서 id + 후보자 이름
  //    (알림 본문에 candidate name 을 담아 ASSET_MANAGER 가 어떤 dispatch 인지
  //    바로 알아볼 수 있게).
  const dispatch = await prisma.hiringDispatch.findUnique({
    where: { id: dispatchId },
    select: {
      id: true,
      candidateName: true,
      departmentId: true,
      createdUserId: true,
    },
  });
  if (!dispatch) return;
  if (!dispatch.createdUserId) return; // dispatch 실행 실패 시 방어

  // 2. 부서 default kit — 없으면 종료 (선택 사양).
  const kit = await prisma.departmentDefaultAssetKit.findUnique({
    where: { departmentId: dispatch.departmentId },
    select: { assetItems: true, defaultExpenseCategoryId: true },
  });
  if (!kit) return;

  const rawItems = kit.assetItems;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return;
  const items = rawItems as unknown as KitItem[];

  // 3. EquipmentItem 스톡 조회 — 삭제된 EquipmentItem 참조는 건너뜀
  //    (draft 만들면 asset-request FK 에서 raise 나므로 미리 필터링).
  const equipmentIds = items.map((i) => i.equipmentItemId);
  const stockRows = await prisma.equipmentItem.findMany({
    where: { id: { in: equipmentIds } },
    select: {
      id: true,
      name: true,
      quantity: true,
      trackedIndividually: true,
    },
  });
  const stockById = new Map(stockRows.map((s) => [s.id, s]));

  // 4. 개별 unit 트래킹 아이템은 AVAILABLE unit 카운트로 재고 판단.
  //    한 번의 groupBy 로 배치 조회 (아이템별 count 를 loop 안에서 치면
  //    N+1 쿼리 폭발).
  const trackedIds = stockRows
    .filter((s) => s.trackedIndividually)
    .map((s) => s.id);
  const availableUnitsByItem = new Map<string, number>();
  if (trackedIds.length > 0) {
    const grouped = await prisma.equipmentUnit.groupBy({
      by: ["equipmentItemId"],
      where: {
        equipmentItemId: { in: trackedIds },
        status: "AVAILABLE",
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      availableUnitsByItem.set(row.equipmentItemId, row._count._all);
    }
  }

  // 5. 각 kit item 마다 draft 생성 (재고 무관) + 부족 여부 기록.
  const shortages: ShortageReport[] = [];
  const createdRequestIds: number[] = []; // AssetRequest.id (Int) — 그대로 유지
  for (const kitItem of items) {
    const stock = stockById.get(kitItem.equipmentItemId);
    if (!stock) continue; // EquipmentItem 삭제됨 — skip (draft 는 FK 위반 방지)

    const justification =
      `신입 자동 프로비저닝 (${dispatch.candidateName})` +
      (kitItem.note ? ` — ${kitItem.note}` : "");

    const created = await prisma.assetRequest.create({
      data: {
        requesterId: dispatch.createdUserId,
        departmentId: dispatch.departmentId,
        type: "HARDWARE",
        status: "DRAFT",
        equipmentItemId: kitItem.equipmentItemId,
        expenseCategoryId: kit.defaultExpenseCategoryId,
        // 신입이 draft 편집 시 실제 견적 금액을 입력. 자동 생성 시점의
        // 기본값은 0 — expectedAmount 는 non-null Int 필드이므로 필수.
        expectedAmount: 0,
        justification,
        isAutoProvisioned: true,
        provisionedFromDispatchId: dispatchId,
      },
      select: { id: true },
    });
    createdRequestIds.push(created.id);

    // 재고 부족 판정. trackedIndividually 여부에 따라 quantity 필드 또는
    // AVAILABLE unit 카운트를 사용. quantity 필드가 null 이면 0 으로 취급
    // (수량 미관리 = 재고 없음 취급).
    let available = 0;
    if (stock.trackedIndividually) {
      available = availableUnitsByItem.get(stock.id) ?? 0;
    } else {
      available = stock.quantity ?? 0;
    }
    if (available < kitItem.quantity) {
      shortages.push({
        equipmentItemId: stock.id,
        name: stock.name,
        requested: kitItem.quantity,
        available,
      });
    }
  }

  // 6. 재고 부족 시 ASSET_MANAGER 알림 발송. 알림 실패해도 dispatch 는
  //    이미 성공. 알림 자체를 fire-and-forget 로 감쌈.
  if (shortages.length > 0) {
    const shortageLine = shortages
      .map((s) => `${s.name} (요청 ${s.requested}, 가용 ${s.available})`)
      .join(", ");
    void notifRepo
      .createForAssetManager(
        "PROVISIONING_LOW_STOCK",
        (lang) => ({
          title:
            lang === "en"
              ? "Provisioning Low Stock Alert"
              : "신입 프로비저닝 재고 부족 경보",
          body:
            lang === "en"
              ? `Hiring dispatch #${dispatchId} (${dispatch.candidateName}) provisioning is short on stock: ${shortageLine}. ${createdRequestIds.length} draft asset request(s) created.`
              : `발령 #${dispatchId} (${dispatch.candidateName}) 신입 프로비저닝 재고 부족: ${shortageLine}. 자동 생성 DRAFT ${createdRequestIds.length}건.`,
        }),
        dispatchId,
      )
      .catch((err) => console.error("[provisionNewEmployeeAssets] notify failed", err));
  }
}
