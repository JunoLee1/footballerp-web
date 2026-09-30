import { PrismaClient } from "../generated/client";

export interface CreateTeamDto {
  name: string;
  type: "FIRST_TEAM" | "B_TEAM" | "YOUTH";
  ageGroup?: string;
  trackStats?: boolean;
  requiresContract?: boolean;
  clubId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  ageGroup?: string;
  trackStats?: boolean;
  requiresContract?: boolean;
  isActive?: boolean;
  clubId?: string | null;
}

export class TeamRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(clubId?: string | null) {
    return this.prisma.team.findMany({
      ...(clubId != null && { where: { clubId } }),
      include: { club: { select: { id: true, name: true, isLite: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  findById(id: number) {
    return this.prisma.team.findUnique({
      where: { id },
      include: { club: { select: { id: true, name: true, isLite: true } } },
    });
  }

  create(dto: CreateTeamDto) {
    return this.prisma.team.create({
      data: {
        name: dto.name,
        type: dto.type,
        ageGroup: dto.ageGroup ?? null,
        trackStats: dto.trackStats ?? true,
        requiresContract: dto.requiresContract ?? true,
        clubId: dto.clubId ?? null,
      },
      include: { club: { select: { id: true, name: true, isLite: true } } },
    });
  }

  findClubById(id: string) {
    return this.prisma.club.findUnique({ where: { id }, select: { id: true } });
  }

  findActiveByNameAndClub(name: string, clubId: string, excludeId?: number) {
    return this.prisma.team.findFirst({
      where: {
        name,
        clubId,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  update(id: number, dto: UpdateTeamDto) {
    return this.prisma.team.update({
      where: { id },
      data: dto,
      include: { club: { select: { id: true, name: true, isLite: true } } },
    });
  }


}
