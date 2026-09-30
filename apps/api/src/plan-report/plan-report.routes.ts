import { Router } from 'express'
import multer from 'multer'
import { gcsUpload } from '../lib/gcs'
import { PlanReportController } from './plan-report.controller'
import { PlanReportService } from './plan-report.service'
import { PlanReportRepository } from './plan-report.repo'
import { NotificationRepository } from '../notification/notification.repo'
import { RecruitmentRepository } from '../recruitment/recruitment.repo'
import { RecruitmentService } from '../recruitment/recruitment.service'
import { auth } from '../lib/authMiddleware'
import { requireReadHR, requireWriteHR } from '../lib/hrGuards'
import { getPrisma } from '../lib/prisma'
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter()
const prisma = getPrisma()
const repo = new PlanReportRepository(prisma)
const notifRepo = new NotificationRepository(prisma)
const service = new PlanReportService(repo, notifRepo)
const recruitmentRepo = new RecruitmentRepository(prisma)
const recruitmentService = new RecruitmentService(recruitmentRepo, notifRepo, repo)
const controller = new PlanReportController(service, repo, recruitmentService)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.get('/', auth, requireReadHR, controller.list)
router.get('/approved-hr', auth, requireReadHR, controller.listApprovedHr)
router.get('/:id', auth, requireReadHR, controller.getById)
router.post('/', auth, requireWriteHR, controller.create)
router.put('/:id', auth, requireWriteHR, controller.update)
router.post('/:id/submit', auth, requireWriteHR, controller.submit)
router.post('/:id/approve', auth, requireWriteHR, controller.approve)
router.post('/:id/reject', auth, requireWriteHR, controller.reject)
router.post('/:id/result', auth, requireWriteHR, controller.submitResult)
router.post('/upload', auth, upload.single('file'), gcsUpload('plan-reports'), controller.uploadAttachment)
router.get('/:id/hiring-items', auth, requireReadHR, controller.listHiringItems)
router.post('/:id/hiring-items', auth, requireWriteHR, controller.createHiringItem)
router.patch('/:id/hiring-items/:itemId', auth, requireWriteHR, controller.updateHiringItem)
router.patch('/:id/hiring-items/:itemId/cancel', auth, requireWriteHR, controller.cancelHiringItem)
router.delete('/:id/hiring-items/:itemId', auth, requireWriteHR, controller.deleteHiringItem)
router.post('/:id/publish-postings', auth, requireWriteHR, controller.publishPostings)

export default router
