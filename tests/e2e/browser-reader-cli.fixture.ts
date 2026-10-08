import { BROWSER_READER_COMMAND_SPECS } from '../../src/cli/specs/browser-readers'
import { BROWSER_READER_HANDLERS } from '../../src/cli/handlers/browser-readers'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
export const createBrowserReaderCli =
  (dir: string) => async (kind: 'browser-drivers' | 'client-browser-rows') => {
    const specs = BROWSER_READER_COMMAND_SPECS
    const parsed = parseArgs(
      ['runtime', kind, '--json'],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_READER_HANDLERS[parsed.commandPath.join(' ')]({
      ...parsed,
      client: new RuntimeClient(dir),
      cwd: dir,
      json: true
    })
  }
