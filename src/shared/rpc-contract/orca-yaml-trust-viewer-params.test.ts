import { expect, it } from 'vitest'
import { OrcaYamlTrustViewerParams } from './orca-yaml-trust-viewer-params'

it('accepts only the host viewer with a repo and script kind to guard a skip, or none', () => {
  for (const command of [
    { operation: 'get' },
    { operation: 'skip' },
    { operation: 'skip', repoId: 'repo-1' },
    { operation: 'skip', scriptKind: 'issueCommand' },
    { operation: 'skip', repoId: 'repo-1', scriptKind: 'vmRecipe' }
  ]) {
    expect(OrcaYamlTrustViewerParams.safeParse({ viewer: 'host', ...command }).success).toBe(true)
  }
  for (const command of [
    { operation: 'skip' },
    { viewer: 'peer', operation: 'get' },
    { viewer: 'host', operation: 'run' },
    { viewer: 'host', operation: 'trust' },
    { viewer: 'host', operation: 'get', repoId: 'repo-1' },
    { viewer: 'host', operation: 'skip', repoId: '' },
    { viewer: 'host', operation: 'skip', repoId: 'a\u0000b' },
    { viewer: 'host', operation: 'skip', scriptKind: 'unknown' },
    { viewer: 'host', operation: 'skip', alwaysTrust: true }
  ]) {
    expect(OrcaYamlTrustViewerParams.safeParse(command).success).toBe(false)
  }
})
