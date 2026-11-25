#!/usr/bin/env node
// ============================================================================
// Language Trainer — smoke-тесты (запуск: node smoke-test.mjs)
// ----------------------------------------------------------------------------
// Без npm-зависимостей: поднимает локальный статический сервер, запускает
// установленный Chrome/Edge в headless-режиме и управляет им по DevTools-
// протоколу (встроенный WebSocket в Node 22+).
//
// Изоляция: у браузера свой временный профиль (--user-data-dir во временной
// папке), поэтому IndexedDB/localStorage/кэш обычного браузера не трогаются.
// Тестовые карточки подкладываются только в этот временный профиль.
//
// Тесты правятся в index.html по маркерам «// smoke: ИМЯ» (см. smoke/README.md).
// Сервер отдаёт index.html с подменёнными внешними библиотеками: hanzi-writer и
// pinyin-pro берутся из кэша service worker (или из сети), Supabase заменён
// заглушкой — тесты не ходят в живую базу.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');
const TIMEOUT_MS = 180000;

// ---------------------------------------------------------------- helpers
const results = [];
let currentScenario = '';

function ok(name, detail) {
  results.push({ ok: true, scenario: currentScenario, name, detail });
  console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail) {
  results.push({ ok: false, scenario: currentScenario, name, detail });
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
}
function check(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
  return !!cond;
}
function scenario(title) {
  currentScenario = title;
  console.log(`\n▶ ${title}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- static server
function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------- browser
function findBrowser() {
  const cands = [
    process.env.SMOKE_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

async function fetchJson(url, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) { /* ещё не поднялся */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools не ответил: ' + url);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) {
          try { fn(msg.params, msg.sessionId); } catch (e) { /* слушатель не должен ронять прогон */ }
        }
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function launchBrowser(browserPath, profileDir) {
  const proc = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
    '--user-data-dir=' + profileDir,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(portFile)) {
      const txt = fs.readFileSync(portFile, 'utf8').split('\n');
      if (txt[0]) { port = Number(txt[0]); break; }
    }
    await sleep(100);
  }
  if (!port) { proc.kill(); throw new Error('Не удалось узнать порт DevTools'); }
  const ver = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  return { proc, port, browser: new CDP(ws) };
}

async function openPage(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => browser.send(method, params, sessionId);
  const on = (method, fn) => browser.on(method, (p, sid) => { if (sid === sessionId) fn(p); });

  const page = {
    sessionId, send, on,
    logs: [],
    errors: [],
    requests: [],
    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'ошибка в странице');
      }
      return r.result ? r.result.value : undefined;
    },
    async waitFor(expression, timeout = 15000, interval = 100) {
      const t0 = Date.now();
      let lastErr = null;
      while (Date.now() - t0 < timeout) {
        try { if (await page.eval(expression)) return true; } catch (e) { lastErr = e; }
        await sleep(interval);
      }
      throw new Error('Не дождались: ' + expression + (lastErr ? ' (' + lastErr.message + ')' : ''));
    },
    async goto(u) {
      const loaded = new Promise((res) => page.on('Page.loadEventFired', res));
      await send('Page.navigate', { url: u });
      await Promise.race([loaded, sleep(30000)]);
    },
    close() { return browser.send('Target.closeTarget', { targetId }); },
  };

  on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
    page.logs.push({ type: p.type, text });
  });
  on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    page.errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text || 'исключение');
  });
  on('Network.requestWillBeSent', (p) => {
    page.requests.push({ id: p.requestId, url: p.request.url, type: p.type, status: null, failed: false });
  });
  on('Network.responseReceived', (p) => {
    const r = page.requests.find((x) => x.id === p.requestId);
    if (r) r.status = p.response.status;
  });
  on('Network.loadingFailed', (p) => {
    const r = page.requests.find((x) => x.id === p.requestId);
    if (r) { r.failed = true; r.error = p.errorText; }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  return page;
}

// ---------------------------------------------------------------- main
async function main() {
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('Не найден Chrome/Edge. Укажите путь переменной SMOKE_CHROME.');
    process.exit(2);
  }
  console.log('Браузер: ' + browserPath);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-smoke-'));
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/`;
  let browser = null;
  let page = null;
  let exitCode = 0;

  try {
    browser = await launchBrowser(browserPath, profileDir);
    page = await openPage(browser.browser, base);

    // ================= 1. Загрузка и версия =================
    scenario('1. Загрузка и версия');
    await page.goto(base + 'index.html?smoke=1');
    try {
      await page.waitFor('!!(window.__SMOKE__ && window.__BOOT_DONE__)', 30000);
      ok('приложение загрузилось, открыт «Словарь»');
    } catch (e) {
      fail('приложение загрузилось', e.message);
      throw e;
    }
    const ver = await page.eval('({app: __SMOKE__.appVersion, first: __SMOKE__.versions[0]})');
    const swSrc = fs.readFileSync(SW, 'utf8');
    const swVer = (swSrc.match(/const VERSION\s*=\s*'([^']+)'/) || [])[1];
    check(ver.app === swVer, 'APP_VERSION = VERSION в sw.js', `${ver.app} / ${swVer}`);
    check(ver.first === ver.app, 'первая запись VERSIONS = APP_VERSION', `${ver.first} / ${ver.app}`);
    check(ver.app === '1.13.4', 'версия релиза 1.13.4', ver.app);
    check(await page.eval('!!window.pinyinPro'), 'pinyin-pro загружен');
    check(await page.eval('!!window.HanziWriter'), 'hanzi-writer загружен');
    // Манифест и иконки установки: JSON валиден, PNG реально отдаются
    const man = await page.eval(`(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return { error: 'нет <link rel=manifest>' };
      const j = await (await fetch(link.href)).json();
      const res = [];
      for (const ic of (j.icons || [])) {
        const r = await fetch(ic.src);
        res.push({ sizes: ic.sizes, purpose: ic.purpose || 'any', ok: r.ok, type: r.headers.get('content-type') });
      }
      return { name: j.name, icons: res };
    })()`);
    check(!man.error && man.icons.length >= 2, 'манифест валиден и содержит иконки', man.error || man.icons.map((i) => i.sizes).join(', '));
    if (!man.error) {
      for (const ic of man.icons) {
        check(ic.ok && /image\/png/.test(ic.type || ''), `иконка ${ic.sizes} (${ic.purpose}) загружается как PNG`, ic.type || 'нет ответа');
      }
    }

    // ================= 2. Консоль и сеть =================
    scenario('2. Консоль и сеть при загрузке');
    // Один раз открываем «Ещё» и «Экзамен» на пустом словаре — тоже часть загрузки
    await page.eval('__SMOKE__.go("scr-more")'); await sleep(400);
    await page.eval('__SMOKE__.go("scr-exam")'); await sleep(400);
    await page.eval('__SMOKE__.go("scr-dict")'); await sleep(300);
    const consoleErrors = page.logs.filter((l) => l.type === 'error');
    check(page.errors.length === 0, 'нет необработанных исключений', page.errors.slice(0, 3).join(' | '));
    check(consoleErrors.length === 0, 'нет console.error', consoleErrors.slice(0, 3).map((l) => l.text).join(' | '));
    const failed = page.requests.filter((r) => r.failed && !/favicon/.test(r.url));
    check(failed.length === 0, 'нет упавших запросов', failed.slice(0, 3).map((r) => r.url + ' ' + (r.error || '')).join(' | '));

    // ================= 3. Экраны =================
    scenario('3. Экраны');
    const screens = ['scr-dict', 'scr-study', 'scr-write', 'scr-exam', 'scr-read', 'scr-more'];
    for (const s of screens) {
      const before = page.errors.length;
      await page.eval(`__SMOKE__.go(${JSON.stringify(s)})`);
      await sleep(300);
      const active = await page.eval(`document.getElementById(${JSON.stringify(s)}).classList.contains('active')`);
      check(active && page.errors.length === before, `экран ${s} открывается без ошибок`);
    }

    // ================= 4. Кнопки скруглены =================
    scenario('4. Кнопки скруглены');
    let totalButtons = 0;
    for (const s of screens) {
      await page.eval(`__SMOKE__.go(${JSON.stringify(s)})`);
      await sleep(350);
      const res = await page.eval(`(() => {
        const out = [];
        for (const b of document.querySelectorAll("button")) {
          const r = b.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const cs = getComputedStyle(b);
          if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
          const rad = parseFloat(cs.borderTopLeftRadius) || 0;
          const minSide = Math.min(r.width, r.height);
          if (rad < 4 && minSide >= 8) out.push((b.id || b.className || b.textContent.trim().slice(0, 24)) + " r=" + rad);
        }
        return { count: document.querySelectorAll("button").length, bad: out };
      })()`);
      totalButtons += res.count;
      check(res.bad.length === 0, `экран ${s}: нет прямоугольных кнопок`, res.bad.slice(0, 5).join(' | '));
    }

    // ================= 4б. Чтение =================
    scenario('4б. Чтение текста');
    await page.eval(`__SMOKE__.go("scr-read")`); await sleep(300);
    // после переработки 1.13.3 шестерёнки наверху больше нет — открываем настройки напрямую
    const readBuilt = await page.eval(`(() => { try { renderRead(); bindReadScreen(); return true; } catch (e) { return String(e && e.message || e); } })()`);
    check(readBuilt === true, 'Чтение: экран собирается без падения (renderRead)', String(readBuilt));
    const readRes = await page.eval(`(() => {
      const ta = document.getElementById('readInput');
      ta.value = '今天天气很好。我们去公园吧！';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      renderRead();
      renderRead();           // второй проход — как при повторном открытии экрана
      readSetPlaying(true);   // имитируем начатое чтение (кнопка «Пауза»)
      readHighlightAt(0);     // первая фраза подсвечена
      const small = [...document.querySelectorAll('#readHighlight .read-w')].map(e => e.textContent);
      const smallHasCur = !!document.querySelector('#readHighlight .read-w.cur');
      document.querySelector('#readModeBar button[data-read-mode="large"]').click();
      const largeView = document.getElementById('readLargeView');
      const large = largeView.textContent.trim();
      const largeSent = [...largeView.querySelectorAll('.read-w.sent')].map(e => e.textContent.trim());
      const largeHasCur = !!largeView.querySelector('.read-w.cur');
      const gearAtBottom = !!document.querySelector('#scr-read #readSettingsBtn');
      const statusAtBottom = !!document.querySelector('#scr-read #readStatus');
      document.querySelector('#readModeBar button[data-read-mode="small"]').click();
      const hasInfoBtn = !!document.getElementById('readInfoBtn');
      ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
      return { small, smallHasCur, large, largeSent, largeHasCur, gearAtBottom, statusAtBottom, hasInfoBtn };
    })()`);
    await sleep(700);
    check(readRes.small.length === 4, 'Чтение: китайский в режиме «Мелкий» делится на фразы до 4 иероглифов — ' + readRes.small.join('|'));
    check(readRes.smallHasCur, 'Чтение: в «Мелком» читаемая фраза подсвечена');
    check(readRes.largeSent.length >= 2, 'Чтение: «Крупный» показывает весь текст по предложениям — ' + readRes.largeSent.join('|'));
    check(readRes.large.includes('今天天气很好') && readRes.large.includes('我们去公园吧'), 'Чтение: «Крупный» содержит оба предложения — ' + readRes.large);
    check(readRes.largeHasCur, 'Чтение: в «Крупном» текущее предложение подсвечено');
    check(readRes.gearAtBottom && readRes.statusAtBottom, 'Чтение: шестерёнка и статус в нижней строке');
    check(!readRes.hasInfoBtn, 'Чтение: кнопка «i» убрана');

    const readSettingsRes = await page.eval(`(() => {
      settings.readMode='sentence'; settings.readFontSize=1; renderRead(); openReadSettings();
      const r=document.getElementById('readFontSizeRange');
      const before={min:r&&r.min, max:r&&r.max, step:r&&r.step, value:r&&r.value, slider:r&&r.parentElement.className, label:document.getElementById('readFontSizeValue')&&document.getElementById('readFontSizeValue').textContent};
      if(r){ r.value='150'; r.dispatchEvent(new Event('input',{bubbles:true})); }
      const after={value:settings.readFontSize, css:document.getElementById('readLargeView').style.getPropertyValue('--read-font-size'), label:document.getElementById('readFontSizeValue')&&document.getElementById('readFontSizeValue').textContent};
      closeModal('modalReadSettings'); return {before,after};
    })()`);
    check(readSettingsRes.before.min==='50' && readSettingsRes.before.max==='250' && readSettingsRes.before.step==='10', 'Чтение: размер иероглифов использует шкалу «Изучения» 50–250% / шаг 10', JSON.stringify(readSettingsRes.before));
    check(readSettingsRes.before.slider==='sn-slider' && readSettingsRes.after.label==='150%' && readSettingsRes.after.value===1.5, 'Чтение: размер сохраняется как множитель и отображается в процентах', JSON.stringify(readSettingsRes.after));

    // ================= 4в. Статистика: склейка календарей и серия =================
    const stRes = await page.eval(`(() => {
      const cal = __SMOKE__.mergeCalendars({ '2026-11-20': 3, '2026-11-21': 1 }, { '2026-11-21': 2, '2026-11-22': 5 });
      const streak = __SMOKE__.statsStreak({ '2026-11-20': 1, '2026-11-21': 2, '2026-11-22': 1 }, '2026-11-22');
      const gap = __SMOKE__.statsStreak({ '2026-11-19': 1, '2026-11-21': 1, '2026-11-22': 1 }, '2026-11-22');
      return { cal, streak, gap };
    })()`);
    check(stRes.cal['2026-11-20'] === 3 && stRes.cal['2026-11-21'] === 2 && stRes.cal['2026-11-22'] === 5,
      'Синк: календарь по дням склеивается максимумом — ' + JSON.stringify(stRes.cal));
    check(stRes.streak === 3, 'Синк: серия считается по календарю — ' + stRes.streak);
    check(stRes.gap === 2, 'Синк: серия обрывается на пропущенном дне — ' + stRes.gap);

    // ================= 5. Письмо =================
    scenario('5. Письмо и экзамен с карточками (zh/en/tr/ar)');
    const seedOK = await seed();
    // после подсева карточки есть — экзамен строит задания; проверяем скругление и на них
    await page.eval(`__SMOKE__.go("scr-exam")`); await sleep(500);
    const examRes = await page.eval(`(() => {
      const out = [];
      for (const b of document.querySelectorAll("#scr-exam button")) {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(b);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        const rad = parseFloat(cs.borderTopLeftRadius) || 0;
        if (rad < 4 && Math.min(r.width, r.height) >= 8) out.push((b.id || b.className || b.textContent.trim().slice(0, 24)) + " r=" + rad);
      }
      return { count: document.querySelectorAll("#scr-exam button").length, bad: out };
    })()`);
    totalButtons += examRes.count;
    if (seedOK) check(examRes.bad.length === 0, 'экран scr-exam с заданиями: нет прямоугольных кнопок', examRes.bad.slice(0, 5).join(' | '));
    // клавиатурное письмо: буквенные кубики/кнопки тоже должны быть скруглены
    if (seedOK) {
      for (const lang of ['en', 'tr']) {
        await page.eval(`__SMOKE__.setActiveLang(${JSON.stringify(lang)}); __SMOKE__.go("scr-write")`);
        await sleep(600);
        const wr = await page.eval(`(() => {
          const out = [];
          for (const b of document.querySelectorAll("#scr-write button")) {
            const r = b.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const cs = getComputedStyle(b);
            if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
            const rad = parseFloat(cs.borderTopLeftRadius) || 0;
            if (rad < 4 && Math.min(r.width, r.height) >= 8) out.push((b.className || b.id) + " r=" + rad);
          }
          return { n: document.querySelectorAll("#scr-write button").length, bad: out };
        })()`);
        totalButtons += wr.n;
        check(wr.bad.length === 0, `экран письма ${lang}: нет прямоугольных кнопок`, wr.bad.slice(0, 5).join(' | '));
      }
      await page.eval('__SMOKE__.setActiveLang("zh")');
    }
    ok('кнопок проверено', String(totalButtons));
    if (!seedOK) fail('тестовые карточки записаны');
    else {
      ok('тестовые карточки записаны (5 китайских + по 4 на en/tr/ar)');
      // zh: кисть
      await page.eval('__SMOKE__.setActiveLang("zh")');
      await page.eval('__SMOKE__.go("scr-write")');
      await sleep(800);
      const zhOK = await page.eval('!!__SMOKE__.writeCurItem && document.querySelectorAll("#scr-write button").length > 3');
      check(zhOK, 'китайский: карточка письма открылась');
      // случайный порядок включён — на границе очереди «Вперёд ▶» не падает и не застревает
      const rand = await page.eval('__SMOKE__.settings.writeOrder');
      check(rand === 'rand', 'порядок письма «Рандом» (как по умолчанию)', String(rand));
      const before = page.errors.length;
      const seen = await page.eval(`(async () => {
        const S = __SMOKE__, out = [];
        for (let i = 0; i < 12; i++) {
          document.getElementById('writeNext').click();
          await new Promise(r => setTimeout(r, 60));
          out.push(S.writeCurItem && S.writeCurItem.id);
        }
        return out;
      })()`);
      const uniq = new Set(seen.filter(Boolean));
      check(page.errors.length === before, 'китайский: «Вперёд ▶» без исключений на границе очереди');
      check(uniq.size >= 4, 'китайский: очередь не застревает на одном слове', 'уникальных: ' + uniq.size);
      // клавиатурные языки
      for (const lang of ['en', 'tr', 'ar']) {
        const errBefore = page.errors.length;
        await page.eval(`__SMOKE__.setActiveLang(${JSON.stringify(lang)})`);
        await page.eval('__SMOKE__.go("scr-write")');
        await sleep(500);
        const info = await page.eval(`(() => {
          const S = __SMOKE__, out = [];
          for (let i = 0; i < 9; i++) {
            document.getElementById('writeNext').click();
            out.push(S.writeCurItem && S.writeCurItem.id);
          }
          const area = document.getElementById('writeArea');
          return { ids: out, area: area.className, hasCard: area.children.length > 0 };
        })()`);
        const u = new Set(info.ids.filter(Boolean));
        check(page.errors.length === errBefore && info.hasCard, `${lang}: письмо открывается и листается`);
        check(u.size >= 4, `${lang}: очередь не застревает на одном слове`, 'уникальных: ' + u.size);
      }
      await page.eval('__SMOKE__.setActiveLang("zh")');
    }

    // ================= 6. Экзамен =================
    scenario('6. Экзамен');
    await page.eval('__SMOKE__.go("scr-dict")');
    const modes = await page.eval(`(() => {
      const S = __SMOKE__;
      Object.assign(S.examSettings, { tf: true, choice: true, tone: true, tonePyQ: true, match: true, write: true });
      const seq = S.examBuildSeq();
      const counts = {};
      for (const q of seq) counts[q.mode] = (counts[q.mode] || 0) + 1;
      return counts;
    })()`);
    for (const m of ['tf', 'choice', 'tone', 'tonePy', 'match', 'write']) {
      check(modes[m] > 0, `режим ${m} попадает в очередь экзамена`, 'заданий: ' + (modes[m] || 0));
    }

    // tonePy: неверный ответ → слово возвращается в очередь именно режимом tonePy
    const tp = await page.eval(`(async () => {
      const S = __SMOKE__;
      const word = S.items.find(it => it.lang === 'zh' && S.toneWordOk(it) && S.toneQuestion(it));
      if (!word) return { error: 'нет подходящего слова' };
      // только tonePy включён — requeueExam обязан вернуть слово именно им
      Object.assign(S.examSettings, { tf: false, choice: false, tone: false, tonePyQ: true, match: false, write: false });
      S.renderExamTonePy({ it: word });
      const st = S.examTonePyState;
      if (!st) return { error: 'состояние tonePy не создано' };
      const wrong = st.options.findIndex(o => o !== st.correct);
      const lenBefore = S.examSeq.length;
      S.examTonePyPick(wrong);
      await new Promise(r => setTimeout(r, 50));
      const added = S.examSeq.slice(lenBefore);
      return { added: added.map(q => q.mode), done: S.examTonePyState && S.examTonePyState.done };
    })()`);
    if (tp.error) fail('tonePy: неверный ответ возвращает слово в очередь', tp.error);
    else {
      check(tp.done, 'tonePy: ответ засчитан');
      check(tp.added.includes('tonePy'), 'tonePy: неверный ответ возвращает слово режимом tonePy', tp.added.join(','));
    }

    // все режимы рисуются без исключений
    const render = await page.eval(`(async () => {
      const S = __SMOKE__;
      const words = S.items.filter(it => it.lang === 'zh' && it.translation);
      const res = {};
      for (const mode of ['tf', 'choice', 'tone', 'tonePy', 'match', 'write']) {
        const it = words.find(w => (mode === 'tone' || mode === 'tonePy') ? S.toneWordOk(w) : true);
        if (!it) { res[mode] = 'нет слова'; continue; }
        S.examSeq = [{ it, mode }]; S.examIdx = 0;
        try { S.startExam(); res[mode] = document.getElementById('examBody').children.length > 0 ? 'ok' : 'пусто'; }
        catch (e) { res[mode] = 'исключение: ' + e.message; }
        await new Promise(r => setTimeout(r, 120));
      }
      return res;
    })()`);
    for (const [m, r] of Object.entries(render)) check(r === 'ok', `режим ${m} рисуется`, r);

    // ================= 7. Мобильная ширина 375×812 =================
    scenario('7. Мобильная ширина 375×812');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 375, height: 812, deviceScaleFactor: 2, mobile: true,
    });
    await sleep(300);
    for (const s of screens) {
      await page.eval(`__SMOKE__.go(${JSON.stringify(s)})`);
      await sleep(400);
      const over = await page.eval(`(() => {
        const w = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.right > w + 1.5) out.push((el.id || el.className || el.tagName) + ' right=' + Math.round(r.right));
        }
        return { sw: document.documentElement.scrollWidth, w, out: out.slice(0, 5) };
      })()`);
      check(over.sw <= over.w + 1, `экран ${s}: нет горизонтального переполнения`, `scrollWidth ${over.sw} / ${over.w}${over.out.length ? ' · ' + over.out.join(' | ') : ''}`);
    }
    await page.send('Emulation.clearDeviceMetricsOverride');

    // ================= итог =================
    const failedCount = results.filter((r) => !r.ok).length;
    console.log('\n' + '─'.repeat(60));
    console.log(`Итог: ${results.length - failedCount} из ${results.length} проверок пройдено`);
    if (failedCount) {
      console.log('Провалено:');
      for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ [${r.scenario}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
    exitCode = failedCount ? 1 : 0;
  } catch (e) {
    console.error('\nПрогон прерван: ' + (e && e.message ? e.message : e));
    if (page && (page.errors.length || page.logs.length)) {
      console.error('Исключения страницы:', page.errors.slice(-5));
      console.error('Последние сообщения консоли:', page.logs.slice(-10));
    }
    exitCode = 3;
  } finally {
    try { if (page) await page.close(); } catch (e) {}
    try { if (browser) { await browser.browser.send('Browser.close').catch(() => {}); browser.proc.kill(); } } catch (e) {}
    server.close();
    await sleep(300);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  }
  process.exit(exitCode);

  // ---------------------------------------------------------------- тестовые данные
  // Записываем карточки в IndexedDB ВРЕМЕННОГО профиля и перезагружаем страницу,
  // чтобы boot() прочитал их штатно (миграции, подписи, статистика — как у пользователя).
  async function seed() {
    const seeded = await page.eval(`(async () => {
      localStorage.setItem('langChosen', '1');
      const open = (name, ver, onUp) => new Promise((res, rej) => {
        const r = indexedDB.open(name, ver);
        r.onupgradeneeded = () => onUp && onUp(r.result);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const db = await open('hanzi-trainer', 1, (d) => { if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); });
      const put = (k, v) => new Promise((res, rej) => {
        const q = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
        q.onsuccess = () => res(); q.onerror = () => rej(q.error);
      });
      const now = Date.now();
      const mk = (id, lang, hanzi, translation) => ({
        id, lang, hanzi, translation, kind: 'word', pinyin: '', trs: [],
        box: 1, newDone: 0, nextDue: 0, addedAt: now, addedOn: new Date(now).toISOString().slice(0, 10),
        updated_at: now, prog_at: now, recordings: [], starred: false,
      });
      const zh = [['妈妈','мама'],['爸爸','папа'],['你好','привет'],['谢谢','спасибо'],['学习','учиться']];
      const en = [['apple','яблоко'],['book','книга'],['water','вода'],['house','дом']];
      const tr = [['kitap','книга'],['su','вода'],['ev','дом'],['elma','яблоко']];
      const ar = [['كتاب','книга'],['ماء','вода'],['بيت','дом'],['تفاحة','яблоко']];
      const items = [];
      zh.forEach(([h, t], i) => items.push(mk('i' + (now + i).toString(36) + 'zh', 'zh', h, t)));
      en.forEach(([h, t], i) => items.push(mk('i' + (now + 10 + i).toString(36) + 'en', 'en', h, t)));
      tr.forEach(([h, t], i) => items.push(mk('i' + (now + 20 + i).toString(36) + 'tr', 'tr', h, t)));
      ar.forEach(([h, t], i) => items.push(mk('i' + (now + 30 + i).toString(36) + 'ar', 'ar', h, t)));
      await put('items', items);
      const settings = {
        activeLang: 'zh', langChosen: true, writeOrder: 'rand', dir: 'fr',
        foreignAudio: false, ruAudio: false, examAudio: false, studyAudio: false,
        examTf: true, examChoice: true, examTone: true, examTonePyQ: true, examMatch: true, examWrite: true,
        examGradual: false, examAudioDelay: 0, samplesOffered: { zh: true, en: true, tr: true, ar: true },
      };
      await put('settings', settings);
      // данные начертания для тестовых иероглифов — чтобы письмо не ждало CDN
      const data = {};
      for (const ch of '妈妈爸你好谢学习') {
        try {
          const r = await fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.0/' + encodeURIComponent(ch) + '.json');
          if (r.ok) data[ch] = await r.json();
        } catch (e) {}
      }
      const hw = await open('hw-char-data', 1, (d) => { if (!d.objectStoreNames.contains('c')) d.createObjectStore('c'); });
      await new Promise((res, rej) => {
        const tx = hw.transaction('c', 'readwrite');
        for (const [ch, j] of Object.entries(data)) tx.objectStore('c').put(j, ch);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      return { count: items.length, chars: Object.keys(data).length };
    })()`);
    console.log(`  · карточек: ${seeded.count}, данных начертания: ${seeded.chars}`);
    // перезагрузка — boot() подхватит карточки
    await page.goto(base + 'index.html?smoke=1');
    try {
      await page.waitFor('!!(window.__SMOKE__ && window.__BOOT_DONE__)', 30000);
      await page.eval('__SMOKE__.closeAllModals()');
      const n = await page.eval('__SMOKE__.items.length');
      if (n < 17) { console.log('  · карточек после перезагрузки: ' + n); return false; }
      return true;
    } catch (e) {
      console.log('  · ' + e.message);
      return false;
    }
  }
}

const guard = setTimeout(() => {
  console.error(`\nТаймаут прогона (${TIMEOUT_MS / 1000} с) — тест остановлен.`);
  process.exit(4);
}, TIMEOUT_MS);
guard.unref();

main();