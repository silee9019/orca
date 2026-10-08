import { z } from 'zod'

export const ExtensionsSidebarPageSchema = z.enum(['automations', 'skills', 'artifacts'])
export const ExtensionsSidebarActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.enum(['open', 'hide']),
    page: ExtensionsSidebarPageSchema,
    reviewedTarget: z.uuid()
  })
])
export const ExtensionsSidebarParams = z.strictObject({
  viewer: z.literal('desktop'),
  action: ExtensionsSidebarActionSchema
})
export type ExtensionsSidebarAction = z.infer<typeof ExtensionsSidebarActionSchema>
export type ExtensionsSidebarPage = z.infer<typeof ExtensionsSidebarPageSchema>
