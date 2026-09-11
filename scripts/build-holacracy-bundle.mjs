import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const input = resolve(process.argv[2] || '../constitution-source/Holacracy-Constitution.md');
const output = resolve(process.argv[3] || 'data/holacracy-constitution-5.0.json');
const markdown = await readFile(input, 'utf8');

const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const root = { key: 'holacracy-constitution', name: 'Holacracy Constitution', type: 'Constitution', content: '', children: [] };
const stack = [{ level: 1, node: root }];
let buffer = [];

function addBlocks(node, body) {
  const content = body.trim();
  if (!content) return;
  node.content = content;
  const blocks = content.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  node.children.push(...blocks.map((text, index) => ({
    key: `${node.key}/block-${index + 1}`,
    name: `Content Block ${index + 1}`,
    type: 'Content Block',
    content: text,
    position: index,
    children: [],
  })));
}

function flush() {
  addBlocks(stack.at(-1).node, buffer.join('\n'));
  buffer = [];
}

for (const line of markdown.split(/\r?\n/)) {
  const heading = /^(#{1,4})\s+(.*?)\s*$/.exec(line);
  if (!heading) { buffer.push(line); continue; }
  flush();
  const level = heading[1].length;
  const title = heading[2].replace(/^\*\*(.*?)\*\*$/, '$1');
  if (level === 1) continue;
  while (stack.length && stack.at(-1).level >= level) stack.pop();
  const parent = stack.at(-1)?.node || root;
  const type = level === 2 ? (title === 'Preamble' ? 'Preamble' : 'Article') : level === 3 ? 'Section' : 'Clause';
  const node = {
    key: `${parent.key}/${slug(title)}`,
    name: title,
    type,
    content: '',
    position: parent.children.filter(child => child.type !== 'Content Block').length,
    children: [],
  };
  parent.children.push(node);
  stack.push({ level, node });
}
flush();

const bundle = {
  format: 'eBliss Holon Bundle',
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    title: 'Holacracy Constitution',
    version: '5.0',
    author: 'HolacracyOne LLC',
    url: 'https://github.com/holacracyone/Holacracy-Constitution/blob/cc93b0b28a271fde147e81ecea39f5599b2f1f7e/Holacracy-Constitution.md',
    repository: 'https://github.com/holacracyone/Holacracy-Constitution',
    revision: 'cc93b0b28a271fde147e81ecea39f5599b2f1f7e',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sha256: createHash('sha256').update(markdown).digest('hex'),
  },
  root,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);

let nodes = 0;
const count = node => { nodes += 1; node.children.forEach(count); };
count(root);
console.log(`Wrote ${nodes} Holons to ${output}`);
