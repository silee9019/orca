import { describe, expect, it } from 'vitest'
import { pluginCommandInputSchema, parsePluginCommandInput } from './plugin-command-input'

describe('plugin command declared input', () => {
  const input = {
    fields: {
      name: { type: 'string', required: true, maxLength: 8, enum: ['demo', 'other'] },
      count: { type: 'number', minimum: 1, maximum: 3 },
      enabled: { type: 'boolean' }
    }
  }

  it('keeps legacy calls without input and rejects undeclared CLI arguments', () => {
    expect(parsePluginCommandInput(undefined, undefined)).toBeUndefined()
    expect(() => parsePluginCommandInput(undefined, { name: 'demo' })).toThrow()
  })

  it('accepts named primitive values and refuses invalid values before dispatch', () => {
    const schema = pluginCommandInputSchema.parse(input)
    expect(parsePluginCommandInput(schema, { name: 'demo', count: 3, enabled: false })).toEqual({
      name: 'demo',
      count: 3,
      enabled: false
    })
    for (const args of [
      undefined,
      {},
      { name: 'invalid' },
      { name: 'demo', count: 4 },
      { name: 'demo', count: '1' },
      { name: 'demo', extra: true },
      { name: 'demo', enabled: 1 }
    ]) {
      expect(() => parsePluginCommandInput(schema, args)).toThrow()
    }
  })

  it('rejects executable, recursive, and inconsistent declarations', () => {
    for (const schema of [
      { fields: { name: { type: 'string', transform: 'eval' } } },
      { fields: { name: { type: 'object' } } },
      { fields: { constructor: { type: 'string' } } },
      { fields: { name: { type: 'number', minimum: 4, maximum: 1 } } },
      { fields: { name: { type: 'string', minLength: 5, maxLength: 1 } } }
    ]) {
      expect(pluginCommandInputSchema.safeParse(schema).success).toBe(false)
    }
  })
})
