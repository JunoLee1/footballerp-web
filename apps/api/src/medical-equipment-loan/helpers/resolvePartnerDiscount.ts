import { PrismaClient } from "../../generated/client";
import { getPrisma } from "../../lib/prisma";

export interface PartnerDiscountResult {
  partnerId: string | null;
  partnerContractId: number | null;
  sponsorshipId: number | null;
  discountRate: number; // 0~100
}

/**
 * EquipmentItem.partnerId 기반으로 파트너/스폰서 할인율 계산.
 *
 * 우선순위 (Grill Q5):
 *   1. Sponsorship ACTIVE (contractEnd > now) → discountRate 100 (무상)
 *   2. PartnerContract ACTIVE + discountRate 존재 → discountRate 사용
 *   3. 없음 → discountRate 0 (외부 유상)
 *
 * 주의 (Grill Q4): Sponsorship 은 attachedContract.partner 체인으로만 조회.
 * PartnerContract 없이 단독 존재하는 Sponsorship 은 매칭 불가 → 팀장 수동 override 필요.
 */
export async function resolvePartnerDiscount(
  equipmentItemId: string,
  tx?: Pick<PrismaClient, "equipmentItem" | "sponsorship" | "partnerContract">
): Promise<PartnerDiscountResult> {
  const client = tx ?? getPrisma();

  const item = await client.equipmentItem.findUnique({
    where: { id: equipmentItemId },
    select: { partnerId: true },
  });

  const partnerId = item?.partnerId ?? null;
  if (!partnerId) {
    return { partnerId: null, partnerContractId: null, sponsorshipId: null, discountRate: 0 };
  }

  const now = new Date();

  const sponsorship = await client.sponsorship.findFirst({
    where: {
      attachedContract: { partner: { id: partnerId } },
      contractEnd: { gt: now },
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { contractEnd: "desc" },
  });

  if (sponsorship) {
    return {
      partnerId,
      partnerContractId: null,
      sponsorshipId: sponsorship.id,
      discountRate: 100,
    };
  }

  const contract = await client.partnerContract.findFirst({
    where: {
      partnerId,
      status: "ACTIVE",
      discountRate: { not: null },
    },
    select: { id: true, discountRate: true },
    orderBy: { startDate: "desc" },
  });

  if (contract && contract.discountRate !== null) {
    return {
      partnerId,
      partnerContractId: contract.id,
      sponsorshipId: null,
      discountRate: Number(contract.discountRate),
    };
  }

  return { partnerId, partnerContractId: null, sponsorshipId: null, discountRate: 0 };
}
