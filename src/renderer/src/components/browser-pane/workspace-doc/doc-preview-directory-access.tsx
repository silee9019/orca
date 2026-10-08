import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DocPreviewFileFailure } from '../../../../../shared/doc-preview-scheme'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

function requestedDirectory(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/')
  return separator === -1 ? '.' : relativePath.slice(0, separator)
}

function requestedDirectoryLabel(relativePath: string, worktreeRoot: string | null): string {
  const directory = requestedDirectory(relativePath)
  return directory === '.' && worktreeRoot ? worktreeRoot : directory
}

function reportAuthorizationFailure(): void {
  toast.error(
    translate(
      'auto.components.editor.HtmlDocPreview.directoryAuthorizationFailed',
      'Could not allow access to this directory.'
    )
  )
}

/**
 * All blocked folders a load has surfaced so far, batched into one decision: a reader cannot
 * meaningfully judge `assets/` and `data/` separately, and N sequential banners only train the
 * allow reflex. What is granted is exactly the set named on the banner, never more.
 */
export function useDocPreviewDirectoryAccess({
  grantId,
  reloadRef
}: {
  grantId: string | null
  reloadRef: RefObject<(() => void) | null>
}): {
  requests: DocPreviewFileFailure[]
  busy: boolean
  offer: (failure: DocPreviewFileFailure) => void
  reset: () => void
  dismiss: () => void
  allow: () => Promise<boolean>
  getPendingPaths: () => string[]
} {
  // Why a ref plus a version tick and not state alone: dismiss must fence the directory against
  // an offer landing in the same event batch, which a state updater sees one render too late.
  const requestsByDirectoryRef = useRef(new Map<string, DocPreviewFileFailure>())
  const [, setRequestsVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const dismissedDirectoriesRef = useRef(new Set<string>())
  const generationRef = useRef(0)
  const busyRef = useRef(false)
  const grantRef = useRef(grantId)
  grantRef.current = grantId
  useEffect(
    () => () => {
      generationRef.current += 1
    },
    []
  )
  const offer = useCallback((failure: DocPreviewFileFailure) => {
    const directory = requestedDirectory(failure.relativePath)
    if (
      dismissedDirectoriesRef.current.has(directory) ||
      requestsByDirectoryRef.current.has(directory)
    ) {
      return
    }
    requestsByDirectoryRef.current.set(directory, failure)
    setRequestsVersion((version) => version + 1)
  }, [])
  const reset = useCallback(() => {
    generationRef.current += 1
    busyRef.current = false
    requestsByDirectoryRef.current = new Map()
    dismissedDirectoriesRef.current.clear()
    setBusy(false)
    setRequestsVersion((version) => version + 1)
  }, [])
  const dismiss = useCallback(() => {
    generationRef.current += 1
    for (const directory of requestsByDirectoryRef.current.keys()) {
      dismissedDirectoriesRef.current.add(directory)
    }
    requestsByDirectoryRef.current = new Map()
    setRequestsVersion((version) => version + 1)
  }, [])
  const allow = useCallback(async (): Promise<boolean> => {
    const pending = [...requestsByDirectoryRef.current.entries()]
    if (pending.length === 0 || !grantId || busyRef.current) {
      return false
    }
    const generation = generationRef.current
    const current = (): boolean =>
      generationRef.current === generation && grantRef.current === grantId
    busyRef.current = true
    setBusy(true)
    try {
      for (const [, failure] of pending) {
        if (!current()) {
          return false
        }
        const accepted = await window.api.docPreview.authorizeDirectory(
          grantId,
          failure.relativePath
        )
        if (!current()) {
          return false
        }
        if (!accepted) {
          reportAuthorizationFailure()
          return false
        }
      }
      for (const [directory, failure] of pending) {
        if (requestsByDirectoryRef.current.get(directory) === failure) {
          requestsByDirectoryRef.current.delete(directory)
        }
      }
      setRequestsVersion((version) => version + 1)
      reloadRef.current?.()
      return true
    } catch {
      if (current()) {
        reportAuthorizationFailure()
      }
      return false
    } finally {
      if (current()) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }, [grantId, reloadRef])
  return {
    requests: [...requestsByDirectoryRef.current.values()],
    busy,
    offer,
    reset,
    dismiss,
    allow,
    getPendingPaths: () =>
      [...requestsByDirectoryRef.current.values()].map((item) => item.relativePath)
  }
}

const MAX_NAMED_FOLDERS = 3

function requestedFolderSentence(labels: string[]): string {
  if (labels.length === 1) {
    return translate(
      'auto.components.editor.HtmlDocPreview.directoryAccessRequest',
      'This preview wants to read files in {{path}}.',
      { path: labels[0] }
    )
  }
  const named = labels.slice(0, MAX_NAMED_FOLDERS)
  const remainder = labels.length - named.length
  const folders =
    remainder > 0
      ? translate(
          'auto.components.editor.HtmlDocPreview.directoryAccessRequestOverflow',
          '{{folders}}, and {{count}} more',
          { folders: named.join(', '), count: remainder }
        )
      : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`
  return translate(
    'auto.components.editor.HtmlDocPreview.directoryAccessRequestMultiple',
    'This preview wants to read files in {{folders}}.',
    { folders }
  )
}

export function DocPreviewDirectoryAccessBanner({
  requests,
  busy,
  worktreeRoot,
  onDismiss,
  onAllow
}: {
  requests: DocPreviewFileFailure[]
  busy: boolean
  worktreeRoot: string | null
  onDismiss: () => void
  onAllow: () => Promise<unknown>
}): React.JSX.Element {
  const labels = requests.map((request) =>
    requestedDirectoryLabel(request.relativePath, worktreeRoot)
  )
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1 text-xs" role="status">
      <AlertCircle className="size-3.5 shrink-0 text-muted-foreground" />
      {/* The title carries every folder in full, for when the sentence truncates past three. */}
      <span className="min-w-0 flex-1 text-muted-foreground" title={labels.join('\n')}>
        {requestedFolderSentence(labels)}
      </span>
      <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onDismiss}>
        {translate('auto.components.editor.HtmlDocPreview.dismissAccessRequest', 'Dismiss')}
      </Button>
      <Button type="button" size="xs" disabled={busy} onClick={() => void onAllow()}>
        {busy ? <Loader2 className="size-3 animate-spin" /> : null}
        {labels.length === 1
          ? translate('auto.components.editor.HtmlDocPreview.allowDirectory', 'Allow folder')
          : translate(
              'auto.components.editor.HtmlDocPreview.allowDirectories',
              'Allow {{count}} folders',
              { count: labels.length }
            )}
      </Button>
    </div>
  )
}
