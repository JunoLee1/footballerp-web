import { AnalysisRepository } from "./analysis.repo";
import { AppError } from "../lib/appError";
import { CompetitionType } from "../generated/enums";

export interface RankingEntry {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
} //DTO 타입파일로 이동 해도 될듯

const VALID_COMPETITION_TYPES = Object.values(CompetitionType);

export class AnalysisService {
  constructor(private repo: AnalysisRepository) {}

  async getRankings(seasonId: number, competitionType: CompetitionType): Promise<RankingEntry[]> {
    if (!VALID_COMPETITION_TYPES.includes(competitionType)) {
      throw new AppError(400, "INVALID_COMPETITION_TYPE");
    }

    const matches = await this.repo.findCompletedMatches(seasonId, competitionType);

    const table = new Map<string, { won: number; drawn: number; lost: number; gf: number; ga: number }>();

    const ensureTeam = (name: string) => {
      if (!table.has(name)) {
        table.set(name, { won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 });
      }
    };

    for (const match of matches) {
      ensureTeam(match.homeTeamName);
      ensureTeam(match.awayTeamName);

      const home = table.get(match.homeTeamName)!;
      const away = table.get(match.awayTeamName)!;

      home.gf += match.homeScore;
      home.ga += match.awayScore;
      away.gf += match.awayScore;
      away.ga += match.homeScore;

      if (match.homeScore > match.awayScore) {
        home.won += 1;
        away.lost += 1;
      } else if (match.homeScore < match.awayScore) {
        away.won += 1;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
      }
    }

    const rows = Array.from(table.entries())
      .map(([teamName, stats]) => ({
        teamName,
        played: stats.won + stats.drawn + stats.lost,
        won: stats.won,
        drawn: stats.drawn,
        lost: stats.lost,
        goalsFor: stats.gf,
        goalsAgainst: stats.ga,
        goalDiff: stats.gf - stats.ga,
        points: stats.won * 3 + stats.drawn,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
        return b.goalsFor - a.goalsFor;
      });

    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  }
}
