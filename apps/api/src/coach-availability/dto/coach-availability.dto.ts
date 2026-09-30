export interface CreateCoachAvailabilityDto {
  userId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface CoachAvailabilityQuery {
  userId?: string;
  from?: string;
  to?: string;
}
