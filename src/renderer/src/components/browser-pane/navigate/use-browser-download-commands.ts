import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  BROWSER_DOWNLOAD_COMMAND_EVENT,
  type BrowserDownloadEvent
} from '@/runtime/browser-download-request'
import type { BrowserDownloadState } from './browser-download-progress'
export function useBrowserDownloadCommands(
  page: string,
  active: boolean,
  downloads: BrowserDownloadState[],
  dismiss: (id: string) => void,
  open: (download: BrowserDownloadState) => Promise<boolean>,
  show: (download: BrowserDownloadState) => Promise<boolean>
): void {
  const current = useRef({ active, downloads })
  const alive = useRef(false)
  const pending = useRef<BrowserDownloadEvent | null>(null)
  useLayoutEffect(() => {
    current.current = { active, downloads }
  })
  useEffect(() => {
    const request = pending.current
    if (request?.action !== 'dismiss' || request.isSettled()) {
      return
    }
    if (!active || Date.now() >= request.expiresAt) {
      request.finish(new Error('browser_download_owner_changed_effect_unknown'))
      pending.current = null
    } else if (!downloads.some((download) => download.downloadId === request.downloadId)) {
      request.finish(undefined, {
        action: 'dismiss',
        downloadId: request.downloadId,
        present: false,
        accepted: true
      })
      pending.current = null
    }
  })
  useEffect(() => {
    alive.current = true
    const receive = (event: WindowEventMap['orca:browser-download-command']): void => {
      const request = event.detail
      if (request.page !== page) {
        return
      }
      request.offer(active, () => {
        void execute(request)
      })
    }
    async function execute(request: BrowserDownloadEvent): Promise<void> {
      const download = current.current.downloads.find(
        (value) => value.downloadId === request.downloadId
      )
      if (!download) {
        request.finish(new Error('browser_download_not_found'))
        return
      }
      if (pending.current && !pending.current.isSettled()) {
        request.finish(new Error('browser_download_busy'))
        return
      }
      if (request.action === 'status') {
        request.finish(undefined, {
          downloadId: download.downloadId,
          action: 'status',
          present: true,
          status: download.status,
          accepted: false
        })
        return
      }
      if (
        (request.action === 'dismiss' && download.status === 'downloading') ||
        (request.action !== 'dismiss' && download.status !== 'completed')
      ) {
        request.finish(new Error('browser_download_action_unavailable'))
        return
      }
      pending.current = request
      try {
        if (request.action === 'dismiss') {
          dismiss(download.downloadId)
          return
        }
        const accepted = await (request.action === 'open' ? open(download) : show(download))
        const latest = current.current.downloads.find(
          (value) => value.downloadId === download.downloadId
        )
        if (
          !alive.current ||
          !current.current.active ||
          request.isSettled() ||
          Date.now() >= request.expiresAt ||
          latest?.savePath !== download.savePath ||
          latest?.status !== download.status
        ) {
          throw new Error('browser_download_owner_changed_effect_unknown')
        }
        if (accepted !== true) {
          throw new Error('browser_download_native_rejected')
        }
        request.finish(undefined, {
          downloadId: download.downloadId,
          action: request.action,
          present: true,
          status: download.status,
          accepted: true
        })
      } catch (error) {
        request.finish(error instanceof Error ? error : new Error('browser_download_failed'))
      } finally {
        if (pending.current === request && (request.action !== 'dismiss' || request.isSettled())) {
          pending.current = null
        }
      }
    }
    window.addEventListener(BROWSER_DOWNLOAD_COMMAND_EVENT, receive)
    return () => {
      alive.current = false
      pending.current?.finish(new Error('browser_download_owner_unavailable_effect_unknown'))
      pending.current = null
      window.removeEventListener(BROWSER_DOWNLOAD_COMMAND_EVENT, receive)
    }
  }, [page, active, dismiss, open, show])
}
