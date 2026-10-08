export type AutomationClockParts = {
  hour12: number
  minute: number
  period: 'AM' | 'PM'
}

export function parseAutomationTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map((part) => Number(part))
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0
  }
}

export function formatAutomationTimeInput(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function getAutomationClockParts(time: string): AutomationClockParts {
  const { hour, minute } = parseAutomationTime(time)
  return {
    hour12: hour % 12 === 0 ? 12 : hour % 12,
    minute,
    period: hour >= 12 ? 'PM' : 'AM'
  }
}

export function formatAutomationTimeFromClockParts(parts: AutomationClockParts): string {
  const hour24 =
    parts.period === 'AM'
      ? parts.hour12 === 12
        ? 0
        : parts.hour12
      : parts.hour12 === 12
        ? 12
        : parts.hour12 + 12
  return formatAutomationTimeInput(hour24, parts.minute)
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Resolve typed digits on commit. Empty → min (0 minutes / 1 hour). */
export function resolveDigitCommit(raw: string, value: number, min: number, max: number): number {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return min
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return value
  }
  return clampInt(parsed, min, max)
}

/** Step from in-progress text when present, otherwise the committed value. */
export function resolveDigitStep(
  raw: string,
  value: number,
  min: number,
  max: number,
  delta: 1 | -1
): number {
  const trimmed = raw.trim()
  const parsed = trimmed === '' ? Number.NaN : Number(trimmed)
  const base = Number.isFinite(parsed) ? clampInt(parsed, min, max) : value
  if (delta === 1) {
    return base >= max ? min : base + 1
  }
  return base <= min ? max : base - 1
}
