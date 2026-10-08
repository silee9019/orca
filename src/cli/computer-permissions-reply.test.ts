import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { okFixture } from './test-fixtures'
import { COMPUTER_PERMISSIONS_VIEWER_HANDLERS } from './handlers/computer-permissions-viewer'

const profiles: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    profiles.splice(0).map((profile) => rm(profile, { recursive: true, force: true }))
  )
})

async function readReply(computerPermissions: unknown): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), 'orca-computer-reply-'))
  profiles.push(profile)
  const client = new RuntimeClient(profile, 1000, null, null)
  vi.spyOn(client, 'call').mockResolvedValue(
    okFixture('reply-fixture', { applied: true, computerPermissions })
  )
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await COMPUTER_PERMISSIONS_VIEWER_HANDLERS['computer permissions viewer']({
    flags: new Map([
      ['viewer', 'host'],
      ['action', 'status']
    ]),
    client,
    cwd: profile,
    json: true
  })
  return output.mock.calls.map((call) => call.join(' ')).join('\n')
}

describe('permissions CLI reply reader', () => {
  it('prints degraded future values without private fields', async () => {
    const output = await readReply({
      platform: 'future-platform',
      permissions: [{ id: 'future-permission', status: 'future-status', reason: 'private-reason' }],
      loading: false,
      helperUnavailable: false,
      helperAppPath: 'private-provider-path'
    })
    expect(output).toContain('future-permission')
    expect(output).toContain('unsupported')
    expect(output).toContain('"platform": null')
    expect(output).not.toContain('future-status')
    expect(output).not.toContain('private-')
  })

  it('rejects malformed replies before printing success or provider details', async () => {
    await expect(
      readReply({
        platform: 'darwin',
        permissions: [{ id: 'accessibility', status: { private: 'provider-details' } }],
        loading: false,
        helperUnavailable: false
      })
    ).rejects.toThrow('Invalid Computer Use permission pane reply.')
    expect(vi.mocked(console.log).mock.calls).toHaveLength(0)
  })
})
