import { expect, it } from 'vitest'
import { CONNECTIONS_VIEWER_COMMAND_SPECS } from './connections-viewer'
import { ConnectionsViewerParams } from '../../shared/rpc-contract/connections-viewer-params'
import { formatCommandHelp } from '../help'
import { buildAgentContext } from '../agent-context'
it('publishes every supported viewer operation through the existing help and agent discovery surfaces', () => {
  const spec = CONNECTIONS_VIEWER_COMMAND_SPECS[0]
  if (!spec) {
    throw new Error('connections_viewer_spec_missing')
  }
  const help = formatCommandHelp(spec)
  const context = JSON.stringify(buildAgentContext([spec]))
  for (const schema of ConnectionsViewerParams.options) {
    const operation = schema.shape.operation
    const operations = 'options' in operation ? operation.options : [operation.value]
    for (const name of operations) {
      expect(help).toContain(name)
      expect(context).toContain(name)
    }
  }
  for (const field of [
    'viewerId',
    'confirmTarget',
    'confirmDevice',
    'workspaceDisposition',
    'pickerId',
    'worktreeId',
    'input-file',
    'input-stdin',
    'persisted=null'
  ]) {
    expect(help).toContain(field)
    expect(context).toContain(field)
  }
  expect(
    spec.examples?.every(
      (example) => !example.includes('--pairing-code') && !example.includes('--value')
    )
  ).toBe(true)
})
