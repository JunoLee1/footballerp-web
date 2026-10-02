import { PrismaClient } from "../generated/client";

export class AgencyRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, contactName: true, phone: true,
        email: true, commissionRate: true, createdAt: true,
        _count: { select: { players: true, contracts: true } },
      },
    });
  }

  findById(id: number) {
    return this.prisma.agency.findUnique({
      where: { id },
      select: {
        id: true, name: true, contactName: true, phone: true,
        email: true, commissionRate: true, createdAt: true, updatedAt: true,
        players: {
          select: { id: true, playerName: true, position: true, status: true },
          orderBy: { playerName: "asc" },
        },
        contracts: {
          select: {
            id: true, startDate: true, endDate: true, status: true,
            agencyCommission: true,
            player: { select: { id: true, playerName: true } },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });
  }

  create(data: { name: string; contactName?: string; phone?: string; email?: string; commissionRate?: number }) {
    return this.prisma.agency.create({
      data: {
        name: data.name,
        contactName: data.contactName ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        commissionRate: data.commissionRate ?? null,
      },
      select: { id: true, name: true, contactName: true, phone: true, email: true, commissionRate: true, createdAt: true },
    });
  }

  update(id: number, data: { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; commissionRate?: number | null }) {
    return this.prisma.agency.update({
      where: { id },
      data,
      select: { id: true, name: true, contactName: true, phone: true, email: true, commissionRate: true, updatedAt: true },
    });
  }

  delete(id: number) {
    return this.prisma.agency.delete({ where: { id } });
  }

  hasLinkedData(id: number) {
    return this.prisma.agency.findUnique({
      where: { id },
      select: { _count: { select: { players: true, contracts: true } } },
    });
  }
}
