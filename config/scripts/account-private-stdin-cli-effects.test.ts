import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'

it.each(['credentials', 'secrets'] as const)(
  'runs real %s stdin with byte boundaries and keeps success/error output private',
  async (command) => {
    const sentinel = 'fixture-private-stdin-canary'
    const multibyte = sentinel + 'é'.repeat(Math.floor((65536 - Buffer.byteLength(sentinel)) / 2))
    const exactMultibyte = multibyte + 'x'.repeat(65536 - Buffer.byteLength(multibyte))
    const root = mkdtempSync(join(tmpdir(), 'orca-private-stdin-'))
    const argv =
      command === 'credentials'
        ? ['credentials', 'save', '--provider', 'opencode-go']
        : ['secrets', 'set', '--key', 'opencodeSessionCookie']
    try {
      for (const scenario of [
        { input: sentinel.padEnd(65536, 'x'), failure: '', success: true },
        { input: exactMultibyte, failure: '', success: true },
        { input: sentinel.padEnd(65537, 'x'), failure: '', success: false },
        { input: sentinel + 'é'.repeat(32768), failure: '', success: false },
        { input: '', failure: '', success: command === 'secrets' },
        { input: sentinel, failure: 'writer', success: command === 'credentials' },
        { input: sentinel, failure: 'rpc', success: false }
      ]) {
        rmSync(join(root, 'saved'), { force: true })
        const result = await runProcess({
          program: process.execPath,
          args: [
            resolve('config/scripts/account-private-stdin-cli-fixture.mjs'),
            root,
            scenario.failure,
            ...argv,
            '--input-file',
            '-',
            '--json'
          ],
          cwd: process.cwd(),
          env: {
            ...process.env,
            ORCA_BACKGROUND_LAUNCH: '1',
            ORCA_CLI_CWD: '',
            ORCA_CLI_WSL_DISTRO: ''
          },
          input: scenario.input,
          maxOutputBytes: 8192,
          timeoutMs: 10000
        })
        expect(result.timedOut).toBe(false)
        expect(result.outputTruncated).toBe(false)
        expect(result.code).toBe(scenario.success ? 0 : 1)
        expect(result.stdout + result.stderr).not.toContain(sentinel)
        expect(result.stdout + result.stderr).not.toContain(root)
        expect(readFileSync(join(root, 'mutations'), 'utf8')).toBe(scenario.success ? '1' : '0')
        const rejectedBeforeRpc =
          Buffer.byteLength(scenario.input) > 65536 ||
          (command === 'credentials' && scenario.input === '')
        expect(readFileSync(join(root, 'calls'), 'utf8')).toBe(rejectedBeforeRpc ? '0' : '1')
        if (scenario.success) {
          expect(result.stderr).toBe('')
          expect(result.stdout).toContain(
            command === 'credentials' ? 'apiKeyConfigured' : 'updated'
          )
          const saved = readFileSync(join(root, 'saved'), 'utf8')
          expect(command === 'credentials' ? saved : JSON.parse(saved).opencodeSessionCookie).toBe(
            scenario.input.trim()
          )
          if (process.platform !== 'win32') {
            expect(statSync(join(root, 'saved')).mode & 0o777).toBe(0o600)
          }
        } else {
          expect(existsSync(join(root, 'saved'))).toBe(false)
          expect(result.stdout + result.stderr).toContain('error')
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

it('rejects malformed sensitive JSON through the public stdin command before the canonical writer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-private-json-'))
  try {
    const result = await runProcess({
      program: process.execPath,
      args: [
        resolve('config/scripts/account-private-stdin-cli-fixture.mjs'),
        root,
        '',
        'secrets',
        'set',
        '--key',
        'agentDefaultEnv',
        '--input-file',
        '-',
        '--json'
      ],
      env: {
        ...process.env,
        ORCA_BACKGROUND_LAUNCH: '1',
        ORCA_CLI_CWD: '',
        ORCA_CLI_WSL_DISTRO: ''
      },
      input: '{fixture-private-json-canary',
      timeoutMs: 10000
    })
    expect(result.code).toBe(1)
    expect(result.stdout + result.stderr).toContain('sensitive_setting_write_unconfirmed')
    expect(result.stdout + result.stderr).not.toContain('fixture-private-json-canary')
    expect(readFileSync(join(root, 'mutations'), 'utf8')).toBe('0')
    expect(existsSync(join(root, 'saved'))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([
  ['credentials', 'save', 'opencode-go'],
  ['credentials', 'status', 'opencode-go'],
  ['credentials', 'clear', 'opencode-go'],
  ['secrets', 'set', 'opencodeSessionCookie'],
  ['secrets', 'clear', 'opencodeSessionCookie']
])(
  'hides RPC error messages and data for %s %s in JSON and human output',
  async (command, action, key) => {
    const root = mkdtempSync(join(tmpdir(), 'orca-private-rpc-error-'))
    try {
      for (const json of [false, true]) {
        const result = await runProcess({
          program: process.execPath,
          args: [
            resolve('config/scripts/account-private-stdin-cli-fixture.mjs'),
            root,
            'rpc',
            command,
            action,
            command === 'credentials' ? '--provider' : '--key',
            key,
            ...(['clear', 'status'].includes(action) ? [] : ['--input-file', '-']),
            ...(json ? ['--json'] : [])
          ],
          env: {
            ...process.env,
            ORCA_BACKGROUND_LAUNCH: '1',
            ORCA_CLI_CWD: '',
            ORCA_CLI_WSL_DISTRO: ''
          },
          input: 'fixture-private-stdin-canary',
          timeoutMs: 10000
        })
        expect(result.code).toBe(1)
        expect(result.stdout + result.stderr).toContain('Could not confirm')
        expect(result.stdout + result.stderr).not.toContain('fixture-private-stdin-canary')
        expect(result.stdout + result.stderr).not.toContain('privateInput')
        expect(readFileSync(join(root, 'mutations'), 'utf8')).toBe('0')
        expect(readFileSync(join(root, 'calls'), 'utf8')).toBe('1')
        expect(existsSync(join(root, 'saved'))).toBe(false)
        expect(json ? result.stderr : result.stdout).toBe('')
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
