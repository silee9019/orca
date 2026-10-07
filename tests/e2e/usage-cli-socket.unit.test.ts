import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'
import { isStreamingMethod } from '../../src/main/runtime/rpc/core'
import { fixture, setup } from './usage-cli-test-fixture'

describe('built usage CLI socket', () => {
  it.skipIf(process.env.ORCA_USAGE_CLI_SMOKE !== '1')(
    'runs the built CLI through a private socket and reads the existing store write back',
    async () => {
      const { runtime, registry, providers } = setup()
      const endpoint =
        process.platform === 'win32'
          ? String.raw`\\.\pipe\orca-usage-${randomUUID()}`
          : join(fixture.directory, 'rpc.sock')
      const authToken = randomUUID()
      const server = createServer((socket) => {
        socket.setEncoding('utf8')
        let input = ''
        socket.on('data', (chunk) => {
          input += chunk.toString()
          if (!input.includes('\n')) {
            return
          }
          const request = JSON.parse(input.split('\n')[0])
          if (request.authToken !== authToken) {
            socket.destroy()
            return
          }
          const method = registry.get(request.method)
          if (!method || isStreamingMethod(method)) {
            socket.destroy()
            return
          }
          Promise.resolve(
            method.handler(method.params ? method.params.parse(request.params) : undefined, {
              runtime
            })
          )
            .then((result) => {
              socket.end(
                `${JSON.stringify({
                  id: request.id,
                  ok: true,
                  result,
                  _meta: { runtimeId: 'fixture-host' }
                })}\n`
              )
            })
            .catch(() => socket.destroy())
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
        const env = {
          ...process.env,
          ORCA_USER_DATA_PATH: fixture.directory,
          ORCA_BACKGROUND_LAUNCH: '1',
          ORCA_ENVIRONMENT: '',
          ORCA_PAIRING_CODE: '',
          ORCA_REMOTE_PAIRING: ''
        }
        const enable = await runProcess({
          program: process.execPath,
          args: [
            'out/cli/index.js',
            'usage',
            'set-enabled',
            '--provider',
            'muse',
            '--enabled',
            'true',
            '--json'
          ],
          env,
          timeoutMs: 10000
        })
        expect(enable.code).toBe(0)
        expect(JSON.parse(enable.stdout).result.enabled).toBe(true)
        const read = await runProcess({
          program: process.execPath,
          args: ['out/cli/index.js', 'usage', 'scan-state', '--provider', 'muse', '--json'],
          env,
          timeoutMs: 10000
        })
        expect(read.code).toBe(0)
        expect(JSON.parse(read.stdout).result.enabled).toBe(true)
        expect(
          JSON.parse(readFileSync(join(fixture.directory, 'orca-muse-usage.json'), 'utf8'))
            .scanState.enabled
        ).toBe(true)
        await providers.muse.flush()
        console.log(
          JSON.stringify({
            smoke: 'built-cli-private-socket',
            enableExit: enable.code,
            readExit: read.code,
            persistedEnabled: true,
            provider: 'muse'
          })
        )
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  )
})
