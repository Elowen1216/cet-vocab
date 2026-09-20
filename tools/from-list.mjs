// tools/from-list.mjs
// 用法：node tools/from-list.mjs data/my-words.txt
// 作用：一行一个词的纯单词表 → data/words.json（自动补音标 + 中文释义）
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC   = process.argv[2];
const OUT   = process.argv[3] || 'data/words.json';
const LIMIT = Number(process.env.LIMIT || 0);        // 0 = 全部处理
if (!SRC) { console.error('用法：node tools/from-list.mjs 词表.txt'); process.exit(1); }

/* ---------- 1. 读纯单词表 ---------- */
const text = await fs.readFile(SRC, 'utf8');
const words = [];
const seen = new Set();
for (const raw of text.split(/\r?\n/)) {
  const w = raw.trim();
  if (!w) continue;
  if (/[\u4e00-\u9fa5]/.test(w)) continue;              // 跳过中文行
  if (!/^[A-Za-z][A-Za-z\-'’. ]*$/.test(w)) continue;   // 只留像单词的行
  const key = w.toLowerCase();
  if (seen.has(key)) continue;                          // 去重，保留第一次出现的位置
  seen.add(key);
  words.push({ key, word: w });
}
console.log(`词表读到 ${words.length} 个不重复的词`);

const picked = LIMIT ? words.slice(0, LIMIT) : words;
if (LIMIT) console.log(`测试模式：本次只处理前 ${picked.length} 个`);

/* ---------- 2. 拉开源 CET 词库当「中文释义字典」 ---------- */
const BRANCHES = ['master', 'main'];
const FILES = ['CET4_1.json', 'CET4_2.json', 'CET4_3.json', 'CET4luan_1.json', 'CET4luan_2.json'];
const dict = new Map();
for (const branch of BRANCHES) {
  const base = `https://raw.githubusercontent.com/Kaiyiwing/qwerty-learner/${branch}/public/dicts/`;
  let ok = false;
  for (const f of FILES) {
    try {
      const r = await fetch(base + f);
      if (!r.ok) continue;
      const arr = await r.json();
      ok = true;
      for (const it of arr) {
        const name = String(it.name || '').trim().toLowerCase();
        if (!name) continue;
        const cur = dict.get(name) || { trans: [], us: '', uk: '' };
        for (const t of it.trans || []) if (!cur.trans.includes(t)) cur.trans.push(t);
        cur.us ||= it.usphone || '';
        cur.uk ||= it.ukphone || '';
        dict.set(name, cur);
      }
      console.log(`  ✓ ${f}（字典累计 ${dict.size} 词）`);
    } catch { /* 网络抖一下就跳过这个文件 */ }
  }
  if (ok) break;
}
if (!dict.size) console.warn('⚠️ 词典没拉到（网络问题），本次只导出单词，释义留空');

/* ---------- 3. 保留旧文件里已有的内容 ---------- */
const old = new Map();
try {
  const j = JSON.parse(await fs.readFile(OUT, 'utf8'));
  for (const w of j.words || []) old.set(w.word.toLowerCase(), w);
  console.log(`读到已有 ${old.size} 词，会保留它们的例句/音频字段`);
} catch {}

/* ---------- 4. 组装 ---------- */
const out = picked.map(({ key, word }) => {
  const d = dict.get(key) || { trans: [], us: '', uk: '' };
  const o = old.get(key) || {};
  return {
    id: `cet4-${key.replace(/[^a-z0-9]+/g, '-')}`,   // ⭐ id 绑定单词本身，加词删词进度都不错位
    word,
    phonetic: {
      us: o.phonetic?.us || (d.us ? `/${d.us}/` : ''),
      uk: o.phonetic?.uk || (d.uk ? `/${d.uk}/` : '')
    },
    audioLocal: o.audioLocal || '',
    pos: o.pos || '',
    trans: (o.trans?.length ? o.trans : d.trans),
    defEn: o.defEn || '',
    example: o.example || null,
    level: 4,
    tags: ['core']
  };
});

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify({
  meta: { name: 'CET-4 核心词（课程顺序）', version: '1.0', count: out.length, builtAt: new Date().toISOString() },
  words: out
}, null, 2));

const noTrans = out.filter(w => !w.trans.length).map(w => w.word);
console.log(`\n✅ 写出 ${out.length} 词 → ${OUT}`);
if (noTrans.length) {
  console.log(`\n⚠️ ${noTrans.length} 个词没查到中文释义（不影响用，只是提示为空）：`);
  console.log(noTrans.join(' '));
}

