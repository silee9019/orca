import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'
import { UsageViewerParams } from '../../src/shared/rpc-contract/usage-params'
import { fixture } from './usage-cli-test-fixture'
it.skipIf(process.env.ORCA_USAGE_CLI_SMOKE !== '1')(
  'dispatches every usage account viewer command from the built CLI to its strict RPC method',
  async () => {
    const endpoint =
      process.platform === 'win32'
        ? String.raw`\\.\pipe\orca-viewer-${randomUUID()}`
        : join(fixture.directory, 'viewer.sock')
    const authToken = randomUUID()
    const seen: string[] = []
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      let input = ''
      socket.on('data', (chunk) => {
        input += chunk.toString()
        if (!input.includes('\n')) {
          return
        }
        const request = JSON.parse(input.split('\n')[0])
        if (request.authToken !== authToken || request.method !== 'usage.viewerAction') {
          socket.destroy()
          return
        }
        const parsed = UsageViewerParams.parse(request.params)
        seen.push(parsed.action.action)
        socket.end(
          `${JSON.stringify({
            id: request.id,
            ok: false,
            error: { code: 'viewer_unavailable', message: 'Fixture viewer unavailable' },
            _meta: { runtimeId: 'fixture-host' }
          })}\n`
        )
      })
    })
    await new Promise<void>((resolve) => server.listen(endpoint, resolve))
    try {
      writeFileSync(
        join(fixture.directory, 'orca-runtime.json'),
        JSON.stringify({
          runtimeId: 'fixture-host',
          pid: process.pid,
          authToken,
          startedAt: Date.now(),
          transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }]
        }),
        { mode: 0o600 }
      )
      const operationId = randomUUID()
      const actions = [
        ['feature-wall-signin', '--provider', 'codex'],
        ['feature-wall-signin-status', '--provider', 'codex', '--operation-id', operationId],
        ['feature-wall-signin-cancel', '--provider', 'codex', '--operation-id', operationId],
        ['refresh-account-state'],
        ['inline-signin', '--account-id', 'fixture-account', '--runtime', 'host'],
        ['inline-signin-status', '--operation-id', operationId],
        ['inline-signin-cancel', '--operation-id', operationId],
        ['roster-signin', '--provider', 'claude'],
        ['refresh-account-usage', '--provider', 'cursor']
      ]
      for (const action of actions) {
        const result = await runProcess({
          program: process.execPath,
          args: [
            join(process.cwd(), 'out/cli/index.js'),
            'usage',
            ...action,
            '--viewer',
            'desktop',
            '--json'
          ],
          env: {
            ...process.env,
            ORCA_USER_DATA_PATH: fixture.directory,
            ORCA_BACKGROUND_LAUNCH: '1',
            ORCA_ENVIRONMENT: '',
            ORCA_PAIRING_CODE: '',
            ORCA_REMOTE_PAIRING: ''
          },
          timeoutMs: 10000
        })
        expect(result.code).toBe(1)
        expect(JSON.parse(result.stderr || result.stdout).error.code).toBe('viewer_unavailable')
        expect(result.stderr).not.toContain(authToken)
      }
      expect(seen).toEqual(actions.map((action) => action[0]))
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
)
