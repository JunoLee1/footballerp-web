import type { PrismaClient } from "../generated/client";
import { encrypt } from "../lib/crypto";
import type { CreateYouthRegistrationDto, YouthRegistrationListQuery } from "./dto/youth-registration.dto";

export class YouthRegistrationRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: YouthRegistrationListQuery) {
    return this.prisma.youthRegistration.findMany({
      where: {
        ...(query.teamId && { teamId: query.teamId }),
        ...(query.status && { status: query.status }),
      },
      include: {
        team: { select: { id: true, name: true } },
        guardian: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.youthRegistration.findUnique({
      where: { id },
      include: {
        team: true,
        guardian: { select: { id: true, username: true, email: true } },
        requestedBy: { select: { id: true, username: true } },
      },
    });
  }

  create(data: CreateYouthRegistrationDto & { requestedById: string; guardianId?: string }) {
    return this.prisma.youthRegistration.create({
      data: {
        playerName: data.playerName,
        birthDate: new Date(data.birthDate),
        ...(data.preferredJerseyNumber != null && { preferredJerseyNumber: data.preferredJerseyNumber }),
        teamId: data.teamId,
        ...(data.guardianId != null && { guardianId: data.guardianId }),
        requestedById: data.requestedById,
        status: "PENDING",
      } as any,
      include: { team: { select: { id: true, name: true } } },
    });
  }

  updateStatus(id: number, status: "GUARDIAN_APPROVED" | "REJECTED", extra?: { rejectionReason?: string }) {
    return this.prisma.youthRegistration.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  findGuardianByEmail(email: string) {
    return this.prisma.user.findFirst({ where: { email, role: "GUARDIAN" } });
  }

  contractAndCreatePlayer(
    id: number,
    registration: { playerName: string; birthDate: Date; teamId: number; guardianId: string | null; preferredJerseyNumber: number | null },
    nationalityId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.youthRegistration.update({ where: { id }, data: { status: "CONTRACTED" } });
      const encDob = encrypt(registration.birthDate.toISOString());
      const player = await tx.player.create({
        data: {
          playerName: registration.playerName,
          dateOfBirthEncrypted: encDob.encrypted,
          dateOfBirthIv: encDob.iv,
          preferredFoot: "RIGHT",
          height: 0,
          weight: 0,
          position: "STRIKER",
          level: "YOUTH",
          nationalityId,
          teamId: registration.teamId,
          ...(registration.guardianId != null && { guardianId: registration.guardianId }),
        },
      });
      return player;
    });
  }
}
