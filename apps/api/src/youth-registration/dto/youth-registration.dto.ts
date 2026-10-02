export interface CreateYouthRegistrationDto {
  playerName: string;
  birthDate: string;
  preferredJerseyNumber?: number;
  teamId: string;
  guardianEmail: string;
}

export interface RejectYouthRegistrationDto {
  rejectionReason: string;
}

export interface YouthRegistrationListQuery {
  teamId?: string;
  status?: "PENDING" | "GUARDIAN_APPROVED" | "CONTRACTED" | "REJECTED";
}
