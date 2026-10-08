import { stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { defineMethod } from '../core'
import {
  DesktopSelectPathParams,
  DesktopShellPathParams,
  DesktopShellUrlParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext } from './desktop-app-target'

export const DESKTOP_SHELL_METHODS = [
  defineMethod({
    name: 'desktopShell.openUrl',
    params: DesktopShellUrlParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      await (await import('../../../ipc/shell')).openShellUrl(params.url)
      return { state: 'requested' as const }
    }
  }),
  defineMethod({
    name: 'desktopShell.openPath',
    params: DesktopShellPathParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      const { mainProcessState } = await import('../../../startup/main-process-state')
      if (!mainProcessState.store) {
        throw new Error('Desktop store is unavailable')
      }
      return (await import('../../../ipc/shell')).openInFileManager(
        mainProcessState.store,
        params.path
      )
    }
  }),
  defineMethod({
    name: 'desktopShell.pathExists',
    params: DesktopShellPathParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (!isAbsolute(params.path)) {
        throw new Error('Path must be absolute on the addressed host')
      }
      return (await import('../../../ipc/shell')).pathExists(params.path)
    }
  }),
  defineMethod({
    name: 'desktopShell.selectPath',
    params: DesktopSelectPathParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (!isAbsolute(params.path)) {
        throw new Error('Path must be absolute on the addressed host')
      }
      const info = await stat(params.path)
      const directory = params.kind === 'directory' || params.kind === 'floating-directory'
      if (directory ? !info.isDirectory() : !info.isFile()) {
        throw new Error('Selected path has the wrong file type')
      }
      const extension = extname(params.path).slice(1).toLowerCase()
      if (
        params.kind === 'image' &&
        !['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension)
      ) {
        throw new Error('Unsupported image format')
      }
      if (
        params.kind === 'audio' &&
        !['ogg', 'mp3', 'wav', 'm4a', 'aac', 'flac'].includes(extension)
      ) {
        throw new Error('Unsupported audio format')
      }
      if (params.kind === 'floating-directory') {
        const { mainProcessState } = await import('../../../startup/main-process-state')
        if (!mainProcessState.store) {
          throw new Error('Desktop store is unavailable')
        }
        await (
          await import('../../../ipc/floating-workspace-directory')
        ).trustFloatingWorkspaceDirectory(mainProcessState.store, params.path)
      }
      if (params.kind === 'floating-markdown') {
        const markdown = await import('../../../ipc/markdown-documents')
        if (!markdown.isMarkdownDocumentName(params.path)) {
          throw new Error('Selected file is not markdown')
        }
        const cwd = await (
          await import('../../../ipc/floating-workspace-directory')
        ).ensureDefaultFloatingWorkspacePath()
        return markdown.markdownDocumentFromFilePath(cwd, params.path, {
          outsideRootRelativePath: 'basename'
        })
      }
      return { path: params.path, kind: params.kind }
    }
  })
]
