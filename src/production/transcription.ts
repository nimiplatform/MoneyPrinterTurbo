import type { Cue } from './types.js';
export function assembleCues(
  words: readonly { text: string; startSeconds: number; endSeconds: number }[],
  mode: 'sentence' | 'word_by_word',
): Cue[] {
  const cues: Cue[] = [];
  let current: Cue | null = null;
  for (const word of words) {
    if (
      !word.text ||
      !Number.isFinite(word.startSeconds) ||
      !Number.isFinite(word.endSeconds) ||
      word.startSeconds < 0 ||
      word.endSeconds <= word.startSeconds
    )
      throw new Error('转写资源没有提供有效逐词时间轴，请选择支持对齐的资源。');
    if (mode === 'word_by_word') {
      cues.push({ text: word.text, start: word.startSeconds, end: word.endSeconds });
      continue;
    }
    if (
      current &&
      (word.startSeconds - current.end > 0.7 ||
        current.text.length > 30 ||
        word.endSeconds - current.start > 5)
    ) {
      cues.push(current);
      current = null;
    }
    if (!current) current = { text: word.text, start: word.startSeconds, end: word.endSeconds };
    else {
      current.text +=
        /[\p{Script=Han}]$/u.test(current.text) || /^[\p{Script=Han}\p{P}]/u.test(word.text)
          ? word.text
          : ' ' + word.text;
      current.end = word.endSeconds;
    }
    if (/[。！？.!?]$/.test(word.text)) {
      cues.push(current);
      current = null;
    }
  }
  if (current) cues.push(current);
  return cues;
}
export function validateCues(input: unknown): Cue[] {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('字幕时间轴格式不正确。');
  let last = 0;
  return input.map((c) => {
    if (
      !c ||
      typeof c.text !== 'string' ||
      !c.text.trim() ||
      c.text.length > 2000 ||
      !Number.isFinite(c.start) ||
      !Number.isFinite(c.end) ||
      c.start < last ||
      c.end <= c.start ||
      c.end > 3600
    )
      throw new Error('字幕需要文字、递增的开始时间和有效结束时间。');
    last = c.start;
    return { text: c.text, start: c.start, end: c.end };
  });
}
const timestamp = (s: number) => {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`)
    .join('\n');
}
