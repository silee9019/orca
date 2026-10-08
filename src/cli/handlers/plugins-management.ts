import type { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'
import { pluginMarketplaceGitSourceSchema } from '../../shared/plugins/plugin-marketplace'
import {
  PluginPreferencesUpdate,
  PluginInstallParams,
  PluginMarketplacePreviewParams,
  PluginMarketplaceInstallParams,
  PluginMarketplaceSourceParams,
  PluginMarketplaceRefreshParams
} from '../../shared/rpc-contract/plugins-management-params'

const format = (value: unknown): string => JSON.stringify(value, null, 2)
function request(method: string, schema: z.ZodType): CommandHandler {
  return async (ctx) => {
    const parsed = schema.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid plugin management request JSON')
    }
    printResult(
      await ctx.client.call(method, parsed.data, { timeoutMs: 10 * 60_000 }),
      ctx.json,
      format
    )
  }
}
function plugin(method: string): CommandHandler {
  return async (ctx) => {
    printResult(
      await ctx.client.call(method, { pluginKey: getRequiredStringFlag(ctx.flags, 'plugin') }),
      ctx.json,
      format
    )
  }
}
function list(method: string): CommandHandler {
  return async (ctx) => {
    printResult(await ctx.client.call(method), ctx.json, format)
  }
}

export const PLUGIN_MANAGEMENT_HANDLERS: Record<string, CommandHandler> = {
  'plugins preferences get': list('plugins.getPreferences'),
  'plugins preferences update': request('plugins.updatePreferences', PluginPreferencesUpdate),
  'plugins install': request('plugins.install', PluginInstallParams),
  'plugins remove': plugin('plugins.remove'),
  'plugins logs': plugin('plugins.getLogs'),
  'plugins refresh': list('plugins.refresh'),
  'plugins language-packs': list('plugins.listLanguagePacks'),
  'plugins marketplace list': list('plugins.listMarketplaces'),
  'plugins marketplace plugins': list('plugins.listMarketplacePlugins'),
  'plugins marketplace add': request('plugins.addMarketplace', pluginMarketplaceGitSourceSchema),
  'plugins marketplace remove': request('plugins.removeMarketplace', PluginMarketplaceSourceParams),
  'plugins marketplace refresh': request(
    'plugins.refreshMarketplaces',
    PluginMarketplaceRefreshParams
  ),
  'plugins marketplace preview': request(
    'plugins.previewMarketplacePlugin',
    PluginMarketplacePreviewParams
  ),
  'plugins marketplace install': request(
    'plugins.installMarketplacePlugin',
    PluginMarketplaceInstallParams
  ),
  'plugins marketplace preview-update': plugin('plugins.previewMarketplaceUpdate'),
  'plugins marketplace rollback': plugin('plugins.rollbackMarketplacePlugin')
}
