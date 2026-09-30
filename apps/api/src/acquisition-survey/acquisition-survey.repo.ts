import { PrismaClient } from "../generated/client";
import { CreateAcquisitionSurveyDto, SubmitAcquisitionSurveyResponseItemDto } from "./dto/acquisition-survey.dto";

const SURVEY_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  notes: true,
  createdById: true,
  createdAt: true,
  closedAt: true,
  createdBy: { select: { id: true, nickname: true } },
} as const;

export class AcquisitionSurveyRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return (this.prisma as any).playerAcquisitionSurvey.findMany({
      select: SURVEY_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return (this.prisma as any).playerAcquisitionSurvey.findUnique({
      where: { id },
      select: SURVEY_SELECT,
    });
  }

  create(dto: CreateAcquisitionSurveyDto & { createdById: string }) {
    return (this.prisma as any).playerAcquisitionSurvey.create({
      data: {
        title: dto.title,
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        createdById: dto.createdById,
      },
      select: SURVEY_SELECT,
    });
  }

  close(id: number) {
    return (this.prisma as any).playerAcquisitionSurvey.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
      select: SURVEY_SELECT,
    });
  }

  findResponse(surveyId: number, respondentId: string) {
    return (this.prisma as any).playerAcquisitionSurveyResponse.findUnique({
      where: { surveyId_respondentId: { surveyId, respondentId } },
    });
  }

  async submitResponse(surveyId: number, respondentId: string, items: SubmitAcquisitionSurveyResponseItemDto[]) {
    return (this.prisma as any).playerAcquisitionSurveyResponse.create({
      data: {
        surveyId,
        respondentId,
        submittedAt: new Date(),
        items: {
          create: items.map((item) => ({
            position: item.position,
            priority: item.priority,
            ...(item.budgetMin !== undefined && { budgetMin: item.budgetMin }),
            ...(item.budgetMax !== undefined && { budgetMax: item.budgetMax }),
            ...(item.notes !== undefined && { notes: item.notes }),
          })),
        },
      },
      include: {
        items: true,
        respondent: { select: { id: true, nickname: true } },
      },
    });
  }

  getResponses(surveyId: number) {
    return (this.prisma as any).playerAcquisitionSurveyResponse.findMany({
      where: { surveyId },
      include: {
        respondent: { select: { id: true, nickname: true, role: true } },
        items: true,
      },
      orderBy: { submittedAt: "asc" },
    });
  }
}
