// ============================================================================
//  Генератор встроенного словаря английской транскрипции (IPA).
//  Запуск:  node build-en-ipa.mjs
//  Что делает: скачивает британский словарь произношений (en_UK) и строит
//  компактный JSON {слово: "/ipa/"} со ВСЕМИ словоформами (не только топ частотных):
//    - покрыты формы множественного числа и производные (subsidies, receiving …),
//      поэтому «на каждое слово фразы — своя транскрипция» работает честно.
//  Результат вшивается в index.html как `window.__EN_IPA__` (полностью офлайн,
//  сети не нужно — симметрично тому, как pinyin-pro даёт китайский пиньинь).
//  ВАЖНО: словарь в index.html вшивается вручную этим же скриптом (ниже), а не
//  отдельным файлом — single-file PWA.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = dirname(fileURLToPath(import.meta.url)) + '/';
const IPA_UK = 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt';

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

const ukTxt = await fetchText(IPA_UK);
const uk = loadDict(ukTxt);

// Весь словарь en_UK целиком (все словоформы), без фильтра по частотности.
const out = {};
for(const [w, p] of uk) out[w] = p;

const dictJson = JSON.stringify(out);
console.log(`слов в словаре: ${Object.keys(out).length}`);
console.log(`размер словаря: ${(dictJson.length/1024).toFixed(1)} КБ`);

// --- вшиваем в index.html ---
const idxPath = join(BASE, 'index.html');
const src = readFileSync(idxPath, 'utf8');
const anchor = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
if(!src.includes(anchor)) throw new Error('анкер Supabase не найден в index.html');
// если уже вшивали — заменяем старый блок на свежий
const block = `\n<script>\n// Встроенный словарь английской транскрипции (UK IPA, ~65 тыс. слов — все словоформы).\n// Источник: open-dict-data/ipa-dict (en_UK.txt).\n// Генерируется скриптом build-en-ipa.mjs; полностью офлайн (никакой сети не нужно).\nwindow.__EN_IPA__=${dictJson};\n</script>`;
let outSrc;
const existing = /<script>\n\/\/ Встроенный словарь английской транскрипции[\s\S]*?window\.__EN_IPA__=.*?;\n<\/script>/;
if(existing.test(src)){
  outSrc = src.replace(existing, block.trim());
}else{
  outSrc = src.replace(anchor, anchor + block);
}
writeFileSync(idxPath, outSrc);
console.log(`index.html обновлён: ${outSrc.length} байт (было ${src.length})`);
