import type { createMobileConnectionOperations } from './mobile'
type MobileConnectionManagement = ReturnType<typeof createMobileConnectionOperations>
let operations: MobileConnectionManagement | null = null
export function setMobileConnectionManagement(value: MobileConnectionManagement | null): void {
  operations = value
}
export function getMobileConnectionManagement(): MobileConnectionManagement {
  if (!operations) {
    throw new Error('mobile_connection_management_not_registered')
  }
  return operations
}
