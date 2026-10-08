import {
  importExternalPathsForDesktop,
  resolveDroppedPathsForDesktop
} from '../desktop-external-path-import'
import { setDesktopExternalPathImportForRpc } from '../runtime/rpc/methods/workspace-external-path-import'
import { createDesktopDirectory } from '../desktop-filesystem-path-commands'
import { setDesktopDirectoryCreateForRpc } from '../runtime/rpc/methods/workspace-host-path'
import { app, ipcMain } from 'electron'
import { constants } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Store } from '../persistence'
import {
  resolveDesktopAuthorizedPath,
  resolveLocalRenamePaths
} from './local-file-access-resolution'
import type { LocalFileAccess } from '../../shared/local-file-access'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { SshMutationExpectation } from '../../shared/ssh-types'
import { assertSshMutationExpectation } from '../ssh/ssh-connection-generation'
import { renameLocalPathSerializedByDestination } from '../destination-serialized-local-rename'
import { rethrowWithUserMessage } from './filesystem-create-path-guards'
import type {
  ImportItemResult,
  ResolveDroppedPathsResult,
  StagedExternalImportSource
} from '../../shared/filesystem-import-result-types'
import {
  stagedRuntimeUploadByteLength,
  stageOneSourceForRuntimeUpload
} from './filesystem-runtime-upload-staging'
import { streamExternalFileToRuntime } from './runtime-upload-file-stream'
import { abortWhenRendererGone } from './renderer-lifetime-abort'
import { sweepAbandonedRuntimeUploadTempPath } from './runtime-upload-temp-sweep'
import type { RuntimeUploadFileStreamRequest } from '../../shared/runtime-upload-staging-contract'
import { resolveEnvironment } from '../../shared/runtime-environment-store'

/**
 * IPC handlers for file/folder creation and renaming.
 * Deletion is handled separately via `fs:deletePath` (shell.trashItem).
 */
