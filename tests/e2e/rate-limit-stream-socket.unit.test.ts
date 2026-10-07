import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'
import { isStreamingMethod } from '../../src/main/runtime/rpc/core'
import { fixture, setup } from './usage-cli-test-fixture'
it.skipIf(process.env.ORCA_USAGE_CLI_SMOKE !== '1')(
  'reads real built CLI socket stream events and releases the original service subscription',
  async () => {
    const { runtime, registry, rates } = setup()
    const remove = vi.fn()
    rates.onStateChange.mockReturnValue(remove)
    const endpoint =
      process.platform === 'win32'
        ? String.raw`\\.\pipe\orca-rates-${randomUUID()}`
        : join(fixture.directory, 'stream.sock')
    const authToken = randomUUID()
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      let input = ''
      socket.once('close', () => runtime.cleanupSubscriptionsForConnection('stream-fixture'))
      socket.on('data', (chunk) => {
        input += chunk.toString()
        if (!input.includes('\n')) {
          return
        }
        const request = JSON.parse(input.split('\n')[0])
        input = ''
        if (request.authToken !== authToken || request.method !== 'rateLimits.subscribe') {
          socket.destroy()
          return
        }
        const method = registry.get(request.method)
        if (!method || !isStreamingMethod(method)) {
          socket.destroy()
          return
        }
        void method
          .handler(null, { runtime, connectionId: 'stream-fixture' }, (result) => {
            if (!socket.destroyed) {
              socket.write(
                `${JSON.stringify({
                  id: request.id,
                  ok: true,
                  result,
                  _meta: { runtimeId: 'fixture-host' }
                })}\n`
              )
            }
          })
          .catch(() => socket.destroy())
        rates.onStateChange.mock.calls.at(-1)?.[0](rates.getState())
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
      const output = await runProcess({
        program: process.execPath,
        args: [
          join(process.cwd(), 'out/cli/index.js'),
          'rate-limit',
          'observe-stream',
          '--count',
          '2',
          '--timeout-ms',
          '2000',
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
      if (output.code !== 0) {
        throw new Error(
          `${process.cwd()} ${process.execPath} ${output.stderr.replaceAll(
            authToken,
            '[redacted]'
          )}${output.stdout.replaceAll(authToken, '[redacted]')}`
        )
      }
      expect(
        output.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).type)
      ).toEqual(['ready', 'snapshot', 'closed'])
      expect(output.stdout).not.toContain(authToken)
      await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
      expect(rates.refresh).not.toHaveBeenCalled()
    } finally {
      runtime.cleanupSubscriptionsForConnection('stream-fixture')
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
)
