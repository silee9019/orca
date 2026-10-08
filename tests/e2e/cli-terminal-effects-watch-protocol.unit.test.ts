import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { TerminalEffectsBatch } from '../../src/shared/rpc-contract/terminal-effects-watch-params'

it.each(['ready-scope', 'event-scope', 'private-field', 'unknown-fact'])(
  'refuses malformed or out-of-scope terminal facts: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-effects-protocol-'))
    const close = vi.fn()
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const target = {
      terminal: 'term_fixture',
      expectedPtyId: 'fixture',
      expectedIncarnationId: 'incarnation',
      expectedExecutionHostId: 'local',
      includeContent: true
    }
    vi.spyOn(RuntimeClient.prototype, 'subscribeTerminalEffects').mockImplementation(
      async (_params, callbacks) => {
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
        emit({
          ...target,
          type: 'ready',
          sequence: 0,
          expectedPtyId: mode === 'ready-scope' ? 'other' : target.expectedPtyId
        })
        emit({
          type: 'event',
          sequence: 1,
          batch: {
            ptyId: mode === 'event-scope' ? 'other' : target.expectedPtyId,
            seq: 1,
            facts: [{ kind: mode === 'unknown-fact' ? 'unknown' : 'bell' }],
            ...(mode === 'private-field' ? { launchToken: 'private-unrequested-fixture' } : {})
          }
        })
        return { close }
      }
    )
    try {
      const file = join(root, 'watch.json')
      await writeFile(file, JSON.stringify({ ...target, watchMs: 1000 }))
      await main(['terminal', 'watch-effects', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(1)
      expect(close).toHaveBeenCalledOnce()
      const frames = output.mock.calls.map((call) => JSON.parse(String(call[0])))
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
      expect(JSON.stringify(frames)).not.toContain('private-unrequested-fixture')
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'invalid_runtime_response' })
        })
      )
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
it('normalizes status facts with the canonical whitelist before serializing content', () => {
  const batch = TerminalEffectsBatch.parse({
    ptyId: 'fixture',
    seq: 1,
    facts: [
      {
        kind: 'agent-status',
        payload: {
          state: 'working',
          prompt: 'requested content',
          launchToken: 'private-unrequested-fixture'
        }
      }
    ]
  })
  expect(batch.facts).toEqual([
    {
      kind: 'agent-status',
      payload: expect.objectContaining({ state: 'working', prompt: 'requested content' })
    }
  ])
  expect(JSON.stringify(batch)).not.toContain('private-unrequested-fixture')
})
it('preserves all existing fact variants, attribution, replay and host byte sequence', () => {
  const batch = {
    ptyId: 'fixture',
    seq: 17,
    replay: true,
    worktreeId: 'folder-fixture',
    tabId: 'tab',
    paneKey: 'pane',
    connectionId: 'ssh-fixture',
    facts: [
      { kind: 'title', rawTitle: 'raw', normalizedTitle: 'title', staleWorkingTitleClear: true },
      { kind: 'agent-idle', title: 'idle', staleWorkingTitleClear: true },
      { kind: 'command-finished', exitCode: null },
      { kind: 'command-finished', exitCode: 3 },
      {
        kind: 'pr-link',
        link: {
          url: 'https://git.example/org/repo/pull/7',
          number: 7,
          slug: { owner: 'org', repo: 'repo', host: 'git.example' }
        }
      },
      { kind: 'command-code-working', prompt: 'working' },
      { kind: 'command-code-done', prompt: 'done' },
      { kind: 'bell' },
      { kind: 'agent-working' },
      { kind: 'agent-exited' },
      { kind: '2031-subscribe' },
      { kind: '2031-unsubscribe' }
    ]
  }
  expect(TerminalEffectsBatch.parse(batch)).toEqual(batch)
})
