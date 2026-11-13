import { invoke, openNimiLocalAppAssetMediaUrl } from '@nimiplatform/kit/shell/renderer/bridge';
import { getNimiLocalAppClient } from './auth/local-app-client.js';
import type { StudioPlatform } from '../production/platform.js';

/** The supervised Host resets this renderer when its protected account scope ends. */
export const nativeProductionPlatform: StudioPlatform = {
  kind: 'desktop', connected: true, client: getNimiLocalAppClient(),
  command: async <T,>(name: string, payload: Record<string, unknown> = {}) => await invoke(`mpt.${name}`, payload) as T,
  openMedia: asset => openNimiLocalAppAssetMediaUrl(asset.relativePath),
  deliverAsset: async asset => { await getNimiLocalAppClient().storage.assets.reveal(asset.relativePath); },
  importMedia: async (file, mediaType) => await invoke('mpt.import', { name: file.name, mediaType, bytes: new Uint8Array(await file.arrayBuffer()) }) as never,
};
