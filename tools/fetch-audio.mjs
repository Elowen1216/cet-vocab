// tools/fetch-audio.mjs —— 抓真人发音
// 用法：node tools/fetch-audio.mjs data/words.json
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE  = process.argv[2] || 'data/words.json';
const OUT   = 'audio';
const LIMIT = Number(process.env.LIMIT || 0);      // 0 = 全部处理

const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
const list = LIMIT ? data.words.slice(0, LIMIT) : data.words;
await fs.mkdir(OUT, { recursive: true });

let ok = 0, skip = 0, miss = 0, done = 0;

for (const w of list) {
  done++;
  if (w.audioLocal) { skip++; continue; }          // 抓过的跳过，可以放心重跑
  const key = w.word.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) continue;
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.word));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const phs = j.flatMap(e => e.phonetics || []).filter(p => p.audio);
    const pick = phs.find(p => /-us\./.test(p.audio))
              || phs.find(p => /-uk\./.test(p.audio))
              || phs[0];
    if (!pick) throw new Error('无音频');
    const url = pick.audio.startsWith('http') ? pick.audio : 'https:' + pick.audio;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await fs.writeFile(path.join(OUT, key + '.mp3'), buf);
    w.audioLocal = `${OUT}/${key}.mp3`;
    ok++;
  } catch (e) {
    miss++;
    console.warn('✗', w.word, e.message);
  }

  if (done % 100 === 0) {
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
    console.log(`  … ${done}/${list.length}（成功 ${ok} / 跳过 ${skip} / 失败 ${miss}）`);
  }
  await new Promise(r => setTimeout(r, 120));
}

await fs.writeFile(FILE, JSON.stringify(data, null, 2));
console.log(`\n完成：成功 ${ok}，跳过 ${skip}，失败 ${miss}`);