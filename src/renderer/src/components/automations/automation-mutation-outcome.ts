import type { AutomationActionNotice } from './automation-row-action-dispatch'

export type AutomationMutationOutcome = {
  mutation: 'acknowledged' | 'refused' | 'unconfirmed'
  refresh: 'completed' | 'failed' | 'skipped'
  notice: AutomationActionNotice | null
}

export async function finishAutomationMutation(
  result: { ok: true } | { ok: false; notice: AutomationActionNotice },
  refresh: (() => Promise<unknown>) | null
): Promise<AutomationMutationOutcome> {
  let refreshed: AutomationMutationOutcome['refresh'] = 'skipped'
  if (refresh) {
    try {
      refreshed = (await refresh()) === false ? 'failed' : 'completed'
    } catch {
      refreshed = 'failed'
    }
  }
  return {
    mutation: result.ok
      ? 'acknowledged'
      : result.notice.severity === 'owner'
        ? 'refused'
        : 'unconfirmed',
    refresh: refreshed,
    notice: result.ok ? null : result.notice
  }
}
