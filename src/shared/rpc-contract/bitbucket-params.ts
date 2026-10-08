import { z } from 'zod'
import { requiredString } from './rpc-param-primitives'

const ApiBaseUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false
    }
    const url = new URL(value)
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  }, 'Use an HTTP API URL without embedded credentials, query or fragment')
  .nullable()
  .optional()

export const BitbucketConnect = z.discriminatedUnion('authMode', [
  z.object({
    authMode: z.literal('token'),
    accessToken: requiredString('Access token is required'),
    baseUrl: ApiBaseUrl
  }),
  z.object({
    authMode: z.literal('basic'),
    email: requiredString('Email is required'),
    apiToken: requiredString('API token is required'),
    baseUrl: ApiBaseUrl
  })
])
