import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { translate } from '@/i18n/i18n'
import type { BrowserDownloadState } from './browser-download-progress'
import { useBrowserPageDownloadEvents } from './use-browser-page-download-events'
import { useBrowserDownloadCommands } from './use-browser-download-commands'
export function useBrowserPageDownloadActions(
  browserTabId: string,
  active: boolean,
  setResourceNotice: Dispatch<SetStateAction<string | null>>
) {
  const { downloadStates, setDownloadStates } = useBrowserPageDownloadEvents({
    browserTabId,
    setResourceNotice
  })
  const dismissBrowserDownload = useCallback(
    (downloadId: string) => {
      setDownloadStates((current) =>
        current.filter((download) => download.downloadId !== downloadId)
      )
    },
    [setDownloadStates]
  )

  const handleOpenDownloadedFile = useCallback(
    async (download: BrowserDownloadState) => {
      if (!download.savePath) {
        setResourceNotice(
          translate(
            'auto.components.browser.pane.BrowserPane.9f6f2e8c19',
            'The downloaded file path is unavailable.'
          )
        )
        return false
      }
      const opened = await window.api.shell.openFilePath(download.savePath)
      if (opened !== true) {
        setResourceNotice(
          translate(
            'auto.components.browser.pane.BrowserPane.0c79b7634d',
            'Could not open the downloaded file. It may have been moved or deleted.'
          )
        )
      }
      return opened === true
    },
    [setResourceNotice]
  )

  const handleShowDownloadedFile = useCallback(
    async (download: BrowserDownloadState) => {
      if (!download.savePath) {
        setResourceNotice(
          translate(
            'auto.components.browser.pane.BrowserPane.9f6f2e8c19',
            'The downloaded file path is unavailable.'
          )
        )
        return false
      }
      const result = await window.api.shell.openInFileManager(download.savePath)
      if (result?.ok !== true) {
        setResourceNotice(
          translate(
            'auto.components.browser.pane.BrowserPane.397d9dc923',
            'Could not show the downloaded file. It may have been moved or deleted.'
          )
        )
      }
      return result?.ok === true
    },
    [setResourceNotice]
  )

  const visibleDownloads = (() => {
    const active = downloadStates.filter((download) => download.status === 'downloading')
    const recent = downloadStates
      .filter((download) => download.status !== 'downloading')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 3)
    return [...active, ...recent]
  })()

  useBrowserDownloadCommands(
    browserTabId,
    active,
    downloadStates,
    dismissBrowserDownload,
    handleOpenDownloadedFile,
    handleShowDownloadedFile
  )
  return {
    visibleDownloads,
    dismissBrowserDownload,
    handleOpenDownloadedFile,
    handleShowDownloadedFile
  }
}
