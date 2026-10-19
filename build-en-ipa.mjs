// ============================================================================
//  Генератор встроенного словаря английской транскрипции (IPA).
//  Запуск:  node build-en-ipa.mjs
//  Что делает: скачивает британский (en_UK) и американский (en_US) словари
//  произношений из open-dict-data/ipa-dict, берёт топ-10 000 частых английских
//  слов (google-10000-english) и строит компактный JSON {слово: "/ipa/"}:
//    - UK произношение — основной вариант;
//    - если UK-словаря нет слова — фолбэк на US.
//  Результат вшивается в index.html как `window.__EN_IPA__` (полностью офлайн,
//  сети не нужно — симметрично тому, как pinyin-pro даёт китайский пиньинь).
//  ВАЖНО: словарь в index.html вшивается вручную этим же скриптом (ниже), а не
//  отдельным файлом — single-file PWA.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const IPA_UK = 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt';
const IPA_US = 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt';
const FREQ = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';

async function fetchText(u){ const r = await fetch(u); if(!r.ok) throw new Error('failed '+u+' '+r.status); return r.text(); }
function loadDict(txt){
  const m = new Map();
  for(const l of txt.split(/\r?\n/)){
    if(!l) continue;
    const i = l.indexOf('\t'); if(i<0) continue;
    const w = l.slice(0,i).trim().toLowerCase();
    const p = l.slice(i+1).trim();
    if(!m.has(w)) m.set(w, p);
  }
  return m;
}

const [ukTxt, usTxt, freqTxt] = await Promise.all([fetchText(IPA_UK), fetchText(IPA_US), fetchText(FREQ)]);
const uk = loadDict(ukTxt), us = loadDict(usTxt);
const freq = freqTxt.split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean);

// Слова стартового набора (SAMPLES.en) добавляем ОБЯЗАТЕЛЬНО, даже если их нет в частотном
// топ-10000 — чтобы у встроенных примеров транскрипция не была пустой (напр. goodbye).
const EXTRA = 'hello thank you goodbye please yes no friend family water food book i love learning english my name is anna'.split(/\s+/);

let hitUk=0, hitUs=0, miss=0;
const out = {};
const add = (w) => {
  if(out[w]) return;
  if(uk.has(w)){ hitUk++; out[w]=uk.get(w); }
  else if(us.has(w)){ hitUs++; out[w]=us.get(w); }
  else miss++;
};
for(const w of freq) add(w);
for(const w of EXTRA) add(w);

const dictJson = JSON.stringify(out);
console.log(`частых слов: ${freq.length} | UK: ${hitUk} | US-фолбэк: ${hitUs} | нет: ${miss}`);
console.log(`размер словаря: ${(dictJson.length/1024).toFixed(1)} КБ`);

// --- вшиваем в index.html ---
const idxPath = BASE + 'index.html';
const src = readFileSync(idxPath, 'utf8');
const anchor = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
if(!src.includes(anchor)) throw new Error('анкер Supabase не найден в index.html');
// если уже вшивали — заменяем старый блок на свежий
const block = `\n<script>\n// Встроенный словарь английской транскрипции (UK IPA, ~7.7 тыс. частых слов + US-фолбэк).\n// Источник: open-dict-data/ipa-dict (en_UK.txt + en_US.txt) × google-10000-english.\n// Генерируется скриптом build-en-ipa.mjs; полностью офлайн (никакой сети не нужно).\nwindow.__EN_IPA__=${dictJson};\n</script>`;
let outSrc;
const existing = /<script>\n\/\/ Встроенный словарь английской транскрипции[\s\S]*?window\.__EN_IPA__=.*?;\n<\/script>/;
if(existing.test(src)){
  outSrc = src.replace(existing, block.trim());
}else{
  outSrc = src.replace(anchor, anchor + block);
}
writeFileSync(idxPath, outSrc);
console.log(`index.html обновлён: ${outSrc.length} байт (было ${src.length})`);
