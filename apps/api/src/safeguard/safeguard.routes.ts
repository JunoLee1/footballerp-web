import { auth } from "../lib/authMiddleware";
import { isAdminLike } from "../lib/permissions";
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { SafeguardController } from './safeguard.controller'
import { SafeguardService } from './safeguard.service'
import { SafeguardRepository } from './safeguard.repo'
import { NotificationRepository } from '../notification/notification.repo'
import { getPrisma } from '../lib/prisma'
import { cuidRouter } from "../lib/cuidGuard";

const router = cuidRouter()
const prisma = getPrisma()
const repo = new SafeguardRepository(prisma)
const notifRepo = new NotificationRepository(prisma)
const service = new SafeguardService(repo, notifRepo)
const controller = new SafeguardController(service)

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5,
  message: { code: 'TOO_MANY_REQUESTS' },
  standardHeaders: true,
  legacyHeaders: false,
})

function adminOnly(req: any, res: any, next: any) {
  if (!isAdminLike(req.user?.role)) return res.status(403).json({ message: 'Forbidden' })
  next()
}

// 익명 제출 — 인증 불필요 (15분에 5회 제한)
router.post('/', submitLimiter, controller.submit)

// 관리자 전용
router.get('/', auth, adminOnly, controller.getAll)
router.get('/:id', auth, adminOnly, controller.getById)
router.patch('/:id/status', auth, adminOnly, controller.updateStatus)

export default router
