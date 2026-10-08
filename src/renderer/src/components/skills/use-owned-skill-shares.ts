import { useAppStore } from '@/store'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SkillCloudOwnedShare } from '../../../../shared/skill-cloud-contract'
import { translate } from '@/i18n/i18n'

function inventoryError(status: string): string {
  return status === 'reconnect-required'
    ? translate(
        'auto.components.settings.shareSkills.linksReconnect',
        'Sign in again to manage shared links.'
      )
    : translate(
        'auto.components.settings.shareSkills.linksUnavailable',
        'Shared links are unavailable right now.'
      )
}

export type OwnedSkillShares = {
  ownerKey?: string
  shares: SkillCloudOwnedShare[]
  loading: boolean
  error: string | null
  busyShareId: string | null
  refresh: () => Promise<void>
  revoke: (share: SkillCloudOwnedShare) => Promise<boolean>
}

export function useOwnedSkillShares(): OwnedSkillShares {
  const auth = useAppStore((state) => state.orcaProfileAuthStatus)
  const ownerKey = JSON.stringify([
    auth?.state,
    auth?.activeProfileId,
    auth?.cloud?.userId,
    auth?.cloud?.cloudProfileId,
    auth?.cloud?.activeOrgId
  ])
  const owner = useRef(ownerKey)
  useLayoutEffect(() => {
    owner.current = ownerKey
  }, [ownerKey])
  const [inventoryOwner, setInventoryOwner] = useState(ownerKey)
  const [shares, setShares] = useState<SkillCloudOwnedShare[]>([])
  const [loading, setLoading] = useState(true)
  const [busyShareId, setBusyShareId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    if (owner.current !== ownerKey) {
      return
    }
    const current = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const operation = await window.api.skills.listOwnedShares()
      if (generation.current !== current || owner.current !== ownerKey) {
        return
      }
      setInventoryOwner(ownerKey)
      if (operation.status !== 'ok') {
        setError(inventoryError(operation.status))
        return
      }
      setShares(operation.value)
    } catch {
      if (generation.current === current && owner.current === ownerKey) {
        setInventoryOwner(ownerKey)
        setError(inventoryError('unavailable'))
      }
    } finally {
      if (generation.current === current && owner.current === ownerKey) {
        setLoading(false)
      }
    }
  }, [ownerKey])

  useEffect(() => {
    setShares([])
    setBusyShareId(null)
    void load()
    return () => {
      generation.current += 1
    }
  }, [load])

  const revoke = useCallback(
    async (share: SkillCloudOwnedShare): Promise<boolean> => {
      if (owner.current !== ownerKey) {
        return false
      }
      setBusyShareId(share.id)
      setError(null)
      try {
        const operation = await window.api.skills.revokeShare(share.id)
        if (owner.current !== ownerKey) {
          return false
        }
        if (operation.status !== 'ok') {
          setError(inventoryError(operation.status))
          return false
        }
        setShares((current) => current.filter((candidate) => candidate.id !== share.id))
        toast.success(translate('auto.components.settings.shareSkills.linkRevoked', 'Link revoked'))
        return true
      } catch {
        if (owner.current !== ownerKey) {
          return false
        }
        setError(
          translate(
            'auto.components.settings.shareSkills.revokeFailed',
            'Orca could not revoke this link.'
          )
        )
        return false
      } finally {
        if (owner.current === ownerKey) {
          setBusyShareId(null)
        }
      }
    },
    [ownerKey]
  )

  return {
    ownerKey,
    shares: inventoryOwner === ownerKey ? shares : [],
    loading: loading || inventoryOwner !== ownerKey,
    error,
    busyShareId,
    refresh: load,
    revoke
  }
}
