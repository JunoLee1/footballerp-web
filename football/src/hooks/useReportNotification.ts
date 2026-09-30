import { useEffect } from 'react'
import { toast } from 'sonner'
import { getSocket } from '@/lib/socket'

interface ReportSubmittedEvent {
  reportId: number
  title: string
  authorId: string
}

export function useReportNotification(onNew: () => void) {
  useEffect(() => {
    const socket = getSocket()

    socket.on('notification:report-submitted', (data: ReportSubmittedEvent) => {
      toast.info('새 보고서 제출', { description: `"${data.title}" 보고서가 결재 대기 중입니다.` })
      onNew()
    })

    return () => {
      socket.off('notification:report-submitted')
    }
  }, [onNew])
}
