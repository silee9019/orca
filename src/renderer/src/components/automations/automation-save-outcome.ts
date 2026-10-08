export type AutomationSaveWrite = {
  provider: 'orca' | 'hermes'
  operation: 'create' | 'update' | 'move'
  automationId: string | null
  originalRemoved: boolean | null
}
export type AutomationSaveProgress = {
  write: AutomationSaveWrite | null
  pageRead: 'completed' | 'failed' | null
  closeRequested: boolean
}
export type AutomationSaveOutcome =
  | { status: 'blocked'; reason: string }
  | { status: 'failed'; write: 'unknown' }
  | {
      status: 'settled'
      write: AutomationSaveWrite
      pageRead: AutomationSaveProgress['pageRead']
      closeRequested: boolean
    }

export function automationSaveOutcome(progress: AutomationSaveProgress): AutomationSaveOutcome {
  return progress.write
    ? {
        status: 'settled',
        write: progress.write,
        pageRead: progress.pageRead,
        closeRequested: progress.closeRequested
      }
    : { status: 'failed', write: 'unknown' }
}
