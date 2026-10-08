import type { PluginMarketplaceMutationReceipt } from './plugin-marketplace-parent-readback'
import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'

type PluginMarketplaceLifecycleOptions = {
  mounted: boolean
  mountedRef: MutableRefObject<boolean>
  plugins: readonly PluginHostListEntry[]
  applyCompletedMutation: (plugins: PluginHostListEntry[]) => void
  setPluginListError: (cause: unknown) => void
  setConsentPluginId: Dispatch<SetStateAction<string | null>>
  setBusyPluginKeys: Dispatch<SetStateAction<Set<string>>>
}

export function usePluginMarketplaceLifecycle({
  mounted,
  mountedRef,
  plugins,
  applyCompletedMutation,
  setPluginListError,
  setConsentPluginId,
  setBusyPluginKeys
}: PluginMarketplaceLifecycleOptions): {
  rollbackPlugin: PluginHostListEntry | null
  rollbackError: string | null
  reloadAfterMutation: (
    pluginKey: string,
    receipt?: PluginMarketplaceMutationReceipt
  ) => Promise<void>
  requestRollback: (pluginKey: string) => void
  cancelRollback: () => void
  confirmRollback: (pluginKey: string) => Promise<boolean>
} {
  const [rollbackPluginId, setRollbackPluginId] = useState<string | null>(null)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const rollbackPlugin = plugins.find((plugin) => plugin.pluginKey === rollbackPluginId) ?? null

  useEffect(() => {
    if (!mounted || (rollbackPluginId && !rollbackPlugin)) {
      setRollbackPluginId(null)
      setRollbackError(null)
    }
  }, [mounted, rollbackPlugin, rollbackPluginId])

  const reloadAfterMutation = async (
    pluginKey: string,
    receipt?: PluginMarketplaceMutationReceipt
  ): Promise<void> => {
    try {
      const nextPlugins = await window.api.plugins.list()
      if (!mountedRef.current || (receipt && !receipt.canApply())) {
        return
      }
      applyCompletedMutation(nextPlugins)
      const changedPlugin = nextPlugins.find((plugin) => plugin.pluginKey === pluginKey)
      if (changedPlugin?.needsReconsent || changedPlugin?.status === 'pending') {
        setConsentPluginId(pluginKey)
      }
      receipt?.applied()
    } catch (cause) {
      if (mountedRef.current && (!receipt || receipt.canApply())) {
        setPluginListError(cause)
      }
    }
  }

  const confirmRollback = async (pluginKey: string): Promise<boolean> => {
    setBusyPluginKeys((current) => new Set(current).add(pluginKey))
    setRollbackError(null)
    try {
      const result = await window.api.plugins.rollbackMarketplacePlugin({ pluginKey })
      if (!result.ok) {
        throw new Error(result.error)
      }
      await reloadAfterMutation(pluginKey)
      if (mountedRef.current) {
        setRollbackPluginId(null)
      }
      return true
    } catch (cause) {
      console.warn('[plugins] marketplace rollback failed:', cause)
      if (mountedRef.current) {
        setRollbackError(
          translate(
            'auto.components.settings.PluginsSettingsSection.rollbackFailed',
            'Could not roll back this plugin. A previous immutable version may not be available.'
          )
        )
      }
      return false
    } finally {
      if (mountedRef.current) {
        setBusyPluginKeys((current) => {
          const next = new Set(current)
          next.delete(pluginKey)
          return next
        })
      }
    }
  }

  return {
    rollbackPlugin,
    rollbackError,
    reloadAfterMutation,
    requestRollback: (pluginKey) => {
      setRollbackError(null)
      setRollbackPluginId(pluginKey)
    },
    cancelRollback: () => setRollbackPluginId(null),
    confirmRollback
  }
}
