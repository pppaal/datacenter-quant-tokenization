import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combineToolsets,
  createHttpToolset,
  decodeWithFallback,
  pickEncoding
} from '@/lib/services/research/research-tools';
import {
  createMockToolset,
  type ResearchSource,
  type ResearchFetchedPage
} from '@/lib/services/research/research-agent';

const asOf = new Date('2026-04-23T00:00:00Z');

const primarySources: ResearchSource[] = [
  {
    id: 'A1',
    url: 'https://example.kr/a',
    title: 'Gangnam A rank one',
    publisher: 'Pub A',
    publishedAt: asOf,
    snippet: 'gangnam snippet a'
  }
];

const secondarySources: ResearchSource[] = [
  {
    id: 'B1',
    url: 'https://example.kr/a', // duplicate URL — should be filtered
    title: 'Gangnam A rank duplicate',
    publisher: 'Pub B',
    publishedAt: asOf,
    snippet: 'gangnam dupe'
  },
  {
    id: 'B2',
    url: 'https://example.kr/b',
    title: 'Gangnam B',
    publisher: 'Pub B',
    publishedAt: asOf,
    snippet: 'gangnam snippet b'
  }
];

const primaryPages: Record<string, ResearchFetchedPage> = {
  'https://example.kr/a': {
    url: 'https://example.kr/a',
    title: 'A page',
    publishedAt: asOf,
    text: 'A body'
  }
};

const secondaryPages: Record<string, ResearchFetchedPage> = {
  'https://example.kr/b': {
    url: 'https://example.kr/b',
    title: 'B page',
    publishedAt: asOf,
    text: 'B body'
  }
};

test('combineToolsets: dedupes search results by canonical URL', async () => {
  const primary = createMockToolset({ news: primarySources, pages: primaryPages });
  const secondary = createMockToolset({ news: secondarySources, pages: secondaryPages });
  const combined = combineToolsets(primary, secondary);
  const results = await combined.searchNews('gangnam');
  const urls = results.map((r) => r.url);
  assert.ok(urls.includes('https://example.kr/a'));
  assert.ok(urls.includes('https://example.kr/b'));
  assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs');
  assert.equal(results.length, 2, 'dupe filtered out');
});

test('combineToolsets: fetchPage tries each toolset in order', async () => {
  const primary = createMockToolset({ news: primarySources, pages: primaryPages });
  const secondary = createMockToolset({ news: secondarySources, pages: secondaryPages });
  const combined = combineToolsets(primary, secondary);

  const pageA = await combined.fetchPage('https://example.kr/a');
  assert.equal(pageA.title, 'A page');

  const pageB = await combined.fetchPage('https://example.kr/b');
  assert.equal(pageB.title, 'B page');

  await assert.rejects(() => combined.fetchPage('https://example.kr/missing'));
});

test('combineToolsets: swallows individual toolset search errors', async () => {
  const failing: ReturnType<typeof createMockToolset> = {
    async searchNews() {
      throw new Error('upstream rate limit');
    },
    async fetchPage() {
      throw new Error('unused');
    }
  };
  const primary = createMockToolset({ news: primarySources, pages: primaryPages });
  const combined = combineToolsets(failing, primary);
  const results = await combined.searchNews('gangnam');
  assert.equal(results.length, 1);
  assert.equal(results[0]!.id, 'A1');
});

test('createHttpToolset: rejects non-http URLs', async () => {
  const http = createHttpToolset();
  // safeFetch rejects non-http(s) schemes with "Disallowed scheme: ftp:"
  await assert.rejects(() => http.fetchPage('ftp://example.com/a'), /Disallowed scheme/);
});

test('createHttpToolset: search returns empty (no vendor API wired yet)', async () => {
  const http = createHttpToolset();
  const results = await http.searchNews('anything');
  assert.deepEqual(results, []);
});

test('pickEncoding prefers Content-Type charset', () => {
  const head = new TextEncoder().encode('<html><body>x</body></html>');
  assert.equal(pickEncoding('text/html; charset=euc-kr', head), 'euc-kr');
  assert.equal(pickEncoding('text/html; charset=UTF-8', head), 'utf-8');
});

test('pickEncoding falls back to <meta charset=...> when header lacks charset', () => {
  const html = '<html><head><meta charset="EUC-KR"></head></html>';
  const head = new TextEncoder().encode(html);
  assert.equal(pickEncoding(null, head), 'euc-kr');
  assert.equal(pickEncoding('text/html', head), 'euc-kr');
});

test('pickEncoding maps cp949 / ks_c_5601-1987 aliases to euc-kr', () => {
  const head = new TextEncoder().encode('<meta charset="CP949">');
  assert.equal(pickEncoding(null, head), 'euc-kr');
  const head2 = new TextEncoder().encode(
    '<meta http-equiv="content-type" content="text/html; charset=ks_c_5601-1987">'
  );
  assert.equal(pickEncoding(null, head2), 'euc-kr');
});

test('pickEncoding defaults to utf-8 when no charset is signaled', () => {
  const head = new TextEncoder().encode('<html><body>plain</body></html>');
  assert.equal(pickEncoding(null, head), 'utf-8');
});

test('decodeWithFallback decodes EUC-KR bytes correctly', () => {
  // "안녕" in EUC-KR is 0xBE C8 0xB3 E7
  const bytes = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7]);
  const decoded = decodeWithFallback(bytes.buffer, 'text/plain; charset=euc-kr');
  assert.equal(decoded, '안녕');
});

test('decodeWithFallback degrades to utf-8 on unknown label', () => {
  const text = 'hello';
  const bytes = new TextEncoder().encode(text);
  const decoded = decodeWithFallback(bytes.buffer, 'text/plain; charset=not-a-real-charset');
  // node text decoder throws for unknown labels — fallback path returns utf-8 text.
  assert.equal(decoded, text);
});
