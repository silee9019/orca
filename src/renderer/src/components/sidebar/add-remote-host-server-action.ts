import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
import {
  translateHostAccessLinkError,
  translateRemotePairingFailureDescription
} from '@/lib/remote-pairing-copy'

export async function saveRemoteServerFromPairingCode({
  serverName,
  pairingCode,
  parsedServerLink,
  allowLoopback,
  setIsSaving,
  setRuntimeEnvironments,
  readRuntimeHostStatusSnapshots,
  reset,
  onOpenChange
}: {
  serverName: string
  pairingCode: string
  parsedServerLink: ReturnType<typeof parseHostAccessLink>
  allowLoopback: boolean
  setIsSaving: (value: boolean) => void
  setRuntimeEnvironments: (environments: PublicKnownRuntimeEnvironment[]) => void
  readRuntimeHostStatusSnapshots: () => Promise<unknown>
  reset: () => void
  onOpenChange: (mode: null) => void
}): Promise<void> {
  const trimmedName = serverName.trim()
  const trimmedPairingCode = pairingCode.trim()
  if (!trimmedName || !trimmedPairingCode) {
    toast.error(
      translate(
        'auto.components.sidebar.AddRemoteHostDialog.serverFieldsRequired',
        'Server name and pairing code are required.'
      )
    )
    return
  }
  if (!parsedServerLink.ok) {
    toast.error(translateHostAccessLinkError(parsedServerLink.kind))
    return
  }
  if (parsedServerLink.value.endpointKind === 'loopback' && !allowLoopback) {
    toast.error(
      translate(
        'auto.components.sidebar.AddRemoteHostDialog.loopbackBlocked',
        'Enable the SSH tunnel override or create a new link using the other host’s Tailscale or LAN address.'
      )
    )
    return
  }

  setIsSaving(true)
  try {
    const result = await window.api.runtimeEnvironments.verifyAndAddFromPairingCode({
      name: trimmedName,
      pairingCode: trimmedPairingCode,
      allowLoopback
    })
    if (!result.ok) {
      toast.error(
        result.kind === 'environment-save-failed'
          ? result.message
          : translateRemotePairingFailureDescription(
              result.kind,
              parsedServerLink.value.displayEndpoint
            )
      )
      return
    }
    const environments = await window.api.runtimeEnvironments.list()
    setRuntimeEnvironments(environments)
    await readRuntimeHostStatusSnapshots()
    toast.success(
      translate('auto.components.sidebar.AddRemoteHostDialog.serverSaved', 'Remote server added.')
    )
    reset()
    onOpenChange(null)
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.sidebar.AddRemoteHostDialog.serverSaveFailed',
            'Failed to add remote server.'
          )
    )
  } finally {
    setIsSaving(false)
  }
}
