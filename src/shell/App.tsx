import { WorkbenchRuntimeGate } from '../workbench-core/index.js';
import { NimiToaster } from '@nimiplatform/kit/ui';
import { Studio } from '../production/Studio.js';
import { StudioPlatformProvider } from '../production/platform.js';
import { nativeProductionPlatform } from './native-production.js';
import {
  appTitle,
  clearTargetRuntimeGate,
  resolveTargetRuntimeGate,
  targetRuntimeGateCopy,
  targetRuntimeGateErrorMessage,
} from './workbench-target-adapter.js';

export function App() {
  return (
    <>
      <WorkbenchRuntimeGate
        appTitle={appTitle}
        copy={targetRuntimeGateCopy}
        resolve={resolveTargetRuntimeGate}
        clear={clearTargetRuntimeGate}
        toErrorMessage={targetRuntimeGateErrorMessage}
      >
        <StudioPlatformProvider platform={nativeProductionPlatform}><Studio /></StudioPlatformProvider>
      </WorkbenchRuntimeGate>
      <NimiToaster />
    </>
  );
}
