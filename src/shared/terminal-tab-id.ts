import { isWebTerminalSurfaceTabId } from './terminal-surface-id'

export function isValidTerminalTabId(value: string): boolean {
  return value.length > 0 && !value.includes(':')
}

export function isValidHostTerminalTabId(value: string): boolean {
  return isValidTerminalTabId(value) && !isWebTerminalSurfaceTabId(value)
}

export function isValidAgentStatusDropTabId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 160 &&
    value.trim() === value &&
    isValidTerminalTabId(value)
  )
}
