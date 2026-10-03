import type { Request, Response, NextFunction } from 'express'
import type { PlanReportService } from './plan-report.service'
import { PlanReportRepository } from './plan-report.repo'
import type { RecruitmentService } from '../recruitment/recruitment.service'
import { HiringPlanItemStatus } from '../generated/enums'
import { AppError } from '../lib/appError'
import { isAdminLike } from '../lib/permissions'
import { assertCuid } from "../lib/cuidGuard";

const HIRING_PLAN_ITEM_STATUSES = Object.values(HiringPlanItemStatus) as string[]

export class PlanReportController {
  constructor(
    private service: PlanReportService,
    private repo: PlanReportRepository,
    private recruitmentService: RecruitmentService,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = req.query?.filter as string | undefined
      const role = req.user?.role ?? ''
      // pending-* 큐 는 GM/ADMIN 계층 전용
      if (filter && String(filter).startsWith('pending-') && !isAdminLike(role)) {
        throw new AppError(403, 'FORBIDDEN')
      }
      res.json(await this.service.list(req.query))
    } catch (e) { next(e) }
  }

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getById(assertCuid(req.params.id)))
    } catch (e) { next(e) }
  }

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.create(req.body, req.user!.id))
    } catch (e) { next(e) }
  }

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.update(assertCuid(req.params.id), req.body, req.user!.id, req.user!.role))
    } catch (e) { next(e) }
  }

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.submit(assertCuid(req.params.id), req.user!.id))
    } catch (e) { next(e) }
  }

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.approve(assertCuid(req.params.id), req.user!.id, req.user!.role))
    } catch (e) { next(e) }
  }

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.reject(assertCuid(req.params.id), req.user!.id, req.user!.role, req.body.reason))
    } catch (e) { next(e) }
  }

  listApprovedHr = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.listApprovedHrReports())
    } catch (e) { next(e) }
  }

  submitResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.submitResult(assertCuid(req.params.id), req.user!.id, req.body.resultContent, req.user!.role))
    } catch (e) { next(e) }
  }

  uploadAttachment = (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE_UPLOADED' })
    const relativePath = (req.file as any).gcsUrl//TODO: as any 지우자
    res.json({ url: relativePath })
  }

  listHiringItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusParam = req.query.status
      const statusFilter = typeof statusParam === 'string'
        ? (statusParam.split(',').filter(s => HIRING_PLAN_ITEM_STATUSES.includes(s)) as HiringPlanItemStatus[])
        : undefined
      const items = await this.repo.listHiringPlanItems(assertCuid(req.params.id), statusFilter)
      res.json(items)
    } catch (e) { next(e) }
  }

  createHiringItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.repo.createHiringPlanItem(assertCuid(req.params.id), req.body)
      res.status(201).json(item)
    } catch (e) { next(e) }
  }

  updateHiringItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.repo.updateHiringPlanItem(
        assertCuid(req.params.itemId),
        assertCuid(req.params.id),
        req.body
      )
      res.json(item)
    } catch (e) { next(e) }
  }

  deleteHiringItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.repo.deleteHiringPlanItem(assertCuid(req.params.itemId), assertCuid(req.params.id))
      res.status(204).send()
    } catch (e) { next(e) }
  }

  cancelHiringItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planReportId = assertCuid(req.params.id)
      const itemId = assertCuid(req.params.itemId)
      const result = await this.service.cancelHiringPlanItem(itemId, planReportId, req.user!.id)
      res.json(result)
    } catch (e) { next(e) }
  }

  publishPostings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planReportId = assertCuid(req.params.id)
      const actorId = req.user!.id
      const result = await this.recruitmentService.bulkCreatePostingsFromPlanReport(planReportId, actorId)
      res.status(201).json(result)
    } catch (e) { next(e) }
  }
}
