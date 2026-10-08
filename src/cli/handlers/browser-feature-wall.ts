import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  BrowserFeatureWallCommand,
  BrowserFeatureWallState
} from '../../shared/rpc-contract/browser-feature-wall-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_FEATURE_WALL_HANDLERS: Record<string, CommandHandler> = {
  'browser feature-wall': async (ctx) => {
    const workspace = getRequiredStringFlag(ctx.flags, 'workspace')
    const command = BrowserFeatureWallCommand.safeParse({
      action: getRequiredStringFlag(ctx.flags, 'action'),
      runtime: getRequiredStringFlag(ctx.flags, 'runtime'),
      workspaceId: workspace === 'none' ? null : workspace
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify the exact host viewer, local runtime, workspace and supported feature-wall action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'browser-feature-wall',
      command: command.data
    })
    const state = BrowserFeatureWallState.safeParse(result.result.browserFeatureWall)
    if (!result.result.applied || !state.success) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser Use tour owner did not acknowledge the action.'
      )
    }
    printResult(
      { ...result, result: { ...result.result, browserFeatureWall: state.data } },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
