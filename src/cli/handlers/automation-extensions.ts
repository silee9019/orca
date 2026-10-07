import type { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'
import {
  ExternalAutomationListParams,
  ExternalAutomationRunsParams,
  ExternalAutomationCreateParams,
  ExternalAutomationUpdateParams,
  ExternalAutomationActionParams,
  AutomationRunPrecheckParams,
  AutomationSnapshotNameParams
} from '../../shared/rpc-contract/automation-extensions-params'

function request(method: string, schema: z.ZodType): CommandHandler {
  return async (ctx) => {
    const parsed = schema.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid automation extension request JSON')
    }
    printResult(await ctx.client.call(method, parsed.data), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
export const AUTOMATION_EXTENSION_HANDLERS: Record<string, CommandHandler> = {
  'automations external list': request('automation.externalList', ExternalAutomationListParams),
  'automations external runs': request('automation.externalRuns', ExternalAutomationRunsParams),
  'automations external create': request(
    'automation.externalCreate',
    ExternalAutomationCreateParams
  ),
  'automations external update': request(
    'automation.externalUpdate',
    ExternalAutomationUpdateParams
  ),
  'automations external action': request(
    'automation.externalAction',
    ExternalAutomationActionParams
  ),
  'automations precheck': request('automation.precheck', AutomationRunPrecheckParams),
  'automations snapshot-name': request(
    'automation.snapshotWorkspaceName',
    AutomationSnapshotNameParams
  )
}
