import { ArtifactViewerParams } from '../../shared/artifact-viewer-command'
import { readJsonInput } from '../json-input'
import { basename, extname, resolve } from 'node:path'
import type {
  ArtifactCloudOperation,
  ArtifactCloudOptions,
  ArtifactListPage,
  ArtifactListItem,
  ArtifactWriteRequest
} from '../../shared/artifacts'
import {
  ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES,
  filterArtifactsBySearchQuery
} from '../../shared/artifact-list-search'
import { isClipboardTextByteLengthOverLimit } from '../../shared/clipboard-text'
import { ARTIFACT_CLI_MAX_RPC_BYTES } from '../../shared/artifacts'
import {
  parseRemoteArtifactInput,
  REMOTE_ARTIFACT_INPUT_ENV
} from '../../shared/artifact-cli-bridge'
import { readArtifactFileWithinLimit } from '../../shared/artifact-file-read'
import {
  ARTIFACT_SHARING_DISABLED_CODE,
  ARTIFACT_SHARING_DISABLED_MESSAGE,
  ARTIFACT_SHARING_DISABLED_NEXT_STEPS
} from '../../shared/artifact-sharing-gate'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime-client'
import { formatArtifactListPage, formatArtifactShared } from '../artifact-format'
import { printResult } from '../format'

function stringFlag(ctx: HandlerContext, name: string): string | undefined {
  const value = ctx.flags.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireStringFlag(ctx: HandlerContext, name: string): string {
  const value = stringFlag(ctx, name)
  if (!value) {
    throw new RuntimeClientError('invalid_argument', `Missing required ${name}.`)
  }
  return value
}

function cloudOptions(ctx: HandlerContext): ArtifactCloudOptions {
  const apiUrl = stringFlag(ctx, 'api-url') ?? process.env.ORCA_ARTIFACTS_API_URL?.trim()
  const authToken = process.env.ORCA_CLOUD_AUTH_TOKEN?.trim()
  return {
    ...(apiUrl ? { apiUrl } : {}),
    ...(authToken ? { authToken } : {})
  }
}

function rejectArtifactRemoteSelectionFlags(ctx: HandlerContext): void {
  rejectRemoteSelectionFlags(
    ctx.flags,
    'artifact commands; artifacts use the signed-in desktop account.'
  )
}

function artifactContentType(path: string): ArtifactWriteRequest['contentType'] | null {
  const extension = extname(path).toLowerCase()
  return ['.html', '.htm'].includes(extension)
    ? 'text/html'
    : ['.md', '.markdown'].includes(extension)
      ? 'text/markdown'
      : null
}

async function readStdinWithinLimit(maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.length
    if (bytes > maxBytes) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Artifact is too large for the Orca CLI transport. Use the browser upload page instead.'
      )
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Publishing is off by default, so denial is the common outcome. A tiny `settings.get` read
 * answers it before we load (or pipe in) up to the full RPC byte budget the host would reject.
 * Only an explicit `false` denies: a host predating the capability omits the field entirely,
 * and an unreachable host stays the publish RPC's problem, not the preflight's.
 */
async function preflightPublishCapability(ctx: HandlerContext): Promise<void> {
  let enabled: unknown
  try {
    const response = await ctx.client.call<{
      settings?: { artifactSharingEnabled?: boolean }
    }>('settings.get')
    enabled = response.result?.settings?.artifactSharingEnabled
  } catch {
    return
  }
  if (enabled === false) {
    throw new RuntimeClientError(
      ARTIFACT_SHARING_DISABLED_CODE,
      ARTIFACT_SHARING_DISABLED_MESSAGE,
      { nextSteps: [...ARTIFACT_SHARING_DISABLED_NEXT_STEPS] }
    )
  }
}

async function readArtifactRequest(ctx: HandlerContext): Promise<ArtifactWriteRequest> {
  const remoteInput = parseRemoteArtifactInput(process.env[REMOTE_ARTIFACT_INPUT_ENV])
  const sourceKey = remoteInput?.sourceKey ?? resolve(ctx.cwd, requireStringFlag(ctx, 'file'))
  const contentType = remoteInput?.contentType ?? artifactContentType(sourceKey)
  if (!contentType) {
    throw new RuntimeClientError('invalid_argument', 'Artifacts must be HTML or Markdown files.')
  }
  await preflightPublishCapability(ctx)
  const localRead = remoteInput
    ? null
    : await readArtifactFileWithinLimit(sourceKey, ARTIFACT_CLI_MAX_RPC_BYTES)
  if (localRead?.status === 'not-file') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Artifact file was not found or is not a file.'
    )
  }
  if (localRead?.status === 'too-large') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Artifact is too large for the Orca CLI transport. Use the browser upload page instead.'
    )
  }
  const content = remoteInput
    ? await readStdinWithinLimit(ARTIFACT_CLI_MAX_RPC_BYTES)
    : localRead?.status === 'ok'
      ? localRead.content
      : ''
  if (!content) {
    throw new RuntimeClientError('invalid_argument', 'Artifact file is empty.')
  }
  const request: ArtifactWriteRequest = {
    sourceKey,
    content,
    contentType,
    fileName: remoteInput?.fileName ?? basename(sourceKey),
    ...cloudOptions(ctx)
  }
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > ARTIFACT_CLI_MAX_RPC_BYTES) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Artifact is too large for the Orca CLI transport. Use the browser upload page instead.'
    )
  }
  return request
}

