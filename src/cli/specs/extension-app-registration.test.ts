import { expect, it } from 'vitest'
import { CLI_COMMAND_NAMES } from '../../main/startup/cli-command-names'
import { HANDLER_COMMAND_KEYS } from '../dispatch'
import { COMMAND_SPECS } from './index'

it('routes extension and app commands through the launcher and lazy dispatcher', () => {
  const roots = ['app', 'plugins', 'skills', 'automations', 'profile', 'sparse-presets']
  for (const root of roots) {
    expect(CLI_COMMAND_NAMES).toContain(root)
    const specs = COMMAND_SPECS.filter((spec) => spec.path[0] === root)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(HANDLER_COMMAND_KEYS.has(spec.path.join(' '))).toBe(true)
    }
  }
})
