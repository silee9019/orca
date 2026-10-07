import { describe, expect, it } from 'vitest'
import { parseArgs } from './args'
import { COMMAND_SPECS } from './specs'

describe('extension command argument boundary', () => {
  it('recognizes stdin as a boolean before the command and keeps the exact plugin selectors', () => {
    const result = parseArgs(
      ['--input-stdin', 'plugins', 'command', '--plugin', 'fixture.cli', '--command', 'save'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    expect(result.commandPath).toEqual(['plugins', 'command'])
    expect(result.flags.get('input-stdin')).toBe(true)
    expect(result.flags.get('plugin')).toBe('fixture.cli')
    expect(result.flags.get('command')).toBe('save')
  })
})
