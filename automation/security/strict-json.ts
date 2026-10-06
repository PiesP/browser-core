export type JsonValue =
  | null
  | boolean
  | string
  | number
  | bigint
  | JsonValue[]
  | { [key: string]: JsonValue };

// OSV's unknown metadata can contain integers outside Number's exact range.
// Keep those as bigint during validation; file adapters preserve the JSON text.
export function parseStrictJson(text: string): JsonValue {
  let cursor = 0;
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  function whitespace(): void {
    while (/[\u0020\u0009\u000a\u000d]/.test(text[cursor] ?? '\0')) cursor += 1;
  }

  function fail(message: string): never {
    throw new SyntaxError(`${message} at offset ${cursor}`);
  }

  function string(): string {
    const start = cursor++;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (character === '\\') {
        cursor += 1;
      } else if (character === '"') {
        const value: unknown = JSON.parse(text.slice(start, cursor));
        if (typeof value !== 'string') return fail('Expected a JSON string');
        return value;
      }
    }
    return fail('Unterminated JSON string');
  }

  function value(): JsonValue {
    whitespace();
    const character = text[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1;
      whitespace();
      const object: { [key: string]: JsonValue } = {};
      if (text[cursor] === '}') { cursor += 1; return object; }
      while (true) {
        whitespace();
        if (text[cursor] !== '"') return fail('Expected an object key');
        const key = string();
        if (Object.hasOwn(object, key)) return fail(`JSON contains duplicate key: ${key}`);
        whitespace();
        if (text[cursor++] !== ':') return fail('Expected a colon');
        Object.defineProperty(object, key, {
          value: value(), enumerable: true, writable: true, configurable: true,
        });
        whitespace();
        const separator = text[cursor++];
        if (separator === '}') return object;
        if (separator !== ',') return fail('Expected an object separator');
      }
    }
    if (character === '[') {
      cursor += 1;
      whitespace();
      const array: JsonValue[] = [];
      if (text[cursor] === ']') { cursor += 1; return array; }
      while (true) {
        array.push(value());
        whitespace();
        const separator = text[cursor++];
        if (separator === ']') return array;
        if (separator !== ',') return fail('Expected an array separator');
      }
    }
    for (const [literal, result] of [['null', null], ['true', true], ['false', false]] as const) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; return result; }
    }
    numberPattern.lastIndex = cursor;
    const token = numberPattern.exec(text)?.[0];
    if (token === undefined) return fail('Expected a JSON value');
    cursor += token.length;
    const number = Number(token);
    if (/[.eE]/.test(token)) {
      if (!Number.isFinite(number)) return fail('JSON contains a non-finite number');
      return number;
    }
    // Match the dependency-free Python validator's default integer conversion
    // limit rather than allowing unbounded integer construction.
    if (token.replace('-', '').length > 4300) return fail('JSON integer exceeds 4300 digits');
    return Number.isSafeInteger(number) ? number : BigInt(token);
  }

  const result = value();
  whitespace();
  if (cursor !== text.length) fail('Unexpected trailing JSON input');
  return result;
}
