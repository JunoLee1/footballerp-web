import type { PrismaClient, AccountCodeType } from "../generated/client";

export class AccountCodeRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.accountCode.findMany({ orderBy: { code: "asc" } });
  }

  create(data: { code: string; name: string; type: AccountCodeType }) {
    return this.prisma.accountCode.create({ data });
  }

  update(id: string, data: { name?: string; type?: AccountCodeType }) {
    return this.prisma.accountCode.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.accountCode.delete({ where: { id } });
  }
}
