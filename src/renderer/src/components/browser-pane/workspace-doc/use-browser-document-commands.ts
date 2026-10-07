import { useEffect, useRef, type RefObject } from 'react'
import type { DocPreviewFileFailure } from '../../../../../shared/doc-preview-scheme'
import type { BrowserDocumentState } from '../../../../../shared/rpc-contract/browser-document-params'
import {
  BROWSER_DOCUMENT_COMMAND_EVENT,
  type BrowserDocumentEvent
} from '@/runtime/browser-document-request'
import { writeVerifiedClipboardText } from '@/runtime/clipboard-text-write'

export function useBrowserDocumentCommands(owner: {
  previewId: string
  worktreeId: string
  isActive: boolean
  phase: BrowserDocumentState['phase']
  grantReady: boolean
  requests: DocPreviewFileFailure[]
  busy: boolean
  absolutePath: string
  relativePath: string
  reload: () => void
  hardReload: () => void
  allow: () => Promise<boolean>
  getPendingPaths: () => string[]
  openExternal: () => Promise<boolean>
  openSource: () => string
  dismiss: () => void
  reloadRef: RefObject<(() => void) | null>
}): void {
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  useEffect(() => {
    let active = true
    const pending = new Set<BrowserDocumentEvent>()
    const receive = (event: CustomEvent<BrowserDocumentEvent>): void => {
      const request = event.detail
      const owner = ownerRef.current
      if (request.page !== owner.previewId || !request.claim()) {
        return
      }
      pending.add(request)
      const execute = async (): Promise<void> => {
        if (!owner.isActive || request.expiresAt <= Date.now()) {
          throw new Error('browser_document_owner_inactive_or_expired')
        }
        const state: BrowserDocumentState = {
          page: owner.previewId,
          worktreeId: owner.worktreeId,
          phase: owner.phase,
          grantReady: owner.grantReady,
          pendingPaths: owner.requests.map((item) => item.relativePath),
          busy: owner.busy
        }
        switch (request.command.action) {
          case 'status':
            break
          case 'reload':
            if (owner.phase !== 'unavailable' && !owner.reloadRef.current) {
              throw new Error('browser_document_guest_unavailable')
            }
            owner.reload()
            state.navigationRequested = true
            break
          case 'hard-reload':
            owner.hardReload()
            state.navigationRequested = true
            break
          case 'copy-path':
          case 'copy-relative-path':
            if (
              !(await writeVerifiedClipboardText(
                request.command.action === 'copy-path' ? owner.absolutePath : owner.relativePath
              ))
            ) {
              throw new Error('browser_document_clipboard_not_verified')
            }
            break
          case 'open-external':
            if (!(await owner.openExternal())) {
              throw new Error('browser_document_external_open_not_verified')
            }
            break
          case 'open-source':
            state.openedFileId = owner.openSource()
            break
          case 'directory-allow': {
            const actual = owner.getPendingPaths().slice().sort()
            const expected = [...new Set(request.command.paths)].sort()
            if (
              request.command.confirmation !== owner.previewId ||
              JSON.stringify(actual) !== JSON.stringify(expected) ||
              owner.busy
            ) {
              throw new Error('browser_document_directory_confirmation_mismatch')
            }
            if (!(await owner.allow())) {
              throw new Error('browser_document_directory_not_authorized_effect_unknown')
            }
            state.pendingPaths = owner.getPendingPaths()
            state.busy = false
            state.navigationRequested = true
            break
          }
          case 'directory-dismiss':
            if (owner.busy) {
              throw new Error('browser_document_directory_busy')
            }
            owner.dismiss()
            state.pendingPaths = []
            break
        }
        if (!active || request.isSettled() || request.expiresAt <= Date.now()) {
          throw new Error('browser_document_owner_changed_effect_unknown')
        }
        request.finish(undefined, state)
      }
      void execute()
        .catch((error: unknown) =>
          request.finish(error instanceof Error ? error : new Error('browser_document_failed'))
        )
        .finally(() => pending.delete(request))
    }
    window.addEventListener(BROWSER_DOCUMENT_COMMAND_EVENT, receive)
    return () => {
      active = false
      window.removeEventListener(BROWSER_DOCUMENT_COMMAND_EVENT, receive)
      for (const request of pending) {
        request.finish(new Error('browser_document_owner_changed_effect_unknown'))
      }
    }
  }, [owner.previewId, owner.worktreeId, owner.isActive, owner.absolutePath])
}
