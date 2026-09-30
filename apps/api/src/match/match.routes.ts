import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import multer from "multer";
import { gcsUpload } from "../lib/gcs";
import { MatchController } from "./match.controller";
import { MatchService } from "./match.service";
import { MatchRepository } from "./match.repo";
import { MatchSquadRepository } from "./match.squad.repo";
import { MatchSquadService } from "./match.squad.service";
import { MatchSquadController } from "./match.squad.controller";
import { getPrisma } from "../lib/prisma";
import { MatchSubstitutionRepository } from "./match.substitution.repo";
import { MatchSubstitutionService } from "./match.substitution.service";
import { MatchSubstitutionController } from "./match.substitution.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new MatchRepository(getPrisma());
const service = new MatchService(repo);
const controller = new MatchController(service);


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("이미지 파일만 업로드할 수 있습니다."));
  },
});

// 경기 목록 조회 (?seasonId=&competitionType=)
router.get("/", auth, controller.getMatches);

// 경기 단건 조회 (선수 스탯 + 팀 스탯 포함)
router.get("/:id", auth, controller.getMatchById);

// 잔여석 조회 (전 직원 접근 가능)
router.get("/:id/remaining-capacity", auth, controller.getRemainingCapacity);

// 경기 생성 (ADMIN, FRONT_OFFICE)
router.post("/", auth, controller.createMatch);

// 경기 정보 수정 — 스코어 입력 포함 (ADMIN, FRONT_OFFICE)
router.patch("/:id", auth, controller.updateMatch);

// 스탯 시트 OCR 업로드 (ADMIN, COACHING_STAFF)
router.post("/:id/stat-sheet", auth, upload.single("image"), gcsUpload('stat-sheets'), controller.uploadStatSheet);

// 선수별 매치 스탯 입력/수정 (ADMIN, COACHING_STAFF)
router.put("/:id/player-stats", auth, controller.upsertPlayerStats);

// 팀 매치 스탯 입력/수정 (ADMIN, COACHING_STAFF)
router.put("/:id/team-stats", auth, controller.upsertTeamStats);

const squadRepo = new MatchSquadRepository(getPrisma());
const squadService = new MatchSquadService(squadRepo, getPrisma());
const squadController = new MatchSquadController(squadService);

router.get("/:id/squad", auth, squadController.getSquad);
router.post("/:id/squad", auth, squadController.addPlayer);
router.delete("/:id/squad", auth, squadController.removePlayer);
router.post("/:id/squad/confirm", auth, squadController.confirmSquad);

// 슈팅 이벤트
router.get("/:id/shots",             auth, controller.getShotEvents);
router.post("/:id/shots",            auth, controller.createShotEvent);
router.delete("/:id/shots/:eventId", auth, controller.deleteShotEvent);

import { MatchLineupRepository } from "./match.lineup.repo";
import { MatchLineupService } from "./match.lineup.service";
import { MatchLineupController } from "./match.lineup.controller";

const lineupRepo = new MatchLineupRepository(getPrisma());
const lineupService = new MatchLineupService(lineupRepo);
const lineupController = new MatchLineupController(lineupService);

router.get("/:id/lineup", auth, lineupController.getLineup);
router.put("/:id/lineup", auth, lineupController.saveLineup);
router.post("/:id/lineup/confirm", auth, lineupController.confirmLineup);

const subRepo = new MatchSubstitutionRepository(getPrisma());
const subService = new MatchSubstitutionService(subRepo, repo);
const subController = new MatchSubstitutionController(subService);

router.get("/:id/substitutions",           auth, subController.list);
router.post("/:id/substitutions",          auth, subController.create);
router.delete("/:id/substitutions/:subId", auth, subController.delete);

export default router;
