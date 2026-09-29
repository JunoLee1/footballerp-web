import { describe, it, expect } from 'vitest'
import { classifyExpiry } from '@/pages/admin/SoftwareLicensePage'

const DAY = 86_400_000
const NOW = new Date('2026-01-01T00:00:00Z')

describe('classifyExpiry', () => {
  it('null expiresAt → null', () => {
    expect(classifyExpiry(null, NOW)).toBeNull()
  })

  it('과거 날짜 → EXPIRED', () => {
    const past = new Date(NOW.getTime() - DAY).toISOString()
    expect(classifyExpiry(past, NOW)).toBe('EXPIRED')
  })

  it('D+30 이내 → D-30', () => {
    const in30 = new Date(NOW.getTime() + 15 * DAY).toISOString()
    expect(classifyExpiry(in30, NOW)).toBe('D-30')
  })

  it('D+31~60 → D-60', () => {
    const in45 = new Date(NOW.getTime() + 45 * DAY).toISOString()
    expect(classifyExpiry(in45, NOW)).toBe('D-60')
  })

  it('D+61~90 → D-90', () => {
    const in75 = new Date(NOW.getTime() + 75 * DAY).toISOString()
    expect(classifyExpiry(in75, NOW)).toBe('D-90')
  })

  it('D+91 이상 → null (경계 밖)', () => {
    const in100 = new Date(NOW.getTime() + 100 * DAY).toISOString()
    expect(classifyExpiry(in100, NOW)).toBeNull()
  })

  it('경계값 exactly 30d → D-30', () => {
    const in30 = new Date(NOW.getTime() + 30 * DAY).toISOString()
    expect(classifyExpiry(in30, NOW)).toBe('D-30')
  })

  it('경계값 exactly 60d → D-60', () => {
    const in60 = new Date(NOW.getTime() + 60 * DAY).toISOString()
    expect(classifyExpiry(in60, NOW)).toBe('D-60')
  })

  it('경계값 exactly 90d → D-90', () => {
    const in90 = new Date(NOW.getTime() + 90 * DAY).toISOString()
    expect(classifyExpiry(in90, NOW)).toBe('D-90')
  })
})
