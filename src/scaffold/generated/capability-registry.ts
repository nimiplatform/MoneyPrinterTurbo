import {
  aiStudioCoreMessageBundles,
  composeAIStudioModules,
  mergeAIStudioMessageBundles,
} from '../../capabilities/ai-studio-core/index.js';
import { studioCreateModule, studioCreateMessageBundles } from '../../capabilities/studio-create/index.js';

export const generatedAIStudioModules = Object.freeze([studioCreateModule]);
export const generatedAIStudioComposition = composeAIStudioModules(generatedAIStudioModules);
export const generatedAIStudioRegistrations = generatedAIStudioComposition.capabilities;
export const generatedAIStudioMessageBundles = Object.freeze({
  en: mergeAIStudioMessageBundles([aiStudioCoreMessageBundles.en, studioCreateMessageBundles.en]),
  zh: mergeAIStudioMessageBundles([aiStudioCoreMessageBundles.zh, studioCreateMessageBundles.zh]),
});
