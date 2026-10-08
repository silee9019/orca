import { z } from 'zod'

const fieldSchema = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('string'),
      required: z.boolean().optional(),
      minLength: z.number().int().min(0).max(65536).optional(),
      maxLength: z.number().int().min(0).max(65536).optional(),
      enum: z.array(z.string().max(65536)).min(1).max(256).optional()
    })
    .refine((field) => (field.minLength ?? 0) <= (field.maxLength ?? 65536)),
  z
    .strictObject({
      type: z.literal('number'),
      required: z.boolean().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional()
    })
    .refine(
      (field) =>
        field.minimum === undefined || field.maximum === undefined || field.minimum <= field.maximum
    ),
  z.strictObject({ type: z.literal('boolean'), required: z.boolean().optional() })
])

export const pluginCommandInputSchema = z.strictObject({
  fields: z
    .record(
      z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
        .refine((name) => name !== 'constructor' && name !== 'prototype'),
      fieldSchema
    )
    .refine((fields) => Object.keys(fields).length <= 64)
})
export type PluginCommandInput = z.infer<typeof pluginCommandInputSchema>

export function parsePluginCommandInput(
  input: PluginCommandInput | undefined,
  args: unknown
): unknown {
  if (!input) {
    if (args !== undefined) {
      throw new Error('This command has no declared input contract')
    }
    return undefined
  }
  const shape: Record<string, z.ZodType> = {}
  for (const [name, field] of Object.entries(input.fields)) {
    let value: z.ZodType
    if (field.type === 'string') {
      value = z
        .string()
        .min(field.minLength ?? 0)
        .max(field.maxLength ?? 65536)
        .refine((text) => !field.enum || field.enum.includes(text))
    } else if (field.type === 'number') {
      value = z
        .number()
        .refine(
          (number) =>
            (field.minimum === undefined || number >= field.minimum) &&
            (field.maximum === undefined || number <= field.maximum)
        )
    } else {
      value = z.boolean()
    }
    shape[name] = field.required ? value : value.optional()
  }
  const parsed = z.strictObject(shape).safeParse(args)
  if (!parsed.success) {
    throw new Error('Invalid plugin command input')
  }
  return parsed.data
}
