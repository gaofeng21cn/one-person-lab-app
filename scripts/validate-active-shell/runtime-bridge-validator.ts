import { validateOplGatewayAccountContract } from './runtime-bridge-validator-parts/gateway-account.ts';
import {
  validateLiveOplConformance,
  validateLiveConformanceContract,
  validateOplAppStateFastAgentPackageDirectoryFixture,
} from './runtime-bridge-validator-parts/app-state.ts';
import { validateCanonicalConversationContinuityPolicy } from './runtime-bridge-validator-parts/continuity.ts';
import { validateCodexParityAdapterPolicies } from './runtime-bridge-validator-parts/codex-parity.ts';
import {
  validateRuntimeBridgeIdentity,
  validateRuntimeBridgeDeclaredSurfaces,
  validateWebuiDeploymentContract,
  validateRuntimeBridgeDefaultReadSurfacePolicy,
  validateRuntimeBridgeUserTaskStatus,
  validateNativeMinimumProductBridge,
  validateRuntimeSurfaceOwnerMatrix,
  validateRuntimeBridgeAuthorityBoundary,
  validateRuntimeBridgeReplacementPolicy,
  validateRuntimeBridgeForbiddenTruthSources,
} from './runtime-bridge-validator-parts/identity-authority.ts';
import { validateRuntimeProgressPageDisplayPolicy } from './runtime-bridge-validator-parts/progress-display.ts';
import {
  validateRuntimeBridgeCommandResolutionPolicy,
  validateSharedGuiRuntimeResolutionPolicy,
} from './runtime-bridge-validator-parts/command-routing.ts';
import {
  validateRuntimeBridgeProjectionContracts,
  validatePackageReadinessProjection,
} from './runtime-bridge-validator-parts/projection-readiness.ts';

export function validateRuntimeBridgeContract(runtimeBridge, contract) {
  validateRuntimeBridgeIdentity(runtimeBridge, contract);
  validateRuntimeBridgeDeclaredSurfaces(runtimeBridge);
  validateWebuiDeploymentContract(runtimeBridge);
  validateOplGatewayAccountContract(runtimeBridge);
  validateRuntimeBridgeDefaultReadSurfacePolicy(runtimeBridge);
  validateRuntimeBridgeCommandResolutionPolicy(runtimeBridge);
  validateSharedGuiRuntimeResolutionPolicy(runtimeBridge);
  validateCanonicalConversationContinuityPolicy(runtimeBridge);
  validateCodexParityAdapterPolicies(runtimeBridge);
  validateRuntimeBridgeProjectionContracts(runtimeBridge);
  validatePackageReadinessProjection(runtimeBridge);
  validateNativeMinimumProductBridge(runtimeBridge);
  validateRuntimeBridgeUserTaskStatus(runtimeBridge);
  validateRuntimeSurfaceOwnerMatrix(runtimeBridge);
  validateRuntimeBridgeAuthorityBoundary(runtimeBridge);
  validateRuntimeBridgeReplacementPolicy(runtimeBridge);
  validateRuntimeBridgeForbiddenTruthSources(runtimeBridge);
  validateLiveConformanceContract(runtimeBridge.live_conformance_gate);
}

export {
  validateLiveOplConformance,
  validateOplAppStateFastAgentPackageDirectoryFixture,
  validateOplGatewayAccountContract,
  validateRuntimeProgressPageDisplayPolicy,
};
