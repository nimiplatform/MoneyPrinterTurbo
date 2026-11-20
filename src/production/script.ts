const PAUSE_KEYWORDS =
  'pause|pausa|silence|silencio|silêncio|silenzio|stille|пауза|тишина|停顿|暂停|静音|ポーズ|一時停止|無音|일시중지|정지';
const PAUSE_TAG_RE = new RegExp(
  String.raw`[\[\(（［【]\s*(?:${PAUSE_KEYWORDS})(?![\p{L}_])(?:\s*[:：]?\s*[^\]\)）］】]*?)?\s*[\]\)）］】]`,
  'giu',
);
const KEYCAP_RE = /([0-9#*])\uFE0F?\u20E3/gu;
const EMOJI_CORE =
  String.raw`(?:\p{Regional_Indicator}{2}|\p{Emoji_Presentation}|(?:[^\p{L}\p{N}\s#*]|\u2139)\uFE0F|[\u2600-\u27BF](?=[\u200D\u{1F3FB}-\u{1F3FF}]))(?:[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|[^\p{L}\p{N}\s])\uFE0F?)*`;
const EMOJI_SEQUENCE_RE = new RegExp(
  String.raw`([ \t]?)(?:${EMOJI_CORE})+(?:[ \t]+(?:${EMOJI_CORE})+)*([ \t]?)`,
  'gu',
);
const CJK_RE = /[\u2E80-\u312F\u3190-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{20000}-\u{3FFFF}]/u;
const OPENING_MARKS = new Set([...'([{«¡¿（「『【《“‘']);
const CLOSING_MARKS = new Set([...'.,!?;:)]}”’»…，。！？；：、）」』】》']);

export function stripReasoningAndFence(value: string): string {
  const withoutThink = value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/^[\s\S]*?<\/think\s*>/i, '')
    .replace(/<think\b[^>]*>[\s\S]*$/i, '')
    .trim();
  return withoutThink.replace(/^```[a-zA-Z0-9_-]*\s*\r?\n([\s\S]*?)\r?\n```$/i, '$1').trim();
}

export function cleanGeneratedScript(value: string): string {
  const stripped = stripReasoningAndFence(value)
    // Retain spoken labels in Markdown links while discarding URLs.
    .replace(/\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
    // Strip heading prefixes without deleting inline sharp symbols such as C# or #1.
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*/g, '');
  const lines = stripped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line || /[\p{L}\p{N}]/u.test(line));
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('模型返回了空脚本，请调整主题或创作要求后重试。');
  return text;
}

export function removeEmoji(value: string): string {
  if (!value) return '';
  const withKeycaps = value.replace(KEYCAP_RE, (match, digit: string, offset: number, source: string) => {
    const next = source.slice(offset + match.length)[0] ?? '';
    return /[\p{L}\p{N}]/u.test(next) && !CJK_RE.test(next) ? `${digit} ` : digit;
  });
  return withKeycaps.replace(
    EMOJI_SEQUENCE_RE,
    (match, before: string, after: string, offset: number, source: string) => {
      const prev = offset > 0 ? source[offset - 1]! : '\n';
      const next = offset + match.length < source.length ? source[offset + match.length]! : '\n';
      if (before && after) return after;
      const afterOpening = /\s/u.test(prev) || OPENING_MARKS.has(prev);
      const beforeClosing = /\s/u.test(next) || CLOSING_MARKS.has(next);
      if (before) return beforeClosing ? '' : before;
      if (after) return afterOpening ? '' : after;
      if (afterOpening || beforeClosing || CJK_RE.test(prev) || CJK_RE.test(next)) return '';
      return ' ';
    },
  );
}

export function prepareNarrationText(value: string): string {
  const withoutPauses = value.replace(PAUSE_TAG_RE, ' ').replace(/[ \t]{2,}/g, ' ');
  const cleaned = removeEmoji(withoutPauses)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && /[\p{L}\p{N}]/u.test(line))
    .join('\n')
    .trim();
  if (value.trim() && !cleaned) {
    throw new Error('脚本去除表情符号与停顿标签后没有可朗读正文。');
  }
  return cleaned;
}

function extractEmbeddedJsonArray(text: string): unknown {
  const start = text.indexOf('[');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('素材关键词的 JSON 不完整。');
}

export function parseVisualTerms(value: string): string[] {
  const text = stripReasoningAndFence(value);
  let terms: unknown;
  if (text.startsWith('[')) {
    try {
      terms = JSON.parse(text);
    } catch {
      throw new Error('素材关键词的 JSON 不完整。');
    }
  } else if (text.startsWith('{')) {
    throw new Error('素材关键词需为 JSON 数组，不能为对象。');
  } else if (text.includes('[')) {
    terms = extractEmbeddedJsonArray(text);
  } else if (text.includes('\n')) {
    terms = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ''));
  } else if (/[,，]/.test(text)) {
    terms = text.split(/[,，]/).map((term) => term.trim()).filter(Boolean);
  }
  if (
    !Array.isArray(terms) ||
    !terms.length ||
    terms.length > 50 ||
    terms.some((term) => typeof term !== 'string' || !term.trim() || term.trim().length > 200 || /[\r\n]/.test(term))
  ) {
    throw new Error('素材关键词需为 JSON 数组、逐行列表或逗号分隔的短语，请检查原响应或手工填写。');
  }
  return terms.map((term: string) => term.trim()).filter(Boolean);
}
