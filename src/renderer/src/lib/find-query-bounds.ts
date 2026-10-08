import { isFindQueryTooLarge } from '../../../shared/rpc-contract/browser-find-params'
export {
  FIND_QUERY_MAX_BYTES,
  isFindQueryTooLarge
} from '../../../shared/rpc-contract/browser-find-params'

export function getFindRequestQuery(query: string): string | null {
  return isFindQueryTooLarge(query) ? null : query
}
