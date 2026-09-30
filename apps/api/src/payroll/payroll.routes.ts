import { auth } from "../lib/authMiddleware";
// apps/api/src/payroll/payroll.routes.ts
import { Router } from "express";
import { getPrisma } from "../lib/prisma";
import { ConfigRepository } from "./config/config.repo";
import { ConfigService } from "./config/config.service";
import { ConfigController } from "./config/config.controller";
import { SalaryRepository } from "./salary/salary.repo";
import { SalaryService } from "./salary/salary.service";
import { SalaryController } from "./salary/salary.controller";
import { AllowanceRepository } from "./allowance/allowance.repo";
import { AllowanceService } from "./allowance/allowance.service";
import { AllowanceController } from "./allowance/allowance.controller";
import { RunRepository } from "./run/run.repo";
import { RunService } from "./run/run.service";
import { RunController } from "./run/run.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();

const prisma = getPrisma();

const configRepo = new ConfigRepository(prisma);
const salaryRepo = new SalaryRepository(prisma);
const allowanceRepo = new AllowanceRepository(prisma);
const runRepo = new RunRepository(prisma);

const configService = new ConfigService(configRepo);
const salaryService = new SalaryService(salaryRepo);
const allowanceService = new AllowanceService(allowanceRepo, salaryRepo);
const runService = new RunService(runRepo, salaryRepo, configRepo, prisma);

const configController = new ConfigController(configService);
const salaryController = new SalaryController(salaryService);
const allowanceController = new AllowanceController(allowanceService);
const runController = new RunController(runService);

// Config routes
router.get("/configs", auth, configController.list);
router.post("/configs", auth, configController.create);
router.patch("/configs/:id", auth, configController.update);

// Salary routes
router.get("/salaries", auth, salaryController.list);
router.post("/salaries", auth, salaryController.create);
router.get("/salaries/:id", auth, salaryController.get);
router.patch("/salaries/:id", auth, salaryController.update);

// Allowance sub-routes
router.get("/salaries/:id/allowances", auth, allowanceController.list);
router.post("/salaries/:id/allowances", auth, allowanceController.create);
router.patch("/salaries/:id/allowances/:aid", auth, allowanceController.update);
router.delete("/salaries/:id/allowances/:aid", auth, allowanceController.remove);

// Run sub-routes
router.get("/salaries/:id/runs", auth, runController.list);
router.post("/salaries/:id/runs", auth, runController.create);
router.patch("/salaries/:id/runs/:runId", auth, runController.confirm);
router.post("/salaries/:id/runs/:runId/second-approve", auth, runController.secondApprove);

export default router;
