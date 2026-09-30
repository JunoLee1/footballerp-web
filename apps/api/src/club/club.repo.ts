import { PrismaClient } from "../generated/client";
import { CreateClubDto, UpdateClubDto } from "./club.dto";

const CLUB_SELECT = {
  id: true,
  name: true,
  isActive: true,
  isLite: true,
  countryId: true,
  ownerEmail: true,
  businessRegNumber: true,
  companyNumber: true,
  vatNumber: true,
  createdAt: true,
  country: { select: { id: true, code: true, name: true } },
  teams: { select: { id: true, name: true, type: true, isActive: true } },
} as const;

export class ClubRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.club.findMany({ select: CLUB_SELECT, orderBy: { name: "asc" } });
  }

  findById(id: string) {
    return this.prisma.club.findUnique({ where: { id }, select: CLUB_SELECT });
  }

  findByIds(ids: string[]) {
    return this.prisma.club.findMany({ where: { id: { in: ids } }, select: CLUB_SELECT });
  }

  findByName(name: string) {
    return this.prisma.club.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
  }

  findByOwnerEmail(email: string) {
    return this.prisma.club.findFirst({
      where: { ownerEmail: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
  }

  create(dto: CreateClubDto) {
    return this.prisma.club.create({
      data: {
        name: dto.name,
        countryId: dto.countryId,
        ...(dto.ownerEmail !== undefined && { ownerEmail: dto.ownerEmail }),
        ...(dto.businessRegNumber !== undefined && { businessRegNumber: dto.businessRegNumber }),
        ...(dto.companyNumber !== undefined && { companyNumber: dto.companyNumber }),
        ...(dto.vatNumber !== undefined && { vatNumber: dto.vatNumber }),
      },
      select: CLUB_SELECT,
    });
  }

  update(id: string, dto: UpdateClubDto) {
    return this.prisma.club.update({ where: { id }, data: dto, select: CLUB_SELECT });
  }

  cascadeIsLite(clubId: string, isLite: boolean) {
    return this.prisma.$transaction([
      this.prisma.club.update({ where: { id: clubId }, data: { isLite }, select: CLUB_SELECT }),
      this.prisma.team.updateMany({ where: { clubId }, data: { isLite } }),
    ])
  }
}
