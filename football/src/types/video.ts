import type { SessionType } from '@/types/training'

export interface TrainingVideo {
  id: number
  title: string
  url: string
  tags: string[]
  sessionType: SessionType | null
  uploadedById: string
  createdAt: string
  aiSummary?: string | null
  uploader: { id: number; nickname: string }
  _count?: { assignments: number }
}

export interface VideoAssignment {
  id: number
  videoId: number
  playerId: string
  assignedById: string
  dueDate: string | null
  progressRate: number
  note: string | null
  createdAt: string
  video: Pick<TrainingVideo, 'id' | 'title' | 'url' | 'tags' | 'sessionType'>
  assignedBy: { id: number; nickname: string }
}

export interface TrainingVideoDetail extends TrainingVideo {
  assignments: (Omit<VideoAssignment, 'video'> & {
    player: { id: string; playerName: string; position: string }
    assignedBy: { id: number; nickname: string }
  })[]
}

export interface CreateVideoPayload {
  title: string
  url: string
  tags: string[]
  sessionType?: SessionType | ''
}

export interface CreateAssignmentPayload {
  playerId: string
  dueDate?: string
  note?: string
}
