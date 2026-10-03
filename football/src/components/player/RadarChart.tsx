import {
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import type { RadarData } from '@/types/player'

interface Props {
  data: RadarData
}

export function PlayerRadarChart({ data }: Props) {
  const { t } = useTranslation('player')

  if (!data.scores || Object.keys(data.scores).length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        {data.message ?? '경기 데이터가 부족합니다.'}
      </div>
    )
  }

  const chartData = Object.entries(data.scores).map(([key, value]) => ({
    axis: t(`radar.${key}`, key),
    value,
    fullMark: 100,
  }))

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={280}>
        <RechartsRadar data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
          <Radar
            name="점수"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.25}
          />
          <Tooltip formatter={(v) => [`${(typeof v === 'number' ? v : Number(v)).toFixed(0)}점`, '점수']} />
        </RechartsRadar>
      </ResponsiveContainer>

      {(data.strengths.length > 0 || data.weaknesses.length > 0) && (
        <div className="flex gap-4 flex-wrap">
          {data.strengths.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-green-700">강점</span>
              {data.strengths.map((s) => (
                <span key={s} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  {t(`radar.${s}`, s)}
                </span>
              ))}
            </div>
          )}
          {data.weaknesses.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-red-700">약점</span>
              {data.weaknesses.map((w) => (
                <span key={w} className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                  {t(`radar.${w}`, w)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
