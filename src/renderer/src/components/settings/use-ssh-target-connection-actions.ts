import { useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { SshTarget } from '../../../../shared/ssh-types'

export function useSshTargetConnectionActions({
  targets,
  showForm,
  mountedRef,
  loadTargets
}: {
  targets: SshTarget[]
  showForm: boolean
  mountedRef: RefObject<boolean>
  loadTargets: () => Promise<SshTarget[] | null>
}) {
  const connectionActionsInFlight = useRef(new Set<string>())
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const handleConnect = async (targetId: string): Promise<boolean> => {
    if (
      !mountedRef.current ||
      showForm ||
      !targets.some((target) => target.id === targetId) ||
      !useAppStore.getState().sshTargetsHydrated ||
      !useAppStore.getState().sshTargetLabels.has(targetId) ||
      connectionActionsInFlight.current.has(targetId)
    ) {
      return false
    }
    const status = useAppStore.getState().sshConnectionStates.get(targetId)?.status
    if (
      status === 'connected' ||
      status === 'connecting' ||
      status === 'reconnecting' ||
      status === 'deploying-relay'
    ) {
      return false
    }
    connectionActionsInFlight.current.add(targetId)
    try {
      const connected = await window.api.ssh.connect({ targetId })
      recordFeatureInteraction('ssh')
      return connected?.targetId === targetId && connected.status === 'connected'
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate('auto.components.settings.SshPane.e95d5ae10e', 'Connection failed')
      )
      return false
    } finally {
      connectionActionsInFlight.current.delete(targetId)
    }
  }

  const handleDisconnect = async (targetId: string): Promise<boolean> => {
    if (
      !mountedRef.current ||
      showForm ||
      !targets.some((target) => target.id === targetId) ||
      !useAppStore.getState().sshTargetsHydrated ||
      !useAppStore.getState().sshTargetLabels.has(targetId) ||
      connectionActionsInFlight.current.has(targetId)
    ) {
      return false
    }
    const status = useAppStore.getState().sshConnectionStates.get(targetId)?.status
    if (status !== 'connected') {
      return false
    }
    connectionActionsInFlight.current.add(targetId)
    try {
      await window.api.ssh.disconnect({ targetId })
      recordFeatureInteraction('ssh')
      const state = await window.api.ssh.getState({ targetId })
      return state
        ? state.targetId === targetId && state.status === 'disconnected'
        : useAppStore.getState().sshTargetsHydrated &&
            useAppStore.getState().sshTargetLabels.has(targetId) &&
            useAppStore.getState().sshConnectionStates.get(targetId)?.status === 'disconnected'
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate('auto.components.settings.SshPane.a43de1d3ee', 'Disconnect failed')
      )
      return false
    } finally {
      connectionActionsInFlight.current.delete(targetId)
    }
  }

  const handleTest = async (targetId: string): Promise<boolean> => {
    if (
      !mountedRef.current ||
      showForm ||
      !targets.some((target) => target.id === targetId) ||
      !useAppStore.getState().sshTargetsHydrated ||
      !useAppStore.getState().sshTargetLabels.has(targetId) ||
      connectionActionsInFlight.current.has(targetId)
    ) {
      return false
    }
    const status = useAppStore.getState().sshConnectionStates.get(targetId)?.status
    if (
      status === 'connected' ||
      status === 'connecting' ||
      status === 'reconnecting' ||
      status === 'deploying-relay'
    ) {
      return false
    }
    connectionActionsInFlight.current.add(targetId)
    setTestingIds((prev) => new Set(prev).add(targetId))
    try {
      const result = await window.api.ssh.testConnection({ targetId })
      recordFeatureInteraction('ssh')
      if (mountedRef.current) {
        if (result.success) {
          toast.success(
            translate('auto.components.settings.SshPane.81d08bcddf', 'Connection successful')
          )
        } else {
          toast.error(
            result.error ??
              translate('auto.components.settings.SshPane.0cda732f43', 'Connection test failed')
          )
        }
      }
      return result.success
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate('auto.components.settings.SshPane.68c13b4589', 'Test failed')
        )
      }
      return false
    } finally {
      connectionActionsInFlight.current.delete(targetId)
      if (mountedRef.current) {
        setTestingIds((prev) => {
          const next = new Set(prev)
          next.delete(targetId)
          return next
        })
      }
    }
  }

  const handleImport = async (): Promise<SshTarget[] | null> => {
    const key = 'ssh-config-all-hosts'
    if (!mountedRef.current || showForm || connectionActionsInFlight.current.has(key)) {
      return null
    }
    connectionActionsInFlight.current.add(key)
    try {
      // Why: the explicit Import action re-adopts every ~/.ssh/config host,
      // including ones the user previously deleted — clear tombstones so a
      // deliberate re-import can bring them back.
      const result = await window.api.ssh.importConfig({ reAdopt: true })
      useAppStore.getState().recordSshRepoReadoptions(result.repoReadoptions)
      recordFeatureInteraction('ssh')
      if (mountedRef.current) {
        if (result.targets.length === 0) {
          toast('~/.ssh/config already in sync')
        } else {
          toast.success(
            translate(
              'auto.components.settings.SshPane.f8050f6307',
              'Synced {{value0}} server{{value1}}',
              { value0: result.targets.length, value1: result.targets.length > 1 ? 's' : '' }
            )
          )
        }
      }
      const current = await loadTargets()
      const keys = [
        'id',
        'label',
        'host',
        'port',
        'username',
        'configHost',
        'identityFile',
        'identityAgent',
        'identitiesOnly',
        'gssapiAuthentication',
        'proxyCommand',
        'jumpHost',
        'source',
        'generation'
      ]
      return current !== null &&
        result.targets.every((target) =>
          current.some((entry) =>
            keys.every((key) => Reflect.get(entry, key) === Reflect.get(target, key))
          )
        )
        ? current
        : null
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate('auto.components.settings.SshPane.f495689b82', 'Import failed')
        )
      }
      return null
    } finally {
      connectionActionsInFlight.current.delete(key)
    }
  }

  return { testingIds, handleConnect, handleDisconnect, handleTest, handleImport }
}
