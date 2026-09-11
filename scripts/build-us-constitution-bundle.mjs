import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] || 'data/us-constitution.json');
const urls = {
  constitution: 'https://www.archives.gov/founding-docs/constitution-transcript',
  billOfRights: 'https://www.archives.gov/founding-docs/bill-of-rights-transcript',
  amendments: 'https://www.archives.gov/founding-docs/amendments-11-27',
};
const decode = value => value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#039;|&apos;/gi, "'").replace(/&ldquo;|&rdquo;/gi, '“').replace(/&lsquo;|&rsquo;/gi, '’')
  .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const makeNode = (key, name, type, position) => ({ key, name, type, content: '', position, children: [] });
const addParagraph = (parent, text) => {
  if (!text) return;
  parent.content = parent.content ? `${parent.content}\n\n${text}` : text;
  const block = makeNode(`${parent.key}/block-${parent.children.length + 1}`, `Content Block ${parent.children.length + 1}`, 'Content Block', parent.children.length);
  block.content = text; parent.children.push(block);
};
const tokens = html => [...html.matchAll(/<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(match => ({ tag: match[1].toLowerCase(), text: decode(match[2]) }));
const pages = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([key, url]) => {
  const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return [key, await response.text()];
})));

const root = makeNode('us-constitution', 'United States Constitution', 'Constitution', 0);
let article = makeNode('us-constitution/preamble', 'Preamble', 'Preamble', 0);
let section = null; root.children.push(article);
const preambleMatch = pages.constitution.match(/<span class="larger">([\s\S]*?)<\/span>/i);
if (preambleMatch) addParagraph(article, decode(preambleMatch[1]));
const original = tokens(pages.constitution.slice(pages.constitution.indexOf('<h2 id="1">'), pages.constitution.indexOf('Back to Main Constitution Page')));
for (const token of original) {
  if (/^Article\.\s+[IVX]+\.?$/i.test(token.text)) {
    article = makeNode(`us-constitution/${slug(token.text)}`, token.text.replace(/\.$/, ''), 'Article', root.children.length);
    root.children.push(article); section = null;
  } else if (/^Section\.\s+\d+\.?$/i.test(token.text)) {
    section = makeNode(`${article.key}/${slug(token.text)}`, token.text.replace('Section.', 'Section').replace(/\.$/, ''), 'Section', article.children.filter(child => child.type === 'Section').length);
    article.children.push(section);
  } else if (token.tag === 'p' && token.text) addParagraph(section || article, token.text);
}

function addAmendments(html, startMarker, endMarker) {
  let amendment = null; let amendmentSection = null;
  const markerIndex = html.indexOf(startMarker);
  const start = html.lastIndexOf('<h', markerIndex);
  const end = html.indexOf(endMarker, markerIndex);
  for (const token of tokens(html.slice(start, end))) {
    if (/^AMENDMENT\s+[IVX]+$/i.test(token.text)) {
      const name = `Amendment ${token.text.split(/\s+/).at(-1).toUpperCase()}`;
      amendment = makeNode(`us-constitution/${slug(name)}`, name, 'Article', root.children.length);
      root.children.push(amendment); amendmentSection = null;
    } else if (amendment && /^Section\s+\d+\.?$/i.test(token.text)) {
      amendmentSection = makeNode(`${amendment.key}/${slug(token.text)}`, token.text.replace(/\.$/, ''), 'Section', amendment.children.filter(child => child.type === 'Section').length);
      amendment.children.push(amendmentSection);
    } else if (amendment && token.tag === 'p' && token.text && !token.text.includes('Back to Main')) addParagraph(amendmentSection || amendment, token.text);
  }
}
addAmendments(pages.billOfRights, 'Amendment I</h3>', 'Amendments 11-27</a>');
addAmendments(pages.amendments, 'AMENDMENT XI</h3>', 'Back to Constitution Main Page');

const sourceText = Object.values(pages).join('\n');
const bundle = { format: 'eBliss Holon Bundle', formatVersion: 1, generatedAt: new Date().toISOString(), source: {
  title: 'The Constitution of the United States: A Transcription', author: 'National Archives', url: urls.constitution,
  additionalUrls: [urls.billOfRights, urls.amendments], revision: new Date().toISOString().slice(0, 10),
  license: 'Public domain (U.S. government work)', sha256: createHash('sha256').update(sourceText).digest('hex'),
}, root };
await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
let count = 0; const visit = item => { count += 1; item.children.forEach(visit); }; visit(root);
console.log(`Wrote ${count} Holons to ${output}`);
