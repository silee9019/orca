import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import {
  RepoIconPickerStart,
  RepoIconPickerRequest,
  RepoIconPickedImageResult
} from '../../shared/rpc-contract/workspace-repo-icon-picker-params'
import { sanitizeRepoIcon, MAX_REPO_ICON_UPLOAD_BYTES } from '../../shared/repo-icon'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_REPO_ICON_PICKER_HANDLERS: Record<string, CommandHandler> = {
  'repo icon-picker-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoIconPickerStart)
    confirmWorkspaceCommand(ctx, 'repo-icon-picker')
    const response = await ctx.client.call('repoIconPicker.start', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo icon-picker-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoIconPickerRequest)
    const response = await ctx.client.call('repoIconPicker.status', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo icon-picker-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoIconPickerRequest)
    const response = await ctx.client.call('repoIconPicker.cancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo icon-picker-result': async (ctx) => {
    const output = ctx.flags.get('output')
    if (typeof output !== 'string' || !output.trim()) {
      throw new RuntimeClientError('invalid_argument', 'Use --output to name a new local PNG file.')
    }
    const outputPath = resolve(ctx.cwd, output)
    const params = await readWorkspaceCommandInput(ctx, RepoIconPickerRequest)
    const response = await ctx.client.call('repoIconPicker.result', params)
    const image = RepoIconPickedImageResult.safeParse(response.result)
    if (
      !image.success ||
      !sanitizeRepoIcon({ type: 'image', source: 'upload', src: image.data.dataUrl })
    ) {
      throw new RuntimeClientError(
        'operation_failed',
        'The selected host returned an invalid PNG image.'
      )
    }
    const bytes = Buffer.from(
      image.data.dataUrl.slice(image.data.dataUrl.indexOf(',') + 1),
      'base64'
    )
    if (bytes.byteLength > MAX_REPO_ICON_UPLOAD_BYTES) {
      throw new RuntimeClientError('operation_failed', 'The selected icon exceeds the 256KB limit.')
    }
    try {
      await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 })
    } catch {
      throw new RuntimeClientError(
        'operation_failed',
        'Could not write the icon output file without overwriting.'
      )
    }
    printWorkspaceCommandResult(
      { ...response, result: { saved: true, path: outputPath, bytes: bytes.byteLength } },
      ctx.json,
      (value) => JSON.stringify(value)
    )
  }
}