function requireOperation<T>(operation: ArtifactCloudOperation<T>): T {
  if (operation.status === 'ok') {
    return operation.value
  }
  if (operation.status === 'reconnect-required') {
    throw new RuntimeClientError('authentication_required', 'Sign in to Orca and try again.')
  }
  throw new RuntimeClientError('authentication_unconfigured', operation.message)
}

export const ARTIFACT_HANDLERS: Record<string, CommandHandler> = {
  'artifacts viewer': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const parsed = ArtifactViewerParams.safeParse({
      viewer: ctx.flags.get('viewer'),
      action: await readJsonInput(ctx)
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'A desktop viewer and valid artifact action JSON are required.'
      )
    }
    printResult(await ctx.client.call('artifacts.viewerAction', parsed.data), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'artifacts list': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const cursor = stringFlag(ctx, 'cursor')
    const rawQuery = ctx.flags.get('query')
    if (rawQuery !== undefined && typeof rawQuery !== 'string') {
      throw new RuntimeClientError('invalid_argument', '--query requires a text value.')
    }
    const query = rawQuery ?? ''
    const id = stringFlag(ctx, 'id')
    if (isClipboardTextByteLengthOverLimit(query, ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES)) {
      throw new RuntimeClientError('invalid_argument', 'Artifact query exceeds 2048 UTF-8 bytes.')
    }
    const response = await ctx.client.call<ArtifactCloudOperation<ArtifactListPage>>(
      'artifacts.list',
      {
        ...cloudOptions(ctx),
        ...(cursor ? { cursor } : {})
      }
    )
    const value = requireOperation(response.result)
    const matching = filterArtifactsBySearchQuery(value.artifacts, query)
    const artifacts = id ? matching.filter((item) => item.artifact.slug === id) : matching
    printResult({ ...response, result: { ...value, artifacts } }, ctx.json, formatArtifactListPage)
  },
  'artifacts share': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const response = await ctx.client.call<ArtifactCloudOperation<ArtifactListItem>>(
      'artifacts.share',
      await readArtifactRequest(ctx)
    )
    const value = requireOperation(response.result)
    printResult({ ...response, result: value }, ctx.json, formatArtifactShared)
  },
  'artifacts update': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const response = await ctx.client.call<ArtifactCloudOperation<ArtifactListItem>>(
      'artifacts.update',
      await readArtifactRequest(ctx)
    )
    const value = requireOperation(response.result)
    printResult({ ...response, result: value }, ctx.json, formatArtifactShared)
  },
  'artifacts unshare': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const remoteInput = parseRemoteArtifactInput(process.env[REMOTE_ARTIFACT_INPUT_ENV])
    const sourceKey = remoteInput?.sourceKey ?? resolve(ctx.cwd, requireStringFlag(ctx, 'file'))
    const response = await ctx.client.call<ArtifactCloudOperation<void>>('artifacts.unshare', {
      sourceKey,
      ...cloudOptions(ctx)
    })
    requireOperation(response.result)
    printResult({ ...response, result: { deleted: true } }, ctx.json, () => 'Artifact deleted.')
  },
  'artifacts delete': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const response = await ctx.client.call<ArtifactCloudOperation<void>>('artifacts.delete', {
      id: requireStringFlag(ctx, 'id'),
      ...cloudOptions(ctx)
    })
    requireOperation(response.result)
    printResult({ ...response, result: { deleted: true } }, ctx.json, () => 'Artifact deleted.')
  }
}
