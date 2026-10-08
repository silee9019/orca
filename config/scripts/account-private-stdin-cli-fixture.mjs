import { createJiti } from 'jiti'
import { writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const [root, failure, ...argv] = process.argv.slice(2)
const json = argv.includes('--json')
const jiti = createJiti(import.meta.url)
const { reportCliError } = await jiti.import('../../src/cli/cli-error.ts')
const { parseArgs, specPaths, validateCommandAndFlags } = await jiti.import('../../src/cli/args.ts')
const { RuntimeClient } = await jiti.import('../../src/cli/runtime-client.ts')
const { ACCOUNT_CREDENTIAL_COMMAND_SPECS } = await jiti.import(
  '../../src/cli/specs/account-credentials.ts'
)
const { ACCOUNT_SECRET_SETTING_COMMAND_SPECS } = await jiti.import(
  '../../src/cli/specs/account-secret-settings.ts'
)
const { ACCOUNT_CREDENTIAL_HANDLERS } = await jiti.import(
  '../../src/cli/handlers/account-credentials.ts'
)
const { ACCOUNT_SECRET_SETTING_HANDLERS } = await jiti.import(
  '../../src/cli/handlers/account-secret-settings.ts'
)
const { AccountCredentialSaveParams } = await jiti.import(
  '../../src/shared/rpc-contract/account-credentials-params.ts'
)
const { AccountSecretSettingParams } = await jiti.import(
  '../../src/shared/rpc-contract/account-secret-settings-params.ts'
)
const { applyAccountSecretSetting, setAccountSecretSettingsWriter } = await jiti.import(
  '../../src/main/runtime/account-secret-settings-writer.ts'
)

let mutations = 0
setAccountSecretSettingsWriter(async (patch) => {
  if (failure === 'writer') {
    throw new Error(`fixture-private-writer-${Object.values(patch)[0]}`)
  }
  writeFileSync(resolve(root, 'saved'), JSON.stringify(patch), { mode: 0o600 })
  mutations++
})
const endpoint =
  process.platform === 'win32'
    ? String.raw`\\.\pipe\orca-private-stdin-${randomUUID()}`
    : join(tmpdir(), `orca-stdin-${randomUUID()}.sock`)
const authToken = randomUUID()
const runtimeId =
  failure === 'rpc' ? 'fixture-private-meta-fixture-private-stdin-canary' : 'fixture'
let calls = 0
const server = createServer((socket) => {
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString()
    if (!buffer.includes('\n')) {
      return
    }
    const request = JSON.parse(buffer.split('\n')[0])
    buffer = ''
    if (request.authToken !== authToken) {
      socket.destroy()
      return
    }
    calls++
    const input = request.params
    const respond = (value) => socket.end(`${JSON.stringify({ id: request.id, ...value })}\n`)
    void (async () => {
      if (failure === 'rpc') {
        const secret = input.secret ?? input.input ?? 'fixture-private-stdin-canary'
        respond({
          ok: false,
          error: {
            code: `fixture-private-code-${secret}`,
            message: `fixture-private-rpc-${secret}`,
            data: { privateInput: secret }
          },
          _meta: { runtimeId }
        })
        return
      }
      let result
      if (request.method === 'accountCredentials.save') {
        const parsed = AccountCredentialSaveParams.parse(input)
        writeFileSync(resolve(root, 'saved'), parsed.secret, { mode: 0o600 })
        mutations++
        result = { apiKeyConfigured: true }
      } else if (request.method === 'accountSecretSettings.apply') {
        result = await applyAccountSecretSetting(AccountSecretSettingParams.parse(input))
      } else {
        throw new Error('Unexpected private input fixture operation')
      }
      respond({ ok: true, result, _meta: { runtimeId: 'fixture' } })
    })().catch((error) =>
      respond({
        ok: false,
        error: { code: 'fixture_failure', message: error.message },
        _meta: { runtimeId: 'fixture' }
      })
    )
  })
})
await new Promise((ready) => server.listen(endpoint, ready))
writeFileSync(
  resolve(root, 'orca-runtime.json'),
  JSON.stringify({
    runtimeId,
    pid: process.pid,
    authToken,
    startedAt: Date.now(),
    transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }]
  }),
  { mode: 0o600 }
)
const client = new RuntimeClient(root, 1000, null, null, 'orca')

try {
  const specs = [...ACCOUNT_CREDENTIAL_COMMAND_SPECS, ...ACCOUNT_SECRET_SETTING_COMMAND_SPECS]
  const parsed = parseArgs(argv, specs.flatMap(specPaths), specs)
  validateCommandAndFlags(specs, parsed)
  const handlers = { ...ACCOUNT_CREDENTIAL_HANDLERS, ...ACCOUNT_SECRET_SETTING_HANDLERS }
  await handlers[parsed.commandPath.join(' ')]({ client, cwd: root, flags: parsed.flags, json })
} catch (error) {
  reportCliError(error, json)
  process.exitCode = 1
} finally {
  writeFileSync(resolve(root, 'mutations'), String(mutations), { mode: 0o600 })
  writeFileSync(resolve(root, 'calls'), String(calls), { mode: 0o600 })
  await new Promise((closed) => server.close(closed))
  if (process.platform !== 'win32') {
    rmSync(endpoint, { force: true })
  }
}
