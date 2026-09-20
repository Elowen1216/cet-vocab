// tools/enrich.mjs
// 用法：node tools/enrich.mjs data/words.json
// 作用：用 dictionaryapi.dev 补上英文释义 / 例句 / 词性 / 音标
import fs from 'node:fs/promises';

const FILE  = process.argv[2] || 'data/words.json';
const LIMIT = Number(process.env.LIMIT || 0);        // 0 = 全部处理

const POS = {
  noun:'n.', verb:'v.', adjective:'adj.', adverb:'adv.', pronoun:'pron.',
  preposition:'prep.', conjunction:'conj.', interjection:'int.',
  article:'art.', determiner:'det.', numeral:'num.'
};

const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
const list = LIMIT ? data.words.slice(0, LIMIT) : data.words;

let ok = 0, skip = 0, miss = 0, done = 0;

for (const w of list) {
  done++;
  // 已经补过就跳过 —— 断了可以放心重跑
  if (w.example?.en && w.defEn) { skip++; continue; }

  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.word));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j  = await r.json();
    const e0 = Array.isArray(j) ? j[0] : null;
    if (!e0) throw new Error('无数据');

    if (e0.phonetic && !(w.phonetic?.us || w.phonetic?.uk)) {
      w.phonetic = w.phonetic || {};
      w.phonetic.us = e0.phonetic;
    }

    let defEn = '', example = '';
    for (const m of e0.meanings || []) {
      const ds = m.definitions || [];
      if (!ds.length) continue;
      if (!defEn) {
        defEn = ds[0].definition || '';
        if (!w.pos && POS[m.partOfSpeech]) w.pos = POS[m.partOfSpeech];
      }
      if (!example) {
        const hit = ds.find(d => d.example);
        if (hit) example = hit.example;
      }
      if (defEn && example) break;
    }
    if (defEn)   w.defEn   = defEn;
    if (example) w.example = { en: example, zh: w.example?.zh || '' };
    if (!defEn && !example) throw new Error('没有可用内容');
    ok++;
  } catch (e) {
    miss++;
    console.warn('✗', w.word, e.message);
  }

  if (done % 100 === 0) {
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));   // 每 100 词存一次盘
    console.log(`  … ${done}/${list.length}（成功 ${ok} / 跳过 ${skip} / 失败 ${miss}）`);
  }
  await new Promise(r => setTimeout(r, 120));                  // 别把人家 API 打爆
}

await fs.writeFile(FILE, JSON.stringify(data, null, 2));
console.log(`\n✅ 完成：补全 ${ok}，跳过 ${skip}，无数据 ${miss}`);