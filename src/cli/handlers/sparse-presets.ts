import { SparsePresetViewerParams } from '../../shared/sparse-preset-viewer-command'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'
import { RepoSparsePresetSave } from '../../shared/rpc-contract/repo-params'

const format = (value: unknown): string => JSON.stringify(value, null, 2)
export const SPARSE_PRESET_HANDLERS: Record<string, CommandHandler> = {
  'sparse-presets viewer': async (ctx) => {
    rejectRemoteSelectionFlags(ctx.flags, 'desktop sparse preset viewer')
    const parsed = SparsePresetViewerParams.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid sparse preset viewer request JSON')
    }
    printResult(await ctx.client.call('sparsePreset.viewerAction', parsed.data), ctx.json, format)
  },
  'sparse-presets list': async (ctx) => {
    printResult(
      await ctx.client.call('repo.sparsePresets', {
        repo: getRequiredStringFlag(ctx.flags, 'repo')
      }),
      ctx.json,
      format
    )
  },
  'sparse-presets save': async (ctx) => {
    const parsed = RepoSparsePresetSave.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid sparse preset request JSON')
    }
    printResult(await ctx.client.call('repo.saveSparsePreset', parsed.data), ctx.json, format)
  },
  'sparse-presets remove': async (ctx) => {
    printResult(
      await ctx.client.call('repo.removeSparsePreset', {
        repo: getRequiredStringFlag(ctx.flags, 'repo'),
        presetId: getRequiredStringFlag(ctx.flags, 'preset')
      }),
      ctx.json,
      format
    )
  }
}