export function registerFilesystemMutationHandlers(store: Store): void {
  setDesktopDirectoryCreateForRpc((args) => createDesktopDirectory(store, args))
  setDesktopExternalPathImportForRpc({
    importPaths: (args) => importExternalPathsForDesktop(store, args),
    resolveDropped: resolveDroppedPathsForDesktop
  })
  ipcMain.handle(
    'fs:createFile',
    async (
      _event,
      args: { filePath: string; connectionId?: string } & SshMutationExpectation
    ): Promise<void> => {
      assertSshMutationExpectation(
        args.connectionId,
        args.expectedSshTargetId,
        args.expectedSshConnectionGeneration,
        args.expectedExecutionHostId
      )
      if (args.connectionId) {
        const provider = requireSshFilesystemProvider(args.connectionId)
        return provider.createFile(args.filePath)
      }
      const filePath = await resolveDesktopAuthorizedPath(args.filePath, store)
      await mkdir(dirname(filePath), { recursive: true })
      try {
        // Use the 'wx' flag for atomic create-if-not-exists, avoiding TOCTOU races
        await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
      } catch (error) {
        rethrowWithUserMessage(error, filePath)
      }
    }
  )

  ipcMain.handle(
    'fs:createDir',
    async (
      _event,
      args: { dirPath: string; connectionId?: string } & SshMutationExpectation
    ): Promise<void> => {
      return createDesktopDirectory(store, args)
    }
  )

  // Note: fs.rename throws EXDEV if old and new paths are on different
  // filesystems/volumes. This is unlikely since both paths are under the same
  // workspace root, but a cross-drive rename would surface as an IPC error.
  ipcMain.handle(
    'fs:rename',
    async (
      _event,
      args: {
        oldPath: string
        newPath: string
        connectionId?: string
        access?: LocalFileAccess
      } & SshMutationExpectation
    ): Promise<void> => {
      assertSshMutationExpectation(
        args.connectionId,
        args.expectedSshTargetId,
        args.expectedSshConnectionGeneration,
        args.expectedExecutionHostId
      )
      if (args.connectionId) {
        const provider = requireSshFilesystemProvider(args.connectionId)
        return provider.renameNoClobber(args.oldPath, args.newPath)
      }
      // Why: rename() operates on directory entries, not file contents. If
      // oldPath is a symlink, we must rename the link itself rather than
      // resolving it to its target — following the link would rename the
      // target file (potentially elsewhere in the worktree) and leave the
      // symlink dangling. newPath must also preserve its leaf so we don't
      // accidentally write into a symlinked destination name.
      // Outside every project, a document the user opened may still be renamed, to any path.
      const { from, to } = await resolveLocalRenamePaths(
        args.oldPath,
        args.newPath,
        args.access,
        store
      )
      await renameLocalPathSerializedByDestination(from, to)
    }
  )

  ipcMain.handle(
    'fs:copy',
    async (
      _event,
      args: {
        sourcePath: string
        destinationPath: string
        connectionId?: string
      } & SshMutationExpectation
    ): Promise<void> => {
      assertSshMutationExpectation(
        args.connectionId,
        args.expectedSshTargetId,
        args.expectedSshConnectionGeneration,
        args.expectedExecutionHostId
      )
      if (args.connectionId) {
        const provider = requireSshFilesystemProvider(args.connectionId)
        return provider.copy(args.sourcePath, args.destinationPath)
      }
      const sourcePath = await resolveDesktopAuthorizedPath(args.sourcePath, store, {
        preserveSymlink: true
      })
      const destinationPath = await resolveDesktopAuthorizedPath(args.destinationPath, store, {
        preserveSymlink: true
      })
      await mkdir(dirname(destinationPath), { recursive: true })
      // Why: duplicate/copy callers deconflict before copying. COPYFILE_EXCL
      // keeps a late race from silently overwriting an existing file.
      await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL)
    }
  )

  ipcMain.handle(
    'fs:importExternalPaths',
    async (
      _event,
      args: {
        sourcePaths: string[]
        destDir: string
        connectionId?: string
        ensureDir?: boolean
        access?: LocalFileAccess
      } & SshMutationExpectation
    ): Promise<{ results: ImportItemResult[] }> => importExternalPathsForDesktop(store, args)
  )

  ipcMain.handle(
    'fs:stageExternalPathsForRuntimeUpload',
    async (
      _event,
      args: { sourcePaths: string[] }
    ): Promise<{ sources: StagedExternalImportSource[] }> => {
      const sources: StagedExternalImportSource[] = []
      // Why: one budget for the whole drop — per-source counters would let five
      // 2 GB files through a ceiling meant to cap the drop.
      let totalBytes = 0
      for (const sourcePath of args.sourcePaths) {
        const source = await stageOneSourceForRuntimeUpload(sourcePath, totalBytes)
        totalBytes += stagedRuntimeUploadByteLength(source)
        sources.push(source)
      }
      return { sources }
    }
  )

  // Why: the file handle and the runtime socket both live in main, so the byte
  // pump runs here. The renderer keeps deconflict/commit/rollback orchestration
  // and never sees file contents.
  ipcMain.handle(
    'fs:uploadExternalFileToRuntime',
    async (event, args: RuntimeUploadFileStreamRequest): Promise<{ byteLength: number }> => {
      const userDataPath = app.getPath('userData')
      // Why: the streamer's manual-disconnect check keys on the environment id,
      // and the renderer may pass any selector the store resolves.
      const request = {
        ...args,
        environmentId: resolveEnvironment(userDataPath, args.environmentId).id
      }
      // Why: the renderer's own loop died with its window. Now that the bytes
      // move in main, a reload or close has to stop the transfer explicitly,
      // or a multi-GB upload outlives the window that asked for it.
      const lifetime = abortWhenRendererGone(event.sender)
      try {
        return await streamExternalFileToRuntime({
          ...request,
          userDataPath,
          signal: lifetime.signal
        })
      } catch (error) {
        if (lifetime.signal.aborted) {
          // Why: the renderer owns temp cleanup, and it is gone — so the
          // abandoned temp path is only collectable from here.
          await sweepAbandonedRuntimeUploadTempPath(userDataPath, request)
        }
        throw error
      } finally {
        lifetime.dispose()
      }
    }
  )

  // Why: terminal drag-and-drop resolver. Local worktrees pass paths through
  // unchanged (reference-in-place; preserves zero-latency drop). SSH worktrees
  // upload each path into `${worktreePath}/.orca/drops/` and return remote
  // paths the remote agent can read. Kept as a separate IPC from
  // fs:importExternalPaths because terminal semantics differ from the
  // explorer's "copy into user-picked destDir". See docs/terminal-drop-ssh.md.
  ipcMain.handle(
    'fs:resolveDroppedPathsForAgent',
    async (
      _event,
      args: {
        paths: string[]
        worktreePath: string
        connectionId?: string
      } & SshMutationExpectation
    ): Promise<ResolveDroppedPathsResult> => resolveDroppedPathsForDesktop(args)
  )
}
