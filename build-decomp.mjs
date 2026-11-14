// ============================================================================
//  Генератор встроенного словаря разложений иероглифов (makemeahanzi).
//  Запуск:  node build-decomp.mjs
//  Что делает: читает hanzi_decomp.json (вычищенная карта «иероглиф → разложение
//  в нотации IDS», полученная из makemeahanzi/dictionary.txt) и вшивает её в
//  index.html как `window.HANZI_DECOMP` — полностью офлайн. Используется режимом
//  «Собрать из частей» в «Письме» (китайский): раскладывает иероглиф на
//  компоненты по образцу Дуолинго.
//  ВАЖНО: разложение в index.html вшивается вручную этим же скриптом, а не
//  отдельным файлом — single-file PWA.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = dirname(fileURLToPath(import.meta.url)) + '/';

const dict = JSON.parse(readFileSync(join(BASE, 'hanzi_decomp.json'), 'utf8'));
const dictJson = JSON.stringify(dict);
console.log(`иероглифов в разложении: ${Object.keys(dict).length}`);
console.log(`размер разложения: ${(dictJson.length/1024).toFixed(1)} КБ`);

// --- вшиваем в index.html ---
const idxPath = join(BASE, 'index.html');
const src = readFileSync(idxPath, 'utf8');
const anchor = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
if(!src.includes(anchor)) throw new Error('анкер Supabase не найден в index.html');
// если уже вшивали — заменяем старый блок на свежий
const block = `\n<script>\n// Встроенный словарь разложений иероглифов (makemeahanzi, нотация IDS).\n// Генерируется скриптом build-decomp.mjs; полностью офлайн (никакой сети не нужно).\nwindow.HANZI_DECOMP=${dictJson};\n</script>`;
let outSrc;
const existing = /<script>\n\/\/ Встроенный словарь разложений иероглифов[\s\S]*?window\.HANZI_DECOMP=.*?;\n<\/script>/;
if(existing.test(src)){
  outSrc = src.replace(existing, block.trim());
}else{
  outSrc = src.replace(anchor, anchor + block);
}
writeFileSync(idxPath, outSrc);
console.log(`index.html обновлён: ${outSrc.length} байт (было ${src.length})`);
