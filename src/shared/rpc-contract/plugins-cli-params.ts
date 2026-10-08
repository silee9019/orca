import { z } from 'zod'
import { isQualifiedPluginKey } from '../plugins/plugin-manifest'
import { isPluginPanelAction } from '../plugins/plugin-host-api'

export const PluginInvokePanelActionParams = z.strictObject({
  pluginKey: z.string().refine(isQualifiedPluginKey),
  panelId: z.string().min(1).max(256),
  action: z.string().min(1).refine(isPluginPanelAction, 'not a panel-callable action'),
  params: z.unknown().optional()
})

export const PluginInspectPanelParams = PluginInvokePanelActionParams.pick({
  pluginKey: true,
  panelId: true
})
