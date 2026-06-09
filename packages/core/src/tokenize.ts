const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "please",
  "help",
  "我",
  "帮",
  "帮我",
  "一个",
  "这个",
  "一下",
]);

export function tokenizeText(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();

  for (const match of normalized.matchAll(/[\p{L}\p{N}_+-]+/gu)) {
    const token = match[0].trim();
    if (token.length > 1 && !STOP_WORDS.has(token)) {
      tokens.add(token);
    }

    if (/\p{Script=Han}/u.test(token)) {
      for (const gram of cjkNgrams(token)) {
        if (!STOP_WORDS.has(gram)) tokens.add(gram);
      }
    }
  }

  return Array.from(tokens);
}

function cjkNgrams(text: string): string[] {
  const chars = Array.from(text);
  const grams: string[] = [];

  if (chars.length > 2) {
    grams.push(text);
  }

  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(chars.slice(index, index + 2).join(""));
  }

  return grams;
}
