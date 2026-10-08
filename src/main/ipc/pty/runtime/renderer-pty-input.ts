import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { createPtyWriteInput } from '../ipc/write-input'
import { writeAfterHostViewportClaim } from '../ipc/write'
import { ptyOwnership, ptyIncarnationById } from '../provider/ownership-state'
import { tryGetProviderForPty } from '../provider/registry'
import { parseExecutionHostId } from '../../../../shared/execution-host'

export async function writeGuardedRendererPtyInput(
  runtime: OrcaRuntimeService,
  id: string,
  data: string,
  options: {
    expectedExecutionHostId: string
    expectedIncarnationId: string
    acceptedOnly: boolean
  },
  assertOwner: () => void
): Promise<boolean> {
  const host = parseExecutionHostId(options.expectedExecutionHostId)
  if (!host || host.kind === 'runtime') {
    throw new Error('terminal_pty_input_owner_changed')
  }
  const connectionId = host.kind === 'ssh' ? host.targetId : null
  const provider = tryGetProviderForPty(id)
  const assertTarget = () => {
    assertOwner()
    if (
      !provider ||
      !ptyOwnership.has(id) ||
      ptyOwnership.get(id) !== connectionId ||
      ptyIncarnationById.get(id) !== options.expectedIncarnationId ||
      tryGetProviderForPty(id) !== provider ||
      runtime.getDriver(id).kind === 'mobile'
    ) {
      throw new Error('terminal_pty_input_owner_changed_or_locked')
    }
  }
  assertTarget()
  const writers = createPtyWriteInput({ runtime, assertTarget })
  try {
    return await writeAfterHostViewportClaim(id, () => {
      assertTarget()
      const args = { id, data, inputKind: 'driving' as const }
      return options.acceptedOnly
        ? writers.writePtyInputAccepted(args)
        : writers.writePtyInput(args)
    })
  } catch {
    return false
  }
}
