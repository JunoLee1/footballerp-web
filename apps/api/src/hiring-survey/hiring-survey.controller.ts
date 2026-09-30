import type { Request, Response } from 'express'
import { requireUser } from '../lib/authMiddleware'
import { HiringSurveyService } from './hiring-survey.service'
import { assertCuid } from "../lib/cuidGuard";

export class HiringSurveyController {
  constructor(private service: HiringSurveyService) {}

  list = async (_req: Request, res: Response) => {
    const surveys = await this.service.list()
    res.json(surveys)
  }

  get = async (req: Request, res: Response) => {
    const survey = await this.service.getById(assertCuid(req.params.id))
    res.json(survey)
  }

  create = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const survey = await this.service.create(req.body, user.id)
    res.status(201).json(survey)
  }

  /**
   * POST /:id/respond — 팀장 (LEADER) creates/updates a DRAFT `SurveyResponse`
   * for their department. The department is inferred from the payload; if it's
   * omitted we fall back to the leader's single LEADER membership (soft-safety).
   */
  createResponse = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const surveyId = assertCuid(req.params.id)
    const departmentId = Number(req.body.departmentId)
    if (!Number.isFinite(departmentId) || departmentId <= 0) {
      res.status(400).json({ code: 'DEPARTMENT_ID_REQUIRED' })
      return
    }
    const { departmentId: _, ...dto } = req.body
    const result = await this.service.createResponse(surveyId, departmentId, user.id, dto as any)
    res.status(201).json(result)
  }

  updateResponse = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const responseId = assertCuid(req.params.responseId)
    const result = await this.service.updateResponse(responseId, user.id, req.body)
    res.json(result)
  }

  submitResponse = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const responseId = assertCuid(req.params.responseId)
    const result = await this.service.submitResponse(responseId, user.id)
    res.json(result)
  }

  approveResponse = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const responseId = assertCuid(req.params.responseId)
    const result = await this.service.approveResponse(responseId, user.id)
    res.json(result)
  }

  rejectResponse = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const responseId = assertCuid(req.params.responseId)
    const rejectionReason = String(req.body?.rejectionReason ?? '')
    const result = await this.service.rejectResponse(responseId, user.id, rejectionReason)
    res.json(result)
  }

  close = async (req: Request, res: Response) => {
    const user = requireUser(req)
    const planReport = await this.service.close(assertCuid(req.params.id), user.id)
    res.json(planReport)
  }

  getParticipationRate = async (req: Request, res: Response) => {
    res.json(await this.service.getParticipationRate(assertCuid(req.params.id)))
  }

  updateDraft = async (req: Request, res: Response) => {
    const id = assertCuid(req.params.id)
    const result = await this.service.updateDraft(id, req.body)
    res.json(result)
  }

  open = async (req: Request, res: Response) => {
    const id = assertCuid(req.params.id)
    const result = await this.service.open(id)
    res.json(result)
  }

  deleteDraft = async (req: Request, res: Response) => {
    const id = assertCuid(req.params.id)
    await this.service.deleteDraft(id)
    res.status(204).send()
  }
}
