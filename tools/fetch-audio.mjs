// tools/fetch-audio.mjs —— 抓真人发音
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE    = process.argv[2] || 'data/words.json';
const OUT     = 'audio';
const LIMIT   = Number(process.env.LIMIT || 0);   // 0 = 全部
const CONC    = 4;       // 同时抓 4 个
const TIMEOUT = 20000;   // 单个请求最多等 20 秒

const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
const list = LIMIT ? data.words.slice(0, LIMIT) : data.words;
await fs.mkdir(OUT, { recursive: true });

let ok = 0, skip = 0, miss = 0;

async function get(url, kind) {          // kind: 'json' | 'bin'
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'bin' ? Buffer.from(await r.arrayBuffer()) : await r.json();
  } finally { clearTimeout(t); }
}

async function one(w) {
  if (w.audioLocal) { skip++; return; }
  const key = w.word.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return;
  try {
    const j = await get('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.word), 'json');
    const phs = j.flatMap(e => e.phonetics || []).filter(p => p.audio);
    const pick = phs.find(p => /-us\./.test(p.audio))
              || phs.find(p => /-uk\./.test(p.audio))
              || phs[0];
    if (!pick) throw new Error('无音频');
    const url = pick.audio.startsWith('http') ? pick.audio : 'https:' + pick.audio;
    const buf = await get(url, 'bin');
    await fs.writeFile(path.join(OUT, key + '.mp3'), buf);
    w.audioLocal = `${OUT}/${key}.mp3`;
    ok++;
  } catch (e) {
    miss++;
    console.warn('✗', w.word, e.message);
  }
}

for (let i = 0; i < list.length; i += CONC) {
  await Promise.all(list.slice(i, i + CONC).map(one));
  const done = Math.min(i + CONC, list.length);
  if (done % 100 < CONC) {
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
    console.log(`  … ${done}/${list.length}（成功 ${ok} / 跳过 ${skip} / 失败 ${miss}）`);
  }
}

await fs.writeFile(FILE, JSON.stringify(data, null, 2));
console.log(`\n完成：成功 ${ok}，跳过 ${skip}，失败 ${miss}`);