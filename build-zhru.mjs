// ============================================================================
//  Генератор встроенного словаря китайско-русского перевода (топ-5000 частотных).
//  Запуск:  node build-zhru.mjs
//  Что делает: читает zh_ru_manual_top5000.json (вручную составленный словарь
//  5000 самых частых китайских слов по SUBTLEX-CH) и вшивает его в index.html
//  как `window.ZH_RU_MANUAL_TOP5000` — полностью офлайн, симметрично тому, как
//  __EN_IPA__ даёт английскую транскрипцию, а pinyin-pro — китайский пиньинь.
//  ВАЖНО: словарь в index.html вшивается вручную этим же скриптом (ниже), а не
//  отдельным файлом — single-file PWA.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = dirname(fileURLToPath(import.meta.url)) + '/';

const dict = JSON.parse(readFileSync(join(BASE, 'zh_ru_manual_top5000.json'), 'utf8'));
const dictJson = JSON.stringify(dict);
console.log(`слов в словаре: ${Object.keys(dict).length}`);
console.log(`размер словаря: ${(dictJson.length/1024).toFixed(1)} КБ`);

// --- вшиваем в index.html ---
const idxPath = join(BASE, 'index.html');
const src = readFileSync(idxPath, 'utf8');
const anchor = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
if(!src.includes(anchor)) throw new Error('анкер Supabase не найден в index.html');
// если уже вшивали — заменяем старый блок на свежий
const block = `\n<script>\n// Встроенный китайско-русский словарь (топ-5000 частотных слов по SUBTLEX-CH, составлен вручную).\n// Генерируется скриптом build-zhru.mjs; полностью офлайн (никакой сети не нужно).\nwindow.ZH_RU_MANUAL_TOP5000=${dictJson};\n</script>`;
let outSrc;
const existing = /<script>\n\/\/ Встроенный китайско-русский словарь[\s\S]*?window\.ZH_RU_MANUAL_TOP5000=.*?;\n<\/script>/;
if(existing.test(src)){
  outSrc = src.replace(existing, block.trim());
}else{
  outSrc = src.replace(anchor, anchor + block);
}
writeFileSync(idxPath, outSrc);
console.log(`index.html обновлён: ${outSrc.length} байт (было ${src.length})`);
