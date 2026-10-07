import type { z } from 'zod'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { AccountInspectionParams } from '../../shared/rpc-contract/account-inspection-params'
import {
  readCodexConfigSyncStatus,
  type CodexMirroredHomeResolver
} from '../codex/config-sync-status-read'
import { listRecordedCodexPaneLanes } from '../codex/codex-pane-account-registry'
import { listStaleCodexPanes, forgetStaleCodexPanes } from '../codex/codex-stale-pane-accounts'
import { getCursorAccountStatus } from '../cursor-accounts/status'
import { getGrokAccountStatus } from '../grok-accounts/status'

export class AccountInspectionController {
  constructor(
    private readonly getSettings: () => GlobalSettings,
    private readonly codexHome: CodexMirroredHomeResolver
  ) {}

  async inspect(input: z.infer<typeof AccountInspectionParams>): Promise<unknown> {
    switch (input.action) {
      case 'cursor-status': {
        const status = await getCursorAccountStatus()
        return { ...status, error: status.error ? 'Could not read Cursor account status' : null }
      }
      case 'grok-status': {
        const status = getGrokAccountStatus()
        return { ...status, error: status.error ? 'Could not read Grok account status' : null }
      }
      case 'codex-sync-status':
        return readCodexConfigSyncStatus(this.codexHome)
      case 'codex-stale-panes':
        return listStaleCodexPanes({ ptyIds: input.ptyIds, settings: this.getSettings() })
      case 'codex-recorded-lanes':
        return listRecordedCodexPaneLanes(input.ptyIds)
      case 'codex-forget-panes': {
        forgetStaleCodexPanes(input.ptyIds)
        return { lanes: listRecordedCodexPaneLanes(input.ptyIds) }
      }
    }
  }
}
