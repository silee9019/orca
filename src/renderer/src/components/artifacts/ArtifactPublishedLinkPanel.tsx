import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { copyArtifactLink, openArtifactInBrowser } from './artifact-link-actions'

export type ArtifactPublishedLinkControl = {
  shareUrl: string
  copied: boolean
  copy: () => Promise<boolean>
  open: () => Promise<boolean>
}

export function ArtifactPublishedLinkPanel({
  shareUrl,
  publishing,
  sharingEnabled,
  onUpdate,
  viewerRef
}: {
  shareUrl: string
  publishing: boolean
  sharingEnabled: boolean
  onUpdate: () => Promise<boolean>
  viewerRef?: RefObject<ArtifactPublishedLinkControl | null>
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  const clearCopiedResetTimer = useCallback((): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current)
      copiedResetTimerRef.current = null
    }
  }, [])
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      mountedRef.current = node !== null
      if (!node) {
        clearCopiedResetTimer()
      }
    },
    [clearCopiedResetTimer]
  )

  const copyLink = async (): Promise<boolean> => {
    if (!(await copyArtifactLink(shareUrl, { showSuccessToast: false }))) {
      return false
    }
    if (!mountedRef.current) {
      return false
    }
    setCopied(true)
    clearCopiedResetTimer()
    copiedResetTimerRef.current = window.setTimeout(() => {
      copiedResetTimerRef.current = null
      setCopied(false)
    }, 1_500)
    return true
  }
  useLayoutEffect(() => {
    if (!viewerRef) {
      return
    }
    viewerRef.current = {
      shareUrl,
      copied,
      copy: copyLink,
      open: () => openArtifactInBrowser(shareUrl)
    }
    return () => {
      viewerRef.current = null
    }
  })

  const copyLabel = copied
    ? translate('auto.components.artifacts.copySuccess', 'Artifact link copied')
    : translate('auto.components.artifacts.ArtifactPublishedLinkPanel.copyLink', 'Copy link')

  return (
    <div ref={setPanelRef} className="space-y-3">
      <div className="flex min-w-0 items-center gap-0.5">
        <p
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
          title={shareUrl}
        >
          {shareUrl}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => void copyLink()}
              aria-label={copyLabel}
            >
              {copied ? <Check className="size-3.5" /> : <Copy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {copyLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => openArtifactInBrowser(shareUrl)}
              aria-label={translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.openLink',
                'Open link'
              )}
            >
              <ExternalLink />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {translate(
              'auto.components.artifacts.ArtifactPublishedLinkPanel.openLink',
              'Open link'
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {sharingEnabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={publishing}
          onClick={onUpdate}
        >
          {publishing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {publishing
            ? translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.updating',
                'Updating…'
              )
            : translate(
                'auto.components.artifacts.ArtifactPublishedLinkPanel.update',
                'Update shared content'
              )}
        </Button>
      ) : null}
    </div>
  )
}
