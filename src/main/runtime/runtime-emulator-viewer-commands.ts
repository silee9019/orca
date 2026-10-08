import { requestEmulatorFocus } from '../emulator/emulator-focus-request-relay'
import type { EmulatorFrameParams } from '../../shared/emulator-frame-command'
import type { RuntimeEmulatorCommandHost } from './runtime-emulator-command-host'

export class RuntimeEmulatorViewerCommands {
  constructor(protected readonly host: RuntimeEmulatorCommandHost) {}

  async emulatorFocus(params: { worktree: string }, signal?: AbortSignal) {
    const worktreeId = await this.host.resolveEmulatorWorkspaceId(params.worktree)
    return requestEmulatorFocus(this.host.getAuthoritativeWindow(), worktreeId, signal)
  }

  async emulatorFrame(params: EmulatorFrameParams, signal?: AbortSignal) {
    const worktreeId = await this.host.resolveEmulatorWorkspaceId(params.worktree)
    return requestEmulatorFocus(this.host.getAuthoritativeWindow(), worktreeId, signal, {
      tabId: params.tabId,
      action: params.action
    })
  }
}
