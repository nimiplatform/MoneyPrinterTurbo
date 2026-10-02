import { composeStudioCapabilityRuntimeHandlers } from '../../capabilities/ai-studio-core/index.js';
import { studioCreateRuntimeHandlers } from '../../capabilities/studio-create/index.js';

export const generatedStudioRuntimeHandlers = composeStudioCapabilityRuntimeHandlers([
  studioCreateRuntimeHandlers,
]);
