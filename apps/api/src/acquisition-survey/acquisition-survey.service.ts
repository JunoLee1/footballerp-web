import { AcquisitionSurveyRepository } from "./acquisition-survey.repo";
import { AppError } from "../lib/appError";
import { CreateAcquisitionSurveyDto, SubmitAcquisitionSurveyResponseItemDto } from "./dto/acquisition-survey.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

export class AcquisitionSurveyService {
  constructor(
    private repo: AcquisitionSurveyRepository,
    private notify: Pick<NotificationService, "notifyAcquisitionSurveyPublished" | "notifyAcquisitionSurveyClosed"> = notificationService,
  ) {}

  getAll() {
    return this.repo.findAll();
  }

  async getById(id: string) {
    const survey = await this.repo.findById(id);
    if (!survey) throw new AppError(404, "SURVEY_NOT_FOUND");
    return survey;
  }

  async create(dto: CreateAcquisitionSurveyDto, createdById: string) {
    const survey = await this.repo.create({ ...dto, createdById });
    void this.notify.notifyAcquisitionSurveyPublished(survey.id, survey.title).catch(console.error);
    return survey;
  }

  async close(id: string) {
    const survey = await this.getById(id);
    if (survey.status === "CLOSED") throw new AppError(409, "SURVEY_ALREADY_CLOSED");
    const closed = await this.repo.close(id);
    void this.notify.notifyAcquisitionSurveyClosed(survey.id, survey.title).catch(console.error);
    return closed;
  }

  async submitResponse(surveyId: string, respondentId: string, items: SubmitAcquisitionSurveyResponseItemDto[]) {
    const survey = await this.getById(surveyId);
    if (survey.status === "CLOSED") throw new AppError(409, "SURVEY_CLOSED");
    const existing = await this.repo.findResponse(surveyId, respondentId);
    if (existing) throw new AppError(409, "ALREADY_SUBMITTED");
    return this.repo.submitResponse(surveyId, respondentId, items);
  }

  async getResponses(surveyId: string) {
    await this.getById(surveyId);
    return this.repo.getResponses(surveyId);
  }
}
