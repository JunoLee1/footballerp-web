import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { getPrisma } from "../lib/prisma";
import { LeagueRepository } from "./league.repo";
import { LeagueService } from "./league.service";
import { LeagueController } from "./league.controller";
import { ClubRepository } from "../club/club.repo";
import { ClubService } from "../club/club.service";
import CountryRepository from "../country/country.repo";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();

const prisma = getPrisma();
const clubRepo = new ClubRepository(prisma);
const countryRepo = new CountryRepository(prisma);
const clubService = new ClubService(clubRepo, countryRepo);
const repo = new LeagueRepository(prisma);
const service = new LeagueService(repo, clubService);
const controller = new LeagueController(service);

router.get("/", auth, controller.list);
router.post("/", auth, controller.create);
router.get("/:id", auth, controller.get);
router.patch("/:id", auth, controller.update);
router.post("/:id/clubs", auth, controller.registerClub);
router.delete("/:id/clubs/:clubId", auth, controller.removeClub);

export default router;
