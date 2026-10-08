import type { createRuntimeEnvironmentConnectivityOperations } from './runtime-environment-connectivity-handlers'
type RuntimeEnvironmentManagement = ReturnType<
  typeof createRuntimeEnvironmentConnectivityOperations
>
let operations: RuntimeEnvironmentManagement | null = null
export function setRuntimeEnvironmentManagement(value: RuntimeEnvironmentManagement | null): void {
  operations = value
}
export function getRuntimeEnvironmentManagement(): RuntimeEnvironmentManagement {
  if (!operations) {
    throw new Error('runtime_environment_management_not_registered')
  }
  return operations
}
