import type { PrismaClient } from '../generated/client'
import { Prisma } from '../generated/client'
import type { PipelineData } from './dto/video-evaluation.dto'
import { validateVideoUrl } from './video-url.validator'

const ML_SERVICE_URL = process.env['ML_SERVICE_URL'] ?? ''
const WEBHOOK_SECRET = process.env['WEBHOOK_SECRET'] ?? ''
const ERP_BASE_URL = process.env['ERP_BASE_URL'] ?? 'http://localhost:3000'

export class VideoAnalysisService {
  constructor(private prisma: PrismaClient) {}

  async createJob(prospectId: string, videoUrl: string) {
    validateVideoUrl(videoUrl)
    const job = await this.prisma.videoAnalysisJob.create({
      data: { prospectId, videoUrl },
    })
    // fire-and-forget — ML 서비스로 분석 요청
    void this.dispatchToMlService(job.id, videoUrl, prospectId)
    return job
  }

  async getJob(prospectId: string, jobId: string) {
    return this.prisma.videoAnalysisJob.findFirst({
      where: { id: jobId, prospectId },
    })
  }

  async handleWebhook(jobId: string, status: 'DONE' | 'FAILED', data?: PipelineData , errorMessage?: string) {
    await this.prisma.videoAnalysisJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(data !== undefined && { pipelineData: data as unknown as Prisma.InputJsonValue }),
        errorMessage: errorMessage ?? null,
        completedAt: new Date(),
      },
    })
  }

  private async dispatchToMlService(jobId: string, videoUrl: string, prospectId: string) {
    if (!ML_SERVICE_URL) return // ML 서비스 미설정 시 skip (개발 환경)
    try {
      await this.prisma.videoAnalysisJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      })
      await fetch(`${ML_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          videoUrl,
          prospectId,
          callbackUrl: `${ERP_BASE_URL}/api/internal/video-analysis/webhook`,
          webhookSecret: WEBHOOK_SECRET,
        }),
      })
    } catch {
      await this.prisma.videoAnalysisJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: 'ML 서비스 연결 실패', completedAt: new Date() },
      })
    }
  }
}
