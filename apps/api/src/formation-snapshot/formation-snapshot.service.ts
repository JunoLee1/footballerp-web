import { FormationSnapshotRepository } from "./formation-snapshot.repo";
import type { CreateFormationSnapshotDto } from "./dto/formation-snapshot.dto";

export class FormationSnapshotService {
  constructor(private repo: FormationSnapshotRepository) {}

  create(dto: CreateFormationSnapshotDto, createdById: string) {
    return this.repo.create(dto, createdById);
  }

  findByMatch(matchId: string) {
    return this.repo.findByMatch(matchId);
  }

  remove(id: string) {
    return this.repo.remove(id);
  }
}
