import { expect, it } from 'vitest'
import { FeatureTipViewerParams } from './feature-tip-viewer-params'

it('accepts only the host viewer with a known tip or none', () => {
  for (const command of [
    { operation: 'get' },
    { operation: 'skip' },
    { operation: 'skip', tipId: 'cmd-j-palette' },
    { operation: 'skip', tipId: 'orca-cli' }
  ]) {
    expect(FeatureTipViewerParams.safeParse({ viewer: 'host', ...command }).success).toBe(true)
  }
  for (const command of [
    { operation: 'skip' },
    { viewer: 'peer', operation: 'get' },
    { viewer: 'host', operation: 'primary' },
    { viewer: 'host', operation: 'get', tipId: 'orca-cli' },
    { viewer: 'host', operation: 'skip', tipId: 'unknown-tip' },
    { viewer: 'host', operation: 'skip', tipId: '' },
    { viewer: 'host', operation: 'skip', extra: true }
  ]) {
    expect(FeatureTipViewerParams.safeParse(command).success).toBe(false)
  }
})
