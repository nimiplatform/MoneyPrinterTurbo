import type { StudioCommand } from './platform.js';
import type { ProductionParams } from './types.js';

export type StudioCommandInvoker = <T>(
  name: StudioCommand,
  payload?: Record<string, unknown>,
) => Promise<T>;

export async function saveCreationDefaults(
  command: StudioCommandInvoker,
  params: ProductionParams,
): Promise<void> {
  await command('settings.save', { scope: 'creation', value: params });
}

export async function submitProductionBatch(
  command: StudioCommandInvoker,
  params: ProductionParams,
): Promise<{ taskIds: string[] }> {
  return command<{ taskIds: string[] }>('start', { params });
}
