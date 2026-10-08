import { basename, dirname, join, normalize } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopDocumentFileCopy } from '../shared/rpc-contract/workspace-shell-copy-params'
import {
  resolveLocalRequestPath,
  resolveUserNamedRegularFile
} from './ipc/local-file-access-resolution'

type CopyRequest = z.infer<typeof DesktopDocumentFileCopy>
export async function copyDesktopDocumentFile(
  store: Store,
  params: CopyRequest,
  copy: (params: Pick<CopyRequest, 'srcPath' | 'destPath'>) => Promise<void>
): Promise<void> {
  const srcPath = await resolveUserNamedRegularFile(params.srcPath, store)
  await resolveUserNamedRegularFile(params.documentPath, store)
  const destination = normalize(params.destPath)
  const parent = await resolveLocalRequestPath(
    dirname(destination),
    { kind: 'document-folder', documentPath: params.documentPath },
    store,
    'import-into'
  )
  await copy({ srcPath, destPath: join(parent, basename(destination)) })
}
