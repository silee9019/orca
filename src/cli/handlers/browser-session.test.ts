import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_SESSION_COMMAND_SPECS } from '../specs/browser-session'
import { BROWSER_SESSION_HANDLERS } from './browser-session'

const client = new RuntimeClient(join(tmpdir(), 'orca-browser-session-fixture'), 60_000, null, null)

async function run(args: string[]) {
  const parsed = parseArgs(args)
  validateCommandAndFlags(BROWSER_SESSION_COMMAND_SPECS, parsed)
  const handler = BROWSER_SESSION_HANDLERS[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error('Missing browser session handler')
  }
  await handler({ client, flags: parsed.flags, cwd: tmpdir(), json: true })
}

afterEach(() => vi.restoreAllMocks())

describe('browser session CLI', () => {
  it.each([
    {
      args: [
        'tab',
        'profile',
        'import-file',
        '--profile',
        'p1',
        '--file',
        join(tmpdir(), 'cookies.json'),
        '--confirm'
      ],
      method: 'browser.profileImportFile',
      params: { profileId: 'p1', filePath: join(tmpdir(), 'cookies.json') },
      result: { ok: true, profileId: 'p1', summary: { importedCookies: 1 } }
    },
    {
      args: ['tab', 'profile', 'detect-browsers'],
      method: 'browser.profileDetectBrowsers',
      params: undefined,
      result: { browsers: [] }
    },
    {
      args: [
        'tab',
        'profile',
        'import-browser',
        '--profile',
        'p1',
        '--browser-family',
        'chrome',
        '--browser-profile',
        'Profile 2',
        '--confirm'
      ],
      method: 'browser.profileImportFromBrowser',
      params: {
        profileId: 'p1',
        browserFamily: 'chrome',
        browserProfile: 'Profile 2',
        supportsPartitionSkippedCookies: true
      },
      result: {
        ok: true,
        profileId: 'p1',
        summary: {
          totalCookies: 3,
          importedCookies: 2,
          skippedCookies: 1,
          domains: ['fixture.invalid']
        }
      }
    },
    {
      args: ['tab', 'profile', 'clear-default-cookies', '--confirm'],
      method: 'browser.profileClearDefaultCookies',
      params: undefined,
      result: { cleared: true }
    },
    {
      args: [
        'browser',
        'certificate',
        'proceed',
        '--page',
        'page-1',
        '--challenge',
        'challenge-1',
        '--confirm'
      ],
      method: 'browser.certificate.proceed',
      params: { page: 'page-1', challengeId: 'challenge-1' },
      result: { ok: true }
    }
  ])(
    'routes $method to the existing host service with exact target',
    async ({ args, method, params, result }) => {
      const call = vi
        .spyOn(client, 'call')
        .mockResolvedValue({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await run(args)
      if (params === undefined) {
        expect(call).toHaveBeenCalledExactlyOnceWith(method)
      } else {
        expect(call).toHaveBeenCalledExactlyOnceWith(method, params)
      }
      expect(log).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify(
          { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } },
          null,
          2
        )
      )
    }
  )

  it.each([
    ['tab', 'profile', 'import-browser', '--profile', 'p1', '--browser-family', 'chrome'],
    ['tab', 'profile', 'clear-default-cookies'],
    ['browser', 'certificate', 'proceed', '--page', 'p1', '--challenge', 'c1'],
    ['browser', 'certificate', 'proceed', '--challenge', 'c1', '--confirm'],
    [
      'tab',
      'profile',
      'import-browser',
      '--profile',
      'p1',
      '--browser-family',
      'chrome',
      '--browser-profile',
      '../Default',
      '--confirm'
    ]
  ])('rejects unsafe or incomplete arguments %j before transport', async (...args) => {
    const call = vi.spyOn(client, 'call')
    await expect(run(args)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  })

  it.each([
    {
      args: [
        'tab',
        'profile',
        'import-browser',
        '--profile',
        'missing',
        '--browser-family',
        'chrome',
        '--confirm'
      ],
      result: { ok: false, reason: 'Session profile not found.' }
    },
    { args: ['tab', 'profile', 'clear-default-cookies', '--confirm'], result: { cleared: false } },
    {
      args: [
        'browser',
        'certificate',
        'proceed',
        '--page',
        'p1',
        '--challenge',
        'stale',
        '--confirm'
      ],
      result: { ok: false, reason: 'challenge_expired' }
    }
  ])('does not report a rejected service operation as success', async ({ args, result }) => {
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result,
      _meta: { runtimeId: 'fixture' }
    })
    await expect(run(args)).rejects.toMatchObject({ code: 'runtime_error' })
  })
})
