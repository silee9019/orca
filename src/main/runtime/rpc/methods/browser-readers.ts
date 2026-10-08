import { defineMethod } from '../core'
import {
  BrowserDriverSnapshot,
  ClientHostedBrowserRowsSnapshot
} from '../../../../shared/rpc-contract/browser-reader-params'
export const browserReaderMethods = [
  defineMethod({
    name: 'runtime.browserDrivers',
    params: null,
    handler: (_params, { runtime }) =>
      BrowserDriverSnapshot.parse(
        Array.from(runtime.getAllBrowserDrivers(), ([browserPageId, driver]) => ({
          browserPageId,
          driver
        }))
      )
  }),
  defineMethod({
    name: 'runtime.clientHostedBrowserRows',
    params: null,
    handler: (_params, { runtime }) =>
      ClientHostedBrowserRowsSnapshot.parse(runtime.readClientHostedBrowserRows())
  })
]
