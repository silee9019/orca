import { describe, expect, it } from 'vitest'
import { parseCliSettingsUpdate, projectCliSettings } from './cli-runtime-settings'

describe('CLI settings boundary', () => {
  it('keeps host preferences while removing credentials and launch recipes', () => {
    const projected = projectCliSettings({
      machineName: 'build-host',
      defaultTuiAgent: 'codex',
      agentDefaultEnv: { codex: { API_KEY: 'env-canary' } },
      agentDefaultArgs: { codex: '--token=args-canary' },
      agentCmdOverrides: { codex: 'command-canary' },
      sourceControlAi: { actions: { commit: { prompt: 'prompt-canary' } } },
      opencodeSessionCookie: 'cookie-canary',
      httpProxyUrl: 'https://user:proxy-canary@example.test',
      futureSecret: 'future-canary'
    })
    expect(projected).toMatchObject({ machineName: 'build-host', defaultTuiAgent: 'codex' })
    expect(JSON.stringify(projected)).not.toContain('canary')
  })

  it('accepts secret environment values for the existing runtime writer', () => {
    expect(
      parseCliSettingsUpdate({ agentDefaultEnv: { codex: { API_KEY: 'input-canary' } } })
    ).toEqual({ agentDefaultEnv: { codex: { API_KEY: 'input-canary' } } })
  })

  it.each([
    { nestedWorkerMaxDepth: 99 },
    { artifactSharingEnabled: true },
    { pluginConsents: { arbitrary: 'trusted' } },
    { floatingTerminalTrustedCwds: ['/untrusted'] },
    { machineName: 7 },
    { minimaxEndpoint: 'invalid-secret-canary' },
    { defaultTuiAgent: 'unknown-agent' },
    { disabledTuiAgents: ['unknown-agent'] },
    { agentDefaultEnv: { codex: { API_KEY: 1 } } },
    { agentDefaultArgs: { codex: false } },
    null,
    []
  ])('rejects invalid updates without including input in the error', (input) => {
    expect(() => parseCliSettingsUpdate(input)).toThrow('Invalid settings update')
  })
})
