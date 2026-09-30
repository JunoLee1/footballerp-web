import { FormationSnapshotRepository } from "./formation-snapshot.repo";
import type { CreateFormationSnapshotDto } from "./dto/formation-snapshot.dto";

export class FormationSnapshotService {
  constructor(private repo: FormationSnapshotRepository) {}

  create(dto: CreateFormationSnapshotDto, createdById: string) {
    return this.repo.create(dto, createdById);
  }

  findByMatch(matchId: number) {
    return this.repo.findByMatch(matchId);
  }

  remove(id: number) {
    return this.repo.remove(id);
  }
}
