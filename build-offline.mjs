import { readFileSync, writeFileSync } from 'node:fs';

const base = process.argv[2];
const src = readFileSync(base + '/index.html', 'utf8');

const HANZI_WRITER = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.6/dist/hanzi-writer.min.js';
const PINYIN_PRO = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js';

async function fetchText(u){ const r = await fetch(u); if(!r.ok) throw new Error('failed '+u+' '+r.status); return r.text(); }

const hw = await fetchText(HANZI_WRITER);
const pp = await fetchText(PINYIN_PRO);

// Частые иероглифы для офлайн-письма (данные начертания вшиваются внутрь)
const CHARS = Array.from(new Set(
  '你 我 好 爱 学 中 国 汉 语 语 谢 再 见 习 一 二 三 四 五 六 七 八 九 十 人 大 小 上 下 日 月 水 火 山 天 是 的 不 了 在 有 他 她 们 这 那 什 么 吗 呢 吃 喝 茶 饭 家 爸 妈 老 师'.split(/\s+/).filter(Boolean)
));
const charData = {};
for (const ch of CHARS) {
  const u = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.0/' + encodeURIComponent(ch) + '.json';
  try { const j = await (await fetch(u)).json(); if(j && j.strokes) charData[ch] = j; } catch(e){}
}
console.log('иероглифов с данными: ' + Object.keys(charData).length + ' из ' + CHARS.length);

const builtin = JSON.stringify(charData);
const injected =
  '<script>\n' + hw + '\n</script>\n' +
  '<script>\n' + pp + '\n</script>\n' +
  '<script>window.__BUILTIN_CHAR_DATA__=' + builtin + ';</script>\n';

let out = src;
// Заменяем два внешних <script src=...> (с любыми атрибутами) одним блоком с вшитыми библиотеками
out = out.replace(
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer@3\.6\/dist\/hanzi-writer\.min\.js"[^>]*><\/script>\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/pinyin-pro@3\.29\.4\/dist\/index\.min\.js"[^>]*><\/script>/,
  injected
);
// Убираем фолбэки загрузки внешних библиотек
out = out.replace(/\/\/ ============================== LIB FALLBACK ==============================[\s\S]*?\n}\n\);\n/, '');
out = out.replace(/\/\/ ============================== LIB FALLBACK ==============================[\s\S]*?document\.head\.appendChild\(s\);\n}\n/, '');

// Имя файла: «hanzi-trainer-offline <полная версия>.html» (например, hanzi-trainer-offline 1.1.0)
const vm = src.match(/const APP_VERSION='([^']+)'/);
const verCode = vm ? vm[1] : 'offline';
const outName = 'hanzi-trainer-offline ' + verCode + '.html';
writeFileSync(base + '/' + outName, out);
console.log('размер итога: ' + out.length + ' байт, файл: ' + outName);