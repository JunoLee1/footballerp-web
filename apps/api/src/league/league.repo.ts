import { PrismaClient } from "../generated/client";
import { LeagueLevel } from "../generated/enums";
import { CreateLeagueDto, UpdateLeagueDto } from "./league.dto";

const LEAGUE_SELECT = {
  id: true,
  name: true,
  level: true,
  year: true,
  isActive: true,
  confederation: true,
  createdAt: true,
  country: { select: { id: true, name: true, code: true } },
  clubs: {
    select: {
      clubId: true,
      joinedAt: true,
      club: { select: { id: true, name: true } },
    },
  },
} as const;

export class LeagueRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.league.findMany({
      select: LEAGUE_SELECT,
      orderBy: [{ year: "desc" }, { level: "asc" }],
    });
  }

  findById(id: number) {
    return this.prisma.league.findUnique({ where: { id }, select: LEAGUE_SELECT });
  }

  findByLevelAndYear(level: LeagueLevel, year: number) {
    return this.prisma.league.findUnique({
      where: { level_year: { level, year } },
      select: { id: true },
    });
  }

  findClubLeague(leagueId: number, clubId: string) {
    return this.prisma.clubLeague.findUnique({
      where: { clubId_leagueId: { clubId, leagueId } },
      select: { clubId: true },
    });
  }

  create(dto: CreateLeagueDto) {
    return this.prisma.league.create({
      data: {
        name: dto.name,
        level: dto.level,
        year: dto.year,
        ...(dto.countryId !== undefined && { countryId: dto.countryId }),
        ...(dto.confederation !== undefined && { confederation: dto.confederation }),
      },
      select: LEAGUE_SELECT,
    });
  }

  update(id: number, dto: UpdateLeagueDto) {
    return this.prisma.league.update({ where: { id }, data: dto, select: LEAGUE_SELECT });
  }

  addClub(leagueId: number, clubId: string) {
    return this.prisma.clubLeague.create({ data: { leagueId, clubId } });
  }

  removeClub(leagueId: number, clubId: string) {
    return this.prisma.clubLeague.delete({
      where: { clubId_leagueId: { clubId, leagueId } },
    });
  }
}
