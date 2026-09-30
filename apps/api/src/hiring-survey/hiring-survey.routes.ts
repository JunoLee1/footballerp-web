import { Router } from 'express'
import { auth } from '../lib/authMiddleware'
import { requireReadHR, requireWriteHR } from '../lib/hrGuards'
import { getPrisma } from '../lib/prisma'
import { HiringSurveyRepository } from './hiring-survey.repo'
import { HiringSurveyService } from './hiring-survey.service'
import { HiringSurveyController } from './hiring-survey.controller'
import { PlanReportRepository } from '../plan-report/plan-report.repo'
import { NotificationRepository } from '../notification/notification.repo'
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter()
const prisma = getPrisma()
const repo = new HiringSurveyRepository(prisma)
const planReportRepo = new PlanReportRepository(prisma)
const notifRepo = new NotificationRepository(prisma)
const service = new HiringSurveyService(repo, planReportRepo, notifRepo)
const controller = new HiringSurveyController(service)

router.get('/', auth, requireReadHR, controller.list)
router.post('/', auth, requireWriteHR, controller.create)
router.get('/:id/participation-rate', auth, requireWriteHR, controller.getParticipationRate)
router.get('/:id', auth, requireReadHR, controller.get)

// Response workflow (issues #367/#368) — leader authorization is enforced by the
// service via `UserDepartment.role='LEADER'` for the target department, so no
// `requireWriteHR` gate here.
router.post('/:id/respond', auth, controller.createResponse)
router.patch('/:id/responses/:responseId', auth, controller.updateResponse)
router.post('/:id/responses/:responseId/submit', auth, controller.submitResponse)
router.post('/:id/responses/:responseId/approve', auth, controller.approveResponse)
router.post('/:id/responses/:responseId/reject', auth, controller.rejectResponse)

router.post('/:id/close', auth, requireWriteHR, controller.close)
router.patch('/:id', auth, requireWriteHR, controller.updateDraft)
router.post('/:id/open', auth, requireWriteHR, controller.open)
router.delete('/:id', auth, requireWriteHR, controller.deleteDraft)

export default router
