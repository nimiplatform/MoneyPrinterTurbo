export function parseVisualTerms(value: string): string[] {
  const text = value.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  let terms: unknown;
  if (text.startsWith('[') || text.startsWith('{')) {
    try { terms = JSON.parse(text); } catch { throw new Error('素材关键词的 JSON 不完整。'); }
  } else if (text.includes('\n')) {
    terms = text.split(/\r?\n/).filter((line) => line.trim())
      .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ''));
  } else if (text.includes(',')) terms = text.split(',').map((term) => term.trim());
  if (!Array.isArray(terms) || !terms.length || terms.length > 50 ||
      terms.some((term) => typeof term !== 'string' || !term.trim() || term.length > 200 || /[\r\n]/.test(term)))
    throw new Error('素材关键词需为 JSON 数组、逐行列表或逗号分隔的短语，请检查原响应或手工填写。');
  return terms.map((term: string) => term.trim());
}
