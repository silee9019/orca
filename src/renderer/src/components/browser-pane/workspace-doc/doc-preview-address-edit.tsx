import {
  BROWSER_ADDRESS_COMMAND_EVENT,
  requestBrowserAddress,
  type BrowserAddressEvent
} from '@/runtime/browser-address-request'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import BrowserAddressBar from '@/components/browser-pane/assemble-chrome/BrowserAddressBar'
import { resolveBrowserAddressBarSubmission } from '@/components/browser-pane/navigate/browser-address-bar-navigation'
import { translate } from '@/i18n/i18n'
import { convertBrowserPageToWorkspaceDoc } from '@/lib/file-preview'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import { useAppStore } from '@/store'
import { DocPreviewDocumentChip } from './doc-preview-document-chip'
import type { DocPreviewDocumentIdentity } from './doc-preview-document-identity'

/**
 * The chip until the reader asks to type: clicking it swaps in the shared address bar, prefilled
 * with the document's workspace-relative path and selected. Committing a web URL converts the tab
 * in place — the preview becomes an ordinary browser tab from then on. The conversion replaces the
 * page, so a successful commit unmounts this whole pane; only a refused commit stays here.
 */
export function DocPreviewAddressEdit({
  identity,
  submitAddressRef,
  previewId,
  worktreeId,
  isActive = true
}: {
  submitAddressRef?: RefObject<(() => boolean) | null>
  identity: DocPreviewDocumentIdentity
  previewId: string
  worktreeId: string
  isActive?: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dismissSuggestionsRef = useRef<(() => void) | null>(null)
  const exitTimerRef = useRef<number | null>(null)
  const pendingCommand = useRef<BrowserAddressEvent | null>(null)
  const submittedRef = useRef(false)

  const beginEdit = useCallback((): void => {
    setValue(`${identity.directoryPrefix}${identity.fileName}`)
    setEditing(true)
  }, [identity.directoryPrefix, identity.fileName])

  const exitEdit = useCallback((): void => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
    setEditing(false)
  }, [])

  useEffect(() => {
    if (!editing) {
      return
    }
    const input = inputRef.current
    input?.focus()
    input?.select()
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  }, [editing])

  const navigateToUrl = useCallback(
    (url: string): void => {
      // Why refused here too: a suggestion click bypasses the typed-input resolver, and a doc tab
      // exists because its file is not this machine's — a file: target would resolve on the wrong
      // host exactly like the typed case.
      if (url.startsWith('file:')) {
        toast.error(
          translate(
            'auto.components.browser.pane.BrowserPane.fileUrlUnsupported',
            'This browser tab cannot open local files. Use "Open Preview to the Side" on the file instead.'
          )
        )
        return
      }
      const converted = useAppStore.getState().convertBrowserPage(previewId, { kind: 'web', url })
      submittedRef.current = !!converted
      if (!converted) {
        exitEdit()
      }
    },
    [exitEdit, previewId]
  )

  const submit = useCallback((): void => {
    submittedRef.current = false
    const typed = inputRef.current?.value ?? ''
    // A workspace path retargets the preview (fresh grant, same tab) — or activates the tab the
    // document is already open in, which is what opening a document has always meant.
    const docTarget = resolveWorkspaceDocAddressTarget(useAppStore.getState(), worktreeId, typed)
    if (docTarget.status === 'workspace-doc') {
      submittedRef.current =
        convertBrowserPageToWorkspaceDoc(previewId, docTarget.docLocation) !== 'failed'
      exitEdit()
      return
    }
    if (docTarget.status === 'unsupported') {
      toast.error(docTarget.message)
      return
    }
    const submission = resolveBrowserAddressBarSubmission(typed, {
      allowFileUrls: false
    })
    if (submission.status === 'navigate') {
      navigateToUrl(submission.url)
      return
    }
    toast.error(submission.loadError.description)
  }, [exitEdit, navigateToUrl, previewId, worktreeId])

  useLayoutEffect(() => {
    if (!submitAddressRef) {
      return
    }
    submitAddressRef.current =
      editing && isActive
        ? () => {
            submittedRef.current = false
            inputRef.current?.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
            )
            return submittedRef.current
          }
        : null
    return () => {
      submitAddressRef.current = null
    }
  }, [editing, isActive, submitAddressRef, submit])

  useEffect(() => {
    const pending = pendingCommand.current
    if (!pending) {
      return
    }
    pendingCommand.current = null
    if (editing) {
      void requestBrowserAddress(previewId, { action: 'status' }, pending.expiresAt).then(
        (state) => pending.finish(undefined, state),
        (error: unknown) =>
          pending.finish(error instanceof Error ? error : new Error('browser_address_failed'))
      )
    } else {
      pending.finish(undefined, {
        value,
        open: false,
        focused: false,
        selectedIndex: -1,
        suggestions: []
      })
    }
  })
  useEffect(() => {
    const receive = (event: CustomEvent<BrowserAddressEvent>): void => {
      const request = event.detail
      if (request.page !== previewId || (editing && request.command.action !== 'dismiss')) {
        return
      }
      if (!request.claim()) {
        return
      }
      if (!isActive || request.expiresAt <= Date.now()) {
        request.finish(new Error('browser_address_viewer_inactive_or_expired'))
        return
      }
      if (!editing && request.command.action === 'status') {
        request.finish(undefined, {
          value,
          open: false,
          focused: false,
          selectedIndex: -1,
          suggestions: []
        })
      } else if (!editing && request.command.action === 'open') {
        pendingCommand.current = request
        beginEdit()
      } else if (editing && request.command.action === 'dismiss') {
        pendingCommand.current = request
        exitEdit()
      } else {
        request.finish(new Error('browser_address_editor_closed'))
      }
    }
    window.addEventListener(BROWSER_ADDRESS_COMMAND_EVENT, receive, true)
    return () => window.removeEventListener(BROWSER_ADDRESS_COMMAND_EVENT, receive, true)
  }, [beginEdit, editing, exitEdit, isActive, previewId, value])
  useEffect(
    () => () => {
      pendingCommand.current?.finish(new Error('browser_address_ui_unavailable'))
    },
    [previewId]
  )

  if (!editing) {
    return <DocPreviewDocumentChip identity={identity} onBeginEdit={beginEdit} />
  }

  return (
    <div
      className="flex min-w-0 flex-1"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          exitEdit()
        }
      }}
      onBlur={(event) => {
        // Why a grace timer and not an immediate exit: a suggestion click blurs the input before
        // its own click lands, and unmounting the list mid-gesture would swallow the commit.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return
        }
        exitTimerRef.current = window.setTimeout(() => setEditing(false), 200)
      }}
      onFocus={() => {
        if (exitTimerRef.current !== null) {
          window.clearTimeout(exitTimerRef.current)
          exitTimerRef.current = null
        }
      }}
    >
      <BrowserAddressBar
        commandOwner={{ page: previewId, active: isActive }}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        onNavigate={navigateToUrl}
        onOpenWorkspaceDoc={(docLocation) => {
          convertBrowserPageToWorkspaceDoc(previewId, docLocation)
          exitEdit()
        }}
        inputRef={inputRef}
        dismissSuggestionsRef={dismissSuggestionsRef}
      />
    </div>
  )
}
