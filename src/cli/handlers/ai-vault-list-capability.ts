import { z } from 'zod'
import type { HandlerContext } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import { AiVaultListSessionsParams } from '../../shared/rpc-contract/ai-vault-params'

export async function requireAiVaultListCancellationCapability(
  ctx: HandlerContext,
  params: unknown
): Promise<void> {
  const request = AiVaultListSessionsParams.safeParse(params)
  if (!request.success || !request.data.requestToken) {
    return
  }
  const capabilities = await ctx.client.call('aiVault.ownedListCapabilities', {})
  if (!z.object({ ownedListCancellation: z.literal(1) }).safeParse(capabilities.result).success) {
    throw new RuntimeClientError(
      'ai_vault_cancel_unavailable',
      'The selected host cannot own cancellable list requests.'
    )
  }
}
