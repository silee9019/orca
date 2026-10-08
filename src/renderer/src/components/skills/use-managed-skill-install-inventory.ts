import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ManagedSkillInstall } from '../../../../shared/skill-install-contract'
import { translate } from '@/i18n/i18n'

export function useManagedSkillInstallInventory({
  open,
  environmentId,
  ownerKey,
  onLoading,
  onLoaded,
  setBusy,
  setError
}: {
  open: boolean
  environmentId: string
  ownerKey: string | undefined
  onLoading: () => void
  onLoaded: () => void
  setBusy: (value: boolean) => void
  setError: (value: string | null) => void
}) {
  const [installs, setInstalls] = useState<ManagedSkillInstall[]>([])
  const [loadedOwner, setLoadedOwner] = useState<string | null | undefined>(null)
  const loadGeneration = useRef(0)
  const latestOwner = useRef(ownerKey)
  useLayoutEffect(() => {
    latestOwner.current = open ? ownerKey : undefined
    return () => {
      latestOwner.current = undefined
    }
  }, [ownerKey, open])
  const load = useCallback(async (): Promise<void> => {
    const generation = ++loadGeneration.current
    onLoading()
    if (!open) {
      return
    }
    setLoadedOwner(null)
    setBusy(true)
    setError(null)
    try {
      const operation = await window.api.skills.listManagedInstalls(
        environmentId === 'local' ? undefined : environmentId
      )
      if (generation !== loadGeneration.current) {
        return
      }
      if (operation.status !== 'ok') {
        setError(operation.message)
        return
      }
      setInstalls(operation.value)
      setLoadedOwner(ownerKey)
      onLoaded()
    } catch (cause) {
      if (generation !== loadGeneration.current) {
        return
      }
      console.warn('[skills] managed install listing failed:', cause)
      setError(
        translate(
          'auto.components.skills.install.inspectManagedFailed',
          'Orca could not inspect managed installs on this machine.'
        )
      )
    } finally {
      if (generation === loadGeneration.current) {
        setBusy(false)
      }
    }
  }, [environmentId, open, ownerKey, onLoaded, onLoading, setBusy, setError])

  useEffect(() => {
    void load()
    return () => {
      loadGeneration.current += 1
    }
  }, [load])

  return {
    installs,
    isCurrentOwner: () => ownerKey !== undefined && latestOwner.current === ownerKey,
    load,
    inventoryReady: ownerKey !== undefined && loadedOwner === ownerKey,
    invalidate: () => {
      loadGeneration.current += 1
    }
  }
}
