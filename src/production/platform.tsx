import { createContext, useContext, type ReactNode } from 'react';
import type { NimiAppRuntimeClient } from '@nimiplatform/sdk/app';
import type { MediaAsset } from './types.js';

export type StudioCommand = 'snapshot' | 'task' | 'settings' | 'settings.save' | 'import' | 'start' | 'cancel' | 'resume' | 'jobs' | 'cues.save' | 'regenerate' | 'rewrite' | 'preview' | 'metadata' | 'asset' | 'publish' | 'publish.status';
export type StudioPlatform = Readonly<{
  kind: 'desktop' | 'web' | 'android'; connected: boolean; client: NimiAppRuntimeClient;
  command<T>(name: StudioCommand, payload?: Record<string, unknown>): Promise<T>;
  openMedia(asset: MediaAsset): Promise<{ url: string; revoke(): void | Promise<void> }>;
  deliverAsset(asset: MediaAsset): Promise<void>;
  shareAsset?(asset: MediaAsset): Promise<void>;
  importMedia(file: File, mediaType: string): Promise<MediaAsset>;
}>;
const Context = createContext<StudioPlatform | null>(null);
export function StudioPlatformProvider({ platform, children }: { platform: StudioPlatform; children: ReactNode }) {
  return <Context.Provider value={platform}>{children}</Context.Provider>;
}
export function useStudioPlatform(): StudioPlatform {
  const platform = useContext(Context);
  if (!platform) throw new Error('The production platform is not connected.');
  return platform;
}
