import type { VoiceViewerOperation, VoiceViewerResult } from '../../../shared/voice-viewer'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import {
  startVmRuntimeViewerRequest,
  readVmRuntimeViewerRequest
} from './vm-runtime-viewer-request'
type Command = Extract<
  VoiceViewerOperation,
  {
    operation:
      | 'vm-runtimes-refresh'
      | 'vm-runtime-cleanup'
      | 'vm-runtime-stop'
      | 'vm-runtime-status'
      | 'vm-copy-cleanup'
  }
>
export async function applyVmRuntimeViewerAction(
  command: Command,
  expiresAt: number
): Promise<Omit<VoiceViewerResult, 'viewerId'>> {
  const result = { viewer: 'host' as const, persisted: false, applied: true }
  if (command.operation === 'vm-runtime-status') {
    const operation = readVmRuntimeViewerRequest(command.operationId)
    return {
      ...result,
      ...operation,
      applied: operation.vmActionState !== 'failed',
      reason:
        operation.vmActionState === 'failed' ? 'vm_runtime_viewer_operation_failed' : undefined
    }
  }
  const state = requireHostViewer()
  if (!state.settings?.experimentalEphemeralVms) {
    throw new Error('vm_feature_disabled')
  }
  if (state.activeModal) {
    throw new Error('viewer_modal_busy')
  }
  if (command.operation === 'vm-runtime-stop' && command.confirmation !== command.runtimeId) {
    throw new Error('vm_runtime_confirmation_mismatch')
  }
  state.openSettingsTarget({ pane: 'experimental', repoId: null, sectionId: 'ephemeral-vms' })
  state.openSettingsPage()
  if (
    !(await waitForView(
      () => document.querySelector('[data-settings-section="temporary-vm-runtimes"]') !== null,
      expiresAt
    ))
  ) {
    throw new Error('vm_runtime_section_unavailable')
  }
  return {
    ...result,
    ...startVmRuntimeViewerRequest(
      command.operation === 'vm-runtimes-refresh'
        ? { action: 'refresh' }
        : {
            action:
              command.operation === 'vm-runtime-cleanup'
                ? 'cleanup'
                : command.operation === 'vm-runtime-stop'
                  ? 'stop'
                  : 'copy',
            runtimeId: command.runtimeId,
            confirmation: command.operation === 'vm-runtime-stop' ? command.confirmation : undefined
          }
    )
  }
}
