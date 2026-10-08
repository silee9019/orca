import { useRuntimePairingNetworkInterfaces } from './use-runtime-pairing-network-interfaces'
import { useRuntimePairingUrlCopy } from './use-runtime-pairing-url-copy'
import { useRuntimeLinkViewer } from '@/runtime/runtime-link-viewer'
import { parseServerShareAddress } from '../../../../shared/network/server-share-address'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { RuntimeAccessGrant } from '../../../../shared/runtime-access-grants'
import { Label } from '../ui/label'
import { RuntimeAccessGrantList } from './RuntimeAccessGrantList'
import { translate } from '@/i18n/i18n'
import { RuntimePairingGeneratorForm } from './RuntimePairingGeneratorForm'
import {
  RUNTIME_PAIRING_LOOPBACK_ADDRESS,
  cacheGeneratedRuntimePairingLink,
  clearGeneratedRuntimePairingLink,
  runtimePairingLinkCache,
  runtimePairingReachForIntent,
  selectRuntimePairingIntent,
  type RuntimePairingIntent,
  type RuntimePairingUrlGeneratorProps
} from './runtime-pairing-link-state'

export function RuntimePairingUrlGenerator({
  framed = true,
  showHeader = true,
  showGeneratorForm = true
}: RuntimePairingUrlGeneratorProps): React.JSX.Element {
  const [selectedAddress, setSelectedAddress] = useState(runtimePairingLinkCache.selectedAddress)
  const [intent, setIntent] = useState<RuntimePairingIntent>(runtimePairingLinkCache.intent)
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(
    runtimePairingLinkCache.generatedAddress
  )
  const [runtimePairingUrl, setRuntimePairingUrl] = useState<string | null>(
    runtimePairingLinkCache.runtimePairingUrl
  )
  const [webClientUrl, setWebClientUrl] = useState<string | null>(
    runtimePairingLinkCache.webClientUrl
  )
  const [runtimePairingDeviceId, setRuntimePairingDeviceId] = useState<string | null>(
    runtimePairingLinkCache.runtimePairingDeviceId
  )
  const [runtimeAccessGrants, setRuntimeAccessGrants] = useState<RuntimeAccessGrant[]>([])
  const [isLoadingAccessGrants, setIsLoadingAccessGrants] = useState(false)
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null)
  const [isGeneratingPairing, setIsGeneratingPairing] = useState(false)
  const accessGrantLoadIdRef = useRef(0)
  const [generationCompletion, setGenerationCompletion] = useState<(() => boolean) | null>(null)
  const generatingRef = useRef(false)
  const revokingRef = useRef(false)
  const mountedRef = useMountedRef()
  const { networkInterfaces, refreshingNetworkInterfaces, loadNetworkInterfaces } =
    useRuntimePairingNetworkInterfaces(mountedRef)
  const { copiedTarget, setContainerNode, copyGeneratedUrl } = useRuntimePairingUrlCopy({
    generatedAddress,
    selectedAddress,
    webClientUrl,
    runtimePairingUrl,
    mountedRef
  })

  const loadRuntimeAccessGrants = useCallback(
    async (options: { showToastOnError?: boolean } = {}): Promise<RuntimeAccessGrant[] | null> => {
      const loadId = accessGrantLoadIdRef.current + 1
      accessGrantLoadIdRef.current = loadId
      if (mountedRef.current) {
        setIsLoadingAccessGrants(true)
      }
      try {
        const result = await window.api.mobile.listRuntimeAccessGrants()
        if (mountedRef.current && loadId === accessGrantLoadIdRef.current) {
          setRuntimeAccessGrants(result.grants)
          return result.grants
        }
        return null
      } catch (error) {
        if (
          mountedRef.current &&
          loadId === accessGrantLoadIdRef.current &&
          options.showToastOnError
        ) {
          toast.error(
            error instanceof Error
              ? error.message
              : translate(
                  'auto.components.settings.RuntimePairingUrlGenerator.1b4e0bbcc5',
                  'Failed to load shared access grants.'
                )
          )
        }
        return null
      } finally {
        if (mountedRef.current && loadId === accessGrantLoadIdRef.current) {
          setIsLoadingAccessGrants(false)
        }
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    if (intent !== 'another' || networkInterfaces.length === 0) {
      return
    }
    const addressStillAvailable = networkInterfaces.some(
      (networkInterface) => networkInterface.address === selectedAddress
    )
    if (!addressStillAvailable) {
      const nextAddress = networkInterfaces[0]?.address ?? ''
      runtimePairingLinkCache.selectedAddress = nextAddress
      setSelectedAddress(nextAddress)
    }
  }, [intent, networkInterfaces, selectedAddress])

  useEffect(() => {
    void loadRuntimeAccessGrants()
    return () => {
      accessGrantLoadIdRef.current += 1
    }
  }, [loadRuntimeAccessGrants])

  const clearGeneratedUrls = (): void => {
    clearGeneratedRuntimePairingLink()
    if (mountedRef.current) {
      setRuntimePairingUrl(null)
      setWebClientUrl(null)
      setRuntimePairingDeviceId(null)
      setGeneratedAddress(null)
    }
  }

  const generateRuntimePairingUrl = async (): Promise<(() => boolean) | null> => {
    if (
      generatingRef.current ||
      !selectedAddress.trim() ||
      !parseServerShareAddress(selectedAddress.trim()).ok
    ) {
      return null
    }
    generatingRef.current = true
    const address = selectedAddress.trim()
    runtimePairingLinkCache.selectedAddress = address
    setSelectedAddress(address)
    if (intent === 'custom') {
      runtimePairingLinkCache.customAddress = address
    }
    setIsGeneratingPairing(true)
    try {
      const result = await window.api.mobile.getRuntimePairingUrl({
        address,
        rotate: true,
        // Why: main gates the one-way network widen on this, so the declared choice must travel with the
        // address — the address alone cannot tell "This computer only" from a loopback tunnel front-end.
        reach: runtimePairingReachForIntent(intent)
      })
      if (!result.available) {
        clearGeneratedUrls()
        if (mountedRef.current) {
          // Why: STA-2370 — surface the specific network-exposure guidance when the widen failed; fall back
          // to the generic message for other unavailable cases (e.g. no reachable address).
          toast.error(
            result.guidance ??
              translate(
                'auto.components.settings.RuntimePairingUrlGenerator.2752126f3e',
                'Runtime pairing is unavailable.'
              )
          )
        }
        return null
      }
      if (!mountedRef.current) {
        return null
      }
      cacheGeneratedRuntimePairingLink({
        address,
        pairingUrl: result.pairingUrl,
        webClientUrl: result.webClientUrl,
        deviceId: result.deviceId
      })
      if (mountedRef.current) {
        setRuntimePairingUrl(result.pairingUrl)
        setWebClientUrl(result.webClientUrl)
        setRuntimePairingDeviceId(result.deviceId)
        setGeneratedAddress(address)
      }
      await loadRuntimeAccessGrants()
      if (mountedRef.current) {
        toast.success(
          result.webClientUrl
            ? translate(
                'auto.components.settings.RuntimePairingUrlGenerator.6dd594a507',
                'Generated web client URL.'
              )
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.11d5248e62',
                'Generated pairing URL.'
              )
        )
      }
      const completion = () =>
        mountedRef.current &&
        !generatingRef.current &&
        runtimePairingLinkCache.generatedAddress === address &&
        runtimePairingLinkCache.runtimePairingUrl === result.pairingUrl
      setGenerationCompletion(() => completion)
      return completion
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.2ed55c841a',
                'Failed to generate pairing URL.'
              )
        )
      }
      return null
    } finally {
      generatingRef.current = false
      if (mountedRef.current) {
        setIsGeneratingPairing(false)
      }
    }
  }

  const revokeRuntimeAccess = async (
    grant: RuntimeAccessGrant
  ): Promise<(() => boolean) | null> => {
    if (revokingRef.current || isLoadingAccessGrants) {
      return null
    }
    revokingRef.current = true
    setRevokingGrantId(grant.deviceId)
    try {
      const result = await window.api.mobile.revokeRuntimeAccess({ deviceId: grant.deviceId })
      if (!mountedRef.current) {
        return null
      }
      const grants = await loadRuntimeAccessGrants()
      if (
        !result.revoked ||
        !grants ||
        grants.some((entry) => entry.deviceId === grant.deviceId) ||
        !mountedRef.current
      ) {
        return null
      }
      if (runtimePairingDeviceId === grant.deviceId) {
        clearGeneratedUrls()
      }
      toast.success(
        translate(
          'auto.components.settings.RuntimePairingUrlGenerator.9f8e037c4a',
          'Shared access revoked.'
        )
      )
      const loadId = accessGrantLoadIdRef.current
      return () =>
        mountedRef.current && !revokingRef.current && accessGrantLoadIdRef.current === loadId
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.settings.RuntimePairingUrlGenerator.e8d83f2b0f',
            'Failed to revoke shared access.'
          )
        )
      }
      return null
    } finally {
      revokingRef.current = false
      if (mountedRef.current) {
        setRevokingGrantId(null)
      }
    }
  }

  const containerClassName = framed
    ? 'space-y-3 rounded-lg border border-border/50 bg-muted/25 p-3'
    : 'space-y-4'
  const sharedAccessClassName = showGeneratorForm ? 'border-t border-border/40 pt-3' : ''

  const updateSelectedAddress = (address: string): void => {
    runtimePairingLinkCache.selectedAddress = address
    setSelectedAddress(address)
    if (
      intent === 'another' &&
      !networkInterfaces.some((networkInterface) => networkInterface.address === address)
    ) {
      runtimePairingLinkCache.customAddress = address
      runtimePairingLinkCache.intent = 'custom'
      setIntent('custom')
    } else if (intent === 'custom') {
      runtimePairingLinkCache.customAddress = address
    }
  }

  const updateIntent = (nextIntent: RuntimePairingIntent): void => {
    setIntent(nextIntent)
    setSelectedAddress(
      selectRuntimePairingIntent(
        nextIntent,
        networkInterfaces,
        runtimePairingLinkCache.customAddress
      )
    )
  }

  useRuntimeLinkViewer({
    generate: (address, expectedIntent) =>
      selectedAddress.trim() === address && intent === expectedIntent
        ? generateRuntimePairingUrl()
        : Promise.resolve(null),
    matchesGeneration: (completion) => generationCompletion === completion && !isGeneratingPairing,
    copy: (target) => {
      const value = target === 'web' ? webClientUrl : runtimePairingUrl
      return value ? copyGeneratedUrl(target, value) : Promise.resolve(null)
    },
    revoke: (deviceId) => {
      const grant = runtimeAccessGrants.find((entry) => entry.deviceId === deviceId)
      return grant ? revokeRuntimeAccess(grant) : Promise.resolve(null)
    },
    read: () => ({
      formVisible: showGeneratorForm,
      intent,
      addressSet: selectedAddress.length > 0,
      refreshing: refreshingNetworkInterfaces,
      grantsLoading: isLoadingAccessGrants,
      grantCount: runtimeAccessGrants.length,
      generating: isGeneratingPairing,
      pairingAvailable: runtimePairingUrl !== null,
      webAvailable: webClientUrl !== null,
      current: generatedAddress !== null && generatedAddress === selectedAddress,
      copiedTarget
    }),
    intent: updateIntent,
    address: (value) => {
      if (
        intent === 'local' ||
        (intent === 'another' &&
          !networkInterfaces.some((entry) => entry.address === value) &&
          !parseServerShareAddress(value).ok)
      ) {
        return false
      }
      updateSelectedAddress(value)
      return true
    },
    matchesAddress: (value) => selectedAddress === value,
    refresh: (target) =>
      target === 'network'
        ? loadNetworkInterfaces({ showToastOnError: true })
        : loadRuntimeAccessGrants({ showToastOnError: true }),
    matchesRefresh: (target, result) =>
      target === 'network'
        ? networkInterfaces === result && !refreshingNetworkInterfaces
        : runtimeAccessGrants === result && !isLoadingAccessGrants
  })

  return (
    <div ref={setContainerNode} className={containerClassName}>
      {showHeader ? (
        <div className="space-y-1">
          <Label id="runtime-share-server-label">
            {translate(
              'auto.components.settings.RuntimePairingUrlGenerator.f8500e134a',
              'Share this Orca server'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.RuntimePairingUrlGenerator.ff80904fc4',
              'Create a revocable access grant for browser or desktop clients.'
            )}
          </p>
        </div>
      ) : null}
      {showGeneratorForm ? (
        <RuntimePairingGeneratorForm
          intent={intent}
          loopbackAddress={RUNTIME_PAIRING_LOOPBACK_ADDRESS}
          networkInterfaces={networkInterfaces}
          selectedAddress={selectedAddress}
          refreshingNetworkInterfaces={refreshingNetworkInterfaces}
          isGeneratingPairing={isGeneratingPairing}
          webClientUrl={webClientUrl}
          runtimePairingUrl={runtimePairingUrl}
          copiedTarget={copiedTarget}
          generatedAddress={generatedAddress}
          onIntentChange={updateIntent}
          onSelectedAddressChange={updateSelectedAddress}
          onRefreshNetworkInterfaces={() => void loadNetworkInterfaces({ showToastOnError: true })}
          onGenerate={() => void generateRuntimePairingUrl()}
          onCopy={(target, value) => void copyGeneratedUrl(target, value)}
        />
      ) : null}

      <RuntimeAccessGrantList
        className={sharedAccessClassName}
        grants={runtimeAccessGrants}
        currentGrantId={runtimePairingDeviceId}
        isLoading={isLoadingAccessGrants}
        revokingGrantId={revokingGrantId}
        onRefresh={() => void loadRuntimeAccessGrants({ showToastOnError: true })}
        onRevoke={(grant) => void revokeRuntimeAccess(grant)}
      />
    </div>
  )
}
