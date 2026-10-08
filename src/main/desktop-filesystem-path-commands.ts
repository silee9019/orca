import { mkdir, stat } from 'node:fs/promises'
import type { Store } from './persistence'
import type { LocalFileAccess } from '../shared/local-file-access'
import type { SshMutationExpectation } from '../shared/ssh-types'
import { requireSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { assertSshMutationExpectation } from './ssh/ssh-connection-generation'
import {
  resolveDesktopAuthorizedPath,
  resolveLocalFileRequestPath
} from './ipc/local-file-access-resolution'
import { assertNotExists } from './ipc/filesystem-create-path-guards'
import { isENOENT } from './ipc/filesystem-path-containment'

export async function createDesktopDirectory(
  store: Store,
  args: { dirPath: string; connectionId?: string } & SshMutationExpectation
): Promise<void> {
  assertSshMutationExpectation(
    args.connectionId,
    args.expectedSshTargetId,
    args.expectedSshConnectionGeneration,
    args.expectedExecutionHostId
  )
  if (args.connectionId) {
    return requireSshFilesystemProvider(args.connectionId).createDir(args.dirPath)
  }
  const dirPath = await resolveDesktopAuthorizedPath(args.dirPath, store)
  await assertNotExists(dirPath)
  await mkdir(dirPath, { recursive: true })
}

export async function desktopPathExists(
  store: Store,
  args: { filePath: string; connectionId?: string; access?: LocalFileAccess }
): Promise<boolean> {
  try {
    if (args.connectionId) {
      await requireSshFilesystemProvider(args.connectionId).stat(args.filePath)
      return true
    }
    await stat(await resolveLocalFileRequestPath(args.filePath, args.access, store))
    return true
  } catch (error) {
    if (isENOENT(error)) {
      return false
    }
    throw error
  }
}
