import { Request, Response, NextFunction } from 'express'
import { VideoAnalysisService } from './video-analysis.service'
import { AppError } from '../lib/appError'
import { assertCuid } from '../lib/cuidGuard'

const WEBHOOK_SECRET = process.env['WEBHOOK_SECRET'] ?? ''

export class VideoAnalysisController {
  constructor(private service: VideoAnalysisService) {}

  createJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prospectId = assertCuid(req.params['prospectId'])
      const { videoUrl } = req.body as { videoUrl: string }
      if (!videoUrl) throw new AppError(400, 'VIDEO_URL_REQUIRED')
      const job = await this.service.createJob(prospectId, videoUrl)
      res.status(202).json(job)
    } catch (err) { next(err) }
  }

  getJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prospectId = assertCuid(req.params['prospectId'])
      const jobId = assertCuid(req.params['jobId'])
      const job = await this.service.getJob(prospectId, jobId)
      if (!job) throw new AppError(404, 'JOB_NOT_FOUND')
      res.json(job)
    } catch (err) { next(err) }
  }

  // ML 서비스가 호출하는 내부 webhook — JWT 인증 대신 secret 헤더 검증
  webhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = req.headers['x-webhook-secret']
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) throw new AppError(401, 'INVALID_WEBHOOK_SECRET')
      const { jobId, status, data, errorMessage } = req.body as {
        jobId: string
        status: 'DONE' | 'FAILED'
        data?: any
        errorMessage?: string
      }
      await this.service.handleWebhook(jobId, status, data, errorMessage)
      res.json({ ok: true })
    } catch (err) { next(err) }
  }
}
