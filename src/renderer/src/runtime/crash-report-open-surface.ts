export type CrashReportOpenSurface = {
  openFromHelp: () => number
  isCurrent: (epoch: number) => boolean
}
let surface: CrashReportOpenSurface | null = null
const listeners = new Set<() => void>()
export function readCrashReportOpenSurface(): CrashReportOpenSurface | null {
  return surface
}
export function subscribeCrashReportOpenSurface(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}
export function publishCrashReportOpenSurface(value: CrashReportOpenSurface): () => void {
  surface = value
  listeners.forEach((callback) => callback())
  return () => {
    if (surface === value) {
      surface = null
      listeners.forEach((callback) => callback())
    }
  }
}
