import type { Task } from '../src/production/types.js';

/** Automation lists carry summaries; detailed timelines and media are read separately. */
export function taskPage(tasks: Iterable<Task>, cursor?: unknown, limit: unknown = 20) {
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50)
    throw new Error('limit must be an integer from 1 to 50.');
  if (cursor !== undefined && (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor)))
    throw new Error('Invalid task cursor.');
  const sorted = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const after = cursor === undefined ? -1 : sorted.findIndex((t) => t.id === cursor);
  if (cursor !== undefined && after === -1) throw new Error('Task cursor not found.');
  const page = sorted.slice(after + 1, after + 1 + (limit as number));
  return {
    tasks: page.map((t) => ({
      id: t.id, topic: t.params.topic.slice(0, 256), createdAt: t.createdAt, updatedAt: t.updatedAt,
      state: t.state, stage: t.stage, progress: t.progress, variant: t.variant,
      aspect: t.params.aspect, stopAt: t.params.stopAt,
      artifactCount: t.artifacts.length, hasFinalVideo: t.artifacts.some((a) => a.name === 'final.mp4'),
      ...(t.error ? { error: t.error.slice(0, 512) } : {}),
    })),
    nextCursor: after + 1 + page.length < sorted.length ? page.at(-1)!.id : null,
  };
}
