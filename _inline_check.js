
// ============================== LIB FALLBACK ==============================
function loadLibFallback(){
  const s=document.createElement('script');
  s.src='https://unpkg.com/hanzi-writer@3.6.1/dist/hanzi-writer.min.js';
  document.head.appendChild(s);
}
function loadLibFallback2(){
  const s=document.createElement('script');
  s.src='https://unpkg.com/pinyin-pro@3.29.4/dist/index.js';
  document.head.appendChild(s);
}

// ============================== STORAGE (IndexedDB) ==============================
const DB = {
  db:null,
  open(){
    return new Promise((res,rej)=>{
      const r=indexedDB.open('hanzi-trainer',1);
      r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess=()=>{ DB.db=r.result; res(); };
      r.onerror=()=>rej(r.error);
    });
  },
  tx(mode){ return DB.db.transaction('kv',mode).objectStore('kv'); },
  get(k){ return new Promise((res,rej)=>{ const q=DB.tx('readonly').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); },
  put(k,v){ return new Promise((res,rej)=>{ const q=DB.tx('readwrite').put(v,k); q.onsuccess=()=>res(); q.onerror=()=>rej(q.error); }); },
  del(k){ return new Promise((res,rej)=>{ const q=DB.tx('readwrite').delete(k); q.onsuccess=()=>res(); q.onerror=()=>rej(q.error); }); }
};

// ============================== STATE ==============================
let items = [];            // array of item
let settings = {
  hint:2, voiceURI:'', studyVoice:'', mulH:1, mulP:1, mulT:1,
  writeOrder:'rand', writeHint:'on', writeHintSize:1, writeNavSize:1   // П.6/8/9 «22.26»: Рандом и подсказка вкл по умолчанию
};
let stats = { streak:0, lastDay:'', activity:{} };
// Активный язык (Фаза 5): справочник языков; у каждого — свои карточки и статистика.
// rtl — зеркальная раскладка экрана (арабский); has_strokes — режим «Письмо» кистью (китайский).
// Для остальных языков «Письмо» — печать на клавиатуре.
const LANGS=[
  {code:'zh', name:'中文',      flag:'🇨🇳', rtl:false, has_strokes:true,  tts:'zh-CN'},
  {code:'en', name:'English',  flag:'🇬🇧', rtl:false, has_strokes:false, tts:'en-US'},
  {code:'tr', name:'Türkçe',   flag:'🇹🇷', rtl:false, has_strokes:false, tts:'tr-TR'},
  {code:'ar', name:'العربية',  flag:'🇸🇦', rtl:true,  has_strokes:false, tts:'ar-SA'}
];
// Флаги — инлайн-SVG, а не эмодзи: на Windows региональные эмодзи-флаги (🇨🇳 и т.п.)
// не рисуются (видно «CN» или пусто), SVG работает одинаково везде и офлайн.
const FLAG_SVG={
  zh:'<svg viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="11" fill="#DE2910"/><g fill="#FFDE00"><polygon points="5.71,2.10 6.53,4.22 8.97,4.26 7.02,5.63 7.73,7.78 5.71,6.50 3.70,7.78 4.41,5.63 2.46,4.26 4.90,4.22"/><polygon points="10.45,2.63 10.97,2.05 10.57,1.40 11.33,1.69 11.87,1.13 11.82,1.88 12.57,2.19 11.77,2.37 11.68,3.11 11.25,2.48"/><polygon points="12.58,4.34 13.31,3.99 13.21,3.25 13.79,3.78 14.54,3.46 14.17,4.13 14.72,4.68 13.92,4.57 13.52,5.23 13.38,4.48"/><polygon points="12.62,7.05 13.43,7.01 13.67,6.29 13.97,6.99 14.79,6.98 14.15,7.45 14.42,8.16 13.73,7.75 13.07,8.20 13.28,7.48"/><polygon points="10.54,8.78 11.30,9.02 11.83,8.44 11.81,9.20 12.57,9.48 11.78,9.69 11.73,10.43 11.27,9.82 10.47,10.00 10.97,9.41"/></g></svg>',
  en:'<svg viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="11" fill="#012169"/><g stroke-linecap="round"><path d="M0 0 L16 11 M16 0 L0 11" stroke="#fff" stroke-width="2.4"/><path d="M0 0 L16 11 M16 0 L0 11" stroke="#C8102E" stroke-width="0.9"/><path d="M8 0 V11 M0 5.5 H16" stroke="#fff" stroke-width="2.8"/><path d="M8 0 V11 M0 5.5 H16" stroke="#C8102E" stroke-width="1.0"/></g></svg>',
  tr:'<svg viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="11" fill="#E30A17"/><g fill="#fff"><circle cx="6" cy="5.5" r="2.6"/><polygon points="10.20,3.90 10.58,4.98 11.72,5.01 10.81,5.70 11.14,6.79 10.20,6.14 9.26,6.79 9.59,5.70 8.68,5.01 9.82,4.98"/></g><circle cx="6.9" cy="5.5" r="2" fill="#E30A17"/></svg>',
  ar:'<svg viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="11" fill="#006C35"/><g fill="#fff"><rect x="3" y="3.2" width="10" height="1.5" rx="0.4"/><path d="M4 8.4 L11.5 3.2 L12.1 3.7 L5 9.1 Z"/><rect x="3.6" y="8.7" width="2.2" height="1.2" rx="0.3"/></g></svg>'
};
function flagSVG(code){ return FLAG_SVG[code] || FLAG_SVG.zh; }
const LANG_MAP={}; LANGS.forEach(l=>LANG_MAP[l.code]=l);
let activeLang='zh';        // текущий язык (подтягивается из settings.activeLang в boot)
// Карточки/статистика фильтруются по языку — см. langItems()/langOf() ниже.

// Версия приложения. Правила бампа: мелкие правки (текст/отступы/цвет/размер) — третья цифра +1;
// заметные (новая кнопка/фильтр/сообщение) — вторая цифра +1, третья в 0; крупные (новый режим/переработка логики) — первая цифра +1.
const APP_VERSION='1.8.24';

// ============================== SUPABASE (облачная синхронизация) ==============================
// Публичные значения (не секретные): URL проекта и anon-ключ. Безопасность даёт RLS.
const SB_URL='https://njlxtfonhzqhxuklrfxs.supabase.co';
const SB_ANON='sb_publishable_FiGJ9WPvbmBDPqaJj5NZnA_HPhIyYAs';
let SB=null;                                   // клиент Supabase (создаётся лениво, после загрузки SDK)
const SB_OFFLINE=window.__NO_SUPABASE__===true; // в офлайн-сборке SDK заменён заглушкой

// ============================== SRS (5 коробок, интервалы в сессиях) ==============================
const BOX_INT=[0,2,3,5,8,12]; // сессий до следующего показа; индекс = коробка (1..5)
const SRS_NEW_NEED=4;         // верных ответов суммарно, чтобы новое слово покинуло коробку 1
const SRS_NEW_PER_SESS=10;    // максимум новых слов в очереди одной сессии
const SET='settings', ITEMS='items', STATS='stats';
let SESS=0;                 // номер текущей сессии (Учить/Письмо/Экзамен)
let SHOW_N=0;               // глобальный порядковый номер показа (для правила «между показами были другие слова»)

function uid(){ return 'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ============================== ЯЗЫКИ (Фаза 5) ==============================
// Активный язык у карточки (миграция проставила 'zh' старым записям); незнакомые коды → 'zh'.
function langOf(it){ return LANG_MAP[it&&it.lang] ? it.lang : 'zh'; }
// Карточки активного языка (порядок items не меняем — только копия для чтения).
function langItems(){ return items.filter(it=>langOf(it)===activeLang); }
function langInfo(){ return LANG_MAP[activeLang]||LANGS[0]; }
function hasStrokes(){ return !!langInfo().has_strokes; }
function ttsLang(){ return langInfo().tts||'zh-CN'; }
// Интерфейс всегда LTR и един для всех языков: зеркалить меню не нужно.
// Арабский текст сам идёт справа налево внутри полей (у них dir="auto").
// Переключатель языка (сегмент в Настройках). Меняет активный язык, подменяет
// статистику (stats — ссылка на statsByLang[activeLang]) и перерисовывает всё.
function renderLangSeg(){
  const seg=document.getElementById('langSeg'); if(!seg) return;
  seg.innerHTML='';
  LANGS.forEach(l=>{
    const b=document.createElement('button');
    b.type='button';
    b.dataset.code=l.code;
    // Флажок — инлайн-SVG (см. FLAG_SVG): на Windows эмодзи-флаги не рисуются.
    const fl=document.createElement('span'); fl.className='flg'; fl.innerHTML=flagSVG(l.code);
    const nm=document.createElement('span'); nm.className='nm'; nm.textContent=l.name;
    b.appendChild(fl); b.appendChild(document.createTextNode(' ')); b.appendChild(nm);
    if(l.code===activeLang) b.classList.add('active');
    b.onclick=()=>setLang(l.code);
    seg.appendChild(b);
  });
}
async function setLang(lang){
  if(activeLang===lang) return;
  activeLang=lang;
  settings.activeLang=lang;
  stats=statsFor(lang);               // stats — теперь статистика выбранного языка
  renderLangSeg();
  if('speechSynthesis' in window) loadVoices(); // заново подбираем голоса под язык
  await persist();
  refreshAll();
  maybeOfferSamples();
  // в фоне: сохраняем выбор языка в профиль (не блокируем интерфейс)
  if(SB_OFFLINE || !sbReady() || !_syncUser) return;
  try{
    const c=sbClient();
    if(c) await c.from('profiles').upsert({id:_syncUser.id, active_lang:lang}, {onConflict:'id'});
  }catch(e){}
}
function now(){ return Date.now(); }
function dayStr(d){
  d=d||new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+dd;
}
// ---- Точный момент добавления карточки (для строгого порядка в словаре) ----
// addedAt — epoch-ms создания. Новые карточки получают монотонно растущую метку
// (внутри одной миллисекунды идём вперёд, чтобы у партии порядок не «слипался»).
let _lastAddedAt=0;
function newAddedAt(){
  const t=Date.now();
  return (_lastAddedAt = (t>_lastAddedAt ? t : _lastAddedAt+1));
}
// Восстановление момента создания для СТАРЫХ карточек (до поля addedAt):
// id вида uid() = 'i'+Date.now().toString(36)+'…' хранит base36-таймстамп создания.
function idCreationMs(id){
  const s=String(id||'');
  if(s[0]!=='i') return 0;
  const rest=(s.slice(1).match(/^[0-9a-z]+/i)||[])[0];
  if(!rest) return 0;
  for(let len=Math.min(rest.length,10); len>=7; len--){
    const cand=parseInt(rest.slice(0,len),36);
    if(cand>1e12 && cand<=Date.now()+86400000) return cand;
  }
  return 0;
}
// День добавления 'YYYY-MM-DD' → начало суток (местное время), если дата валидна.
function dayStartMs(day){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));
  if(!m) return 0;
  const t=new Date(+m[1], +m[2]-1, +m[3]).getTime();
  return (t>0 && t<=Date.now()+86400000) ? t : 0;
}
// Проставляет addedAt, если его нет: сначала по id (точный момент), затем по дню addedOn.
function ensureAddedAt(it){
  const at=+it.addedAt||0;
  if(at>0){ it.addedAt=at; return; }
  it.addedAt=idCreationMs(it.id)||dayStartMs(it.addedOn)||0;
}
// Эффективный момент добавления для сортировки (см. ensureAddedAt).
function addedOrderTs(it){ return +it.addedAt||0; }
function normBox(it){ let b=+it.box||1; return b<1?1:(b>5?5:b); }
function isNewWord(it){ return !it.newDone; }            // «новое» = ещё не набрало 4 верных ответа
function isLearned(it){ return normBox(it)>=5; }         // коробка 5 — выучено
function markShown(it){ SHOW_N++; it.lastShowN=SHOW_N; it.lastSeen=now(); recordSeen(it); }

// Сессия = один заход в режим (Учить/Письмо/Экзамен). Вход в режим открывает новую сессию.
function enterSession(){
  SESS=(SESS||0)+1;
  settings.sessN=SESS;
  sweepNewStage();
  persist();
}
// Одноразовая зачистка служебного поля старой схемы «3+3» у слов, оставшихся между тройками.
function sweepNewStage(){
  for(const it of items){
    if(it.nsDoneSess!=null){ it.nsDoneSess=null; }
  }
}
// Миграция на актуальные слоты аудио (norm/alt2/alt3): устаревшие записи slow/fast удаляем из данных и из БД.
async function migrateNormAudio(it){
  const kept=[];
  for(const r of (it.recordings||[])){
    if(AUDIO_SLOTS.includes(r.speed)){ kept.push(r); }
    else{
      if(r.url && r.url.startsWith('blob:')) URL.revokeObjectURL(r.url);
      await DB.del('aud:'+it.id+':'+r.speed);
    }
  }
  it.recordings=kept;
}
// Миграция старых карточек (Leitner 0..5 → коробки 1..5) + проставка lang.
// ВАЖНО (Фаза 8): метки updated_at/prog_at тут НЕ трогаем — иначе загрузка «омолодит»
// всю старую базу и она затрёт свежие данные другого устройства. Нормализацию таймстампов
// (отсутствующие → 0) делает normalizeAppItem ПОСЛЕ этой функции, тоже без реальных now().
function migrateItem(it){
  if(!it.lang) it.lang='zh';
  if(it.__v3) return;
  if(!it.hasOwnProperty('newDone')){
    const ob=+it.box||0;
    it.newDone = (ob>=1 || it.learnedOn) ? 1 : 0;
    it.box = Math.max(1, Math.min(5, ob));
    it.dueSess = 0;
    it.nsStreak=0; it.nsSess=0; it.nsDoneSess=null; it.nsLastGoodShow=null;
    it.nsGood=0;
    it.lastSeen = +it.nextDue||0;
  }
  it.__v3=1;
}
function logActivity(){ const t=dayStr(); stats.activity=stats.activity||{}; stats.activity[t]=(stats.activity[t]||0)+1; }

// ============================== СИГНАТУРЫ LWW (Фаза 8) ==============================
// Карточка разбита на две независимо стареющие части: КОНТЕНТ (updated_at) и ПРОГРЕСС (prog_at).
// Причина: раньше один updated_at перештамповывался при любой смене единой сигнатуры, и бутовая
// миграция делала всю старую базу «свежей» — старая база затирала свежий прогресс другого устройства.
// Теперь таймстамп двигается ТОЛЬКО при реальном действии пользователя, по своей части.
const C_FIELDS=['lang','kind','hanzi','pinyin','translation','trs','note','tag','starred','addedOn','addedAt'];
const P_FIELDS=['box','dueSess','newDone','nsGood','nsStreak','nsSess','nsDoneSess','nsLastGoodShow',
                'correct','wrong','wrongStreak','correctStreak','correctStreakDays','lastCorrectDay','learnedOn'];
// Сигнатура контента: что пользователь ввёл/пометил/записал. Аудио — по слотам (speed+имя файла),
// без blob/cloud-URL: прикрепление/удаление записи делает карточку «новее», а смена URL — нет.
function itemContentSig(it){
  const recSig=(it.recordings||[]).filter(r=>r&&r.speed).map(r=>r.speed+':'+(r.name||'')).sort().join('|');
  return JSON.stringify([
    it.id, it.lang, it.kind, it.hanzi, it.pinyin, it.translation, it.trs, it.note, it.tag,
    it.starred, it.addedOn, it.addedAt, recSig
  ]);
}
// Сигнатура прогресса: SRS-состояние (коробка, счётчики, повторы, даты заучивания).
function itemProgSig(it){
  return JSON.stringify([
    it.box, it.dueSess, it.newDone, it.nsGood, it.nsStreak, it.nsSess, it.nsDoneSess, it.nsLastGoodShow,
    it.correct, it.wrong, it.wrongStreak, it.correctStreak, it.correctStreakDays, it.lastCorrectDay,
    it.learnedOn
  ]);
}
// Сеем подписи карточки: persist() не сдвинет ни одну метку, пока часть реально не изменится.
function seedCardSigs(it){
  it.__sigC=itemContentSig(it);
  it.__sigP=itemProgSig(it);
  delete it.__sig;   // старый комбинированный признак больше не используется
}
// ============================== ДЕДУПЛИКАЦИЯ КАРТОЧЕК ==============================
// Ключ «дубля»: язык + слово (свёрнутое сравнение). Два вхождения с одинаковым ключом —
// один и тот же материал (случайные id от разных устройств не совпадают, поэтому сверять
// нужно СОДЕРЖАНИЕ, а не id). Пиньинь в ключ не входит — он выводится автоматически и
// может разойтись в регистре без изменения смысла.
function keyFolded(s){
  return String(s||'').trim().toLowerCase()
    .normalize('NFC')
    .replace(/[«»„“”"'`´()[\]]/g,'')
    .replace(/\s+/g,' ');
}
// Свёртка для поиска-сравнения в арабском: огласовки (харакат) игнорируются, чтобы
// «поиск „قلم“» находил и «قَلَم». НО в ключ дубля/id это НЕ подставляем: иначе слово
// с огласовками и без получили бы один id и огласовки «схлопывались» при пересохранении.
function keyFoldedAr(s){
  return keyFolded(s).replace(/[ً-ْٰ]/g,'');
}
function dupKeyOfLang(it){ return langOf(it)+'|'+keyFolded(it.hanzi); }
function dupKeyOf(it){ return dupKeyOfLang(it)+'|'+keyFolded(it.translation); }
// Прогресс при склейке одинаковых карточек: берём максимум по каждому полю — ничего не теряем.
function mergeDupProgress(dst, src){
  const nums=['box','dueSess','newDone','nsGood','nsStreak','nsSess','correct','wrong','wrongStreak','correctStreak','correctStreakDays','lastSeen','nextDue'];
  for(const k of nums) if((src[k]||0)>(dst[k]||0)) dst[k]=src[k];
  const dates=['lastCorrectDay','learnedOn'];
  for(const k of dates) if(String(src[k]||'')>String(dst[k]||'')) dst[k]=src[k];
  if((src.nsDoneSess||0)>(dst.nsDoneSess||0)) dst.nsDoneSess=src.nsDoneSess;
  if((src.nsLastGoodShow||0)>(dst.nsLastGoodShow||0)) dst.nsLastGoodShow=src.nsLastGoodShow;
}
// Перевод ДЛЯ ОТЧЁТА о склейке (нужен для наглядности; в реальных данных ничего не трогаем).
function dupTranslate(it){ return (String(it.translation||'').trim()||'')+(it.trs&&it.trs.length?' +'+it.trs.length:''); }
// Нормализация карточки, пришедшей из IndexedDB/облака/импорта: приводит скаляры, но НИКОГДА
// не трогает таймстампы. Отсутствующей метке ставим 0 («возраст неизвестен»): такой контент/прогресс
// никогда не победит сторону с положительной меткой при авто-мерже (защита от затирания).
function normalizeAppItem(it){
  it.updated_at=(+it.updated_at)||0;
  it.prog_at=(+it.prog_at)||0;
  it.box=Math.max(1, Math.min(5, +it.box||1));
  it.dueSess=+it.dueSess||0; it.correct=+it.correct||0; it.wrong=+it.wrong||0;
  it.correctStreak=+it.correctStreak||0; it.correctStreakDays=+it.correctStreakDays||0;
  it.nsStreak=+it.nsStreak||0; it.nsSess=+it.nsSess||0; it.nsGood=+it.nsGood||0;
  it.nsDoneSess=it.nsDoneSess==null?null:it.nsDoneSess;
  it.nsLastGoodShow=it.nsLastGoodShow==null?null:it.nsLastGoodShow;
  it.lastShowN=+it.lastShowN||0; it.lastSeen=+it.lastSeen||0; it.nextDue=+it.nextDue||0;
  it.newDone=+it.newDone||0; it.starred=!!it.starred;
  it.lastCorrectDay=it.lastCorrectDay||''; it.learnedOn=it.learnedOn||'';
  it.addedOn=it.addedOn||''; it.lang=it.lang||'zh'; it.kind=it.kind||'word';
  ensureAddedAt(it);
  if(!Array.isArray(it.recordings)) it.recordings=[];
  seedCardSigs(it);
  return it;
}
// Склейка локальных дублей: входы с одинаковым ключом «язык|слово» сливаем в одного
// выжившего. Правило выживания ДЕТЕРМИНИРОВАННОЕ — меньший id (строково) — поэтому все
// устройства и удаление лишних облачных строк (prepareCloudDedupe) выбирают одну и ту же
// копию, и после синка снова не размножается пара. Прогресс объединяем максимумами,
// таймстампы клампим максимумом (не «омолаживаем» насильно). Возвращает число склеенных.
function mergeDupInto(surv, loser){
  if((loser.updated_at||0)>(surv.updated_at||0)) surv.updated_at=loser.updated_at;
  if((loser.prog_at||0)>(surv.prog_at||0)) surv.prog_at=loser.prog_at;
  mergeDupProgress(surv, loser);
}
function makeLocalUnique(){
  let merged=0;
  const map=new Map();   // ключ «язык|слово» → карточка-победитель
  const out=[];          // итоговый порядок (карточки без слова сохраняются как есть)
  for(const it of items){
    if(!String(it.hanzi||'').trim()){ out.push(it); continue; }   // без слова — не с чем совпадать
    const k=dupKeyOfLang(it);
    const s=map.get(k);
    if(s===undefined){ map.set(k,it); out.push(it); continue; }
    let surv=it, loser=s;
    if(s.id<it.id){ surv=s; loser=it; }
    if(surv===it){ const idx=out.indexOf(s); if(idx>=0) out[idx]=it; }  // новый выживший занял место прежнего
    map.set(k,surv);
    mergeDupInto(surv, loser);
    revokeAll(loser);
    merged++;
  }
  items=out;
  for(const it of items) seedCardSigs(it);
  return merged;
}
// Стабильный id для новой карточки: 64-битный FNV-1a хэш «язык|свёрнутое слово». Один и тот
// же материал на разных устройствах получает ОДИН id — дубли вообще перестают рождаться при
// повторном добавлении одинакового слова. Возвращает присвоенный id.
function hash64(s){
  // FNV-1a 64-bit (basis 0xcbf29ce484222325, prime 0x100000001b3) на BigInt — точнее,
  // чем эмуляция через два 32-битных полуслова в double.
  let h=0xcbf29ce484222325n;
  const prime=0x100000001b3n, mask=(1n<<64n)-1n;
  for(let i=0;i<s.length;i++){
    h^=BigInt(s.charCodeAt(i));
    h=(h*prime)&mask;
  }
  return h.toString(16).padStart(16,'0');
}
function assignStableId(it){
  // Арабское слово с огласовками — ОТДЕЛЬНАЯ карточка: keyFolded для ar больше НЕ вырезает
  // харакат (это делает только поиск через keyFoldedAr), поэтому «قَلَم» и «قلم» получают
  // разные id и не «схлопываются» при пересохранении.
  it.id='k'+hash64(dupKeyOfLang(it));
  return it.id;
}
// Сигнатуры settings/stats для LWW. Исключаем updated_at (сама метка) и sessN
// (локальный счётчик сессий — меняется при каждом входе в режим, но это не пользовательская настройка).
function settingsSig(s){ const o={}; for(const k in s){ if(k==='updated_at'||k==='sessN') continue; o[k]=s[k]; } return JSON.stringify(o); }
function statsSig(s){ const o={}; for(const k in s){ if(k==='updated_at') continue; o[k]=s[k]; } return JSON.stringify(o); }
let _sigSet=null;   // базовая сигнатура настроек, проставляется в boot()

// Статистика разделена по языкам (Фаза 5): карта {lang → stats}. Переменная `stats`
// — это статистика АКТИВНОГО языка (для совместимости со всем остальным кодом).
const DB_STATS_ALL='stats-all';
let statsByLang={};                // {code → {streak,lastDay,activity,words,...}}
let _sigStatsMap={};               // сигнатуры каждой языковой статистики (для persist)
function statsFor(lang){
  if(!statsByLang[lang]){
    statsByLang[lang]={streak:0,lastDay:'',activity:{}};
    _sigStatsMap[lang]=statsSig(statsByLang[lang]);  // пустой язык не должен сдвигать updated_at при persist()
  }
  return statsByLang[lang];
}

async function persist(){
  const t=now();
  // карточки (Фаза 8): двигаем updated_at и prog_at НЕЗАВИСИМО — каждый только при изменении
  // своей части. Подписи __sigC/__sigP сеются normalizeAppItem при загрузке, поэтому простой
  // перезапуск/миграция не сдвигают ни одну метку.
  for(const it of items){
    const sc=itemContentSig(it);
    if(it.__sigC!==sc){ it.updated_at=(it.updated_at||0)<t?t:it.updated_at; it.__sigC=sc; }
    const sp=itemProgSig(it);
    if(it.__sigP!==sp){ it.prog_at=(it.prog_at||0)<t?t:it.prog_at; it.__sigP=sp; }
  }
  // settings/stats: двигаем updated_at только при изменении содержимого
  const ss=settingsSig(settings);
  if(_sigSet!==ss){ settings.updated_at=t; _sigSet=ss; }
  // статистика активного языка живёт в statsByLang[activeLang] (stats — та же ссылка)
  const st=statsSig(stats);
  if(_sigStatsMap[activeLang]!==st){ stats.updated_at=t; _sigStatsMap[activeLang]=st; }
  await DB.put(ITEMS, items);
  await DB.put(SET, settings);
  await DB.put(DB_STATS_ALL, statsByLang);
}

// ============================== HELPERS ==============================
function toast(msg, ms=2200){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'), ms);
}
// короткое уведомление (1 секунда) — для мгновенных действий вроде понижения уровня
function toastShort(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1000);
}
function go(scrId, writeIt){
  stopAllAudio();
  clearExamIdle();
  clearStudyIdle();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(scrId).classList.add('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.scr===scrId));
  refreshModeFilterBadges();
  if(scrId==='scr-dict') renderDict();
  if(scrId==='scr-study') startStudy();
  if(scrId==='scr-write') startWrite(writeIt);
  if(scrId==='scr-exam') startExam();
  if(scrId==='scr-more') renderMore();
}

// ============================== PINYIN ==============================
function toPinyin(s){
  if(!window.pinyinPro) return '';
  try{ return window.pinyinPro.pinyin(s,{toneType:'symbol'}); }catch(e){ return ''; }
}

// ============================== TTS ==============================
let VOICES=[], audioUnlocked=false;
function loadVoices(){
  // голоса только активного языка (Фаза 5); «Авто (xx-XX)» — без ручного выбора, берём best-fit
  const prefix=(ttsLang()||'zh-CN').replace('-','').split('-')[0].toLowerCase(); // zh/en/tr/ar
  VOICES=speechSynthesis.getVoices().filter(v=>new RegExp('^'+prefix,'i').test(v.lang));
  const sel=document.getElementById('voiceSel');
  sel.innerHTML='<option value="">Авто ('+ttsLang()+')</option>';
  VOICES.forEach(v=>{ const o=document.createElement('option'); o.value=v.voiceURI; o.textContent=v.name+' ('+v.lang+')'; sel.appendChild(o); });
  if(settings.voiceURI) sel.value=settings.voiceURI;
  // Подсказка, если у языка нет локального голоса: не молчим, а объясняем и говорим про fallback.
  const hint=document.getElementById('voiceHint');
  if(hint){
    if(!VOICES.length){
      hint.textContent='Для '+ttsLang()+' на этом устройстве нет голоса — синтез переключится на сетевой mp3 (или прикрепите запись).';
    }else{
      hint.textContent='';
    }
  }
}
if('speechSynthesis' in window){
  loadVoices();
  speechSynthesis.onvoiceschanged=loadVoices;
}
function pickVoice(){
  const pref=ttsLang();
  return VOICES.find(v=>v.voiceURI===settings.voiceURI) || VOICES.find(v=>v.lang===pref) || VOICES[0] || null;
}
function getVoiceByURI(uri){
  if(!uri) return null;
  return VOICES.find(v=>v.voiceURI===uri) || null;
}
// страховочный таймаут для TTS: если onend/onerror не пришли (зависание очереди),
// обещание завершаем принудительно — речь не «висит» в фоне.
function maxSpeechMs(text){
  const n=String(text||'').trim().length;
  return Math.max(2500, Math.min(15000, 1000+n*420));
}
function speak(text,rate){
  return (async ()=>{
    if(!text||!String(text).trim()) return;
    speechSynthesis.cancel();
    if(('speechSynthesis' in window) && pickVoice()){
      await new Promise((res)=>{
        const u=new SpeechSynthesisUtterance(text);
        u.lang=ttsLang(); u.rate=rate||1;
        const v=pickVoice(); if(v) u.voice=v;
        let done=false, tmo=null;
        const finish=()=>{ if(done) return; done=true; clearTimeout(tmo); res(); };
        u.onend=finish; u.onerror=finish;
        try{ speechSynthesis.speak(u); }catch(e){ finish(); return; }
        // страховка: если onend/onerror так и не пришли (зависший TTS), отпускаем обещание
        tmo=setTimeout(finish, maxSpeechMs(text));
      });
    }else{
      // локального голоса языка нет (напр. арабский на Windows) — играем сетевой mp3
      const a=await fetchRemoteTTS(text);
      if(a){
        await new Promise((res)=>{
          let tmo=null;
          const finish=()=>{ try{ a.pause(); }catch(e){} a.onended=a.onerror=null; clearTimeout(tmo); res(); };
          a.onended=finish; a.onerror=finish;
          tmo=setTimeout(finish, Math.min(90000, 3000+String(text||'').length*450));
          try{ a.play().catch(finish); }catch(e){ finish(); }
        });
      }
    }
  })();
}
// Внешний TTS (Google translate_tts): mp3 по тексту. Используется как запасной путь, когда
// у языка НЕТ локального голоса (напр. арабский на Windows).
// ВАЖНО-1: у translate_tts нет CORS-заголовков, поэтому fetch() для него запрещён —
// используем прямой <audio src> (воспроизведение медиа не ограничено CORS).
// ВАЖНО-2: сервис отдаёт 404, если к запросу прикреплён заголовок Referer с чужим origin
// (наш <meta referrer=no-referrer> снимает его со ВСЕХ исходящих запросов страницы).
// Лимит длины: у `translate_tts` текст условно до ~200 знаков; длиннее не отправляем.
const G_TRANSLATE_TTS='https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=TTL&q=';
async function fetchRemoteTTS(text, langTag){
  const MAX=200;
  const t=String(text||'').trim();
  if(!t) return null;
  const tag=(langTag||ttsLang()||'zh-CN').toLowerCase();
  const url=G_TRANSLATE_TTS.replace('TTL', encodeURIComponent(tag))+encodeURIComponent(t.slice(0,MAX));
  try{
    const a=new Audio();
    a.preload='auto';
    let failed=false;
    a.addEventListener('error',()=>{ failed=true; }, {once:true});
    a.src=url;                                  // src после подписки на error — не пропустим раннюю ошибку
    await Promise.race([
      new Promise(ok=>a.addEventListener('canplay',ok,{once:true})),   // canplay срабатывает раньше canplaythrough
      new Promise(ok=>setTimeout(ok,1500))
    ]);
    return failed ? null : a;
  }catch(e){ return null; }
}

// ============================== AUDIO SEQUENCE PLAYER ==============================
// plays tracks sequentially; each track: {kind:'file',url} or {kind:'tts',text,rate}
const Player={
  busy:false, gen:0, stopFlag:false, onSpeedChange:null, onDone:null, cur:null,
  async play(tracks, opts){
    opts=opts||{};
    const my=++this.gen;                      // устаревший запуск сам выходит из цикла
    if(this.cur) this._releaseTrack();
    speechSynthesis.cancel();
    this.busy=true; this.stopFlag=false;
    const gap=opts.gap??450;
    const announce=(t)=>this.onSpeedChange&&this.onSpeedChange(t.label||'');
    try{
      for(const t of tracks){
        if(this.stopFlag||my!==this.gen) break;
        const reps=t.reps||1;
        for(let r=0;r<reps;r++){
          if(this.stopFlag||my!==this.gen) break;
          announce(t);
          await this._one(t,my);
          if(this.stopFlag||my!==this.gen) break;
          await this._sleep(gap);
        }
      }
    }finally{
      if(my===this.gen){
        this.busy=false;
        this.cur=null;
        announce('');
        this.onDone&&this.onDone();
      }
    }
  },
  stop(){
    this.gen++;                               // аннулирует любой идущий плейлист
    this.stopFlag=true;
    this.busy=false;                          // запуск прерван — признак «идёт» снимаем сразу
    if(this.cur) this._releaseTrack();
    if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  },
  _releaseTrack(){
    const c=this.cur; this.cur=null;
    try{ c.pause(); c.onended=c.onerror=null; }catch(e){}
  },
  _one(t,my){
    return new Promise(res=>{
      let done=false, tmo=null;
      const finish=()=>{ if(done) return; done=true; clearTimeout(tmo); res(); };
      if(t.kind==='tts'){
        (async()=>{
          const forcedV= t.voice==='google' ? null : (t.voice ? getVoiceByURI(t.voice) : null);
          const v = forcedV || pickVoice();
          if(t.voice!=='google' && v){
            const u=new SpeechSynthesisUtterance(t.text);
            u.lang=ttsLang(); u.rate=t.rate||1;
            u.voice=v;
            u.onend=finish; u.onerror=finish;
            try{ speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){ finish(); return; }
            tmo=setTimeout(finish, maxSpeechMs(t.text));
          }else{
            // Google голос (выбор по умолчанию) или нет локального голоса — сетевой mp3 (fallback)
            const a=await fetchRemoteTTS(t.text);
            if(!a){ finish(); return; }
            if(this.cur){ try{ this.cur.pause(); this.cur.onended=this.cur.onerror=null; }catch(e){} }
            this.cur=a;
            a.onended=finish; a.onerror=finish;
            tmo=setTimeout(finish, Math.min(90000, 3000+String(t.text||'').length*450));
            try{ a.play().catch(finish); }catch(e){ finish(); }
          }
        })();
      }else{
        let a;
        try{ a=new Audio(t.url); }catch(e){ res(); return; }
        // предыдущий элемент этого же слота останавливается при старте нового
        if(this.cur){ try{ this.cur.pause(); this.cur.onended=this.cur.onerror=null; }catch(e){} }
        this.cur=a;
        a.onended=finish; a.onerror=finish;
        tmo=setTimeout(finish, 90000);
        a.play().catch(finish);
      }
    });
  },
  _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
};

// Общие «дорожки» для слова: MP3 есть → файлы; нет → TTS тремя скоростями.
// study: speeds = выбранная скорость (или все подряд); exam: всегда ['norm'].
function tracksFor(it, opts){
  opts=opts||{};
  const R=opts.reps ?? 1;                          // одно проговаривание на скорость
  const labelMap={slow:'медленно', norm:'обычно', fast:'быстро'};
  const rateMap={slow:0.55, norm:1, fast:1.18};
  const rec=(sp)=> (it.recordings||[]).find(r=>r.speed===sp);
  const speeds = opts.mode==='exam' ? ['norm'] : (opts.speeds||['norm']);
  const out=[];
  for(const sp of speeds){
    const r=rec(sp);
    // пустая ссылка (слёт blob: напр. после восстановления БД) — не ломаем плейлист
    if(r && r.url) out.push({kind:'file',url:r.url,reps:R,label:labelMap[sp]});
  }
  if(out.length) return out;
  const sv=(opts.mode==='study')?(settings.studyVoice||'google'):'';
  return speeds.map(sp=>({kind:'tts',text:it.hanzi,rate:rateMap[sp],reps:R,label:labelMap[sp],voice:sv||opts.voice||''}));
}
// В режиме «Учить» слово озвучивается один раз на обычной скорости.
// Повтор — только при продолжительном простое (см. studyIdle) или кнопкой «Повторить».
function studySpeeds(){ return ['norm']; }
// Проигрывание для «Учить»: mp3 могло прийти из облака с path, но без локального файла —
// сначала подтягиваем его (кэш/сеть), затем собираем плейлист из файлов, иначе TTS.
async function playItem(it, opts){
  opts=opts||{};
  opts.mode=opts.mode||'study';
  if(opts.mode!=='exam') opts.speeds=opts.speeds||studySpeeds();
  ensureCardAudio(it, opts.mode==='exam' ? ['norm'] : (opts.speeds||studySpeeds()));  // в фоне: не блокируем старт звука
  const el=document.getElementById('studySpeed');
  Player.onSpeedChange=(label)=> el.textContent=label?'🔊':'';
  Player.onDone=()=>{ if(opts.onDone) opts.onDone(); };
  Player.play(tracksFor(it,opts));
}
function stopPlayer(){ Player.stop(); }
async function playWordNorm(it){
  // проигрывание слова в обычной скорости (из карточки словаря и в экзамене)
  if(!it) return;
  Player.stop();
  Player.onSpeedChange=null;
  const rec=liveRec(it,'norm');
  if(rec){
    if(!rec.url && rec.path) await cacheRemoteAudio(it,'norm');
    if(rec.url) Player.play([{kind:'file',url:rec.url}]);
    else speak(it.hanzi,1);
  }else speak(it.hanzi,1);
}

// ============================== RECORDINGS / AUDIO FILES ==============================
// Слоты аудио: norm — основное, alt2/alt3 — задел под «Аудио 2/3» (UI появится отдельной фазой,
// но схема хранения уже под массив слотов, чтобы не делать миграцию потом).
const AUDIO_SLOTS=['norm','alt2','alt3'];
const AUDIO_SLOT_LABEL={norm:'Аудио', alt2:'Аудио 2', alt3:'Аудио 3'};
let audioTargetSpeed=null; // slot ('norm'|'alt2'|'alt3'), к которому прикрепляем файл
// Выбранное, но ещё не сохранённое аудио живёт здесь (в памяти формы) до нажатия «Сохранить».
// В БД ничего не пишется; при закрытии карточки без сохранения — отбрасывается.
let pendingRec={};   // slot -> {name,type,buf,url}
let pendingDrop={};  // slot -> true (уже сохранённую запись убрали, но ещё не «Сохранить»)
function bindAudioSlot(){
  const fi=document.getElementById('fileAudio');
  fi.onchange=async ()=>{
    const files=Array.from(fi.files);
    if(!files.length||!audioTargetSpeed||!editingItem) return;
    const speed=audioTargetSpeed;
    const f=files[0];
    const buf=await f.arrayBuffer();
    appendPendingRecording(speed, f.name||'файл', f.type||'audio/mpeg', buf);
    toast('Аудио прикреплено');
    audioTargetSpeed=null; fi.value='';
    renderSlots();
  };
}
// Кладёт файл в память формы (с живым blob-URL для предпрослушки), не трогая БД.
function appendPendingRecording(speed,name,type,buf){
  const old=pendingRec[speed];
  if(old&&old.url) URL.revokeObjectURL(old.url);
  pendingRec[speed]={name,type,buf,url:URL.createObjectURL(new Blob([buf],{type}))};
  delete pendingDrop[speed]; // новый файл важнее отложенного удаления
}
// Запись для слота скорости: свежее из формы (pending) либо уже сохранённая.
function formRec(speed){
  if(pendingDrop[speed]) return null;
  if(pendingRec[speed]) return {speed, name:pendingRec[speed].name, url:pendingRec[speed].url, pending:true};
  if(!editingItem) return null;
  return (editingItem.recordings||[]).find(r=>r.speed===speed)||null;
}
// Восстанавливает аудио после перезагрузки страницы:
// - локальная запись: из IndexedDB в blob-URL (как раньше);
// - remote-запись (path из облака): оставляем path, blob-кэш подтянется лениво при проигрывании.
async function hydrateRecordings(it){
  for(const r of (it.recordings||[])){
    if(!r.speed) continue;
    // пустой blob: url — значение от старого «пустого» аудио; вычищаем мусор из записи
    if(r.url && r.url.startsWith('blob:')){
      const rec=await DB.get('aud:'+it.id+':'+r.speed);
      if(rec){ URL.revokeObjectURL(r.url); r.url=URL.createObjectURL(new Blob([rec.buf],{type:rec.type})); r.name=rec.name; }
    }else if(r.path && !r.url){
      const local=await DB.get('aud:'+it.id+':'+r.speed);
      if(local){ r.url=URL.createObjectURL(new Blob([local.buf],{type:local.type})); }
    }
  }
}
async function revokeAll(it){ (it.recordings||[]).forEach(r=>{ if(r.url&&r.url.startsWith('blob:')){ URL.revokeObjectURL(r.url); } }); }
// Сбрасывает несохранённое аудио формы (карточку закрыли без «Сохранить»)
function dropPendingRec(){
  for(const s of Object.keys(pendingRec)){ URL.revokeObjectURL(pendingRec[s].url); }
  pendingRec={};
  pendingDrop={};
}

// ============================== HANZI WRITER DATA ==============================
const HW_DB_NAME='hw-char-data';
function hwDb(){
  return new Promise((res,rej)=>{ const r=indexedDB.open(HW_DB_NAME,1);
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('c')) r.result.createObjectStore('c'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function hwCharData(ch){
  if(window.__BUILTIN_CHAR_DATA__ && window.__BUILTIN_CHAR_DATA__[ch]) return window.__BUILTIN_CHAR_DATA__[ch];
  const db=await hwDb();
  const have=await new Promise(res=>{ const q=db.transaction('c').objectStore('c').get(ch); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); });
  if(have) return have;
  const enc=encodeURIComponent(ch);
  const urls=[
    'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.0/'+enc+'.json',
    'https://unpkg.com/hanzi-writer-data@2.0.0/'+enc+'.json'
  ];
  // загрузка данных с таймаутом: недоступный CDN не должен навсегда «зависать» письмо
  async function fetchOne(u){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(), 4000);
    try{
      const r=await fetch(u, {signal:ctrl.signal});
      if(!r.ok) return null;
      return await r.json();
    }catch(e){ return null; }
    finally{ clearTimeout(timer); }
  }
  // несколько попыток на каждый CDN: единичный сбой сети не должен выбрасывать в «свободное рисование»
  for(let attempt=0; attempt<3; attempt++){
    for(const u of urls){
      const j=await fetchOne(u);
      if(j&&j.strokes){ db.transaction('c','readwrite').objectStore('c').put(j,ch); return j; }
    }
    if(attempt<2) await new Promise(res=>setTimeout(res, 250*(attempt+1)));
  }
  return null;
}
// Ждём, пока CDN-скрипт hanzi-writer загрузит глобальный HanziWriter (устраняет гонку запуска)
function ensureHanziWriter(timeout){
  return new Promise(res=>{
    if(window.HanziWriter) return res(true);
    const t0=Date.now();
    const iv=setInterval(()=>{
      if(window.HanziWriter){ clearInterval(iv); res(true); }
      else if(Date.now()-t0>=timeout){ clearInterval(iv); res(false); }
    }, 80);
  });
}

// ============================== RENDER DICT ==============================
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// фильтр словаря: 'all' | 'star' | 'learned' | 'due'; активна всегда ровно одна кнопка
let dictFilter='all';
function dictFiltered(){
  const q=(document.getElementById('dictSearch').value||'').trim().toLowerCase();
  let arr=langItems().slice(); // копия карточек активного языка: сортируем только здесь
  if(dictFilter==='star') arr=arr.filter(it=>it.starred);
  else if(dictFilter==='learned') arr=arr.filter(isLearned);
  // расширенные фильтры (окно «Фильтр») применяются поверх «Все слова / Избранное»
  if(fltActive()) arr=arr.filter(passesFilter);
  if(q) arr=arr.filter(it=> it.hanzi.toLowerCase().includes(q) || keyFoldedAr(it.hanzi).includes(keyFoldedAr(q)) || (it.pinyin&&it.pinyin.toLowerCase().includes(q)) || (trJoined(it)&&trJoined(it).toLowerCase().includes(q)) || (it.tag&&it.tag.toLowerCase().includes(q)));
  // Новые слова вверху: строго по моменту добавления (addedAt, epoch-ms) по убыванию.
  // У карточек без точной метки добавление восстановлено из id/addedOn в normalizeAppItem,
  // поэтому addedAt есть у всех. При равенстве (пара слов одной партии) — более свежий id сверху.
  arr.sort((a,b)=>((b.addedAt||0)-(a.addedAt||0)) || String(b.id||'').localeCompare(String(a.id||'')));
  return arr;
}
// подписи-счётчики «N выучено» + подсветка активной кнопки + бейдж «Фильтра»
function updateDictFilterChips(){
  const learned=langItems().filter(isLearned).length;
  document.getElementById('dictFilterLearned').innerHTML='<b>'+learned+'</b> выучено';
  document.querySelectorAll('[data-dict-filter]').forEach(b=>b.classList.toggle('active', b.dataset.dictFilter===dictFilter));
  updateFilterBadge();
}
// ====== Окно «Фильтр» (уровни + метки + «повторить сейчас») ======
// flt = {lvls:Set<1..5>, tags:Set<string>, due:bool}
let flt={lvls:new Set(), tags:new Set(), due:false, thisMonth:false, lastMonth:false};
function fltActive(){ return flt.lvls.size>0 || flt.tags.size>0 || flt.due || flt.thisMonth || flt.lastMonth; }
function fltCount(){ return flt.lvls.size + flt.tags.size + (flt.due?1:0) + (flt.thisMonth?1:0) + (flt.lastMonth?1:0); }
function passesFilter(it){
  if(flt.lvls.size && !flt.lvls.has(normBox(it))) return false;
  if(flt.tags.size){
    const t=(it.tag||'').trim();
    if(!t || !flt.tags.has(t)) return false;
  }
  if(flt.due && !(it.translation && isDue(it))) return false;
  if(flt.thisMonth || flt.lastMonth){
    const d=dictMonthDate(it);
    if(!d) return false;
    const now=new Date();
    const isThis=d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    const prevY=now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
    const prevM=now.getMonth()===0 ? 11 : now.getMonth()-1;
    const isLast=d.getFullYear()===prevY && d.getMonth()===prevM;
    if(!((flt.thisMonth && isThis) || (flt.lastMonth && isLast))) return false;
  }
  return true;
}
// Все карточки языка с учётом активных фильтров словаря (расширенный фильтр + кнопки
// «★ Избранное»/«выучено»). Ими сужаются режимы Учить/Письмо/Экзамен/Подбор;
// возврат к «Все слова» и сброс фильтра возвращают полную колоду.
function filteredLangItems(){
  let arr=langItems();
  if(fltActive()) arr=arr.filter(passesFilter);
  if(dictFilter==='star') arr=arr.filter(it=>it.starred);
  else if(dictFilter==='learned') arr=arr.filter(isLearned);
  return arr;
}
function allTags(){
  const set=new Set();
  for(const it of langItems()){ const t=(it.tag||'').trim(); if(t) set.add(t); }
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
function openFilterModal(){
  closeAllModals();
  const m=document.getElementById('modalFilter');
  const tags=allTags();
  // tmp — рабочая копия фильтра в окне; в flt она попадает только по «Применить».
  const tmp={lvls:new Set(flt.lvls), tags:new Set(flt.tags), due:flt.due, thisMonth:flt.thisMonth, lastMonth:flt.lastMonth};
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Фильтр</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalFilter')">✕</button></div>
    <label class="lbl">Уровни</label>
    <div class="flt-sec" id="fltLvls">
      ${[1,2,3,4,5].map(l=>`<button class="flt-chip ${tmp.lvls.has(l)?'on':''}" data-flt-lvl="${l}">Уровень ${l}</button>`).join('')}
    </div>
    <label class="lbl">Метки</label>
    <div class="flt-sec" id="fltTags">
      ${tags.length?tags.map(t=>`<button class="flt-chip ${tmp.tags.has(t)?'on':''}" data-flt-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(''):'<div class="auth-hint" style="margin:0">Меток пока нет — добавьте их в карточке (поле «Метка»).</div>'}
    </div>
    <label class="lbl">Когда добавлено</label>
    <div class="flt-sec" id="fltMonth">
      <button class="flt-chip ${tmp.thisMonth?'on':''}" data-flt-month="this">Этот месяц</button>
      <button class="flt-chip ${tmp.lastMonth?'on':''}" data-flt-month="last">Прошлый месяц</button>
    </div>
    <label class="lbl">Другое</label>
    <div class="flt-sec" id="fltDue">
      <button class="flt-chip ${tmp.due?'on':''}" data-flt-due="1">Повторить сейчас</button>
    </div>
    <div class="btn-row" style="margin-top:14px">
      <button class="btn sec" id="fltReset">Сбросить фильтр</button>
      <button class="btn ok" id="fltApply">Применить фильтр</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  // выбор чипов меняет только рабочую копию; к реальному flt ничего не применяется,
  // пока пользователь не нажмёт «Применить фильтр» (или «Сбросить» очистит выбор).
  m.querySelectorAll('[data-flt-lvl]').forEach(b=>b.onclick=()=>{ toggleSet(tmp.lvls, +b.dataset.fltLvl); b.classList.toggle('on', tmp.lvls.has(+b.dataset.fltLvl)); });
  m.querySelectorAll('[data-flt-tag]').forEach(b=>b.onclick=()=>{ toggleSet(tmp.tags, b.dataset.fltTag); b.classList.toggle('on', tmp.tags.has(b.dataset.fltTag)); });
  m.querySelector('[data-flt-due]').onclick=e=>{ tmp.due=!tmp.due; e.currentTarget.classList.toggle('on', tmp.due); };
  m.querySelectorAll('[data-flt-month]').forEach(b=>b.onclick=()=>{ const k=b.dataset.fltMonth==='this'?'thisMonth':'lastMonth'; tmp[k]=!tmp[k]; b.classList.toggle('on', tmp[k]); });
  m.querySelector('#fltReset').onclick=()=>{
    flt={lvls:new Set(), tags:new Set(), due:false, thisMonth:false, lastMonth:false};
    tmp.lvls=new Set(); tmp.tags=new Set(); tmp.due=false; tmp.thisMonth=false; tmp.lastMonth=false;
    m.querySelectorAll('.flt-chip').forEach(c=>c.classList.remove('on'));
    renderDict(); updateFilterBadge(); refreshModeFilterBadges();
  };
  m.querySelector('#fltApply').onclick=()=>{
    flt={lvls:new Set(tmp.lvls), tags:new Set(tmp.tags), due:tmp.due, thisMonth:tmp.thisMonth, lastMonth:tmp.lastMonth};
    renderDict(); updateFilterBadge(); refreshModeFilterBadges();
    closeModal('modalFilter');
  };
}
function toggleSet(set, v){ if(set.has(v)) set.delete(v); else set.add(v); }
// Метка «Фильтр: N слов» в режимах Учить/Письмо/Экзамен — видна при активном фильтре
// или при включённых кнопках «★ Избранное»/«выучено» (они тоже сужают колоду режимов).
function refreshModeFilterBadges(){
  const n=filteredLangItems().length;
  let label=null;
  if(dictFilter==='star') label='★ Избранное: '+n+' сл.';
  else if(dictFilter==='learned') label='Выучено: '+n+' сл.';
  else if(fltActive()) label='Фильтр: '+n+' сл.';
  ['studyFltBadge','writeFltBadge','examFltBadge'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(label){ el.textContent=label; el.classList.remove('hidden'); }
    else { el.textContent=''; el.classList.add('hidden'); }
  });
}
}
function updateFilterBadge(){
  const el=document.getElementById('fltBadge'); if(!el) return;
  const n=fltCount();
  if(n){ el.classList.add('show'); el.textContent=n; }
  else el.classList.remove('show');
}
function toggleStar(id){
  const it=items.find(x=>x.id===id); if(!it) return;
  it.starred=!it.starred;
  persist().then(()=>renderDict());
}
// ↓ понижение уровня на 1 (без подтверждения; короткое уведомление на 1 секунду).
function demoteLevel(id){
  const it=items.find(x=>x.id===id); if(!it) return;
  const b=normBox(it);
  const nb=Math.max(1, b-1);
  if(nb===b){ persist().then(()=>{ renderDict(); toastShort('Слово уже на минимальном уровне'); }); return; }
  it.box=nb; it.dueSess=0;
  persist().then(()=>{ renderDict(); toastShort('Уровень этого слова понижен'); });
}
// ↑ повышение уровня на 1 (без подтверждения; короткое уведомление на 1 секунду).
function promoteLevel(id){
  const it=items.find(x=>x.id===id); if(!it) return;
  const b=normBox(it);
  if(b>=5){ persist().then(()=>{ renderDict(); toastShort('Слово уже на высшем уровне'); }); return; }
  it.box=b+1; it.dueSess=0;
  persist().then(()=>{ renderDict(); toastShort('Уровень этого слова повышен'); });
}
function levelOf(it){ return normBox(it); }
// Месяц добавления карточки — для заголовков-групп в словаре.
// Точная метка addedAt есть у всех (нормализуется в normalizeAppItem), но на случай
// старых бэкапов делаем fallback на addedOn 'YYYY-MM-DD'.
function dictMonthDate(it){
  let d=null;
  const at=+it.addedAt||0;
  if(at>0){ d=new Date(at); if(!isNaN(d)) return d; }
  const m=/^(\d{4})-(\d{2})/.exec(String(it.addedOn||''));
  if(m){ d=new Date(+m[1], +m[2]-1, 1); if(!isNaN(d)) return d; }
  return null;
}
function dictMonthKey(it){
  const d=dictMonthDate(it);
  if(!d) return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function renderDict(){
  const list=document.getElementById('dictList');
  const arr=dictFiltered();
  updateChips();
  updateDictFilterChips();
  if(!arr.length){
    list.innerHTML='<div class="empty"><span class="big-ic">📭</span>Пока пусто.<br>Нажмите «＋ Слово», чтобы добавить первую карточку.</div>';
    return;
  }
  list.innerHTML=arr.map(it=>{
    const learned=isLearned(it);
    const statA='Уровень '+levelOf(it);
    const statB=learned ? 'Выучено' : ('Повторов '+(it.correct||0));
    return `<div class="card item-line" data-id="${it.id}">
      <div class="dict-card">
        <div class="dc-cols">
          <div class="dc zh">${escapeHtml(it.hanzi)}</div>
          <div class="dc py">${escapeHtml(it.pinyin||'')}</div>
          <div class="dc tr">${escapeHtml(trJoined(it)||'')}</div>
        </div>
        <div class="dc-side">
          <div class="dc-btns">
            <button class="icon-btn star ${it.starred?'starred':''}" data-act="star" title="Звезда">★</button>
            <button class="icon-btn" data-act="play" title="Произнести">🔊</button>
            <button class="icon-btn" data-act="write" title="Писать этот иероглиф/слово">✍️</button>
            <button class="icon-btn arrow" data-act="up" title="Повысить уровень">↑</button>
            <button class="icon-btn arrow" data-act="down" title="Понизить уровень">↓</button>
          </div>
          <div class="dc-stat"><span>${statA}</span><span>${statB}</span></div>
        </div>
      </div>
    </div>`;
  }).join('');
  // Подпись месяца на самой свежей карточке каждого месяца (слева над группой).
  // Порядок карточек не меняем — только вставляем заголовки между группами, если
  // встречаем новую метку месяца. Показываются и в поиске/фильтрах; у карточек без
  // даты addedOn/addedAt (старые бэкапы) заголовка нет.
  const MONTHS_RU=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const nowYear=new Date().getFullYear();
  let prevKey='';
  list.querySelectorAll('.item-line').forEach(row=>{
    const id=row.dataset.id;
    const it=items.find(x=>x.id===id);
    if(!it) return;
    // Добавляем заголовок, когда меняется месяц (а при первом — всегда)
    const curKey=dictMonthKey(it);
    if(curKey && curKey!==prevKey){
      prevKey=curKey;
      const d=dictMonthDate(it);
      const mName=MONTHS_RU[d.getMonth()];
      const label=(d.getFullYear()===nowYear)?mName:(mName+' '+d.getFullYear());
      row.insertAdjacentHTML('beforebegin', `<div class="dict-month">${escapeHtml(label)}</div>`);
    }
  });
  list.innerHTML+=`<button class="dict-up-fab hidden" id="dictUpFab" aria-label="Наверх"><svg viewBox="0 0 24 24"><path d="M12 5l6 7h-4v7h-4v-7H6z"/></svg></button>`;
  list.querySelectorAll('.item-line').forEach(el=>{
    const id=el.dataset.id;
    el.onclick=()=>openItemModal(id);
    el.querySelectorAll('[data-act]').forEach(b=>{
      b.onclick=(e)=>{ e.stopPropagation();
        const act=b.dataset.act;
        if(act==='star') toggleStar(id);
        else if(act==='play'){ const it=items.find(x=>x.id===id); if(it) playWordNorm(it); }
        else if(act==='up') promoteLevel(id);
        else if(act==='down') demoteLevel(id);
        else if(act==='write'){ const it=items.find(x=>x.id===id); if(it) go('scr-write', it); }
      };
    });
  });
  bindDictUpFab();
}
// Плавающая кнопка «Наверх» (П.4): появляется, когда 15-я карточка ушла за верх экрана.
// Стрелка прижата к правому краю содержимого словаря на уровне полосы прокрутки.
const DICT_UP_AFTER=15;
let _dictUpBound=false;
function bindDictUpFab(){
  const scr=document.getElementById('scr-dict'); if(!scr) return;
  if(_dictUpBound) return;
  _dictUpBound=true;
  scr.addEventListener('scroll', updateDictUpFab, {passive:true});
  const fab=document.getElementById('dictUpFab');
  if(fab) fab.onclick=()=>{ scr.scrollTo({top:0, behavior:'smooth'}); };
  updateDictUpFab();
}
function updateDictUpFab(){
  const scr=document.getElementById('scr-dict'); if(!scr) return;
  const fab=document.getElementById('dictUpFab'); if(!fab) return;
  const rows=scr.querySelectorAll('#dictList .item-line');
  if(rows.length<=DICT_UP_AFTER){ fab.classList.add('hidden'); return; }
  const ref=rows[DICT_UP_AFTER-1]; // 15-я карточка (счёт сверху вниз)
  const r=ref.getBoundingClientRect(), sr=scr.getBoundingClientRect();
  const aboveTop = r.bottom <= sr.top;       // целиком ушла за верх экрана
  // показываем, когда 15-я карточка именно «поднялась за верх» при скролле вниз
  fab.classList.toggle('hidden', !(aboveTop));
}

// ============================== ITEM MODAL ==============================
let editingItem=null;      // живой объект карточки (уже в items)
let isNewItem=false;       // черновик ещё не в items
function openItemModal(id){
  closeAllModals();
  isNewItem=false;
  editingItem = id ? items.find(x=>x.id===id) : null;
  if(!editingItem){
    isNewItem=true;
    editingItem={id:uid(),kind:'word',hanzi:'',pinyin:'',translation:'',note:'',tag:'',starred:false,recordings:[],box:1,dueSess:0,newDone:0,nsGood:0,nsStreak:0,nsSess:0,nsDoneSess:null,lastSeen:0,nextDue:0,correct:0,wrong:0,correctStreak:0,correctStreakDays:0,lastCorrectDay:'',learnedOn:'',addedOn:dayStr(),addedAt:newAddedAt(),lang:activeLang,updated_at:now(),prog_at:now()};
  }else{
    hydrateRecordings(editingItem);
  }
  const it=editingItem;
  const title=isNewItem?'Новая карточка':'Карточка';
  trRows=Math.min(5, Math.max(1, 1+(editingItem.trs||[]).filter(t=>String(t||'').trim()).length));
  dropPendingRec(); // новый вход в карточку — предыдущее несохранённое аудио сброшено
  const m=document.getElementById('modalItem');
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>${title}</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalItem')">✕</button></div>
    <label class="lbl">${hasStrokes()?'Китайский текст':'Слово'}</label>
    <input type="text" class="${hasStrokes()?'zh':''}" id="fHanzi" dir="${langInfo().rtl?'rtl':'auto'}" value="${escapeHtml(it.hanzi)}" placeholder="${hasStrokes()?'你好':'hello'}">
    ${hasStrokes()?`<label class="lbl">Пиньинь</label>
    <input type="text" id="fPinyin" value="${escapeHtml(it.pinyin||'')}" placeholder="nǐ hǎo">`:''}
    <div class="row" style="margin-top:6px">
      <label class="lbl" style="margin:0">Перевод</label><span class="spacer"></span>
      <a href="#" class="autolink" id="fAutoTr" onclick="event.preventDefault();autoTranslate()">Яндекс.Перевод</a>
    </div>
    <div id="trFields"></div>
    <label class="lbl">Метка / группа (необязательно)</label>
    <input type="text" id="fTag" value="${escapeHtml(it.tag||'')}" placeholder="HSK1, еда…">
    <label class="lbl">
      <span style="color:var(--amber)">★</span> Важное слово (звезда)
      <input type="checkbox" id="fStarred" ${it.starred?'checked':''} style="margin-left:6px; transform:scale(1.3)">
    </label>
    <label class="lbl">Аудио (MP3 с tts.wangwangit.com)</label>
    <div id="audioSlots"></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" id="btnSaveModal">Сохранить</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  m.querySelector('#btnSaveModal').onclick=saveItem;
  renderTrFields();
  renderSlots();
  // автопиньинь: при вводе китайского сразу подставляем пиньинь (можно поправить вручную)
  m.querySelector('#fHanzi').oninput=()=>{
    const h=m.querySelector('#fHanzi').value.trim();
    const p=m.querySelector('#fPinyin');
    if(p) p.value=toPinyin(h);
  };
  // Стабильный id — при создании новой карточки, как только введено слово (и до «Сохранить»).
  // Звук прикрепляется в текущей модалке по editingItem.id, поэтому важно обновить id ДО сохранения.
  const hz=m.querySelector('#fHanzi');
  hz.onchange=()=>{ if(isNewItem && hz.value.trim()) assignStableId(editingItem); };
}
// Альтернативные переводы: «Перевод», «Перевод 2» … «Перевод 5» (максимум 5 полей).
// «Перевод» имеет только плюс; «Перевод 2–4» — плюс и минус; «Перевод 5» — только минус.
// Хранится: it.translation (главный) + it.trs (массив альтернативных переводов).
let trRows=1; // сколько полей перевода видно в текущем модальном окне (1..5)
function trList(it){
  const out=[it.translation&&String(it.translation).trim()].filter(Boolean);
  for(const t of (it.trs||[])){ const v=t&&String(t).trim(); if(v) out.push(v); }
  return out;
}
// все заполненные переводы одной строкой через «/».
// «Все переводы» (examAllTr) теперь честно работает и вне Экзамена:
// выкл → только главный перевод, вкл → все переводы через «/».
function trJoined(it){
  const all=trList(it);
  if(!all.length) return '';
  return (examAllTr===false ? [all[0]] : all).join(' / ');
}
// заполненные переводы главный + альтернативные (внутренний массив окна)
function trValArr(it){
  const a=[String(it.translation||'').trim(), ...(it.trs||[]).map(t=>String(t||'').trim())];
  return a;
}
function renderTrFields(){
  const box=document.getElementById('trFields'); if(!box) return;
  const v=trValArr(editingItem);
  box.innerHTML='';
  for(let i=0;i<trRows;i++){
    const wrap=document.createElement('div');
    if(i>0){
      const lab=document.createElement('label');
      lab.className='lbl'; lab.style.margin='10px 0 5px';
      lab.textContent='Перевод '+(i+1);
      wrap.appendChild(lab);
    }
    const row=document.createElement('div');
    row.className='tr-row';
    const inp=document.createElement('input');
    inp.type='text'; inp.id='fTr'+i; inp.placeholder=i===0?'здравствуй':('доп. перевод '+(i+1)); inp.value=v[i]||'';
    row.appendChild(inp);
    if(i>0){ // «Перевод 2» и далее — с кнопкой минус
      const mn=document.createElement('button');
      mn.type='button'; mn.className='tr-btn minus'; mn.textContent='−'; mn.title='Удалить перевод';
      mn.onclick=()=>removeTrField(i);
      row.appendChild(mn);
    }
    if(i<4 && trRows<5){ // плюса нет только на «Перевод 5» (и когда максимум достигнут)
      const pl=document.createElement('button');
      pl.type='button'; pl.className='tr-btn'; pl.textContent='+'; pl.title='Добавить перевод';
      pl.onclick=()=>addTrField(i);
      row.appendChild(pl);
    }
    wrap.appendChild(row);
    box.appendChild(wrap);
  }
}
function addTrField(i){
  if(trRows>=5) return;
  flushTrInputs();      // сохраняем уже введённые переводы, чтобы они не стёрлись
  trRows++;
  renderTrFields();
  const inp=document.getElementById('fTr'+(i+1));
  if(inp) setTimeout(()=>inp.focus(),0);
}
function removeTrField(i){
  if(i===0) return;     // «Перевод» не удаляется — только поле номер удаляется вместе со значением
  flushTrInputs();
  const v=trValArr(editingItem);
  v.splice(i,1);        // убираем этот перевод; следующие сдвигаются вверх
  editingItem.translation=v[0]||'';
  editingItem.trs=v.slice(1);
  trRows=Math.max(1, trRows-1);
  renderTrFields();
}
// Читает текущие значения полей перевода и кладёт их в editingItem (перевод + trs),
// чтобы перерисовка полей (renderTrFields) не теряла уже введённый текст.
function flushTrInputs(){
  const a=[];
  for(let i=0;i<trRows;i++){
    const inp=document.getElementById('fTr'+i);
    a.push(inp?inp.value.trim():'');
  }
  editingItem.translation=a[0]||'';
  editingItem.trs=a.slice(1).filter(t=>t);
}
// Один аудио-файл на карточку (обычная скорость). Кнопка «Прикрепить аудио» — обычная btn,
// кликается целиком. Если файл прикреплён — строка с именем + ▶ (прослушать) и 🗑 (удалить).
function renderSlots(){
  const box=document.getElementById('audioSlots'); if(!box) return;
  const r=formRec('norm');
  if(r){
    box.innerHTML=`<div class="slot has">
      <span class="ic">🎧</span>
      <span class="nm">${escapeHtml(r.name||'файл')}</span>
      <button class="btn ghost" style="width:auto;font-size:14px" data-play="norm">▶</button>
      <button class="btn ghost" style="width:auto;font-size:14px" data-rm="norm">🗑</button>
    </div>
    <button class="btn sec" id="btnAddAudio" style="margin-top:8px">Заменить аудио</button>`;
  } else {
    box.innerHTML=`<button class="btn sec" id="btnAddAudio">＋ Прикрепить аудио</button>`;
  }
  box.querySelector('#btnAddAudio').onclick=()=>pickAudioForNext();
  box.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>playSlot(b.dataset.play));
  box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>rmSlot(b.dataset.rm));
}
// Прикрепляем файл к единственной (обычной) скорости.
function pickAudioForNext(){
  if(!editingItem) return;
  audioTargetSpeed='norm';
  document.getElementById('fileAudio').click();
}
function closeModal(id){
  const m=document.getElementById(id);
  if(id==='modalItem') dropPendingRec(); // закрыли без «Сохранить» — несохранённое аудио отброшено
  m.classList.add('hidden');
}
// Закрывает все модалки. Вызывается первой строкой в каждом открывателе,
// чтобы карточка/фильтр/список/вход никогда не ложились поверх друг друга.
function closeAllModals(){
  const item=document.getElementById('modalItem');
  if(item && !item.classList.contains('hidden')) dropPendingRec();
  document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
}
// Клик по затемнённому фону или Esc закрывает любую модалку
function bindModalDismiss(){
  document.querySelectorAll('.modal').forEach(m=>{
    m.addEventListener('pointerdown', e=>{ if(e.target===m) m.classList.add('hidden'); });
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape') document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
  });
}

// ============================== AUTO TRANSLATE ==============================
// При нажатии «Яндекс.Перевод» открываем translate.yandex.ru (zh→ru).
// Работает только если браузер откроет внешнее окно; т.к. сторонние сайты
// блокируют встраивание, всегда переключаемся на всплывающее окно,
// а в мобильном PWA/браузере — на вкладку, с которой пользователь
// вернётся и вставит перевод сам (может и исправить его в поле).
let trFallback=false;
function autoTranslate(){
  const link=document.getElementById('fAutoTr');
  const h=(document.getElementById('fHanzi').value||'').trim();
  if(!h){ toast('Сначала введите китайский текст'); return; }
  const provider=trFallback?'google':'yandex';
  const url= provider==='yandex'
    ? 'https://translate.yandex.ru/?source_lang=zh&target_lang=ru&text='+encodeURIComponent(h)
    : 'https://translate.google.com/?sl=zh-CN&tl=ru&text='+encodeURIComponent(h);
  let w=null;
  try{ w=window.open(url,'_blank','noopener'); }catch(e){ w=null; }
  if(!w || w.closed){
    // попап заблокирован или недоступен → переключаемся на запасной переводчик
    if(!trFallback){ trFallback=true; if(link) link.textContent='Перевести'; toast('Открою запасной переводчик'); autoTranslate(); }
    else toast('Не удалось открыть переводчик — вставьте перевод сами');
  }
}
async function playSlot(speed){
  const r=formRec(speed);
  if(r){
    if(!r.url && r.path){ await cacheRemoteAudio(editingItem, speed); return playSlotAfter(r); }
    if(r.url){ const a=new Audio(r.url); a.play(); return; }
  }
  const t=(editingItem&&editingItem.hanzi)||document.getElementById('fHanzi').value; if(t) speak(t,0.7);
}
function playSlotAfter(r){ if(r && r.url){ const a=new Audio(r.url); a.play(); } }
function rmSlot(speed){
  if(!editingItem) return;
  if(pendingRec[speed]){ URL.revokeObjectURL(pendingRec[speed].url); delete pendingRec[speed]; renderSlots(); return; }
  // удаление уже сохранённой записи — откладываем до «Сохранить» (память формы)
  pendingDrop[speed]=true;
  renderSlots();
}
async function saveItem(){
  if(!editingItem) return;
  const hanzi=document.getElementById('fHanzi').value.trim();
  if(!hanzi){ toast('Введите китайский текст'); return; }
  editingItem.hanzi=hanzi;
  editingItem.pinyin=(document.getElementById('fPinyin')?.value?.trim())||(hasStrokes()?toPinyin(hanzi):(editingItem.pinyin||''));
  const trs=[];
  for(let i=0;i<5;i++){
    const inp=document.getElementById('fTr'+i);
    const v=inp?inp.value.trim():'';
    if(i===0){ editingItem.translation=v; }
    else if(v){ trs.push(v); }
  }
  editingItem.trs=trs;
  editingItem.tag=document.getElementById('fTag').value.trim();
  editingItem.starred=document.getElementById('fStarred').checked;
  editingItem.kind='word';
  // Стабильный id для новых карточек (страховка, если onchange по полю слова не сработал —
  // например, автозаполнение). Один и тот же материал получит один id на любом устройстве.
  if(isNewItem && editingItem.hanzi.trim()) assignStableId(editingItem);
  // --- пишем в БД только при «Сохранить» (аудио из памяти формы + снятые записи) ---
  for(const s of AUDIO_SLOTS){
    const p=pendingRec[s];
    if(p){
      await DB.put('aud:'+editingItem.id+':'+s, {name:p.name, type:p.type, buf:p.buf});
      attachRecordingPersist(editingItem, s, p.name, p.type, p.buf);
    }
  }
  for(const s of Object.keys(pendingDrop)){
    const old=(editingItem.recordings||[]).find(r=>r.speed===s);
    if(old&&old.url) URL.revokeObjectURL(old.url);
    editingItem.recordings=(editingItem.recordings||[]).filter(r=>r.speed!==s);
    await DB.del('aud:'+editingItem.id+':'+s);
    // Фаза 6: снятую запись убираем и из облака (если вошли), чтобы не болтался осиротевший файл.
    removeAudioRemote(editingItem, s);
  }
  // Фаза 6: если вошли и онлайн — свежие mp3 сразу уходят в облако (иначе отложатся до «Синхронизировать»).
  if(_syncUser && sbReady()){
    for(const s of AUDIO_SLOTS){ if(pendingRec[s]) uploadAudio(editingItem, s).catch(()=>{}); }
  }
  if(isNewItem){ items.push(editingItem); isNewItem=false; }
  await persist();
  dropPendingRec();
  closeModal('modalItem');
  renderDict(); updateChips();
  toast('Сохранено');
}
// Заменяет запись в it.recordings на живую blob-ссылку (используется при «Сохранить» из pendingRec).
function attachRecordingPersist(it,speed,name,type,buf){
  it.recordings=it.recordings||[];
  const old=it.recordings.find(r=>r.speed===speed);
  if(old&&old.url) URL.revokeObjectURL(old.url);
  it.recordings=it.recordings.filter(r=>r.speed!==speed);
  it.recordings.push({speed, name, url:URL.createObjectURL(new Blob([buf],{type}))});
}

// ============================== BATCH MODAL ==============================
function openBatch(){
  closeAllModals();
  const m=document.getElementById('modalBatch');
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Добавить списком</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalBatch')">✕</button></div>
    <div style="font-size:13px;color:var(--mut);line-height:1.5;margin:8px 0">По одной записи на строку. Приложение само поймёт, где слово, пиньинь и перевод:<br>
      1) <b>特别 tèbié — особенный; особенно</b><br>
      2) <b>特别 — особенный; особенно</b> (пиньинь подставится сам)<br>
      3) <b>再见 ; zài jiàn ; до свидания</b> (старый формат)<br>
      « ; » делит переводы: первый — главный, остальные — «Перевод 2–5». Слово и перевод можно отделять « — », « - », « : », « , » или « ; ».
    </div>
    <textarea id="batchText" placeholder="特别 tèbié — особенный; особенно"></textarea>
    <div class="btn-row" style="margin-top:16px"><button class="btn ok" onclick="saveBatch()">Добавить</button></div>
  </div>`;
  m.classList.remove('hidden');
}
// Граница «слово ↔ перевод». Ищем САМОЕ ЛЕВОЕ вхождение любого разделителя:
// тире-семейство (— – ―), « - », «:», «,», «;» или таб. Слово в строке идёт первым,
// поэтому берём первый разделитель; всё, что правее, — переводы (их делим только по «;»).
// Дефис «-» учитываем только с пробелами (« - »), чтобы не резать слова типа T-shirt.
function batchBoundary(s){
  const seps=['—','–','―',' - ','\t',' : ',':',';',',','，'];
  let best=-1, len=0;
  for(const sep of seps){
    const i=s.indexOf(sep);
    if(i>=0 && (best<0 || i<best)){ best=i; len=sep.length; }
  }
  return best<0 ? null : {i:best, len};
}
function saveBatch(){
  const txt=document.getElementById('batchText').value;
  const kind='word';
  const zh=hasStrokes(); // китайский: иероглиф+пиньинь; иначе само слово — слово, пиньиня нет
  const CJK=/[㐀-䶿一-鿿豈-﫿]/;
  const LAT=/^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9]*$/; // латиница с тона́ми (пиньинь)
  let n=0;
  txt.split(/\n+/).forEach(line=>{
    line=line.trim(); if(!line) return;
    let hanzi='', pinyin='', tr='', trs=[];
    let left='', right='';

    if(zh){
      // Старый формат «再见 ; zài jiàn ; до свидания»: части отделяются только «;»
      const semi=line.split(/[;；]/).map(s=>s.trim()).filter(Boolean);
      if(semi.length>=3 && CJK.test(semi[0]) && /^[A-Za-zÀ-ɏ]/.test(semi[1]) && /^[A-Za-zÀ-ɏ0-9 ’'·\s]+$/.test(semi[1])){
        hanzi=semi[0]; pinyin=semi[1]; right=semi.slice(2).join('; ');
      }else{
        const b=batchBoundary(line);
        if(b){ left=line.slice(0,b.i).trim(); right=line.slice(b.i+b.len).trim(); }
        else { left=line; }
        // Раскладываем левую часть по скрипту: CJK→иероглиф, латиница→пиньинь.
        const hz=[], py=[];
        left.split(/\s+/).forEach(tok=>{
          if(!tok) return;
          if(CJK.test(tok)) hz.push(tok);
          else if(LAT.test(tok)) py.push(tok);
        });
        hanzi=hz.join('') || left;
        pinyin=py.join(' ');
      }
      if(!pinyin && hanzi) pinyin=toPinyin(hanzi);
    }else{
      // en/tr/ar: слово — это сам текст слева от разделителя; пиньиня нет
      const b=batchBoundary(line);
      if(b){ left=line.slice(0,b.i).trim(); right=line.slice(b.i+b.len).trim(); hanzi=left; }
      else { hanzi=line; }
      pinyin='';
    }

    // Переводы: «;» делит их — первая часть главный перевод, остальные «Перевод 2–5»
    const tparts=right.split(/[;；]/).map(s=>s.trim()).filter(Boolean);
    tr=tparts[0]||'';
    trs=tparts.slice(1,5); // максимум 4 дополнительных перевода
    if(!hanzi) return;
    const it={id:uid(),kind,hanzi,pinyin,translation:tr,trs,note:'',tag:'',starred:false,recordings:[],box:1,dueSess:0,newDone:0,nsGood:0,nsStreak:0,nsSess:0,nsDoneSess:null,lastSeen:0,nextDue:0,correct:0,wrong:0,correctStreak:0,correctStreakDays:0,lastCorrectDay:'',learnedOn:'',addedOn:dayStr(),addedAt:newAddedAt(),lang:activeLang,updated_at:now(),prog_at:now()};
    assignStableId(it);
    items.push(it);
    n++;
  });
  persist().then(()=>{ closeModal('modalBatch'); renderDict(); updateChips(); toast('Добавлено: '+n); });
}

// ============================== КЛЕТКА-НАПРАВЛЯЮЩАЯ ==============================
// Рисует под окном письма синюю пунктирную клетку (квадрат 9 зон) + серые точки-ориентиры,
// как в прописях для китайских иероглифов. Слой вставляется первым внутри контейнера;
// HanziWriter рисует поверх, поэтому сетка остаётся видимой через прозрачный фон.
function makeGuideSVG(size){
  const N=size||280;
  const step=N/8;
  const pts=[];
  for(let r=2;r<=6;r+=2){ for(let col=2;col<=6;col+=2){ pts.push([col*step, r*step]); } }
  const dots=pts.map(p=>`<circle class="gz-dot" cx="${p[0]}" cy="${p[1]}" r="1.6"></circle>`).join('');
  return `<svg width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
      <rect class="gz-outer" x="${step}" y="${step}" width="${N-2*step}" height="${N-2*step}"></rect>
      <line class="gz-mid" x1="${step}" y1="${N/2}" x2="${N-step}" y2="${N/2}"></line>
      <line class="gz-mid" x1="${N/2}" y1="${step}" x2="${N/2}" y2="${N-step}"></line>
      <line class="gz-diag" x1="${step}" y1="${step}" x2="${N-step}" y2="${N-step}"></line>
      <line class="gz-diag" x1="${step}" y1="${N-step}" x2="${N-step}" y2="${step}"></line>
      ${dots}
    </svg>`;
}
// Свободное рисование (когда у иероглифа нет данных начертания): палец/стилус/мышь
// рисуют по бледному контуру-подложке; при касании слово повторяется (как и в обычном письме).
function freeDraw(cv){
  const ctx=cv.getContext('2d');
  ctx.lineWidth=Math.max(6, cv.width*0.03);
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='#1d1c1a';
  let drawing=false, px=0, py=0;
  const pos=e=>{
    const r=cv.getBoundingClientRect();
    return [e.clientX-r.left, e.clientY-r.top];
  };
  const down=e=>{ drawing=true; [px,py]=pos(e); ctx.beginPath(); ctx.moveTo(px,py); e.preventDefault(); };
  const move=e=>{
    if(!drawing) return;
    [px,py]=pos(e);
    ctx.lineTo(px,py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px,py);
  };
  const up=()=>{ drawing=false; };
  cv.addEventListener('pointerdown',down);
  cv.addEventListener('pointermove',move);
  cv.addEventListener('pointerup',up);
  cv.addEventListener('pointerleave',up);
}
function attachGuide(el, size){
  // вставляет слой сетки первым; HanziWriter добавит svg поверх (z-index:1 у #writeArea svg)
  let g=el.querySelector('.hz-grid');
  if(!g){ g=document.createElement('div'); g.className='hz-grid'; g.setAttribute('aria-hidden','true'); el.insertBefore(g, el.firstChild); }
  size=size||Math.min(el.clientWidth||280, el.clientHeight||280);
  g.innerHTML=makeGuideSVG(size);
  if(g.firstElementChild){ g.firstElementChild.style.width='100%'; g.firstElementChild.style.height='100%'; }
  return g;
}

// ============================== STUDY ==============================
let studyQueue=[], studyIdx=0;
// Настройки показа в «Учить»: аудио (озвучка + автоповтор), пиньинь, перевод.
// Показ строк карточки в «Учить»: аудио, пиньинь, перевод, иероглиф.
// Размеры строк (mulH/mulP/mulT) регулируются ползунками здесь же, в модалке «Настройки режима».
let studyAudioOn=true, studyPyOn=true, studyTrOn=true, studyHanziOn=true;
// Порядок полей в модалке «Настройки режима Изучение»: Аудио, Иероглиф, Пиньинь, Перевод.
const STUDY_KEYS=[
  ['studyAudio','Аудио','🔊 озвучка + автоповтор', null],
  ['studyHanzi','Иероглиф','размер шрифта','mulH'],
  ['studyPy','Пиньин','размер шрифта','mulP'],
  ['studyTr','Перевод','размер шрифта','mulT'],
];
function applyStudyToggles(){
  const gear=document.getElementById('studySettingsBtn');
  if(gear) gear.classList.toggle('dim', !(studyAudioOn&&studyPyOn&&studyTrOn&&studyHanziOn));
  const hz=document.getElementById('studyHanzi'), py=document.getElementById('studyPinyin'), tr=document.getElementById('studyTr');
  if(hz) hz.style.display=studyHanziOn?'':'none';
  if(py) py.style.display=studyPyOn?'':'none';
  if(tr) tr.style.display=studyTrOn?'':'none';
  applyStudySizes();
  renderStudySettings();
}
function studyFlag(k){ return k==='studyAudio'?studyAudioOn:(k==='studyPy'?studyPyOn:(k==='studyTr'?studyTrOn:studyHanziOn)); }
function setStudyFlag(k,v){
  if(k==='studyAudio'){ studyAudioOn=v; settings.studyAudio=v; }
  else if(k==='studyPy'){ studyPyOn=v; settings.studyPy=v; }
  else if(k==='studyTr'){ studyTrOn=v; settings.studyTr=v; }
  else { studyHanziOn=v; settings.studyHanzi=v; }
  persist(); applyStudyToggles();
  if(k==='studyAudio'){ if(!v){ Player.stop(); speechSynthesis.cancel(); studyTouch(); } else { const it=studyQueue[studyIdx]; if(it) studyPlayLoop(it); } }
}
function openStudySettings(){
  closeAllModals();
  document.getElementById('modalStudySettings').classList.remove('hidden');
  renderStudySettings();
}
// ползунок размера: 50–200%, шаг 10; живёт в модалке и меняет mul* через applySizes()
function studySizeSliderHTML(skey){
  const cur=Math.round((settings[skey]||1)*100);
  return `<div class="sn-slider"><input type="range" min="50" max="200" step="10" value="${cur}" data-size-key="${skey}"><span class="sn-slider-val" data-val-key="${skey}">${cur}%</span></div>`;
}
function renderStudySettings(){
  const m=document.getElementById('modalStudySettings');
  if(!m || m.classList.contains('hidden')) return;
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Настройки режима Изучение</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalStudySettings')">✕</button></div>
    <div style="margin-top:6px">
    ${STUDY_KEYS.map(([key,label,hint,skey])=>{
      const v=studyFlag(key);
      return `<div class="sn-block">
        <div class="sn-row">
          <div><div style="font-weight:700">${label}</div><div style="font-size:12px;color:var(--mut);font-weight:400;margin-top:2px">${hint}</div></div>
          <button class="sn-switch ${v?'on':''}" data-study-key="${key}"></button>
        </div>
        ${skey?studySizeSliderHTML(skey):''}
        ${key==='studyAudio'?studyVoiceSelectHTML():''}
      </div>`;
    }).join('')}
    </div>
  </div>`;
  m.querySelectorAll('.sn-switch').forEach(b=>{
    b.onclick=()=>{ setStudyFlag(b.dataset.studyKey, !studyFlag(b.dataset.studyKey)); renderStudySettings(); };
  });
  bindStudyVoiceSel();
  m.querySelectorAll('input[type=range][data-size-key]').forEach(r=>{
    r.oninput=()=>{
      const k=r.dataset.sizeKey;
      const v=Math.round(Number(r.value));
      settings[k]=v/100; persist();
      applyStudySizes();
      const val=m.querySelector(`[data-val-key="${k}"]`); if(val) val.textContent=v+'%';
    };
  });
}
// Выбор голоса «Учить»: Google (сетевой, по умолчанию) или локальный голос устройства.
function studyVoiceSelectHTML(){
  const cur=settings.studyVoice||'google';
  const opts=['<option value="google"'+(cur==='google'?' selected':'')+'>Google (сетевой)</option>'];
  VOICES.forEach(v=>{
    opts.push('<option value="'+escapeHtml(v.voiceURI)+'"'+(cur===v.voiceURI?' selected':'')+'>'+escapeHtml(v.name+' ('+v.lang+')')+'</option>');
  });
  return `<div style="margin:8px 0 2px"><label style="font-size:12px;color:var(--mut)">Голос озвучки</label>
    <select id="studyVoiceSel" style="width:100%;margin-top:4px">${opts.join('')}</select></div>`;
}
function bindStudyVoiceSel(){
  const sel=document.getElementById('studyVoiceSel');
  if(!sel) return;
  sel.onchange=()=>{ settings.studyVoice=sel.value; persist(); };
}
function toggleStudyAudio(){ setStudyFlag('studyAudio', !studyAudioOn); }
function toggleStudyPy(){ setStudyFlag('studyPy', !studyPyOn); }
function toggleStudyTr(){ setStudyFlag('studyTr', !studyTrOn); }
function shuffle(a){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
// Приоритет: звёзды наверху; внутри — «давно не видел — первым» (меньше lastSeen первым).
function studyPool(){
  const due=filteredLangItems().filter(it=>it.translation && isDue(it));
  const seen=it=>(it.lastSeen||it.nextDue||0);
  return [].concat(
    due.filter(it=>it.starred).sort((a,b)=>seen(a)-seen(b)),
    due.filter(it=>!it.starred).sort((a,b)=>seen(a)-seen(b))
  );
}
function queueStudy(){
  const due=studyPool();
  const newW=due.filter(it=>isNewWord(it)).slice(0, SRS_NEW_PER_SESS); // лимит новых за сессию
  const oldW=due.filter(it=>!isNewWord(it));
  // 2 новых : 1 старое; если старых нет — новые подряд; если новых нет — цикл старых.
  const out=[]; let ni=0, oi=0;
  while(ni<newW.length || oi<oldW.length){
    if(ni<newW.length){ out.push(newW[ni++]); if(ni<newW.length) out.push(newW[ni++]); }
    if(oi<oldW.length){ out.push(oldW[oi++]); }
  }
  return out;
}
function buildStudyQueue(){
  const q=queueStudy(); return q.length?q:[];
}
function startStudy(){
  Player.stop();
  clearStudyIdle();
  applyStudyToggles();
  enterSession();
  resetStudyQueue();
}
// перестроить очередь БЕЗ открытия новой сессии (конец очереди → зацикливание)
function resetStudyQueue(){
  document.getElementById('studySpeed').textContent='';
  studyQueue=buildStudyQueue();
  studyIdx=0;
  const wrap=document.getElementById('studyWrap');
  const emp=document.getElementById('studyEmpty');
  if(!studyQueue.length){ wrap.classList.add('hidden'); emp.classList.remove('hidden'); return; }
  wrap.classList.remove('hidden'); emp.classList.add('hidden');
  showStudyCard();
}
function showStudyCard(){
  if(studyIdx>=studyQueue.length){ resetStudyQueue(); return; }
  const it=studyQueue[studyIdx];
  markShown(it);
  document.getElementById('studyProgress').textContent=(studyIdx+1)+' / '+studyQueue.length;
  const big=document.getElementById('studyHanzi');
  big.textContent=it.hanzi;
  // один класс на все случаи: точный размер задаёт applyStudySizes
  big.className='big';
  applyStudySizes();
  // строка статуса: уровень/повторы текущей карточки (компактно, вверху справа)
  const stLine=document.getElementById('studyStatusLine');
  const statusLine='Уровень '+levelOf(it)+(isLearned(it) ? ' · Выучено' : (' · Повторов '+(it.correct||0)));
  if(stLine) stLine.textContent=statusLine;
  // пиньинь и перевод видны сразу (и крупно); скрыты, если выключены в тулбаре
  document.getElementById('studyPinyin').textContent=it.pinyin||'';
  document.getElementById('studyTr').textContent=trJoined(it)||'';
  if(!studyAudioOn) document.getElementById('studySpeed').textContent='🔇';
  else studyPlayLoop(it);
}
// Точные размеры «Учить» при 100% (золотой стандарт, пользователь утвердил 05.10.26):
// телефон — иероглиф 100px / пиньинь 38px / перевод 27px;
// десктоп (≥1024px) — иероглиф 57px / пиньинь 29px / перевод 19px.
// Ползунок «Иероглиф/Пиньинь/Перевод» в модалке умножает базовое значение (mulH/mulP/mulT).
const STUDY_HZ_MOBILE=100, STUDY_HZ_DESKTOP=57;
const STUDY_PY_MOBILE=38, STUDY_PY_DESKTOP=29;
const STUDY_TR_MOBILE=27, STUDY_TR_DESKTOP=19;
const STUDY_SENT_RATIO=1;          // предложение: тот же размер, что стандарт
const STUDY_SENT_BREAK=5;         // порог: 1..4 иероглифа — стандарт, 5+ — предложение
const STUDY_SENT_MIN=0.52;        // предложение: нижняя граница масштаба (не сжимаем в ноль)
const STUDY_DECAY=0.05;           // предложение: насколько уменьшается масштаб за каждый знак сверх 2
function studyFonts(chars){
  const desktop=innerWidth>=1024;
  const sent=chars>=STUDY_SENT_BREAK;
  const mulH=settings.mulH||1, mulP=settings.mulP||1, mulT=settings.mulT||1;
  // Плавный масштаб по числу знаков (П.1 «правки 07.10.26 16.02» + «правки 07.10.26 23.33»):
  // 1–4 знака — полная база (один иероглиф такого же размера, как 2–3 знака),
  // 5+ плавно ужимается, у длинных фраз включается предложенческий режим.
  const cur = sent
    ? Math.max(STUDY_SENT_MIN, 1 - Math.max(0, chars-2) * STUDY_DECAY)
    : 1;
  const hz=(desktop?STUDY_HZ_DESKTOP:STUDY_HZ_MOBILE)*STUDY_SENT_RATIO*mulH*cur;
  const py=(desktop?STUDY_PY_DESKTOP:STUDY_PY_MOBILE)*mulP*Math.min(1, cur*1.05);
  const tr=(desktop?STUDY_TR_DESKTOP:STUDY_TR_MOBILE)*mulT*Math.min(1, cur*1.05);
  return {desktop, sent, hz, py, tr, cur};
}
function applyStudySizes(){
  const n=document.getElementById('studyHanzi'); if(!n) return;
  const f=studyFonts(Array.from((n.textContent||'')).length);
  n.style.fontSize = f.hz.toFixed(1)+'px';
  n.style.lineHeight = f.sent ? 1.4 : '';
  if(f.sent){ n.style.wordBreak='normal'; n.style.overflowWrap='anywhere'; } else { n.style.wordBreak='break-all'; n.style.overflowWrap=''; }
  const py=document.getElementById('studyPinyin');
  if(py) py.style.fontSize=f.py.toFixed(1)+'px';
  const tr=document.getElementById('studyTr');
  if(tr) tr.style.fontSize=f.tr.toFixed(1)+'px';
  const sz=document.getElementById('studySize');
  if(sz){
    const wpc=(f.hz/innerWidth*100).toFixed(1);
    sz.textContent='иер '+Math.round(f.hz)+'px ('+wpc+'% экрана) · пин '+Math.round(f.py)+'px · пер '+Math.round(f.tr)+'px';
  }
}
// Единый размер текста вопроса в «Экзамене» — тот же, что в «Учить» (иер/пин/пер).
function eqSizesStyle(hanzi, opts){
  const f=studyFonts(Array.from((hanzi||'')).length);
  const o=opts||{};
  const lines=[];
  if(o.word){
    lines.push('font-size:'+f.hz.toFixed(1)+'px');
    if(f.sent){ lines.push('line-height:1.4','word-break:normal','overflow-wrap:anywhere'); }
    else { lines.push('line-height:1.12','word-break:break-all'); }
  }
  if(o.py) lines.push('font-size:'+f.py.toFixed(1)+'px');
  if(o.tr) lines.push('font-size:'+f.tr.toFixed(1)+'px');
  return lines.join(';');
}
function updateStudySize(){
  applyStudySizes();   // строка размеров («иер px · пин px · пер px») обновляется вместе с размерами
}
// пересчитывать размеры при повороте/изменении ширины и после смены слайдеров
window.addEventListener('resize', ()=>{ if(document.getElementById('scr-study').classList.contains('active')) updateStudySize(); });
// --- Автоповтор озвучки в «Учить»: слово звучит при показе, затем повторяется
// всё время, пока пользователь активен на этой карточке (без лимита повторов).
// Останавливается только: действием пользователя (studyTouch), уходом с карточки,
// сменой режима (studyGen) или уходом в фон (visibilitychange → stopAllAudio).
// Отсчёт идёт от Player.onDone, поэтому повтор не стартует поверх ещё звучащей речи.
const STUDY_REPEAT_MAX=Infinity;           // повторять без ограничения (правки 07.10.26 23.33)
let studyRepeats=0, studyRepeatTmo=null, studyGen=0;
function studyRepeatDelay(text){
  // пауза: 2с + 350мс за символ, в границах 2.5с..7с
  const n=String(text||'').trim().length;
  return Math.max(2500, Math.min(7000, 2000+n*350));
}
// любое действие пользователя прерывает цепочку автоповторов текущего показа
function studyTouch(){ studyGen++; if(studyRepeatTmo){ clearTimeout(studyRepeatTmo); studyRepeatTmo=null; } }
function clearStudyIdle(){ if(studyRepeatTmo){ clearTimeout(studyRepeatTmo); studyRepeatTmo=null; } }
function studyPlayLoop(it){
  studyGen++; clearStudyIdle();
  studyRepeats=0;
  const my=studyGen;
  const step=()=>{
    if(!it) return;
    playItem(it, { onDone: ()=>{
      if(studyGen!==my) return;                          // действие пользователя или уход с карточки
      const scr=document.getElementById('scr-study');
      if(!scr || !scr.classList.contains('active')) return;
      const cur=studyQueue[studyIdx];
      if(!cur || cur.id!==it.id) return;                 // карточка сменилась
      if(!studyAudioOn) return;                          // выключили аудио — больше не повторяем
      studyRepeats++;
      studyRepeatTmo=setTimeout(()=>{
        if(studyGen!==my) return;
        const cur2=studyQueue[studyIdx];
        if(!cur2 || cur2.id!==it.id) return;
        Player.stop();
        step();
      }, studyRepeatDelay(it.hanzi));
    }});
  };
  step();
}
['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev, studyTouch, {passive:true}));
function studyNext(){
  studyTouch();
  if(document.getElementById('studySpeed')) document.getElementById('studySpeed').textContent='';
  const it=studyQueue[studyIdx]; if(!it) return;
  Player.stop();
  it.nextDue=now(); // пометим как просмотренный, чтобы не блокировало повторение
  touchStreak();
  logActivity();
  studyIdx++;
  showStudyCard();
  updateChips();
  persist();
}
function studyBack(){
  studyTouch();
  if(document.getElementById('studySpeed')) document.getElementById('studySpeed').textContent='';
  const it=studyQueue[studyIdx]; if(!it) return;
  Player.stop();
  if(studyIdx<=0){ resetStudyQueue(); return; }   // на первой карточке: круг по очереди, индекс не застревает
  studyIdx--;
  showStudyCard();
}
// --- результат ответа (общий для «Письма» и всех подрежимов «Экзамена») ---
// Верный ответ/написание → в следующую коробку. Ошибка → −2 коробки + повтор в текущей сессии.
function srsGood(it){
  it.correct=(it.correct||0)+1;
  it.wrongStreak=0;
  if(!it.newDone){ it.box=1; it.dueSess=(SESS||0)+BOX_INT[1]; } // новое: коробка 1, повтор через BOX_INT[1] сессий (не каждую)
  else {
    const b=normBox(it);
    if(b>=5){ it.dueSess=(SESS||0)+BOX_INT[5]; }         // коробка 5 — навсегда, раз в 8 сессий
    else if(it.dueSess && (SESS||0)<(+it.dueSess)){ /* ещё не пришло время — откладываем */ }
    else {
      it.box=Math.min(5, b+1);
      it.dueSess=(SESS||0)+BOX_INT[normBox(it)];
    }
  }
}
// общий счётчик «нового»: SRS_NEW_NEED верных ответов СУММАРНО — не обязательно подряд
// и не в рамках одной сессии. Ошибка счётчик не обнуляет, а просто не засчитывает показ.
// «Между показами было другое слово» гарантируется очередью (слово повторяется в тесте
// только после других показов); повторный зачёт того же показа срезаем по lastShowN.
function newGood(it){
  if(it.newDone) return;
  const myShow=it.lastShowN||0;
  if(it.nsLastGoodShow!=null && (myShow - it.nsLastGoodShow) <= 1) return; // тот же показ — между не было другого слова
  it.nsLastGoodShow=myShow;
  it.nsSess=(SESS||0);
  it.nsGood=(it.nsGood||0)+1;
  if(it.nsGood>=SRS_NEW_NEED){
    it.newDone=1;                                       // накоплено нужное число верных — «не новое»
    it.nsGood=0;
    it.box=Math.max(2, it.box||1);                      // покидает коробку 1 → коробка 2
    it.dueSess=(SESS||0)+BOX_INT[2];
    toast('✨ «'+it.hanzi+'» больше не новое');
  }
}
// Ошибка → слово откатывается на 2 коробки (или в 3 из 5) и показывается в текущей сессии.
function demoteBox(it){
  const b=normBox(it);
  if(b>=5){ it.box=3; it.dueSess=0; }                  // из коробки 5 — в коробку 3
  else if(b===4 || b===3){ it.box=b-2; it.dueSess=0; }  // 4→2, 3→1 (гарантирует повтор ниже)
  else if(b===2){ it.box=1; it.dueSess=0; }             // 2→1
  else { it.box=1; it.dueSess=0; }                      // 1→1
}
function srsBad(it){
  it.wrong=(it.wrong||0)+1;
  it.wrongStreak=(it.wrongStreak||0)+1;
  if(!it.newDone){
    // счётчик верных НЕ сбрасывается: ошибка просто не засчитывает текущий показ.
    if(it.nsDoneSess!=null){ it.nsDoneSess=null; }      // зачистка остатков старой схемы 3+3
  }
  demoteBox(it);
}
// Лёгкая ошибка (Верно-неверно / Подбор): как полная ошибка — влияет на коробку,
// статистику и коробку нового слова (его счётчик верных НЕ сбрасывает).
function srsBadSoft(it){
  srsBad(it);
}
// Верный ответ → следующую коробку + счётчик «нового» (как «Выбор ответов»).
function srsGoodSoft(it){
  it.correct=(it.correct||0)+1;
  it.wrongStreak=0;
  if(!it.newDone){ it.dueSess=(SESS||0)+BOX_INT[1]; return; } // новое: коробка 1, повтор через BOX_INT[1] сессий
  srsGood(it);
}
// Звёздочка всегда в очереди (не зависит от dueSess), поэтому dueSess=0 не мешает.
function isDue(it){ return it.starred || ((it.dueSess||0)<=(SESS||0)); }

// ============================== WRITING ==============================
// writeChars = китайские иероглифы текущего слова/предложения (по порядку, без знаков препинания)
// writeCharIdx = текущий индекс в writeChars (бесконечный цикл)
// Три переключателя сохраняют своё последнее состояние в settings
let writer=null, writeChars=[], writeCharIdx=0, writeCurItem=null;
let writeAudioOn=true, writeOutlineOn=true, writeAnimOn=false;
let writeAnimRunning=false, writeToken=0;
let writeSeq=[]; // упорядоченный список слов/предложений для письма (звёзды первыми; при «Рандом» — вразброс)

// Подсказка (слово над окном письма) и Назад/Вперёд: включение + ползунок размера (П.8/9 «22.26»).
function writeHintOn(){ return settings.writeHint!==false && settings.writeHint!=='off'; }
function writeHintMul(){ return (Number(settings.writeHintSize)||1); }
function writeNavMul(){ return (Number(settings.writeNavSize)||1); }
function writeRandOn(){ return settings.writeOrder==='rand'; }
function loadWritePrefs(){
  writeAudioOn=settings.writeAudio!==false;
  writeOutlineOn=settings.writeOutline!==false;
  writeAnimOn=!!settings.writeAnim;
}
function applyWriteToggles(){
  const b=(id,on)=>document.getElementById(id)&&document.getElementById(id).classList.toggle('on',on);
  b('writeAudio',writeAudioOn); b('writeOutline',writeOutlineOn); b('writeAnim',writeAnimOn);
  b('writeRand', writeRandOn());
  // размеры кнопок Назад/Вперёд и подсказки — CSS-переменные
  document.documentElement.style.setProperty('--wbtn', writeNavMul());
  document.documentElement.style.setProperty('--whint', writeHintMul());
  // языки без кисти (en/tr/ar): Контур и Анимация не имеют смысла — скрываем
  const hide=!hasStrokes();
  ['writeOutline','writeAnim'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display=hide?'none':'';
  });
}
function writableItems(){
  // языки без иероглифов (en/tr/ar): «Письмо» — это все карточки с переводом
  if(!hasStrokes()) return filteredLangItems().filter(it=>it.translation && trList(it).length);
  return filteredLangItems().filter(it=>/[一-鿿]/.test(it.hanzi) && !/[a-zA-Z0-9]/.test(it.hanzi));
}
function startWrite(focusIt){
  Player.stop();
  enterSession();
  loadWritePrefs(); applyWriteToggles();
  const all=writableItems();
  if(!all.length){
    document.getElementById('writeWord').innerHTML='';
    document.getElementById('writeArea').innerHTML='<div class="empty">Нет слов для письма.<br>Добавьте их в «Словаре».</div>';
    document.getElementById('writePy').textContent=''; document.getElementById('writeTr').textContent='';
    document.getElementById('writeList').innerHTML='';
    return;
  }
  // «✍️ Писать это» из «Учить»: сразу с этим словом, не с начала очереди
  const target=(focusIt && writableItems().find(x=>x.id===focusIt.id)) || null;
  // языки без кисти (en/tr/ar) — клавиатурный ввод целого слова
  if(!hasStrokes()){
    applyWriteToggles();
    rebuildWriteSeq();
    if(target) setWriteItemTyping(target, true);
    else if(writeCurItem && langOf(writeCurItem)===activeLang) setWriteItemTyping(writeCurItem, true);
    else setWriteItemTyping(all[0], true);
    return;
  }
  // самое последнее добавленное слово — первое в списке ниже
  rebuildWriteSeq();
  setWriteItem(target || writeSeq[0]);
}
function setWriteItem(it, keepIdx){
  if(!it) return;
  writeCurItem=it;
  markShown(it);
  writeChars=Array.from(it.hanzi).filter(c=>/[一-鿿]/.test(c));
  if(!writeChars.length) writeChars=Array.from(it.hanzi);
  writeCharIdx=keepIdx ? writeCharIdx : 0;
  if(writeCharIdx>=writeChars.length) writeCharIdx=0;
  writeToken++;
  startWriteChar();
}
function renderWriteWord(){
  const el=document.getElementById('writeWord');
  if(!writeChars.length || !writeHintOn()){ el.innerHTML=''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML=writeChars.map((c,i)=>`<span class="wch ${i===writeCharIdx?'cur':''}">${c}</span>`).join('');
}
// ===== ПИСЬМО: КЛАВИАТУРНЫЙ ВВОД (en/tr/ar — языки без кисти) =====
function writeTypeSeq(){ return writeSeq.length?writeSeq:writeWordList(); }
function setWriteItemTyping(it, speakNow){
  if(!it) return;
  writeCurItem=it;
  writeChars=Array.from(it.hanzi);
  markShown(it);
  writeToken++;
  const area=document.getElementById('writeArea');
  area.classList.add('type');
  const hintOn=writeHintOn();
  area.innerHTML=`<div class="type-card">
    <div id="writeTr" class="type-tr">${escapeHtml(trJoined(it))}</div>
    ${hintOn?`<div class="type-word ${eqWordClass(it.hanzi)}">${escapeHtml(it.hanzi)}</div>`:''}
    <input type="text" id="typeInput" class="type-in" dir="${langInfo().rtl?'rtl':'auto'}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${hintOn?'введите слово':'слово / фраза'}">
    <div><button class="btn type-btn" id="typeCheck">Проверить</button></div>
  </div>`;
  renderWriteList();
  renderTypeCardsHint();
  const inp=area.querySelector('#typeInput');
  inp.onkeydown=e=>{
    if(e.key==='Enter'){ e.preventDefault(); checkTyped(inp); }
    else { if(area._err){ area._err=''; area.animate([{opacity:1},{opacity:.75},{opacity:1}],{duration:140}); } }
  };
  area.querySelector('#typeCheck').onclick=()=>checkTyped(inp);
  if(speakNow!==false && writeAudioOn){ if(it.hanzi) speak(it.hanzi,1); }
  setTimeout(()=>{ try{ inp.focus(); }catch(e){} },0);
}
function typeNormalize(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
function checkTyped(inp){
  const it=writeCurItem; if(!it) return;
  const area=document.getElementById('writeArea');
  const val=typeNormalize(inp.value);
  const want=typeNormalize(it.hanzi);
  // арабский/турецкий: допускаем пропущенные диакритики в слове пользователя? нет — сравниваем
  // по нормализации (регистр/лишние пробелы); точное совпадение для всех языков
  if(val===want){
    good(it); newGood(it); persist(); updateChips();
    // автопиньинь ни при чём — сразу следующее слово
    writeNextTyping();
  }else{
    area._err=true;
    area.animate([{opacity:1},{opacity:.7},{opacity:1}],{duration:180});
    if(writeAudioOn && it.hanzi) speak(it.hanzi,1); // повторяем слово вслух
    inp.value='';
    setTimeout(()=>{ try{ inp.focus(); }catch(e){} },0);
  }
}
function renderTypeCardsHint(){
  const el=document.getElementById('writeWord');
  // в режиме печати подсказка-слово не нужна: слово уже целиком показано в карточке
  el.innerHTML=''; el.classList.add('hidden');
}
function writeNextTyping(){
  const btn=document.getElementById('writeNext'); // подсветим кнопку «Вперёд ▶», как в китайском режиме
  const L=writeTypeSeq(); if(!L.length) return;
  const i=L.findIndex(x=>x.id===writeCurItem.id);
  let nx=i<0?L[0]:(i>=L.length-1?L[0]:L[i+1]);
  if(i>=L.length-1){ rebuildWriteSeq(); }
  setWriteItemTyping(nx);
}
function renderWriteLabels(){
  const ch=writeChars[writeCharIdx];
  document.getElementById('writePy').textContent=ch?toPinyin(ch):'';
  document.getElementById('writeTr').textContent=(writeCurItem&&trJoined(writeCurItem))||'';
}
function renderWriteList(){
  const el=document.getElementById('writeList'); if(!el) return;
  // список ВСЕГДА в строгом порядке добавления (П.9), независимо от «Рандом» для прохождения
  const L=writeWordList();
  if(!L.length){ el.innerHTML=''; return; }
  // простой список слева направо, только китайский текст; текущее подсвечено
  el.innerHTML=L.map(it=>{
    const cur=writeCurItem && it.id===writeCurItem.id;
    return `<span class="wl-zh-pill ${cur?'cur':''}" data-id="${it.id}">${escapeHtml(it.hanzi)}</span>`;
  }).join('');
  el.querySelectorAll('.wl-zh-pill').forEach(pill=>{
    pill.onclick=()=>{ const it=items.find(x=>x.id===pill.dataset.id); if(it){ if(hasStrokes()) setWriteItem(it, false); else setWriteItemTyping(it, true); } };
  });
}
function writeGoto(idx){
  const n=writeChars.length; if(!n) return;
  writeCharIdx=((idx%n)+n)%n;
  startWriteChar();
}
function writeWordList(){
  // ВСЕ слова/предложения словаря строго в порядке добавления: чем позже добавлено —
  // тем выше (П.9 «правки 22.26»). Сортировка — по точному моменту добавления addedAt
  // (epoch-ms), как в словаре; при равенстве (одна партия) — более свежий id сверху.
  const list=writableItems().slice().sort((a,b)=>{
    return ((b.addedAt||0)-(a.addedAt||0)) || String(b.id||'').localeCompare(String(a.id||''));
  });
  return list;
}
function rebuildWriteSeq(){
  // Порядок прохождения «◀ Назад / Вперёд ▶»: при «Рандом» — перемешанный набор;
  // список под переводом при этом всегда остаётся строгим (П.9).
  writeSeq=writeWordList();
  if(writeRandOn()) shuffle(writeSeq);
}
function writePrev(){ // предыдущее слово/предложение (по списку ниже); внутри — к его ПЕРВОМУ иероглифу
  if(!hasStrokes()){ writeNavTyping(-1); return; }
  const L=writeSeq.length?writeSeq:writeWordList(); if(!L.length) return;
  let i=L.findIndex(x=>x.id===writeCurItem.id);
  i=(i<=0)?L.length-1:i-1;
  setWriteItem(L[i]);
}
function writeNext(){ // следующее слово/предложение; после последнего — снова первое
  if(!hasStrokes()){ writeNavTyping(1); return; }
  let L=writeSeq.length?writeSeq:writeWordList();
  if(!L.length) return;
  let i=L.findIndex(x=>x.id===writeCurItem.id);
  if(i<0){ setWriteItem(L[0]); return; }
  if(i>=L.length-1){ rebuildWriteSeq(); L=writeSeq; i=0; }  // конец — очередь зацикливается
  else i=i+1;
  setWriteItem(L[i]);
}
function writeNavTyping(dir){ // прокрутка слов в режиме печати (клавишный ввод)
  let L=writeTypeSeq(); if(!L.length) return;
  let i=L.findIndex(x=>x.id===writeCurItem.id);
  if(i<0){ setWriteItemTyping(L[0]); return; }
  if(dir<0){ i=(i<=0)?L.length-1:i-1; }
  else {
    if(i>=L.length-1){ rebuildWriteSeq(); L=writeTypeSeq(); i=0; }
    else i=i+1;
  }
  setWriteItemTyping(L[i]);
}

function stopWriteAnim(){ writeToken++; } // прерывает отложенную перестройку
// --- озвучка при возобновлении рисования после паузы ---
// слово целиком произносится сразу при появлении иероглифа; если пользователь бросил
// рисовать на 3 секунды и снова повёл пальцем/стилусом — слово повторяется.
let writeLastMove=0;
function writeSpeakWord(){
  if(!writeAudioOn) return;
  const full=(writeCurItem&&writeCurItem.hanzi)||writeChars.join('');
  if(full) speak(full,1);
}
function initWriteResume(){
  const area=document.getElementById('writeArea');
  if(!area || area._resumeBound) return;
  area._resumeBound=true;
  area.addEventListener('pointerdown',()=>{ writeLastMove=Date.now(); });
  area.addEventListener('pointermove',()=>{
    const t=Date.now();
    if(writeLastMove && (t-writeLastMove)>=3000) writeSpeakWord();
    writeLastMove=t;
  });
}
function startWriteChar(quiet){
  const token=++writeToken;
  writeAnimRunning=false;
  if(!writeChars.length) return;
  writeLastMove=0; initWriteResume();
  renderWriteWord(); renderWriteLabels(); renderWriteList();
  const area=document.getElementById('writeArea');
  area.classList.remove('type');
  const ch=writeChars[writeCharIdx];
  area.innerHTML=''; area.style.opacity='';
  writer=null;
  hwCharData(ch).then(async data=>{
    if(token!==writeToken) return;
    const size=Math.min(area.clientWidth||320, area.clientHeight||320);
    if(!data){
      // данных начертания нет ни во вшитых, ни в кэше, ни на CDN — свободное рисование
      // поверх бледного контура вместо «готового» знака, с пометкой пользователю
      attachGuide(area, size);
      const fb=document.createElement('div');
      fb.className='hz-fallback';
      fb.style.fontSize=(size*0.9)+'px';
      fb.textContent=ch;
      area.appendChild(fb);
      const cv=document.createElement('canvas');
      cv.className='hz-freedraw';
      cv.width=size; cv.height=size;
      area.appendChild(cv);
      const skip=document.createElement('button');
      skip.className='btn sec hz-skip'; skip.type='button'; skip.textContent='Дальше ▶';
      skip.onclick=()=>{ if(writeAnimRunning) return; blinkWriteArea(()=>writeGoto(writeCharIdx+1)); };
      area.appendChild(skip);
      freeDraw(cv);
      if(!quiet){ writeSpeakWord(); toast('Подключитесь к интернету, иероглиф недоступен'); }
      return;
    }
    // библиотека могла ещё не загрузиться (CDN подгружается асинхронно) — подождём её
    const hwOk=await ensureHanziWriter(3000);
    if(token!==writeToken) return;
    if(!hwOk){
      attachGuide(area, size);
      const fb=document.createElement('div');
      fb.className='hz-fallback';
      fb.style.fontSize=(size*0.9)+'px';
      fb.textContent=ch;
      area.appendChild(fb);
      const cv=document.createElement('canvas');
      cv.className='hz-freedraw';
      cv.width=size; cv.height=size;
      area.appendChild(cv);
      const skip=document.createElement('button');
      skip.className='btn sec hz-skip'; skip.type='button'; skip.textContent='Дальше ▶';
      skip.onclick=()=>{ if(writeAnimRunning) return; blinkWriteArea(()=>writeGoto(writeCharIdx+1)); };
      area.appendChild(skip);
      freeDraw(cv);
      if(!quiet){ writeSpeakWord(); toast('Подключитесь к интернету, иероглиф недоступен'); }
      return;
    }
    attachGuide(area, size);
    writer=HanziWriter.create(area,ch,{
      width:size,
      height:size,
      padding:4, strokeAnimationSpeed:1.05, delayBetweenStrokes:130,
      showOutline:writeOutlineOn,
      charDataLoader:(c,ok,err)=>ok(data)
    });
    startWriteQuiz();
    if(writeAnimOn) playWriteAnim();
    if(!quiet) writeSpeakWord();
  });
}
function startWriteQuiz(){
  if(!writer) return;
  // вид контура задаётся опцией showOutline при создании писателя;
  // quiz() сам не трогает слой контура, поэтому состояние сохраняется
  writer.quiz({
    onComplete:onCharComplete,
    showHintAfterMisses:settings.hint===0?1:(settings.hint||2)
  });
}
function onCharComplete(){
  if(writeAnimRunning) return;
  // слово засчитываем, когда дописан последний иероглиф целиком;
  // тогда верное написание идёт в общий счётчик «нового» и двигает коробку.
  const isLast=writeCharIdx>=writeChars.length-1;
  if(isLast && writeCurItem){ good(writeCurItem); newGood(writeCurItem); persist(); updateChips(); }
  blinkWriteArea(()=>{ writeGoto(writeCharIdx+1); });
}
function blinkWriteArea(done){
  const area=document.getElementById('writeArea');
  const seq=[0.25,1,0.25,1,0.25,1]; let i=0;
  const step=()=>{ if(i>=seq.length){ area.style.opacity=''; if(done) done(); return; } area.style.opacity=String(seq[i++]); setTimeout(step,140); };
  step();
}
function toggleWriteAudio(){
  writeAudioOn=!writeAudioOn;
  settings.writeAudio=writeAudioOn; persist();
  applyWriteToggles();
  if(!writeAudioOn){ if('speechSynthesis' in window) speechSynthesis.cancel(); }
  else { const full=(writeCurItem&&writeCurItem.hanzi)||writeChars.join(''); if(full) speak(full,1); }
}
function toggleWriteOutline(){
  writeOutlineOn=!writeOutlineOn;
  settings.writeOutline=writeOutlineOn; persist();
  applyWriteToggles();
  // пересоздаём писателя с новой опцией showOutline — гарантированно применяется
  startWriteChar(true);
}
function toggleWriteAnim(){
  writeAnimOn=!writeAnimOn;
  settings.writeAnim=writeAnimOn; persist();
  applyWriteToggles();
  if(writeAnimOn){ playWriteAnim(); }
  else { startWriteChar(); } // немедленное отключение: пересоздаём чистый контур
}
function toggleWriteRand(){
  // «Рандомно» в тулбаре Письма — тот же флаг, что и в настройках (Обычный/Рандом)
  settings.writeOrder = writeRandOn() ? 'seq' : 'rand';
  persist();
  applyWriteToggles();
  syncWriteOrderSeg();
  if(document.getElementById('scr-write').classList.contains('active')){
    rebuildWriteSeq();   // при включении — новый случайный порядок
    renderWriteList();
  }
}
function toggleWriteHint(){
  // Подсказка (слово над окном письма): вкл/выкл. Синхронизирует сегмент «Общие» и модалку Письма.
  settings.writeHint = writeHintOn() ? 'off' : 'on';
  persist();
  applyWriteToggles();
  syncWriteHintSeg();
  onWriteHintChange();
  renderWriteSettings();
}
function playWriteAnim(){
  if(!writer || writeAnimRunning) return;
  const ch=writeChars[writeCharIdx]; if(!ch) return;
  writeAnimRunning=true;
  writer.animateCharacter({onComplete:()=>{ writeAnimRunning=false; }});
}

// ---------- Шестерёнка «Письмо»: Контур / Рандом / Анимация / Аудио ----------
function openWriteSettings(){
  closeAllModals();
  document.getElementById('modalWriteSettings').classList.remove('hidden');
  renderWriteSettings();
}
function writeSizeSliderHTML(skey, cur, min, max, label){
  return `<div class="sn-slider"><span class="sn-slider-lab">${label}</span><input type="range" min="${min}" max="${max}" step="10" value="${cur}" data-wsize-key="${skey}"><span class="sn-slider-val" data-wsize-val="${skey}">${cur}%</span></div>`;
}
function renderWriteSettings(){
  const m=document.getElementById('modalWriteSettings');
  if(!m || m.classList.contains('hidden')) return;
  const rows=[
    ['Аудио','Озвучка слова/предложения','sn','writeAudio',writeAudioOn],
    ['Контур','Помогающая сетка и контур иероглифа','sn','writeOutline',writeOutlineOn],
    ['Рандом','Перемешивать порядок прохождения по словам','sn','writeRand',writeRandOn()]
  ];
  if(hasStrokes()) rows.splice(2,0,['Анимация','Показывать, как пишется иероглиф','sn','writeAnim',writeAnimOn]);
  else rows.splice(3,0,['Анимация','Показывать, как пишется иероглиф','sn','writeAnim',writeAnimOn]);
  const navPct=Math.round(writeNavMul()*100);
  const hintPct=Math.round(writeHintMul()*100);
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Настройки режима Письмо</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalWriteSettings')">✕</button></div>
    <div style="margin-top:6px">
    ${rows.map(([label,hint,type,key,v])=>{
      if(type==='sn') return `<div class="menu-item" data-write-key="${key}">
        <div class="mi-label">${label}<span class="mi-hint">${hint}</span></div>
        <button class="sn-switch ${v?'on':''}" data-write-key="${key}"></button>
      </div>`;
      return '';
    }).join('')}
      <div class="menu-item">
        <div class="mi-label">Кнопки Назад / Вперёд<span class="mi-hint">ползунок ниже меняет их размер</span></div>
      </div>
      ${writeSizeSliderHTML('writeNavSize', navPct, 70, 180, 'Размер кнопок')}
      <div class="menu-item">
        <div class="mi-label">Подсказка<span class="mi-hint">показывать слово над окном письма</span></div>
        <button class="sn-switch ${writeHintOn()?'on':''}" data-write-key="writeHint"></button>
      </div>
      ${writeSizeSliderHTML('writeHintSize', hintPct, 50, 160, 'Размер подсказки')}
    </div>
  </div>`;
  m.querySelectorAll('.sn-switch[data-write-key]').forEach(el=>{
    const k=el.dataset.writeKey;
    el.onclick=()=>{
      if(k==='writeOutline') toggleWriteOutline();
      else if(k==='writeRand') toggleWriteRand();
      else if(k==='writeAnim') toggleWriteAnim();
      else if(k==='writeAudio') toggleWriteAudio();
      else if(k==='writeHint') toggleWriteHint();
      renderWriteSettings();  // П.6: перерисовать переключатели, чтобы состояние мгновенно отразилось
    };
  });
  m.querySelectorAll('input[type=range][data-wsize-key]').forEach(r=>{
    r.oninput=()=>{
      const k=r.dataset.wsizeKey;
      const v=Math.round(Number(r.value));
      settings[k]=v/100; persist();
      applyWriteToggles();
      const val=m.querySelector(`[data-wsize-val="${k}"]`); if(val) val.textContent=v+'%';
    };
  });
}

// ============================== EXAM ==============================
// examSeq — упорядоченный поток заданий (слова с повтором по числу иероглифов в Письменно);
// каждый элемент: {it, mode:'tf'|'choice'|'write'|'match', charIdx?}
let examSeq=[], examIdx=0, examRight=0, examWrong=[];
let examSettings={tf:true, choice:true, choiceN:8, match:false};
let examAudioOn=true; // 🔊 Аудио в Экзамене (по умолчанию, как и в Письме)
let examAllTr=true;   // «Все переводы» — использовать альтернативные переводы в заданиях
let examIdleTimer=null, examCurrentIt=null, examLastMove=0;

// Случайный перевод слова для задания: либо главный, либо одна из альтернатив (если «Все переводы»).
function examPickTr(it){
  const all=trList(it);
  if(!all.length) return '';
  if(!examAllTr) return all[0];
  return all[Math.floor(Math.random()*all.length)];
}
function examChoiceN(){ return examSettings.choiceN||8; }
function examModes(){ return {tf:examSettings.tf, choice:examSettings.choice}; }
const EXAM_MIN_GAP=5; // слово нельзя повторить, пока не прошло 5 других заданий

// Поточное формирование заданий экзамена. Для каждого слова из очереди — по одному
// заданию на включённый подрежим (Выбор ответов / Верно-неверно), подрежимы чередуются.
// Правила выбора слова в каждом новом задании:
// 1) слово не повторяется дважды подряд (ни внутри подрежима, ни при переходе);
// 2) слово не возвращается, пока не прошло минимум 5 ДРУГИХ заданий (фильтр поверх
//    стратегии: если слово подходит по приоритету раньше — пропускается, берётся следующее);
// 3) если слов меньше 5 — отступ «по возможности»: сначала исключаются недавние повторы,
//    затем берётся то слово, которое «отдыхало» дольше всех.
function examBuildSeq(){
  const sep=examModes();
  const pool=queueStudy().filter(it=>it.translation);
  const modeOrder=[];
  if(sep.choice) modeOrder.push('choice');
  if(sep.tf) modeOrder.push('tf');
  if(!modeOrder.length || !pool.length) return [];
  const total=pool.length*modeOrder.length;
  const seq=[];
  const last={}; // id -> индекс задания, где слово показывалось в последний раз
  for(let t=0;t<total;t++){
    const mode=modeOrder[t%modeOrder.length];
    let pick=null, bestScore=-Infinity;
    for(let p=0;p<pool.length;p++){
      const cand=pool[p];
      const lastT=last[cand.id];
      const never=lastT===undefined;
      const gap=never?Infinity:(t-lastT-1);          // сколько заданий прошло после последнего показа
      const eligible=never || gap>=EXAM_MIN_GAP;
      const rest=never?(1000000-p):(t-lastT);        // отдохнул дольше = раньше в очереди
      const score=(eligible?1000000000:0)+rest;
      if(score>bestScore){ bestScore=score; pick=cand; }
    }
    if(!pick) break;
    last[pick.id]=t;
    seq.push({it:pick, mode});
  }
  return seq;
}
function startExam(){
  Player.stop();
  clearExamIdle();
  enterSession();
  examSeq=examBuildSeq();
  examIdx=0; examRight=0; examWrong=[]; examCurrentIt=null;
  document.getElementById('examEmpty').classList.toggle('hidden', examSeq.length>=4);
  if(examSeq.length<4){ document.getElementById('examBody').innerHTML=''; updateExamScore(); return; }
  updateExamScore();
  updateExamToggleUI();
  nextExamQ();
}
function updateExamScore(){
  document.getElementById('examProgress').textContent=(examIdx)+' / '+examSeq.length;
  document.getElementById('examScore').textContent='✓ '+examRight;
}
function updateExamToggleUI(){
  syncExamChoiceSeg();
}
function syncExamChoiceSeg(){
  const seg=document.getElementById('examChoiceSeg'); if(!seg) return;
  seg.querySelectorAll('button').forEach(b=>b.classList.toggle('active', +b.dataset.v===examChoiceN()));
}
// смена числа карточек 4-6-8-10: мгновенно перерисовать текущий вопрос, если это «Выбор ответов»
function examChoiceChanged(){
  settings.examChoiceN=examSettings.choiceN;
  syncExamChoiceSeg();
  const q=examSeq[examIdx];
  if(q && q.mode==='choice') renderExamChoice(q);
  persist();
}
function nextExamQ(){
  if(examIdx>=examSeq.length){ showExamResult(); return; }
  updateExamScore();
  const q=examSeq[examIdx];
  examCurrentIt=q.it;
  markShown(q.it);
  clearExamIdle(); examLastMove=0;
  if(q.mode==='tf') renderExamTF(q);
  else if(q.mode==='choice') renderExamChoice(q);
  else if(q.mode==='match'){ matchStart(); }
  else renderExamTF(q);
  // в «Подборе» на экране 5 слов сразу и озвучка по клику — фиксированный повтор не нужен
  if(q.mode!=='match') startExamRepeat(q.it);
}
function clearExamIdle(){
  if(examIdleTimer){ clearInterval(examIdleTimer); examIdleTimer=null; }
}
// Повтор озвучки в экзамене: слово звучало при показе, затем повторяется фиксированно
// каждые 7 секунд, пока вопрос на экране. Прекращается ответом, уходом с режима,
// сменой карточки (токен) или выключением «🔊 Аудио».
const EXAM_REPEAT_MS=7000;
let examRepeatGen=0;
function startExamRepeat(it){
  const my=++examRepeatGen;
  clearExamIdle();
  if(!examAudioOn) return;
  if(!it || !it.hanzi) return;
  examIdleTimer=setInterval(()=>{
    if(my!==examRepeatGen) return;                  // ответ/уход/смена вопроса
    const scr=document.getElementById('scr-exam');
    if(!scr || !scr.classList.contains('active')) return;
    if(!examAudioOn) return;
    if(examCurrentIt && examCurrentIt.id!==it.id) return;
    examSpeakWord(it);
  }, EXAM_REPEAT_MS);
}
// повтор слова целиком (обычный темп). Если у слова есть сохранённое mp3 (в том числе
// пришедшее из облака — подтягиваем его по path), играем файл; иначе синтез речи.
async function examSpeakWord(it){
  if(!examAudioOn) return;
  if(!it||!it.hanzi) return;
  await ensureCardAudio(it, ['norm']);
  const r=liveRec(it, 'norm');
  if(r && r.url){ Player.stop(); Player.play([{kind:'file',url:r.url,reps:1,label:'обычно'}], {gap:0}); }
  else speak(it.hanzi,1);
}
function toggleExamAudio(){
  examAudioOn=!examAudioOn;
  settings.examAudio=examAudioOn; persist();
  clearExamIdle();
  if(!examAudioOn){ if('speechSynthesis' in window) speechSynthesis.cancel(); }
  else { const it=examCurrentIt; if(it&&it.hanzi){ examSpeakWord(it); startExamRepeat(it); } }
}
function toggleExamAllTr(){
  examAllTr=!examAllTr;
  settings.examAllTr=examAllTr; persist();
}
function toggleExamMode(k){
  examSettings[k]=!examSettings[k];
  // хотя бы один режим должен оставаться включённым (иначе не из чего строить экзамен)
  if(!examSettings.tf && !examSettings.choice){ examSettings[k]=true; }
  settings.examTf=examSettings.tf; settings.examChoice=examSettings.choice;
  persist();
}
// ---------- Шестерёнка «Экзамен»: Верно-Неверно / Выбор ответов / 4-6-8-10 / Все переводы / Подбор / Аудио ----------
function openExamSettings(){
  closeAllModals();
  document.getElementById('modalExamSettings').classList.remove('hidden');
  renderExamSettings();
}
function renderExamSettings(){
  const m=document.getElementById('modalExamSettings');
  if(!m || m.classList.contains('hidden')) return;
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Настройки экзамена</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalExamSettings')">✕</button></div>
    <div style="margin-top:6px">
      <div class="menu-item">
        <div class="mi-label">Верно-неверно<span class="mi-hint">Показывать задания «Верно / Не верно»</span></div>
        <button class="sn-switch ${examSettings.tf?'on':''}" data-exam-key="tf"></button>
      </div>
      <div class="menu-item">
        <div class="mi-label">Выбор ответов<span class="mi-hint">Показывать задания с вариантами ответов</span></div>
        <button class="sn-switch ${examSettings.choice?'on':''}" data-exam-key="choice"></button>
      </div>
      <div class="menu-item">
        <div class="mi-label">Число вариантов<span class="mi-hint">Сколько карточек в «Выборе ответов»</span></div>
        <span class="seg sm" id="examChoiceSeg" style="flex:0 0 auto; margin-left:10px">
          <button data-v="4">4</button><button data-v="6">6</button>
          <button data-v="8" class="active">8</button><button data-v="10">10</button>
        </span>
      </div>
      <div class="menu-item">
        <div class="mi-label">Все переводы<span class="mi-hint">Использовать альтернативные переводы в заданиях</span></div>
        <button class="sn-switch ${examAllTr?'on':''}" data-exam-key="allTr"></button>
      </div>
      <div class="menu-item">
        <div class="mi-label">Подбор<span class="mi-hint">Игра: соединить иероглиф и перевод</span></div>
        <button class="btn sec sm" data-exam-key="match" style="width:auto">Играть</button>
      </div>
      <div class="menu-item">
        <div class="mi-label">Аудио<span class="mi-hint">Озвучка слов в заданиях</span></div>
        <button class="sn-switch ${examAudioOn?'on':''}" data-exam-key="audio"></button>
      </div>
    </div>
  </div>`;
  m.querySelectorAll('[data-exam-key]').forEach(el=>{
    el.onclick=()=>{
      const k=el.dataset.examKey;
      if(k==='tf'){ toggleExamMode('tf'); renderExamSettings(); }
      else if(k==='choice'){ toggleExamMode('choice'); renderExamSettings(); }
      else if(k==='allTr'){ toggleExamAllTr(); renderExamSettings(); }
      else if(k==='audio'){ toggleExamAudio(); renderExamSettings(); }
      else if(k==='match'){ closeModal('modalExamSettings'); matchStart(); }
    };
  });
  m.querySelectorAll('#examChoiceSeg button').forEach(b=>{
    b.classList.toggle('active', +b.dataset.v===examChoiceN());
    b.onclick=()=>{
      examSettings.choiceN=+b.dataset.v;
      examChoiceChanged();
      renderExamSettings();
    };
  });
}
// сбрасывает отсчёт бездействия на новое взаимодействие (касание/ответ/рисование)
function examTouch(){
  if(examIdleTimer) examLastMove=Date.now();
}
function examFinish(steps){
  // переход к следующему заданию (без повторов счёта); steps — сколько заданий уже посчитано внутри
  clearExamIdle();
  examIdx+=steps;
  touchStreak(); logActivity(); persist();
  updateExamScore();
  nextExamQ();
}
function flashBad(el, done){
  if(!el) return;
  el.classList.remove('bad'); void el.offsetWidth;
  el.classList.add('bad');
  // ошибку держим заметной дольше (1 сек), затем аккуратно снимаем подсветку
  setTimeout(()=>el.classList.remove('bad'), 1000);
  if(done) setTimeout(done, 1000);
}
function examAdv(){
  Player.stop();
  clearExamIdle();
  examIdx++;
  touchStreak(); logActivity(); persist();
  updateExamScore();
  nextExamQ();
}
function examMistakeSoft(it){  // Верно-неверно / Подбор: ошибка двигает коробку, но не сбрасывает счётчик «нового»
  Player.stop();
  if(it===examCurrentIt) examWrong.push(it);
  if(it!==writeCurItem){ examCurrentIt=it; }
  srsBadSoft(it);         // = srsBad: коробка −2 (счётчик «нового» не трогает)
  requeueExam(it);        // ошибка → слово повторяется в текущей сессии
  persist();
}
function examMistake(it){  // «Выбор ответов»: ошибка двигает коробку (счётчик «нового» не трогает)
  Player.stop();
  if(it===examCurrentIt) examWrong.push(it);
  wrong(it);
  requeueExam(it);        // ошибка → слово повторяется в текущей сессии
  persist();
}
function examCorrect(it){  // ВН/Подбор: двигают коробку И кормят счётчик «нового»
  Player.stop();
  examRight++;
  if(it!==writeCurItem){ examCurrentIt=it; }
  srsGoodSoft(it);
  newGood(it);
  persist();
}
function examCorrectCounted(it){  // «Выбор ответов»: кормим счётчик «нового»
  Player.stop();
  examRight++;
  good(it);
  newGood(it);
  if(isNewWord(it) && it.newDone) examDrop(it);
  persist();
}
// легковесные обёртки с семантикой «Письма» и «Экзамена»
function good(it){
  if(it!==writeCurItem){ examCurrentIt=it; }
  srsGood(it);
}
function wrong(it){
  if(it!==writeCurItem){ examCurrentIt=it; }
  srsBad(it);
}
// слово с ошибкой показывается ещё раз в текущей сессии, но НЕ сразу:
// повтор ставится в самый конец очереди, чтобы между показами прошли другие задания
// (правило «слово не показывается дважды подряд» + отступ).
function requeueExam(it){
  const modes=[];
  if(examSettings.choice) modes.push('choice');
  if(examSettings.tf) modes.push('tf');
  if(!modes.length) return;
  const mode=modes[Math.floor(Math.random()*modes.length)];
  examSeq.push({it, mode});
  updateExamScore();
}
// слово, ставшее НЕ-новым прямо в этой сессии, перестаёт щеголять «новеньким» приоритетом
function examDrop(it){
  for(let i=examIdx+1;i<examSeq.length;i++){
    if(examSeq[i].it===it){ examSeq.splice(i,1); i--; }
  }
  updateExamScore();
}

// ---------- Верно-неверно ----------
// Размер текста вопроса в экзамене по длине: 1 символ — крупно, 2–4 — средне,
// 5+ (предложение) — компактно, чтобы кнопки ответов всегда влезали в экран.
function eqWordClass(hanzi){
  const n=(hanzi||'').replace(/\s+/g,'').length;
  if(n<=1) return '';
  if(n<=4) return 'mid';
  return 'sent';
}
function renderExamTF(q){
  const it=q.it;
  const showOk=Math.random()<0.5;
  let tr=examPickTr(it);
  if(!showOk){
    const others=langItems().filter(x=>x.id!==it.id&&trList(x).length).map(x=>examPickTr(x));
    if(others.length) tr=others[Math.floor(Math.random()*others.length)];
  }
  const body=document.getElementById('examBody');
  body.innerHTML=`
    <div class="exam-q">
      <div class="eq-word" style="${eqSizesStyle(it.hanzi,{word:true})}">${escapeHtml(it.hanzi)}</div>
      <div class="exam-py" style="${eqSizesStyle(it.hanzi,{py:true})}">${escapeHtml(it.pinyin||pinyinOf(it)||'')}</div>
      <div class="eq-tr" style="${eqSizesStyle(it.hanzi,{tr:true})}">${escapeHtml(tr)}</div>
    </div>
    <div class="exam-spacer"></div>
    <div class="btn-col">
      <button class="btn ok" data-v="1">Верно</button>
      <button class="btn warn" data-v="0">Не верно</button>
    </div>`;
  body.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{
    examTouch();
    const taskOk=(b.dataset.v==='1')===showOk;
    if(taskOk){ examCorrect(it); examFinish(1); }
    else { examMistakeSoft(it); flashBad(b, ()=>examFinish(1)); }
  });
  examSpeakWord(it);
}

// ---------- Выбор ответов ----------
function renderExamChoice(q){
  const it=q.it;
  const body=document.getElementById('examBody');
  // вопрос один раз; число вариантов (4-6-8-10) меняется в шестерёнке → мгновенная перерисовка
  body.innerHTML=`
    <div class="exam-q" style="margin-bottom:14px">
      <div class="eq-word" style="${eqSizesStyle(it.hanzi,{word:true})}">${escapeHtml(it.hanzi)}</div>
    </div>
    <div class="exam-q" style="width:100%">
      <div id="examOpts" class="exam-opts"></div>
    </div>`;
  function drawOpts(N){
    const correct=examPickTr(it);
    const opts=[correct];
    const others=langItems().filter(x=>x.id!==it.id&&trList(x).length).map(x=>examPickTr(x));
    shuffle(others);
    for(const o of others){
      if(opts.length>=N) break;
      if(opts.includes(o) || trList(it).includes(o)) continue;
      opts.push(o);
    }
    while(opts.length<N) opts.push('—');
    shuffle(opts);
    const box=document.getElementById('examOpts');
    box.innerHTML='';
    opts.forEach(o=>{
      const b=document.createElement('button');
      b.className='btn sec exam-opt';
      const t=document.createElement('span');
      t.className='opt-txt';
      t.textContent=o;
      b.appendChild(t);
      b.onclick=()=>{
        examTouch();
        if(trList(it).includes(o)){ examCorrectCounted(it); examFinish(1); }
        else { examMistake(it); flashBad(b, ()=>examFinish(1)); }
      };
      box.appendChild(b);
    });
  }
  drawOpts(examChoiceN());
  examSpeakWord(it);
}
// ---------- Письменно: УБРАНО из экзамена (используется только отдельный режим «Письмо») ----------
function pinyinOf(it){ return it.pinyin || toPinyin(it.hanzi); }

// ---------- Подбор ----------
let matchRound=[], matchSelLeft=null, matchSelRight=null, matchSelRightEl=null;
function matchDeck(){
  // звёздные в первую очередь, всё в полном рандоме
  const star=filteredLangItems().filter(it=>it.translation&&it.starred);
  const rest=filteredLangItems().filter(it=>it.translation&&!it.starred);
  return shuffle(star).concat(shuffle(rest));
}
function matchDraw(arr, n){
  const out=[]; const seen=new Set();
  const src=[...arr];
  while(out.length<n && src.length){
    const i=Math.floor(Math.random()*src.length);
    const it=src[i];
    if(!seen.has(it.id)){ seen.add(it.id); out.push(it); }
    src.splice(i,1);
  }
  return out;
}
function matchStart(){
  Player.stop();
  // П.11: в «Подборе» не должно работать 7-секундное повторение озвучки экзамена
  clearExamIdle();
  if('speechSynthesis' in window) speechSynthesis.cancel();
  matchRound=[]; matchSelLeft=null; matchSelRight=null; matchSelRightEl=null;
  matchNextRound();
  if(examAudioOn && matchRound.length && matchRound[0]) examSpeakWord(matchRound[0]);
}
function matchNextRound(){
  const deck=matchDeck();
  const need=5;
  if(deck.length<2){
    document.getElementById('examBody').innerHTML='<div class="empty">Для подбора нужно хотя бы 2 слова.</div>';
    return;
  }
  matchRound=matchDraw(deck, Math.min(need, deck.length));
  matchSelLeft=null; matchSelRight=null; matchSelRightEl=null;
  matchRound.forEach(it=>markShown(it)); // каждое слово раунда — отдельный «показ» (для счётчика «нового»)
  renderMatch();
}
function renderMatch(){
  const left=shuffle([...matchRound]);
  const right=shuffle([...matchRound]);
  const body=document.getElementById('examBody');
  body.innerHTML=`
    <div class="match-cols">
      <div class="match-col" id="matchLeft">${left.map(it=>`<button class="btn sec match-pair ${eqWordClass(it.hanzi)}" data-id="${it.id}">${escapeHtml(it.hanzi)}</button>`).join('')}</div>
      <div class="match-col" id="matchRight">${right.map(it=>{const t=examPickTr(it);return `<button class="btn sec match-pair match-txt ${eqWordClass(t)}" data-id="${it.id}">${escapeHtml(t)}</button>`;}).join('')}</div>
    </div>
    <button class="btn" id="matchDone" style="width:100%; margin-top:12px">Завершить подбор</button>`;
  document.querySelectorAll('#matchLeft button').forEach(b=>{
    b.onclick=()=>matchPickLeft(b.dataset.id, b);
  });
  document.querySelectorAll('#matchRight button').forEach(b=>{
    b.onclick=()=>matchPickRight(b.dataset.id, b);
  });
  document.getElementById('matchDone').onclick=examReturnToExam;
}
function matchPair(id, side){
  const el=document.querySelector(`#match${side} button[data-id="${id}"]`);
  return el;
}
function matchPickLeft(id, btn){
  if(btn.classList.contains('done')) return;
  if(matchSelRight===id){ // справа уже выбран этот же иероглиф → верная пара в обратном порядке
    const rightBtn=matchSelRightEl;
    const it=matchRound.find(x=>x.id===id);
    if(it) examSpeakWord(it);
    matchDone(btn, rightBtn, id);
    return;
  }
  matchSelLeft=id; matchSelRight=null; matchSelRightEl=null;
  document.querySelectorAll('#matchLeft button').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('#matchRight button').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  // клик по иероглифу слева сразу озвучивает его (если «Аудио» включено)
  const it=matchRound.find(x=>x.id===id);
  if(it) examSpeakWord(it);
}
function matchPickRight(id, btn){
  if(matchSelLeft){ // выбран иероглиф слева → проверяем пару
    const leftBtn=matchPair(matchSelLeft,'Left');
    if(matchSelLeft===id){
      matchDone(leftBtn, btn, id);
    }else{
      // ошибка — красная вспышка + тряска (коробка −2)
      flashBad(btn);
      flashBad(leftBtn);
      matchSelLeft=null;
      const it=matchRound.find(x=>x.id===id);
      if(it){ srsBadSoft(it); }
      persist();
    }
    return;
  }
  // левый не выбран — запоминаем перевод как «левый по выбору» (пара в любом порядке)
  matchSelRight=id; matchSelRightEl=btn; matchSelLeft=null;
  document.querySelectorAll('#matchLeft button').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('#matchRight button').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}
function matchDone(leftBtn, rightBtn, id){
  leftBtn.classList.remove('sel');
  rightBtn.classList.remove('sel');
  leftBtn.classList.add('done'); leftBtn.disabled=true;
  rightBtn.classList.add('done'); rightBtn.disabled=true;
  matchSelLeft=null; matchSelRight=null; matchSelRightEl=null;
  const it=matchRound.find(x=>x.id===id);
  if(it){ examRight++; touchStreak(); logActivity(); updateExamScore(); srsGoodSoft(it); newGood(it); }
  persist();
  if(document.querySelectorAll('#matchLeft button:not(.done)').length===0){
    // раунд угадан — новая пятёрка
    setTimeout(matchNextRound, 450);
  }
}
function examReturnToExam(){
  Player.stop();
  // «Завершить» возвращает из подбора в обычный экзамен (следующее задание)
  examAdv();
}

// ---------- Результат ----------
function showExamResult(){
  clearExamIdle();
  const body=document.getElementById('examBody');
  const total=examSeq.length;
  const pct=total?Math.round(examRight/total*100):0;
  body.innerHTML=`
    <div class="card" style="text-align:center">
      <div style="font-size:44px">🎓</div>
      <div class="num" style="font-size:40px;font-weight:800;color:var(--red)">${examRight} / ${total}</div>
      <div class="lbl" style="color:var(--mut)">правильно · ${pct}%</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" id="examRetake">🔁 Начать экзамен заново</button>
        <button class="btn sec" id="examReview">📖 Перейти в режим «Учить»</button>
      </div>
      <button class="btn ghost" style="margin-top:6px" onclick="go('scr-more')">К статистике</button>
    </div>
    <h3 style="margin:14px 0 8px">Ошибки</h3>
    <div>${examWrong.length?'':'<div class="empty" style="padding:10px">Ошибок нет — отлично! 🎉</div>'}${examWrong.map(it=>`
      <div class="card item-line">
        <div class="row"><div class="zh" style="font-size:22px">${escapeHtml(it.hanzi)}</div><div class="spacer"></div></div>
        <div class="row" style="margin-top:3px"><span class="py">${escapeHtml(it.pinyin||'')}</span><span class="spacer"></span><span class="tr">${escapeHtml(it.translation||'')}</span></div>
      </div>`).join('')}
    </div>`;
  document.getElementById('examProgress').textContent=total+' / '+total;
  document.getElementById('examRetake').onclick=startExam;
  document.getElementById('examReview').onclick=()=>go('scr-study');
}

// ============================== STATS / MORE ==============================
function updateChips(){
  const learned=langItems().filter(isLearned).length;
  const lb=document.getElementById('dictFilterLearned');
  if(lb) lb.innerHTML='<b>'+learned+'</b> выучено';
}

// ---------- История версий ----------
const VERSIONS=[
  ['1.8.24','09.10.26','Словарь: карточки сгруппированы по месяцам (заголовок «Октябрь» слева над самой свежей карточкой месяца, у старых лет добавляется год); включённый фильтр словаря теперь ограничивает и режимы «Учить»/«Письмо»/«Экзамен» (добавлен фильтр «Этот месяц»/«Прошлый месяц», в режимах — метка «Фильтр: N сл.», сброс возвращает полную колоду); вход в аккаунт: после «Отправить ссылку» поля заменяются подсказкой «Проверьте почту» и кнопкой «Готово»'],
  ['1.8.23','09.10.26','Пакетный ввод: умный разбор строки — поля определяются по типу символов (иероглиф → слово, латиница → пиньинь, кириллица → перевод), разделители «—»/«:»/«;» распознаются в любом порядке; переводы после «;» раскладываются по отдельным полям «Другие переводы»'],
  ['1.8.22','08.10.26','Значки: шестерёнка «Учить» и луна темы — материальные SVG; аудио грузится быстрее (таймаут 1,5 с) и работает офлайн — mp3 кэшируется в service worker; повтор звука без лимита с обрывом при действии; вернулась строка размеров; короткие слова крупнее; «Писать это» ставит ★; смена режима мгновенно гасит звук; выбор голоса в «Учить» (Google-сетевой / локальный голос); Мятная тема заменена на Синюю'],
  ['1.8.21','07.10.26','Режим «Учить»: компактные кнопки Назад/Писать это/Вперёд, лёгкая шестерёнка в строке статуса («1 / 204» → «Номер / Всего» + «Уровень N · Повторов M»), размер шрифта плавно подстраивается под длину текста (одиночный знак больше не вымахивает); арабский: огласовки (фатха/касра/дамма и др.) теперь сохраняются и различают карточки (раньше вычищались и склеивались), поиск их учитывает; TTS-фолбэк: арабская озвучка работает на компьютере без локального голоса — mp3 с Google translate_tts (прямой <audio>, meta referrer=no-referrer, т.к. сервис отдаёт 404 при чужом Referer)'],
  ['1.8.20','07.10.26','Аудио: ссылка на mp3 теперь доставляется в облако при любом исходе синхронизации (раньше при «вытащил из облака»/конфликте path снова оставался null, и другие устройства играли синтез речи); pull больше не стирает локальную ссылку на файл; если облако уже знает path, а устройство нет — ссылка перенимается молча и mp3 докачивается'],
  ['1.8.19','07.10.26','Аудио: исправлена доставка ссылки на mp3 в облако — после выгрузки файла приложение само отправляет path карточке (раньше он оставался null и другие устройства играли синтез речи вместо записи); теперь mp3 из «Базы аудио» звучит на всех устройствах после синхронизации'],
  ['1.8.18','07.10.26','Аудио: после синхронизации приложение само докачивает mp3 из облака (одинаковая «База аудио» на всех устройствах, звук сразу в карточке); кнопки «Назад» в «Учить» больше не «проглатываются» на тач-экране (при нажатии кнопка не сдвигается под пальцем + touch-action:manipulation); «Назад» на первой карточке корректно уходит по кругу очереди; в репозитории — SQL-чинка SELECT-политики bucket `recordings` (создание подписанной ссылки исправно работает)'],
  ['1.8.17','06.10.26','«Учить»: под размерами — строка «Уровень N . Повторов M» текущей карточки; три кнопки в ряд Назад/Писать это/Вперёд (25% / 25% / 50% ширины); «Письмо»: список слов строго по моменту добавления (свежее сверху); аудио на чужих устройствах — подписанный URL как запасной путь, если bucket остался приватным'],
  ['1.8.16','06.10.26','Кэш-бастер версии: service worker теперь всегда забирает свежий index.html (обновления видны без чистки кэша), а имя кэша привязано к версии; исправлено проигрывание mp3 на других устройствах — режимы «Учить» и «Экзамен» теперь подтягивают аудио из облака и играют файл вместо синтеза речи'],
  ['1.8.15','05.10.26','Словарь: строгий порядок слов по времени добавления (каждое новое слово — в самый верх; у карточек появилась точная метка момента добавления, у старых она восстанавливается из id/дня добавления); на компьютере статус карточки теперь одной строкой «Уровень N. Повторов M.», на телефоне остаются две строки'],
  ['1.8.14','05.10.26','Исправлена ошибка синхронизации, появившаяся в 1.8.13: при записи в облако поднималась скрытая ошибка «Assignment to constant variable» и синхронизация падала на любом устройстве; восстановление карточки из облака теперь не ломается на строке без данных'],
  ['1.8.13','05.10.26','Дедупликация карточек: одинаковый материал (язык + слово) больше не плодится — новые карточки получают стабильный id из слова, поэтому дубли не рождаются при повторном добавлении/стартовом наборе; при старте и при синхронизации одинаковые карточки склеиваются (прогресс объединяется максимумами), а лишние облачные строки удаляются — уже удвоенная база сама складывается в один экземпляр на первом же синке'],
  ['1.8.12','05.10.26','Исправлена потеря статистики после чистки кэша: пустая статистика/настройки больше не получают метку «сейчас», поэтому не побеждали реальную историю в синхронизации; облачная история восстанавливается поверх затёртых пустышек; флажки языков в настройках теперь рисуются инлайн-SVG и видны на Windows (раньше эмодзи-флаги пропадали)'],
  ['1.8.11','05.10.26','Режим «Экзамен» теперь показывает вопрос теми же размерами, что «Учить» (иероглиф/пиньинь/перевод — один источник, ползунки «Учить» действуют и в экзамене); service worker обновлён: index.html всегда берётся из сети, поэтому новые версии больше не «застревают» в кэше браузера'],
  ['1.8.10','05.10.26','«Учить» — ползунки размера теперь отсчитываются от золотого стандарта: на десктопе 100% = иероглиф 57px / пиньинь 29px / перевод 19px (телефон 100/38/27), а у тех, кто раньше держал 60/60/70, ползунки один раз сами встали на 100% — крутить вручную не нужно'],
  ['1.8.9','04.10.26','Размеры «Учить» подобраны под ноутбук 14″: главный иероглиф 95px / пиньинь 49px / перевод 27px на десктопе (телефон 100/38/27), предложения — тот же размер, что стандарт (убрано уменьшение до ~72%)'],
  ['1.8.8','04.10.26','Правки от 04.10.26 22:26: в «Учить» — главный иероглиф 100/134px, пиньинь 38/52px, перевод 28px (предложения ~72%), модалка «Настройки режима Изучение» с порядком Аудио→Иероглиф→Пиньинь→Перевод и подписями; в «Словаре» — «Уровень N / Повторов M» в 2 строки на телефоне, плавающая стрелка «Наверх» для длинных списков, перевод чёрный жирный; в «Письме» — переключатели Контур/Аудио/Анимация/Рандом (Анимация выкл по умолчанию), «Настройки режима Письмо», Назад/Вперед по краям с ползунком размера, шестерёнка справа от «Вперед», компактная подсказка с переключателем и ползунком, убрана строка с иероглифом и переводом между кнопками, список слов строго по порядку добавления (свежие первыми); в «Экзамене» — шестерёнка справа, переключатели перерисовываются сразу, в «Подборе» нет 7-сек повтора озвучки экзамена и карточки одной высоты; на «Ещё → Синхронизация» журнал обновляется сразу после синка, а «Новое имя этого устройства» задаёт имя для будущих записей журнала'],
  ['1.8.7','04.10.26','В «Учить» под карточкой — размеры иероглифа / пиньиня / перевода в пикселях и процентах; модалка шестерёнки переименована в «Настройки режима» и получила ползунки размера (50–200%, шаг 10) под «Пиньин», «Перевод» и новое поле «Иероглиф» с переключателем; шестерёнка — заливной классический значок; дубли сегментов размера из общих «Настроек» убраны'],
  ['1.8.6','04.10.26','Большие правки удобства: главный иероглиф/слово в «Учить» — 100px на телефоне и 140px на десктопе (предложения остаются компактными); шестерёнка настроек — у «Учить» янтарная, у «Экзамена» и «Письма» своя справа сверху (меню: Верно-неверно, Выбор ответов, 4-6-8-10, Все переводы, Подбор, Аудио / Контур, Рандом, Анимация, Аудио); убран дубль кнопок 4-6-8-10; в «Письме» под переводом — список всех слов в порядке добавления; в «Словаре» новая кнопка ✍️ «писать это слово», кнопка «Наверх» в конце списка и карточка в 3 колонки с рядом ★ 🔊 ✍️ ↑ ↓ и статусом справа («Уровень N. Повторов M» / «Уровень 5. Выучено»); скролл нигде не заезжает под нижнее меню; у конфликтов синхронизации показываются только 2 самые свежие карточки, а при явно свежих данных на одной стороне загрузка происходит автоматически; исправлена ошибка запуска после удаления старого тулбара экзамена'],
  ['1.8.5','04.10.26','Длинные слова и предложения больше не выталкивают кнопки за экран и не прячутся под ними ни в одном режиме: размер текста подбирается по длине (1 символ крупно, 2–4 средне, предложение компактно) — в «Экзамене», «Учить», письме-печати и «Подборе»; зона вопроса/подбора прокручивается, когда контент выше экрана'],
  ['1.8.4','03.10.26','Синхронизация прогресса больше не застревает в конфликтах: SRS (уровни, ответы) сливается автоматически по свежести таймстампа (новее всегда побеждает), экран «Конфликты» показывается только для контента (слова/переводы/аудио)'],
  ['1.8.3','03.10.26','Окно конфликтов синхронизации: кнопки «Локально»/«Облако» подсвечиваются при выборе, «Применить» прикреплена к низу и видна всегда. Экзамен → Выбор ответов: кнопки теперь строго 2 в ряд на всю ширину экрана (раньше блок сжимался до ширины содержимого, и короткие слова давали мелкие кнопки) и выше на 30%'],
  ['1.8.2','03.10.26','Вкладка «Ещё → Синхронизация»: агрегат облака и журнал синхронизаций (таблица sync_log). Правки: конфликт при одинаково свежих версиях больше не блокирует синк — побеждает облако; автосинхронизация отключена (только кнопка «Синхронизировать»); 4 цветовые гаммы (Светлая/Тёмная/Песочная/Мятная) с быстрым переключателем в шапке и выбором в Настройках; шестерёнка в «Учить» — аккуратная SVG-иконка; кнопки экспорта/импорта подписаны «все языки»; «Верно/Не верно» прижаты к низу, как в «Учить»'],
  ['1.8.1','03.10.26','Словарь — стрелки ↑↓ жирнее и контрастнее; Экзамен «Верно-неверно» — кнопки Верно/Не верно прижаты к низу экрана (как в «Учить»); экран конфликтов синхронизации переделан: выбор стороны теперь глобальный по частям «Контент» и «Прогресс» (не на каждое слово), внизу — список-справка с датами изменения обеих версий и подсветкой более свежей'],
  ['1.8.0','03.10.26','Фаза 8 — защита от затирания свежих данных: карточка разделена на контент и прогресс с отдельными таймстампами (updated_at / prog_at), каждый двигается только при реальном действии; серверная БД не принимает более старую запись; при расхождении обеих версий — экран конфликтов «Локально / Облако»'],
  ['1.7.0','03.10.26','SRS — переработка стратегии уровней: интервалы коробок 2/3/5/8/12 сессий (было 1/2/4/6/8); новое слово покидает уровень 1 после 4 верных ответов суммарно (было 3+3 подряд в соседних сессиях), ошибки счётчик не сбрасывают; новое слово повторяется через сессию, а не в каждой; в очереди не больше 10 новых слов за сессию'],
  ['1.6.0','03.10.26','Настройки → Данные: размер базы слов и базы аудио (штуки и КБ/МБ, активный язык); Экзамен — слово повторяется каждые 7 секунд, пока вопрос на экране; «Выбор ответов» — выше кнопки ответов (×1.5); «Учить» — тулбар заменён кнопкой ⚙ справа сверху: настройки Аудио/Пиньин/Перевод переехали в отдельное окно'],
  ['1.5.1','03.10.26','«Все переводы» честно работает во всех режимах (выкл — только главный перевод, вкл — все через «/»); «Учить» — тулбар настроек сверху (Аудио/Пиньин/Перевод); ошибка в Экзамене подсвечивается 1 сек без зелёной подсветки правильного; «Верно-неверно» — кнопки столбиком (Верно сверху); словарь — 4 одинаковых чипа-фильтра; крупнее поля карточки, кнопки действий всегда 2×2; окно фильтра — «Сбросить фильтр»/«Применить фильтр», фильтр применяется только по кнопке'],
  ['1.1.3','01.10.26','Фаза 4 — облачная синхронизация: кнопка «Синхронизировать» в Словаре (поиск слева, кнопка справа, строка статуса); LWW-merge карточек/настроек/статистики по updated_at; календарь и «дни» склеиваются по датам; сбой сети не трогает локальные данные'],
  ['1.1.2','30.09.26','Все модальные окна (вход, карточка, пакетный ввод, история версий) открываются по центру экрана, а не снизу; подтверждение входа — toast «Проверьте почту…» поверх окна'],
  ['1.1.1','30.09.26','Фаза 3 (синхронизация): вход по email в Supabase — блок «Аккаунт» в Настройках, вход по magic-link без пароля, автоподхват сессии из ссылки письма, кнопка «Выйти»; офлайн-сборка — без Supabase (честная заглушка)'],
  ['1.1.0','29.09.26','Фаза 1 — фундамент синхронизации: у карточек, настроек и статистики появились поля lang и updated_at; миграция старых данных; updated_at обновляется только при реальном изменении содержимого (подпись содержимого). Внешне ничего не изменилось'],
  ['1.0.19','27.09.26','Экзамен: кнопки результатов переименованы («Начать экзамен заново», «Перейти в режим «Учить»»); «Учить» — кнопка «Вперёд ▶» в 1,5 раза выше; экспорт JSON сохраняется как «hanzi-backup <дата>»; офлайн-файл называется «hanzi-trainer-offline <версия>»'],
  ['1.0.18','26.09.26','Словарь: кнопка ↑ (повысить уровень) вместо ✎, ↑ и ↓ теперь меняют уровень на 1; одно аудио на карточку (кнопка «Прикрепить аудио» целиком, старые скорости удалены); новые слова вверху списка; в карточке «Уровень N»; «Учить» — кнопки Вперёд/Назад/Повторить столбиком; уведомление «Подключитесь к интернету, иероглиф недоступен»'],
  ['1.0.17','25.09.26','Исправление ошибок: единый шрифт 13px оси Y и дат в «Словах» за «День» (как в остальных периодах); «Письмо» — таймаут загрузки данных иероглифа (4 c, 3 попытки) + ожидание HanziWriter, при неудаче — fallback со свободным рисованием и уведомлением «Иероглиф недоступен»'],
  ['1.0.16','22.09.26','Статистика переработана по образцу Loop Habit Tracker: единый шрифт 13px (заголовки карточек 17px), календарь-хитмап, «Слова» и «История» с подбором числа точек/столбиков под ширину (подписи не накладываются), день в «Словах» — смахиваемая лента, столбики «Истории» справа налево, «Лучшие серии» топ-5'],
  ['1.0.15','21.09.26','Экзамен: крупный иероглиф в «Верно-неверно» и «Выбор ответов» снова адаптивный (min 30vmin / 130px) вместо фиксированных 40px'],
  ['1.0.14','21.09.26','«Ещё»: вкладки «Статистика»/«Настройки», Память барами, Календарь-хитмап, график «Слова», столбцы «История», «Лучшие серии», модалка «История версий», выравнивание карточек «Выбора ответов»'],
  ['1.0.13','21.09.26','Упрощение карточки (одно «Слово», один плюсик аудио), аудио в памяти формы до «Сохранить», скругления, единый 40px в Письме/Экзамене, свободное рисование без данных начертания, «Подбор» во всю ширину без зачёркивания, убраны ползунки скорости в «Учить»'],
  ['1.0.12','20.09.26','Альтернативные переводы (до 5 полей), «Все переводы», «Подбор» в любом порядке + «Завершить подбор»'],
  ['1.0.11','20.09.26','Экзамен: новое слово при каждом задании + отступ ≥5, повтор ошибки в конец, единое моргание badBlink'],
  ['1.0.10','20.09.26','Кнопка «↓» понижения, шапка с версией «от DD.MM.YY», правки экзамена'],
  ['1.0.9','19.09.26','Словарь: 4 фильтра с числами, жирнее пиньинь/перевод; экзамен: крупнее карточки на десктопе'],
  ['1.0.8','18.09.26','SRS: 5 коробок 1/2/4/6/8, «новое слово» 3+3, приоритет, 2:1, очередь без дублей, из экзамена убран «Письменно»'],
  ['1.0.7','17.09.26','Окно письма на всю ширину, аудио переписано'],
  ['1.0.6','14.09.26','«Рандомно» в Письме, озвучка при появлении + повтор через 3 c паузы, сетка под большой иероглиф, «Письменно» озвучка/повтор 5 c, ВН: Верно справа, мгновенное 4-6-8-10, порядок «Письменно», кнопка «Контур»'],
  ['1.0.5','14.09.26','Аудио в нормальном темпе везде + слово целиком, клетка-сетка, «Учить»: свежие первыми, «Экзамен» переработан полностью (+ «Подбор»)'],
  ['1.0.4','14.09.26','«Учить» без зависаний + «◀ Назад», в «Письме» список слов внизу, «Рандом» и «Подсказка», иероглиф по центру, контур через showOutline'],
  ['1.0.3','14.09.26','Полная переработка «Письма» и «Словаря»'],
  ['1.0.2','12.09.26','«🔄 Повторить» / «➡️ Следующее ✓», «Письмо» по центру на 1–3 иероглифа, кнопки по углам'],
  ['1.0.1','12.09.26','Остановка звука при переключении режимов, перемешивание в «Учить», пиньинь+перевод сразу, переключатель скорости, экран результатов, крупнее шрифты, подсветка иероглифа, раздельные размеры']
];
function openVersionModal(){
  const m=document.getElementById('modalVersions');
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>История версий</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalVersions')">✕</button></div>
    <div style="margin-top:8px">${VERSIONS.map(([v,d,t])=>`
      <div class="ver-item">
        <div class="vh">Версия <span class="vnum">${v}</span> от ${d}</div>
        <div class="vt">${t}</div>
      </div>`).join('')}
      <div class="ver-now">Текущая версия — ${APP_VERSION} от ${versionDate()}</div>
    </div>
  </div>`;
  m.classList.remove('hidden');
}
// Версия программы в шапке: «Версия X.Y.Z от DD.MM.YY» + клик открывает историю
function versionDate(){
  const d=new Date(); const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0'); const yy=String(d.getFullYear()).slice(2);
  return dd+'.'+mm+'.'+yy;
}
function renderVersion(){
  const el=document.getElementById('appVer');
  if(!el) return;
  el.textContent='Версия '+APP_VERSION+' от '+versionDate();
  el.onclick=openVersionModal;
}

function touchStreak(){
  const t=dayStr();
  if(stats.lastDay===t) return;
  const yest=new Date(); yest.setDate(yest.getDate()-1);
  if(stats.lastDay===dayStr(yest)) stats.streak=(stats.streak||0)+1; else stats.streak=1;
  stats.lastDay=t;
}
// Разница в днях b-a (обе — 'YYYY-MM-DD', локальные даты)
function dayDiff(a,b){
  const x=new Date(+a.slice(0,4), +a.slice(5,7)-1, +a.slice(8,10));
  const y=new Date(+b.slice(0,4), +b.slice(5,7)-1, +b.slice(8,10));
  return Math.round((y-x)/86400000);
}

// ---------- Периоды (день/неделя/месяц/квартал/год) ----------
function startOfWeek(day){
  const d=new Date(+day.slice(0,4), +day.slice(5,7)-1, +day.slice(8,10));
  const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return d;
}
function startOfMonth(day){ return new Date(+day.slice(0,4), +day.slice(5,7)-1, 1); }
function startOfQuarter(day){ return new Date(+day.slice(0,4), Math.floor((+day.slice(5,7)-1)/3)*3, 1); }
function startOfYear(day){ return new Date(+day.slice(0,4), 0, 1); }
const MONTHS_ACC=['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сент.','окт.','нояб.','дек.'];
const QUARTERS=['I','II','III','IV'];
function labelOf(periodStart, range){
  if(range==='day'){ const d=dayStr(periodStart); return d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(2,4); }
  if(range==='week'){
    const end=new Date(periodStart); end.setDate(end.getDate()+6);
    return periodStart.getDate()+'–'+end.getDate()+' '+MONTHS_ACC[periodStart.getMonth()];
  }
  if(range==='month') return MONTHS_ACC[periodStart.getMonth()]+' '+periodStart.getFullYear();
  if(range==='quarter') return QUARTERS[Math.floor(periodStart.getMonth()/3)]+' кв. '+periodStart.getFullYear();
  return String(periodStart.getFullYear());
}
// Начальная дата использования: первый активный день или день добавления первого слова
function earliestUsageDay(){
  let e=null;
  const act=stats.activity||{};
  for(const d in act){ if(act[d]>0 && (!e||d<e)) e=d; }
  for(const it of items){ if(it.addedOn && (!e||it.addedOn<e)) e=it.addedOn; }
  return e||dayStr();
}
// Перечисляет периоды подряд от отправной точки использования до текущего периода включительно (старые слева).
// Для диапазона «день» точка отсчёта — дата начала использования (глубже данных нет).
function periodList(range){
  const today=dayStr();
  let cur, curEnd;
  if(range==='day'){
    cur=new Date(+earliestUsageDay().slice(0,4), +earliestUsageDay().slice(5,7)-1, +earliestUsageDay().slice(8,10));
    curEnd=new Date(+today.slice(0,4), +today.slice(5,7)-1, +today.slice(8,10));
  } else {
    const e=earliestUsageDay();
    if(range==='week') cur=startOfWeek(e);
    else if(range==='month') cur=startOfMonth(e);
    else if(range==='quarter') cur=startOfQuarter(e);
    else cur=startOfYear(e);
    if(range==='week') curEnd=startOfWeek(today);
    else if(range==='month') curEnd=startOfMonth(today);
    else if(range==='quarter') curEnd=startOfQuarter(today);
    else curEnd=startOfYear(today);
  }
  const out=[];
  while(cur<=curEnd){
    out.push(new Date(cur));
    if(range==='day') cur.setDate(cur.getDate()+1);
    else if(range==='week') cur.setDate(cur.getDate()+7);
    else if(range==='month') cur=new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    else if(range==='quarter') cur=new Date(cur.getFullYear(), cur.getMonth()+3, 1);
    else cur=new Date(cur.getFullYear()+1, 0, 1);
  }
  return out;
}
// Конец периода (эксклюзив) как 'YYYY-MM-DD'
function periodEnd(periodStart, range, nextStart){
  if(range==='day') return dayStr(periodStart);
  const end=new Date(nextStart); end.setDate(end.getDate()-1);
  return dayStr(end);
}

// ---------- Вкладки Ещё ----------
let moreTab='stats';
function switchMoreTab(tab){
  moreTab=tab;
  document.getElementById('moreTabStats').classList.toggle('hidden', tab!=='stats');
  document.getElementById('moreTabSync').classList.toggle('hidden', tab!=='sync');
  document.getElementById('moreTabSettings').classList.toggle('hidden', tab!=='settings');
  document.getElementById('moreTabSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  if(tab==='stats') renderMoreStats();
  else if(tab==='sync') renderSyncPanel();
  else renderDataStats();
}
// Читаемый размер в байтах: до 1 МБ — в КБ (точнее для текста слов), дальше — в МБ с 1 знаком.
function fmtBytes(n){
  n=+n||0;
  if(n<1048576) return (n/1024).toFixed(n<10240?1:0)+' КБ';
  return (n/1048576).toFixed(1)+' МБ';
}
// Размер текста в utf-8 (без суррогатов: китайские иероглифы — 3 байта каждый).
function utf8Bytes(s){
  s=String(s||'');
  let n=0;
  for(let i=0;i<s.length;i++){
    const c=s.codePointAt(i);
    if(c>0xffff) i++;
    n += c<=0x7f ? 1 : (c<=0x7ff ? 2 : (c<=0xffff ? 3 : 4));
  }
  return n;
}
// Размеры баз в «Данные» (активный язык, считаются на лету при открытии вкладки):
// слова — карточки без аудио-файлов: размер сериализованных полей (текст/пиньинь/переводы и т.п.);
// аудио — прикреплённые mp3: сумма буферов в IndexedDB.
async function renderDataStats(){
  const wEl=document.getElementById('dsWords'), aEl=document.getElementById('dsAudio'), nEl=document.getElementById('dsNote');
  if(!wEl) return;
  const list=langItems();
  const auList=list.filter(it=>it.recordings && it.recordings.length);
  let total=5; // JSON-обёртка [{items…}] — пара байт на пустую галерею
  for(const it of list) total += (utf8Bytes(JSON.stringify(it))||0) + 1;
  wEl.textContent=list.length+' шт · '+fmtBytes(total);
  // аудио: сколько записей и сколько занимают; буферы читаем пакетно (не блокируя UI)
  const slots=[];
  for(const it of auList) for(const r of it.recordings) if(r && r.speed) slots.push(it.id+':'+r.speed);
  aEl.textContent=slots.length+' шт · …';
  let ab=0;
  for(const k of slots){
    const rec=await DB.get('aud:'+k);
    if(rec && rec.buf) ab += rec.buf.byteLength||rec.buf.length||0;
  }
  aEl.textContent=slots.length+' шт · '+fmtBytes(ab);
  nEl.textContent='Для активного языка · без учёта облака';
}

function renderMore(){
  updateChips();
  renderMoreStats();
}
function renderMoreStats(){
  renderTiles();
  renderMemoryBars();
  ensureStatsDropdowns();
  renderStCalendar();
  renderStWords();
  renderStHist();
  renderStStreaks();
}
function renderTiles(){
  const list=langItems();
  const learned=list.filter(isLearned).length;
  const studying=list.filter(it=>!isLearned(it)).length;
  // «Добавлено недавно»: последняя партия за 7 дней (по календарному дню добавления).
  // Партия = самая свежая дата addedOn; если таких дней несколько — показываем только последнюю.
  // addedOn — строка 'YYYY-MM-DD', поэтому сравнение строк корректно для дат.
  const since=dayStr(new Date(Date.now()-7*86400000));
  const recent=list.map(it=>it.addedOn).filter(d=>d && d>=since);
  let addedRecent=0;
  if(recent.length){ const last=recent.slice().sort().pop(); addedRecent=recent.filter(d=>d===last).length; }
  document.getElementById('stTotal').textContent=list.length;
  document.getElementById('stToday').textContent=addedRecent;
  document.getElementById('stLearned').textContent=learned;
  document.getElementById('stStudying').textContent=studying;
}
// «Память (5 уровней)» — горизонтальные бары
function renderMemoryBars(){
  const el=document.getElementById('stBars'); if(!el) return;
  const labels=['Уровень 1 — новое','Уровень 2 — раз в 2 сессии','Уровень 3 — раз в 4 сессии','Уровень 4 — раз в 6 сессий','Уровень 5 — выучено'];
  const counts=[0,0,0,0,0];
  langItems().forEach(it=>{ const b=normBox(it)-1; counts[b]=(counts[b]||0)+1; });
  const max=Math.max(1,...counts);
  el.innerHTML=counts.map((c,i)=>`
    <div class="hmbar">
      <div class="lb">${labels[i]}</div>
      <div class="track"><div class="fill" style="width:${Math.round(c/max*100)}%"></div></div>
      <div class="num">${c}</div>
    </div>`).join('');
}
// ============================================================
//  «Синхронизация» — админ-панель: агрегат облака + журнал sync_log.
// ============================================================
function deviceId(){
  try{
    let id=localStorage.getItem('ltDeviceId');
    if(!id){ id=(crypto.randomUUID?crypto.randomUUID():('d'+Date.now()+Math.random().toString(36).slice(2,8))); localStorage.setItem('ltDeviceId', id); }
    return id;
  }catch(e){ return 'unknown'; }
}
function deviceLabel(){
  try{ return localStorage.getItem('ltDeviceLabel')||''; }catch(e){ return ''; }
}
// Вставляем одну запись в журнал sync_log (серверная метка ts). Вызывается в конце успешного doSync.
async function logSyncEvent(st){
  if(SB_OFFLINE || !_syncUser || !sbClient()) return;
  try{
    await sbClient().from('sync_log').insert({
      device_id: deviceId(), device_label: (st.deviceLabel||'').slice(0,32),
      app_version: APP_VERSION, started_at: st.startedAt||0, duration_ms: st.durationMs||0,
      cards_pushed: st.pushedCards||0, cards_pulled: st.pulledCards||0,
      content_push: st.contentPush||0, content_pull: st.contentPull||0,
      progress_push: st.progressPush||0, progress_pull: st.progressPull||0,
      conflict_content: st.conflictContent||0, conflict_progress: st.conflictProgress||0,
      conflict_content_local: st.conflictContentLocal||0, conflict_content_cloud: st.conflictContentCloud||0,
      conflict_progress_local: st.conflictProgressLocal||0, conflict_progress_cloud: st.conflictProgressCloud||0
    });
  }catch(e){ /* журнал не должен ломать синхронизацию */ }
}
// Основной агрегат: сколько всего в облаке (карточки, слова по языкам, МБ БД и аудио).
// Карточки/БД/число синков — серверная функция db_stats(); аудио — пересчёт файлов в Storage.
async function loadCloudTotals(){
  if(!_syncUser || !sbClient()) return {cards:0, byLang:null, dbBytes:0, audioBytes:0, audioFiles:0, syncCount:0};
  const c=sbClient();
  let cards=0, byLang=null, dbBytes=0, syncCount=0;
  try{
    const {data,error}=await c.rpc('db_stats');
    if(!error && data){
      cards=+data.cards||0;
      byLang=data.by_lang||null;
      dbBytes=+data.db_bytes||0;
      syncCount=+data.sync_count||0;
    }
  }catch(e){ /* rpc нет — fallback ниже */ }
  let audioFiles=0, audioBytes=0;
  try{
    // Подсчёт файлов аудио в Storage по папке пользователя (без скачивания самих mp3).
    let offset=0;
    for(;;){
      const {data:l,error}=await c.storage.from('recordings').list(_syncUser.id, {limit:200, offset:offset, sortBy:{column:'name',order:'asc'}});
      if(error) break;
      const items=l||[];
      for(const f of items){
        if(!f.id) continue;                     // id — null у папок
        audioFiles++;
        audioBytes += (f.metadata && f.metadata.size) ? +f.metadata.size : 0;
      }
      if(items.length<200) break;
      offset+=200;
    }
  }catch(e){}
  return {cards, byLang, dbBytes, audioBytes, audioFiles, syncCount};
}
// Последние записи журнала (для экрана «Синхронизация»).
async function loadSyncLog(){
  const out=[];
  if(!_syncUser || !sbClient()) return out;
  try{
    const r=await sbClient().from('sync_log')
      .select('ts,device_label,app_version,started_at,duration_ms,cards_pushed,cards_pulled,content_push,content_pull,progress_push,progress_pull,conflict_content,conflict_progress,conflict_content_local,conflict_content_cloud,conflict_progress_local,conflict_progress_cloud')
      .eq('user_id',_syncUser.id).order('ts',{ascending:false}).limit(30);
    return (r.data||[]).map(x=>({...x, ts: x.ts||x.started_at||0}));
  }catch(e){ return out; }
}
function fmtDTlog(ts){
  if(!ts) return '…';
  const d=new Date(ts);
  const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
  return d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear()+' '+hh+':'+mm;
}
async function renderSyncPanel(){
  const cardsEl=document.getElementById('slCards'), byLangEl=document.getElementById('slByLang'),
        dbEl=document.getElementById('slDbBytes'), audEl=document.getElementById('slAudioBytes'),
        cntEl=document.getElementById('slSyncCount'), logEl=document.getElementById('slLog'),
        noteEl=document.getElementById('slShowNote'), refr=document.getElementById('slRefresh'),
        reset=document.getElementById('slResetDevice');
  if(!_syncUser || !sbClient()){
    cardsEl.textContent='—'; byLangEl.textContent='—'; dbEl.textContent='—'; audEl.textContent='—'; cntEl.textContent='—';
    logEl.innerHTML='<div class="muted" style="padding:4px 2px">Войдите в аккаунт и синхронизируйтесь — здесь появятся данные облака.</div>';
    if(noteEl) noteEl.style.display='none';
    return;
  }
  if(refr) refr.disabled=true;
  const t=await loadCloudTotals();
  cardsEl.textContent=t.cards;
  if(t.byLang && typeof t.byLang==='object'){
    byLangEl.textContent=Object.keys(t.byLang).map(lg=>(LANG_MAP[lg]?LANG_MAP[lg].flag:lg)+' '+t.byLang[lg]).join(' · ')||'—';
  }else byLangEl.textContent='—';
  dbEl.textContent=fmtBytes(t.dbBytes);
  audEl.textContent=t.audioFiles ? (t.audioFiles+' шт · '+fmtBytes(t.audioBytes)) : '—';
  cntEl.textContent=t.syncCount;
  const rows=await loadSyncLog();
  if(noteEl) noteEl.style.display=rows.length?'none':'block';
  if(!rows.length){
    logEl.innerHTML='<div class="muted" style="padding:4px 2px">Записей пока нет.</div>';
  }else{
    logEl.innerHTML=rows.map(x=>{
      const up=(x.cards_pushed||0), down=(x.cards_pulled||0);
      const cpush=(x.content_push||0), cpull=(x.content_pull||0), ppush=(x.progress_push||0), ppull=(x.progress_pull||0);
      const conf=(x.conflict_content||0)+(x.conflict_progress||0);
      const dl=(x.device_label||'устройство').slice(0,14);
      return `<div class="sl-row">
        <div class="sl-head"><span class="sl-time">${fmtDTlog(x.ts)}</span><span class="sl-ver">v${escapeHtml(x.app_version||'—')}</span><span class="spacer"></span><span class="muted">${escapeHtml(dl)}</span></div>
        <div class="sl-meta">
          <span><span class="tag-up">↑ ${up}</span></span>
          <span><span class="tag-down">↓ ${down}</span></span>
          <span>контент <b>${cpush}/${cpull}</b></span>
          <span>прогресс <b>${ppush}/${ppull}</b></span>
          ${conf?`<span>конфликтов <b>${conf}</b></span>`:''}
          <span>${x.duration_ms? (x.duration_ms<1000?x.duration_ms+' мс':(x.duration_ms/1000).toFixed(1)+' с') : ''}</span>
        </div>
      </div>`;
    }).join('');
  }
  if(refr) refr.disabled=false;
}
function bindSyncPanel(){
  const r=document.getElementById('slRefresh');
  if(r) r.onclick=()=>renderSyncPanel();
  const rs=document.getElementById('slResetDevice');
  if(rs) rs.onclick=()=>{
    const nm=prompt('Имя этого устройства (видно в журнале синхронизаций):', deviceLabel()||'');
    if(nm===null) return;
    try{ localStorage.setItem('ltDeviceLabel', nm.trim()); }catch(e){}
    toastShort('Устройство: '+(nm.trim()||'(без имени)'));
    renderSyncPanel();
  };
}

// ============================================================
//  Статистика (по образцу uHabits / Loop Habit Tracker).
//  Единый шрифт 13px (заголовки карточек 17px); число точек и
//  столбиков подбирается так, чтобы подписи не накладывались
//  и не обрезались. Измеряем ширину надписей канвой 13px.
// ============================================================
var measCv=document.createElement('canvas').getContext('2d');
var ETALON='13px system-ui,-apple-system,"Segoe UI",sans-serif';
function stTextW(s){ measCv.font=ETALON; return measCv.measureText(s).width; }
function stAt(t){ const d=new Date(t); return {y:d.getFullYear(), m:d.getMonth(), d:d.getDate()}; }
function stKey(y,m,d){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function stMs(y,m,d){ return new Date(y,m,d).getTime(); }
const ST_TODAY=stAt(Date.now());
const MONTHS_NOM=['янв.','февр.','мар.','апр.','май','июн.','июл.','авг.','сент.','окт.','нояб.','дек.'];
const MO_NO=['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сент.','окт.','нояб.','дек.'];

// горизонтальное смахивание без ползунка (календарь и «Слова» за «день»)
function makeSwipeable(el){
  let down=false, startX=0, startL=0, tracked=false;
  el.addEventListener('pointerdown', function(e){
    down=true; tracked=false; startX=e.clientX; startL=el.scrollLeft;
    el.classList.add('grabbing');
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  });
  el.addEventListener('pointermove', function(e){
    if(!down) return;
    const dx=e.clientX-startX;
    if(Math.abs(dx)>3) tracked=true;
    el.scrollLeft=startL-dx;
  });
  el.addEventListener('pointerup', function(e){
    down=false; el.classList.remove('grabbing');
    if(tracked){ e.preventDefault(); e.stopPropagation(); }
  });
}

// выпадающий выбор периода (▾). initialId согласует надпись с нарисованным графиком.
function buildDropdown(el, periods, onChange, initialId){
  el.className='dd';
  el.innerHTML=
    '<button type="button" class="dd-btn"><span class="dd-label"></span><span class="tgl">▾</span></button>'+
    '<div class="dd-menu"></div>';
  const btn=el.querySelector('.dd-btn'), lbl=el.querySelector('.dd-label'), menu=el.querySelector('.dd-menu');
  let cur=initialId||periods[0].id;
  function render(){
    const p=periods.filter(x=>x.id===cur)[0];
    lbl.textContent=p.label;
    menu.innerHTML='';
    periods.forEach(x=>{
      const b=document.createElement('button');
      b.type='button'; b.textContent=x.label;
      if(x.id===cur) b.classList.add('active');
      b.addEventListener('click', function(){ cur=x.id; render(); el.classList.remove('open'); onChange(x.id); });
      menu.appendChild(b);
    });
  }
  btn.addEventListener('click', function(e){ e.stopPropagation(); el.classList.toggle('open'); });
  document.addEventListener('click', function(e){ if(!el.contains(e.target)) el.classList.remove('open'); });
  render();
}

// ---------- «Календарь» — хитмап, сегодня справа, лента смахивается ----------
function renderStCalendar(){
  const el=document.getElementById('stCalWrap'); if(!el) return;
  const act=stats.activity||{};
  const S=16, GAP=2, STEP=S+GAP;
  const DOW=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const t0=stMs(ST_TODAY.y, ST_TODAY.m, ST_TODAY.d);
  const WEEKS=53;
  const curDow=(new Date(ST_TODAY.y, ST_TODAY.m, ST_TODAY.d).getDay()+6)%7;
  const leftMon=t0-curDow*86400000-(WEEKS-1)*7*86400000;
  const gridW=WEEKS*STEP;

  let html='<div class="calrow"><div class="wrap">';
  html+='<div class="months" style="width:'+gridW+'px">';
  let lastM=-1, lastY=-1, lastEnd=-1e9;
  for(let w=0;w<WEEKS;w++){
    const topDate=new Date(leftMon + w*7*86400000);
    const y=topDate.getFullYear(), m=topDate.getMonth();
    if(m!==lastM){
      let label=MONTHS_NOM[m];
      if(y!==lastY) label+=' '+y;
      lastM=m; lastY=y;
      let lx=Math.max(w*STEP+2, lastEnd+6);
      lx=Math.min(lx, gridW-stTextW(label));
      html+='<span style="left:'+lx+'px">'+label+'</span>';
      lastEnd=lx+stTextW(label);
    }
  }
  html+='</div>';
  const nextDay=t0+86400000;
  html+='<div class="grid" style="width:'+gridW+'px">';
  for(let w=0;w<WEEKS;w++){
    for(let r=0;r<7;r++){
      const dt=new Date(leftMon + (w*7+r)*86400000);
      const y=dt.getFullYear(), m=dt.getMonth(), d=dt.getDate();
      const t=stMs(y,m,d);
      let cls='cell';
      if(t>=nextDay) cls+=' future';
      else if(act[stKey(y,m,d)]>0) cls+=' on';
      let dot='';
      if(t<nextDay && t>=t0-9*86400000) dot='<i class="dot"></i>';
      html+='<div class="'+cls+'">'+(t>=nextDay?'':d)+dot+'</div>';
    }
  }
  html+='</div>';
  html+='</div><div class="days"></div></div>';
  el.innerHTML=html;
  el.querySelector('.days').innerHTML=DOW.map(x=>'<span>'+x+'</span>').join('');
  const scroll=el.querySelector('.wrap');
  makeSwipeable(scroll);
  scroll.scrollLeft=scroll.scrollWidth;
}
// ---------- общие геометрические хелперы графиков ----------
function stBucketStart(id, t){
  const a=stAt(t);
  if(id==='d') return stMs(a.y,a.m,a.d);
  if(id==='w'){ const dow=(new Date(a.y,a.m,a.d).getDay()+6)%7; return stMs(a.y,a.m,a.d-dow); }
  if(id==='m') return stMs(a.y,a.m,1);
  if(id==='q') return stMs(a.y,a.m-(a.m%3),1);
  return stMs(a.y,0,1);
}
function stStepBack(id, t){
  const a=stAt(t);
  if(id==='d') return new Date(a.y,a.m,a.d-1).getTime();
  if(id==='w') return new Date(a.y,a.m,a.d-7).getTime();
  if(id==='m') return new Date(a.y,a.m-1,1).getTime();
  if(id==='q') return new Date(a.y,a.m-3,1).getTime();
  return new Date(a.y-1,0,1).getTime();
}
function stKeyOf(t){ const a=stAt(t); return stKey(a.y,a.m,a.d); }
function stBucketLabel(st, id){
  const a=stAt(st);
  if(id==='d'||id==='w') return a.d+' '+MO_NO[a.m];
  if(id==='m') return MONTHS_NOM[a.m];
  if(id==='q'){ const q=Math.floor(a.m/3)+1; return q+' кв. '+a.y; }
  return String(a.y);
}
function stNiceCeil(rawMax, steps, div){
  let step=steps[steps.length-1];
  for(let s=0;s<steps.length;s++){ if(steps[s]>=rawMax/div){ step=steps[s]; break; } }
  return Math.ceil(rawMax/step)*step;
}
function estimateMonthWidth(){
  // ширина блока графика: карточка 600px − 2×16px отступа
  return (document.getElementById('stWordsChart')||{}).clientWidth || 568;
}

// ---------- «Слова» — линейный график (uHabits Score) ----------
const WORDS_PERIODS=[
  {id:'d',days:1,  label:'День'},
  {id:'w',days:7,  label:'Неделя'},
  {id:'m',days:30, label:'Месяц'},
  {id:'q',days:90, label:'Квартал'},
  {id:'y',days:365,label:'Год'}
];
const HIST_PERIODS=[
  {id:'w',days:7,  label:'Неделя'},
  {id:'m',days:30, label:'Месяц'},
  {id:'q',days:90, label:'Квартал'},
  {id:'y',days:365,label:'Год'}
];
let stWordsCur='w', stHistCur='w', stSegsReady=false;

function ensureStatsDropdowns(){
  if(stSegsReady) return;
  stSegsReady=true;
  buildDropdown(document.getElementById('stWordsSeg'), WORDS_PERIODS, function(id){ stWordsCur=id; renderStWords(); }, stWordsCur);
  buildDropdown(document.getElementById('stHistSeg'), HIST_PERIODS, function(id){ stHistCur=id; renderStHist(); }, stHistCur);
}

function wordsBuckets(id, N){
  const words=stats.words||{};
  const t0=stMs(ST_TODAY.y, ST_TODAY.m, ST_TODAY.d);
  const starts=[]; let s=stBucketStart(id, t0);
  for(let i=0;i<N;i++){ starts.push(s); s=stStepBack(id, s); }
  starts.reverse();
  const out=[];
  for(let j=0;j<starts.length;j++){
    const st=starts[j];
    const end=(j===starts.length-1) ? t0+86400000 : starts[j+1];
    const stEndK=stKeyOf(end), stK=stKeyOf(st);
    const set={};
    for(const d in words){ if(d>=stK && d<stEndK) words[d].forEach(w=>set[w]=1); }
    out.push({st:st, end:end, sum:Object.keys(set).length});
  }
  return out;
}
function wordsFitN(id){
  const span=WORDS_PERIODS.filter(p=>p.id===id)[0].days;
  const spanN=Math.ceil(365/span)+1;
  const all=wordsBuckets(id, spanN);
  let maxW=0;
  all.forEach(b=>{ const w=stTextW(stBucketLabel(b.st,id)); if(w>maxW) maxW=w; });
  const plotW=estimateMonthWidth()-34-10;
  let n=Math.floor(plotW/(maxW+16))+1;
  n=Math.max(2, Math.min(10, n, spanN));
  return n;
}
function renderStWords(){
  const wrapEl=document.getElementById('stWordsChart'); if(!wrapEl) return;
  const cur=stWordsCur, isDay=(cur==='d');
  const PW=estimateMonthWidth(), PH=190;
  const PT=12, PB=28, PL=34, PR=10;
  const DAY_N=30;

  let D;
  if(isDay){
    D=wordsBuckets('d', DAY_N);
  } else {
    D=wordsBuckets(cur, wordsFitN(cur));
  }

  let maxLabW=0;
  D.forEach(b=>{ const w=stTextW(stBucketLabel(b.st,cur)); if(w>maxLabW) maxLabW=w; });

  // Крайние подписи центрируются на своих точках; чтобы не обрезаться краем SVG,
  // для ленты (день) первый столбик отступает на полширины подписи, а под последний
  // подпись резервируем место в viewBox; для растянутых периодов — врезка с двух краёв.
  let W, xs, PWv;
  if(isDay){
    const stepX=maxLabW+18;
    W=stepX*(D.length-1);
    xs=D.map((_,i)=>PL+maxLabW/2+stepX*i);
    PWv=PL+maxLabW+W+PR;
  } else {
    const innerL=PL+maxLabW/2;
    const innerR=PL+(PW-PL-PR)-maxLabW/2;
    W=innerR-innerL;
    xs=D.map((_,i)=>innerL+W*i/(D.length-1));
    PWv=PW;
  }

  let rawMax=1;
  D.forEach(b=>{ if(b.sum>rawMax) rawMax=b.sum; });
  const max=stNiceCeil(rawMax, [1,2,5,10,20,50,100,200,500,1000], 3);

  const H=PH-PT-PB;
  const ys=D.map(b=>PT+H*(1-b.sum/max));

  function pathOf(pts){
    const n=pts.length;
    if(!n) return '';
    if(n===1) return 'M'+pts[0][0]+' '+pts[0][1];
    let d='M'+pts[0][0]+' '+pts[0][1];
    for(let i=0;i<n-1;i++){
      const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
      const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=' C'+c1x+' '+c1y+' '+c2x+' '+c2y+' '+p2[0]+' '+p2[1];
    }
    return d;
  }
  const pts=D.map((_,i)=>[xs[i],ys[i]]);
  const line=pathOf(pts);
  const area=line+' L'+xs[xs.length-1]+' '+(PT+H)+' L'+xs[0]+' '+(PT+H)+' Z';

  let yGrid='', yTicks='';
  for(let v=0; v<=max; v+=max/4){
    if(v<=0) continue;
    const yy=PT+H*(1-v/max);
    yGrid+='<line x1="'+PL+'" y1="'+yy+'" x2="'+(PL+W)+'" y2="'+yy+'" stroke="#eee" stroke-width="1"/>';
    yTicks+='<text class="ax" x="'+(PL-5)+'" y="'+(yy+3)+'" text-anchor="end">'+Math.round(v*10)/10+'</text>';
  }

  let xTicks='';
  D.forEach((b,i)=>{
    const lab=stBucketLabel(b.st, cur);
    xTicks+='<text class="ax" x="'+xs[i]+'" y="'+(PH-8)+'" text-anchor="middle">'+lab+'</text>';
  });

  let dots='';
  D.forEach((b,i)=>{
    const r=isDay?2.4:2.8;
    dots+='<circle cx="'+xs[i]+'" cy="'+ys[i]+'" r="'+r+'" fill="#c62828"/>';
  });

  let hoverCells='';
  D.forEach((_,i)=>{
    const l=i===0?Math.min(PL, xs[0]):(xs[i-1]+xs[i])/2;
    const r=i===D.length-1?Math.max(PL+W, xs[xs.length-1]):(xs[i]+xs[i+1])/2;
    const x0=Math.max(PL, l), x1=Math.min(PL+W, r);
    if(x1>x0) hoverCells+='<rect x="'+x0+'" y="'+PT+'" width="'+(x1-x0)+'" height="'+H+'" fill="transparent"/>';
  });

  const svgOpen=isDay
    ? '<svg width="'+PWv+'" height="'+(PH+4)+'" viewBox="0 0 '+PWv+' '+(PH+4)+'">'
    : '<svg width="100%" height="'+(PH+4)+'" viewBox="0 0 '+PWv+' '+(PH+4)+'" preserveAspectRatio="none">';
  const svg=svgOpen+
    '<g class="chart">'+
    yGrid+
    '<path d="'+area+'" fill="rgba(198,40,40,.10)"/>'+
    '<path d="'+line+'" fill="none" stroke="#c62828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+
    yTicks+xTicks+dots+hoverCells+
    '</g></svg>';

  if(isDay){
    // «День»: ось Y неподвижна слева, прокручивается только полотно графика.
    // Ось рисует лишь подписи Y в своей колонке (ширина PL); сетка остаётся в полотне.
    const axisOnly='<svg width="'+PL+'" height="'+(PH+4)+'" viewBox="0 0 '+PL+' '+(PH+4)+'">'+
      '<g class="chart">'+yTicks+'</g></svg>';
    const plotSvg='<svg width="'+PWv+'" height="'+(PH+4)+'" viewBox="0 0 '+PWv+' '+(PH+4)+'">'+
      '<g class="chart">'+yGrid+
      '<path d="'+area+'" fill="rgba(198,40,40,.10)"/>'+
      '<path d="'+line+'" fill="none" stroke="#c62828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+
      xTicks+dots+hoverCells+
      '</g></svg>';
    wrapEl.className='dchart';
    wrapEl.innerHTML='<div class="daxis">'+axisOnly+'</div><div class="dplot">'+plotSvg+'</div>';
    const plot=wrapEl.querySelector('.dplot');
    makeSwipeable(plot);
    plot.scrollLeft=plot.scrollWidth;
    attachWordsHover(wrapEl, D, cur, xs, ys, PWv, PH);
    return;
  }

  wrapEl.className='chart-wrap';
  wrapEl.innerHTML=svg;
  attachWordsHover(wrapEl, D, cur, xs, ys, PWv, PH);
}

function attachWordsHover(wrapEl, D, cur, xs, ys, PWv, PH){
  const tip=document.createElement('div');
  tip.className='tip';
  wrapEl.appendChild(tip);
  const svgEl=wrapEl.querySelector('.dplot svg')||wrapEl.querySelector('svg');
  wrapEl.querySelectorAll('rect[fill="transparent"]').forEach(function(rect, i){
    if(!D[i]) return;
    rect.addEventListener('mousemove', function(e){
      const svgRect=svgEl.getBoundingClientRect();
      const b=D[i];
      tip.innerHTML=stBucketLabel(b.st, cur)+'<br><b>слов: '+b.sum+'</b>';
      tip.style.display='block';
      tip.style.left=((xs[i]/PWv)*svgRect.width)+'px';
      let topPx=(ys[i]/PH)*svgRect.height-30;
      tip.style.top=(topPx<0?4:topPx)+'px';
    });
    rect.addEventListener('mouseleave', function(){ tip.style.display='none'; });
  });
}

// ---------- «История» — столбики, справа налево (uHabits History) ----------
function histBuckets(id, N){
  const act=stats.activity||{};
  const t0=stMs(ST_TODAY.y, ST_TODAY.m, ST_TODAY.d);
  const starts=[]; let s=stBucketStart(id, t0);
  for(let i=0;i<N;i++){ starts.push(s); s=stStepBack(id, s); }
  starts.reverse();
  const out=[];
  for(let j=0;j<starts.length;j++){
    const st=starts[j];
    const end=(j===starts.length-1) ? t0+86400000 : starts[j+1];
    const stEndK=stKeyOf(end), stK=stKeyOf(st);
    let n=0;
    for(const d in act){ if(act[d]>0 && d>=stK && d<stEndK) n++; }
    out.push({st:st, end:end, n:n});
  }
  return out;
}
function histFitN(id){
  const span=HIST_PERIODS.filter(p=>p.id===id)[0].days;
  const spanN=Math.ceil(365/span)+1;
  const all=histBuckets(id, spanN);
  let maxW=0;
  all.forEach(b=>{ const w=stTextW(stBucketLabel(b.st,id)); if(w>maxW) maxW=w; });
  const plotW=estimateMonthWidth()-34-10;
  // самый левый столбик должен встать так, чтобы его подпись (полностью,
  // центрированная) не выходила за левый край и не касалась соседней
  const n=Math.floor((plotW-maxW)/(maxW+16))+1;
  return Math.max(2, Math.min(10, n, spanN));
}
function renderStHist(){
  const wrapEl=document.getElementById('stHistChart'); if(!wrapEl) return;
  const cur=stHistCur;
  const PW=estimateMonthWidth(), PH=190;
  const PT=26, PB=28, PL=34, PR=10;
  const FONT=ETALON;

  const N=histFitN(cur);
  const buckets=histBuckets(cur, N);

  let rawMax=1;
  buckets.forEach(b=>{ if(b.n>rawMax) rawMax=b.n; });
  const max=stNiceCeil(rawMax, [1,2,5,10,20,50,100,200,365], 4);

  const H=PH-PT-PB;
  const baseY=PT+H;
  const plotR=PW-PR, plotL=PL;

  let maxW=0;
  buckets.forEach(b=>{ const w=stTextW(stBucketLabel(b.st, cur)); if(w>maxW) maxW=w; });
  const stepX=maxW+16;
  const lastX=plotR-maxW/2;
  const xs=buckets.map((_,i)=>lastX-(buckets.length-1-i)*stepX);
  const ys=buckets.map(b=>PT+H*(1-b.n/max));

  let yGrid='', yTicks='';
  for(let v=0; v<=max; v+=max/4){
    if(v<=0) continue;
    const yy=PT+H*(1-v/max);
    yGrid+='<line x1="'+plotL+'" y1="'+yy+'" x2="'+plotR+'" y2="'+yy+'" stroke="#eee" stroke-width="1"/>';
    yTicks+='<text class="ax" x="'+(plotL-5)+'" y="'+(yy+3)+'" text-anchor="end">'+Math.round(v*10)/10+'</text>';
  }

  let xTicks='';
  buckets.forEach((b,i)=>{
    const lab=stBucketLabel(b.st, cur);
    const w=stTextW(lab);
    let anchor='middle', tx=xs[i];
    if(tx-w/2<plotL){ anchor='start'; tx=plotL; }
    else if(tx+w/2>plotR){ anchor='end'; tx=plotR; }
    xTicks+='<text class="ax" x="'+tx+'" y="'+(PH-8)+'" text-anchor="'+anchor+'">'+lab+'</text>';
  });

  const barW=Math.min(stepX*0.55, 26);
  let bars='', barNums='';
  buckets.forEach((b,i)=>{
    bars+='<rect x="'+(xs[i]-barW/2)+'" y="'+ys[i]+'" width="'+barW+'" height="'+(baseY-ys[i])+'" rx="2" fill="#c62828"/>';
    if(b.n>0) barNums+='<text class="num" x="'+xs[i]+'" y="'+(ys[i]-6)+'" text-anchor="middle">'+b.n+'</text>';
  });

  let hoverCells='';
  buckets.forEach((_,i)=>{
    const x0=Math.max(plotL, xs[i]-stepX/2);
    const x1=Math.min(plotR, xs[i]+stepX/2);
    if(x1>x0) hoverCells+='<rect x="'+x0+'" y="'+PT+'" width="'+(x1-x0)+'" height="'+H+'" fill="transparent"/>';
  });

  const svg='<svg width="100%" height="'+(PH+4)+'" viewBox="0 0 '+PW+' '+(PH+4)+'" preserveAspectRatio="none">'+
    '<g class="chart">'+yGrid+bars+barNums+yTicks+xTicks+hoverCells+'</g></svg>';

  wrapEl.className='chart-wrap';
  wrapEl.innerHTML=svg;

  const tip=document.createElement('div');
  tip.className='tip';
  wrapEl.appendChild(tip);
  const svgEl=wrapEl.querySelector('svg');
  wrapEl.querySelectorAll('rect[fill="transparent"]').forEach(function(rect,i){
    rect.addEventListener('mousemove', function(){
      const svgRect=svgEl.getBoundingClientRect();
      if(buckets[i]){
        const b=buckets[i];
        tip.innerHTML=stBucketLabel(b.st, cur)+'<br><b>дней: '+b.n+'</b>';
        tip.style.display='block';
        tip.style.left=((xs[i]/PW)*svgRect.width)+'px';
        let topPx=(ys[i]/PH)*svgRect.height-34;
        tip.style.top=(topPx<0?4:topPx)+'px';
      }
    });
    rect.addEventListener('mouseleave', function(){ tip.style.display='none'; });
  });
}

// ---------- «Лучшие серии» — топ-5 (uHabits Best streaks) ----------
function pluralDays(n){
  const d=n%10, h=n%100;
  if(d===1&&h!==11) return 'день';
  if(d>=2&&d<=4&&(h<10||h>=20)) return 'дня';
  return 'дней';
}
// русское склонение произвольного слова: pluralRu(5,'карточка','карточки','карточек')
function pluralRu(n, one, few, many){
  const d=n%10, h=n%100;
  if(d===1&&h!==11) return one;
  if(d>=2&&d<=4&&(h<10||h>=20)) return few;
  return many;
}
function renderStStreaks(){
  const listEl=document.getElementById('stStreakList'); if(!listEl) return;
  const act=stats.activity||{};
  const t0=stMs(ST_TODAY.y, ST_TODAY.m, ST_TODAY.d);
  const yest=t0-86400000;

  const keysSorted=Object.keys(act).filter(k=>act[k]>0).sort();
  const streaks=[];
  let i=0;
  while(i<keysSorted.length){
    const p=keysSorted[i].split('-').map(Number);
    const start=stMs(p[0], p[1]-1, p[2]);
    let prev=start, days=1; i++;
    while(i<keysSorted.length){
      const q=keysSorted[i].split('-').map(Number);
      const t=stMs(q[0], q[1]-1, q[2]);
      if(t-prev===86400000){ prev=t; days++; i++; }
      else break;
    }
    streaks.push({start:start, end:prev, days:days});
  }

  function fmtDate(t){
    const a=stAt(t);
    return a.d+' '+MONTHS_ACC[a.m]+' '+a.y;
  }
  function numW(s){ measCv.font='700 13px system-ui,-apple-system,"Segoe UI",sans-serif'; return measCv.measureText(s).width; }
  function lblW(s){ measCv.font=ETALON; return measCv.measureText(s).width; }
  function bandColor(f){
    if(f>=1) return '#c62828';
    if(f>=0.8) return 'rgba(198,40,40,.75)';
    if(f>=0.5) return 'rgba(198,40,40,.38)';
    return 'rgba(29,28,26,.14)';
  }
  function bandText(f){ return f>=0.5 ? '#fff' : 'rgba(29,28,26,.62)'; }

  if(!streaks.length){
    listEl.innerHTML='<div style="font-size:13px;color:var(--mut)">Пока нет серий — начните заниматься!</div>';
    return;
  }

  streaks.sort((a,b)=>(b.days-a.days)||(b.end-a.end));
  const shown=streaks.slice(0,5);
  shown.sort((a,b)=>b.end-a.end);

  let maxEnd=-Infinity;
  shown.forEach(s=>{ if(s.end>maxEnd) maxEnd=s.end; });
  shown.forEach(s=>{ if(s.end===maxEnd && maxEnd>=yest) s.end=t0; });

  let maxLength=0;
  shown.forEach(s=>{ if(s.days>maxLength) maxLength=s.days; });
  const scale=Math.max(30, maxLength);

  let I=listEl.clientWidth;
  if(!I) I=estimateMonthWidth();

  let maxLabelWidth=0;
  shown.forEach(s=>{ maxLabelWidth=Math.max(maxLabelWidth, lblW(fmtDate(s.start)), lblW(fmtDate(s.end))); });
  let textMargin=5, shouldShowLabels=true;
  if(I-2*maxLabelWidth < I*0.25){ maxLabelWidth=0; shouldShowLabels=false; }

  const rows=shown.map(s=>{
    let f=s.days/scale; if(f>1) f=1;
    const cf=s.days/maxLength;
    let availableWidth=I-2*maxLabelWidth;
    if(shouldShowLabels) availableWidth-=2*textMargin;
    let barWidth=f*availableWidth;
    const minBarWidth=numW(String(s.days))+14;
    if(barWidth<minBarWidth) barWidth=minBarWidth;
    if(barWidth>I) barWidth=I;
    const gap=Math.max(0, (I-barWidth)/2);
    const B=I-gap+textMargin;
    return '<div class="streak-row" title="'+fmtDate(s.start)+' — '+fmtDate(s.end)+' · '+s.days+' '+pluralDays(s.days)+'">'+
      (shouldShowLabels
        ? '<span class="sdate" style="left:0;right:'+B+'px;text-align:right">'+fmtDate(s.start)+'</span>'+
          '<span class="sdate" style="left:'+B+'px;right:0;text-align:left">'+fmtDate(s.end)+'</span>'
        : '')+
      '<span class="sbar" style="left:'+gap+'px;width:'+barWidth+'px;background:'+bandColor(cf)+'">'+
        '<b style="color:'+bandText(cf)+'">'+s.days+'</b>'+
      '</span>'+
    '</div>';
  }).join('');
  listEl.innerHTML=rows;
}

// Дополнение к markShown: фиксируем уникальные слова за день (для графика «Слова»)
function recordSeen(it){
  if(!it || !it.hanzi) return;
  const t=dayStr();
  stats.words=stats.words||{};
  const set=stats.words[t]||(stats.words[t]=[]);
  if(set.indexOf(it.id)<0) set.push(it.id);
}

// ============================== SETTINGS BIND ==============================
function applySizes(){
  document.documentElement.style.setProperty('--mul-h', settings.mulH||1);
  document.documentElement.style.setProperty('--mul-p', settings.mulP||1);
  document.documentElement.style.setProperty('--mul-t', settings.mulT||1);
}

// ============================== ТЕМЫ ОФОРМЛЕНИЯ ==============================
// Четыре гаммы (светлая/тёмная/песочная/мятная) на CSS-переменных в head.
// Выбор хранится в localStorage ('ltTheme') отдельно от settings — не участвует в облачной
// синхронизации (оформление — личная настройка устройства, а не данные аккаунта).
const THEME_ORDER=['light','dark','sepia','blue'];
function applyTheme(t){
  if(THEME_ORDER.indexOf(t)<0) t='light';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('ltTheme', t); }catch(e){}
  const seg=document.getElementById('themeSeg');
  if(seg) seg.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.v===t));
  const sw=document.getElementById('themeSwitch');
  if(sw) sw.innerHTML = (t==='dark') ? SUN_ICON : MOON_ICON;
}
const MOON_ICON='<svg viewBox="0 -960 960 960"><path fill="currentColor" stroke="none" d="M560-80q-82 0-155-31.5t-127.5-86Q223-252 191.5-325T160-480.5q0-82.5 31.5-155t86-127Q332-817 405-848.5T560-880q54 0 105 14t95 40q-91 53-145.5 143.5T560-480q0 112 54.5 202.5T760-134q-44 26-95 40T560-80Zm0-80h21q10 0 19-2-57-66-88.5-147.5T480-480q0-89 31.5-170.5T600-798q-9-2-19-2h-21q-133 0-226.5 93.5T240-480q0 133 93.5 226.5T560-160Zm-80-320Z"/></svg>';
const SUN_ICON='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
function bindThemeControls(){
  let cur='light';
  try{ cur=localStorage.getItem('ltTheme')||'light'; }catch(e){}
  if(THEME_ORDER.indexOf(cur)<0) cur='light';
  applyTheme(cur);
  document.getElementById('themeSwitch').onclick=()=>{
    applyTheme(cur==='dark' ? 'light' : 'dark');
    cur=cur==='dark' ? 'light' : 'dark';
  };
  document.getElementById('themeSeg').querySelectorAll('button').forEach(b=>{
    b.onclick=()=>{ cur=b.dataset.v; applyTheme(cur); };
  });
}
function bindSettings(){
  const seg=(id, key, type, after)=>{
    document.getElementById(id).querySelectorAll('button').forEach(b=>{
      const val= type==='num'||type==='float' ? (+b.dataset.v) : b.dataset.v;
      if(val===settings[key]) b.classList.add('active');
      else b.classList.remove('active');
      b.onclick=()=>{
        document.getElementById(id).querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
        settings[key]=val;
        if(after) after();
        persist();
      };
    });
  };
  seg('hintSeg','hint','num');
  seg('writeOrderSeg','writeOrder','str',onWriteOrderChange);
  seg('writeHintSeg','writeHint','str',onWriteHintChange);
  document.getElementById('voiceSel').onchange=e=>{ settings.voiceURI=e.target.value; persist(); };
  applySizes();
}
function onWriteOrderChange(){
  // порядок слов в письме сменился — перестроить список; текущая карточка остаётся активной
  if(document.getElementById('scr-write').classList.contains('active')){
    rebuildWriteSeq();
    renderWriteList();
  }
}
function syncWriteOrderSeg(){
  // синхронизирует сегмент «Письмо: порядок слов» в Ещё с кнопкой тулбара «Рандомно»
  const seg=document.getElementById('writeOrderSeg'); if(!seg) return;
  seg.querySelectorAll('button').forEach(x=>x.classList.toggle('active', x.dataset.v===(writeRandOn()?'rand':'seq')));
}
function syncWriteHintSeg(){
  // синхронизирует сегмент «Письмо: подсказка» в Ещё с модалкой Письма
  const seg=document.getElementById('writeHintSeg'); if(!seg) return;
  seg.querySelectorAll('button').forEach(x=>x.classList.toggle('active', x.dataset.v===(writeHintOn()?'on':'off')));
}
function onWriteHintChange(){
  // режим печати (en/tr/ar): перестраиваем карточку, чтобы слово-подсказка появилось/исчезло
  if(!hasStrokes()){
    if(document.getElementById('scr-write').classList.contains('active') && writeCurItem){
      setWriteItemTyping(writeCurItem, false);
    }
    return;
  }
  // показать/скрыть слово над окном письма (китайский)
  const el=document.getElementById('writeWord');
  if(!el) return;
  if(writeHintOn()){ el.classList.remove('hidden'); renderWriteWord(); }
  else { el.classList.add('hidden'); el.innerHTML=''; }
}

// ============================== EXPORT / IMPORT ==============================
async function doExport(){
  const out=await Promise.all(items.map(async it=>{
    const recs=[];
    if(it.recordings) for(const r of it.recordings){
      const rec=await DB.get('aud:'+it.id+':'+r.speed);
      recs.push({speed:r.speed, name:r.name, data: rec?await blobToB64(new Blob([rec.buf],{type:rec.type})):null});
    }
    return {kind:it.kind,hanzi:it.hanzi,pinyin:it.pinyin,translation:it.translation,tag:it.tag,starred:it.starred,box:it.box,dueSess:it.dueSess,newDone:it.newDone,nsGood:it.nsGood,nsStreak:it.nsStreak,nsSess:it.nsSess,nsDoneSess:it.nsDoneSess,nsLastGoodShow:it.nsLastGoodShow,lastShowN:it.lastShowN,lastSeen:it.lastSeen,nextDue:it.nextDue,correct:it.correct,wrong:it.wrong,correctStreak:it.correctStreak,correctStreakDays:it.correctStreakDays,lastCorrectDay:it.lastCorrectDay,learnedOn:it.learnedOn,addedOn:it.addedOn,addedAt:it.addedAt||0,lang:langOf(it),updated_at:it.updated_at||0,prog_at:it.prog_at||0,recordings:recs};
  }));
  const blob=new Blob([JSON.stringify({items:out,settings,statsByLang},null,1)],{type:'application/json'});
  downloadBlob(blob,'hanzi-backup '+versionDate()+'.json');
}
function blobToB64(blob){ return new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(blob); }); }
function b64ToBuf(b64){ const [head,data]=b64.split(','); const bin=atob(data); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); const mime=(head.match(/data:(.*?);/)||[])[1]||'audio/mpeg'; return {buf:arr,mime}; }
function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
async function doImportFile(file){
  try{
    const j=JSON.parse(await file.text());
    if(!j.items){ toast('Не похоже на файл бэкапа'); return; }
    for(const each of items) revokeAll(each);
    items=[];
    for(const d of (j.items||[])){
      const it={id:uid(),kind:d.kind||'word',hanzi:d.hanzi,pinyin:d.pinyin||'',translation:d.translation||'',tag:d.tag||'',starred:d.starred||false,note:'',recordings:[],box:d.box||1,dueSess:d.dueSess||0,newDone:d.newDone||0,nsGood:d.nsGood||0,nsStreak:d.nsStreak||0,nsSess:d.nsSess||0,nsDoneSess:d.nsDoneSess==null?null:d.nsDoneSess,nsLastGoodShow:d.nsLastGoodShow==null?null:d.nsLastGoodShow,lastShowN:d.lastShowN||0,lastSeen:d.lastSeen||0,nextDue:d.nextDue||0,correct:d.correct||0,wrong:d.wrong||0,correctStreak:d.correctStreak||0,correctStreakDays:d.correctStreakDays||0,lastCorrectDay:d.lastCorrectDay||'',learnedOn:d.learnedOn||'',addedOn:d.addedOn||'',addedAt:+d.addedAt||0,lang:d.lang||'zh',trs:d.trs||undefined,updated_at:d.updated_at||0,prog_at:d.prog_at||0};
      if(String(d.hanzi||'').trim()) assignStableId(it);   // одинаковый материал = одинаковый id при импорте
      migrateItem(it);
      ensureAddedAt(it);   // старые бэкапы без addedAt — по дню добавления
      seedCardSigs(it);
      for(const r of (d.recordings||[])){
        if(r.data){ const {buf,mime}=b64ToBuf(r.data); await DB.put('aud:'+it.id+':'+r.speed,{name:r.name,type:mime,buf}); it.recordings.push({speed:r.speed,name:r.name,url:URL.createObjectURL(new Blob([buf],{type:mime}))}); }
      }
      items.push(it);
    }
    const dupN=makeLocalUnique();   // бэкап мог сам содержать дубли — склеиваем сразу
    if(j.settings) settings={...settings,...j.settings};
    // статистика: новый формат — карта по языкам; старый — объект stats активного языка
    if(j.statsByLang){ statsByLang=j.statsByLang; }
    else if(j.stats){ statsByLang={}; statsByLang['zh']=j.stats; }
    if(!statsByLang[activeLang]) statsByLang[activeLang]={streak:0,lastDay:'',activity:{}};
    stats=statsByLang[activeLang];
    await persist(); await refreshAll();
    toast(dupN>0 ? ('Импортировано: '+items.length+' (склеено дублей: '+dupN+')') : ('Импортировано: '+items.length));
  }catch(e){ toast('Ошибка импорта'); console.error(e); }
}

// ============================== SAMPLE DATA ==============================
const SAMPLES={
  zh:[
    ['char','你','nǐ','ты'],
    ['char','我','wǒ','я'],
    ['char','好','hǎo','хороший'],
    ['char','爱','ài','любить, любовь'],
    ['char','学','xué','учиться'],
    ['char','中','zhōng','середина; Китай'],
    ['word','你好','nǐ hǎo','здравствуй'],
    ['word','谢谢','xiè xie','спасибо'],
    ['word','再见','zài jiàn','до свидания'],
    ['word','中国','zhōng guó','Китай'],
    ['word','学习','xué xí','учёба, учиться'],
    ['sentence','我爱学汉语','wǒ ài xué hàn yǔ','Я люблю учить китайский'],
    ['sentence','你好，我叫安娜','nǐ hǎo, wǒ jiào ān nà','Здравствуйте, меня зовут Анна']
  ],
  en:[
    ['word','hello','','привет'],
    ['word','thank you','','спасибо'],
    ['word','goodbye','','до свидания'],
    ['word','please','','пожалуйста'],
    ['word','yes','','да'],
    ['word','no','','нет'],
    ['word','friend','','друг'],
    ['word','family','','семья'],
    ['word','water','','вода'],
    ['word','food','','еда'],
    ['word','book','','книга'],
    ['sentence','I love learning English','','Я люблю учить английский'],
    ['sentence','My name is Anna','','Меня зовут Анна']
  ],
  tr:[
    ['word','merhaba','','здравствуй'],
    ['word','teşekkürler','','спасибо'],
    ['word','hoşça kal','','до свидания'],
    ['word','lütfen','','пожалуйста'],
    ['word','evet','','да'],
    ['word','hayır','','нет'],
    ['word','arkadaş','','друг'],
    ['word','aile','','семья'],
    ['word','su','','вода'],
    ['word','yemek','','еда'],
    ['word','kitap','','книга'],
    ['sentence','Türkçe öğrenmeyi seviyorum','','Я люблю учить турецкий'],
    ['sentence','Benim adım Anna','','Меня зовут Анна']
  ],
  ar:[
    ['word','مرحبا','','здравствуй'],
    ['word','شكرا','','спасибо'],
    ['word','مع السلامة','','до свидания'],
    ['word','من فضلك','','пожалуйста'],
    ['word','نعم','','да'],
    ['word','لا','','нет'],
    ['word','صديق','','друг'],
    ['word','عائلة','','семья'],
    ['word','ماء','','вода'],
    ['word','طعام','','еда'],
    ['word','كتاب','','книга'],
    ['sentence','أحب تعلم العربية','','Я люблю учить арабский'],
    ['sentence','اسمي آنا','','Меня зовут Анна']
  ]
};
function sampleData(skipConfirm){
  // примеры добавляются для АКТИВНОГО языка; предупреждаем только если в нём уже есть карточки
  if(!skipConfirm && langItems().length && !confirm('Добавить примеры к уже существующим словам?')) return;
  const S=SAMPLES[activeLang]||SAMPLES.zh;
  for(const [kind,hanzi,pinyin,tr] of S){
    const it={id:uid(),kind,hanzi,pinyin,translation:tr,note:'',tag:'пример',starred:false,recordings:[],box:1,dueSess:0,newDone:0,nsGood:0,nsStreak:0,nsSess:0,nsDoneSess:null,lastSeen:0,nextDue:0,correct:0,wrong:0,correctStreak:0,correctStreakDays:0,lastCorrectDay:'',learnedOn:'',addedOn:dayStr(),addedAt:newAddedAt(),lang:activeLang,updated_at:now(),prog_at:now()};
    assignStableId(it);
    items.push(it);
  }
  persist().then(()=>{ renderDict(); updateChips(); toast('Примеры добавлены'); });
}
// Разовая оферта на первом входе в пустой язык (boot и setLang): спросить и, если
// согласились, добавить стартовый набор. Показывается только когда у языка ещё нет слов.
async function maybeOfferSamples(){
  const S=SAMPLES[activeLang]||SAMPLES.zh;
  if(!S || !S.length) return;
  if(settings.samplesOffered && settings.samplesOffered[activeLang]) return;
  if(!settings.samplesOffered) settings.samplesOffered={};
  settings.samplesOffered[activeLang]=true; // спрашиваем один раз на язык (даже если «Нет»)
  await persist();
  if(langItems().length || !SAMPLES[activeLang] || !SAMPLES[activeLang].length) return;
  if(confirm('Добавить стартовый набор слов для '+langInfo().name+'?')){
    sampleData(true);
  }
}
async function wipeAll(){
  if(!confirm('Удалить ВСЕ слова, аудио и статистику? Это необратимо.')) return;
  for(const it of items) for(const r of (it.recordings||[])){ if(r.url)URL.revokeObjectURL(r.url); await DB.del('aud:'+it.id+':'+r.speed); }
  items=[];
  statsByLang={}; stats=statsFor(activeLang);
  await persist(); await refreshAll(); toast('Всё очищено');
}

// ============================== REFRESH ==============================
async function refreshAll(){
  renderDict(); renderMore(); updateChips(); renderVersion(); refreshModeFilterBadges();
}
// ============================== NAV ==============================
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>go(b.dataset.scr));

// ============================== TOOLBAR BIND ==============================
document.getElementById('btnAdd').onclick=()=>openItemModal(null);
document.getElementById('btnBatch').onclick=openBatch;
document.getElementById('btnSync').onclick=doSync;
document.getElementById('dictSearch').oninput=renderDict;
document.querySelectorAll('[data-dict-filter]').forEach(b=>{
  b.onclick=()=>{
    dictFilter=b.dataset.dictFilter;
    renderDict();
    refreshModeFilterBadges();
  };
});
document.getElementById('dictFilterBtn').onclick=openFilterModal;
document.getElementById('studyAgain').onclick=()=>{
  const it=studyQueue[studyIdx];
  if(!it) return;
  if(!it.starred){ it.starred=true; persist().then(()=>{ updateChips(); toastShort('Слово отмечено ★ — будет повторяться чаще'); }); }
  go('scr-write', it);
};
document.getElementById('studyKnow').onclick=studyNext;
document.getElementById('studyBack').onclick=studyBack;
document.getElementById('studySettingsBtn').onclick=openStudySettings;
document.getElementById('writePrev').onclick=writePrev;
document.getElementById('writeNext').onclick=writeNext;
document.getElementById('writeSettingsBtn').onclick=openWriteSettings;
document.getElementById('examSettingsBtn').onclick=openExamSettings;
document.getElementById('btnExport').onclick=doExport;
document.getElementById('btnImport').onclick=()=>document.getElementById('fileImport').click();
document.getElementById('fileImport').onchange=e=>{ if(e.target.files[0]) doImportFile(e.target.files[0]); e.target.value=''; };
document.getElementById('btnSample').onclick=sampleData;
document.getElementById('btnWipe').onclick=wipeAll;
document.getElementById('voiceSel').onchange=e=>{ settings.voiceURI=e.target.value; persist(); };
// Вкладки «Ещё»: Статистика / Синхронизация / Настройки
document.getElementById('moreTabSeg').querySelectorAll('button').forEach(b=>{
  b.onclick=()=>switchMoreTab(b.dataset.tab);
});
bindSyncPanel();
bindModalDismiss();

// ============================== AUDIO LIFECYCLE ==============================
// Автовоспроизведение: браузеры (особенно мобильные) блокируют звук до первого
// жеста пользователя. Разблокируем очередь TTS самым первым касанием — в фоне,
// без какого-либо звука (говорим пустую строку, которую сразу отменяем).
function unlockAudio(){
  if(audioUnlocked) return;
  if(!('speechSynthesis' in window)){ audioUnlocked=true; return; }
  try{
    const u=new SpeechSynthesisUtterance(' ');
    u.volume=0; u.rate=1;
    u.onend=u.onerror=()=>{ audioUnlocked=true; };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // на случай, если событие не пришло — всё равно считаем разблокированным
    setTimeout(()=>{ try{ speechSynthesis.cancel(); }catch(e){} audioUnlocked=true; }, 800);
  }catch(e){ audioUnlocked=true; }
}
function bindAudioLifecycle(){
  ['pointerdown','touchend','keydown'].forEach(ev=>document.addEventListener(ev, unlockAudio, {passive:true, once:true}));
  // сворачивание/уход в фон — останавливаем всё, чтобы речь не «висела» при возврате;
  // цепочка автоповторов «Учить» при этом обрывается (иначе отложенный таймер включит звук в фоне),
  // а при возврате на карточку — возобновляется.
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ stopAllAudio(); studyTouch(); }
    else{
      const scr=document.getElementById('scr-study');
      if(scr && scr.classList.contains('active') && studyAudioOn){
        const it=studyQueue[studyIdx];
        if(it) studyPlayLoop(it);
      }
    }
  });
  window.addEventListener('pagehide', stopAllAudio);
}
// Единая точка остановки: и плейлист, и одиночные TTS, и проигрывание из словаря
function stopAllAudio(){
  Player.stop();
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
}

// ============================== SYNC (Supabase: LWW-merge) ==============================
// Кнопка «Синхронизировать» на экране Словаря. Только для вошедшего пользователя, только онлайн.
// Модель: каждая строка (карточка / настройки / статистика) побеждает по updated_at (epoch-мс).
// Календарь activity и «дни» words склеиваются по датам (union), а не побеждают одной стороной.
const SYNC_LANG='zh';                 // метка языка в кэше sync-meta (для совместимости старых записей)
let syncBusy=false;                   // идёт синхронизация (блокирует повторный клик)
let lastSyncAt=0;                     // момент последней успешной синхронизации
let _syncUser=null;                   // вошедший пользователь (обновляется в renderAuth)
let _lastOtpReq=0;                    // момент последней отправки ссылки входа (защитный интервал)

// --- кэш облака после последней синхронизации (для «Изменено: N» и «В сети · синхр.») ---
let cloudRecs={};                     // id карточки → {u,pu} метки в облаке (все языки)
let cloudSettingsU=0;                 // updated_at настроек в облаке
let cloudStatsU={};                   // {lang → updated_at} статистики в облаке (Фаза 5)

function cloudStatsUOf(lang){ return cloudStatsU && cloudStatsU[lang] || 0; }

function syncStatus(text, cls){
  const el=document.getElementById('syncStatus'); if(!el) return;
  el.className='sync-status '+(cls||'');
  const t=document.getElementById('syncStatusText'); if(t) t.textContent=text;
}
function setSyncEnabled(incoming){
  const b=document.getElementById('btnSync'); if(!b) return;
  if(syncBusy){ b.disabled=true; b.classList.add('busy'); b.textContent='Синхронизация…'; return; }
  b.disabled=!incoming; b.classList.remove('busy'); b.textContent='Синхронизировать';
}
function syncNetDown(){ return SB_OFFLINE || !sbReady(); }
function refreshSyncUI(){
  if(!document.getElementById('btnSync')) return;
  if(SB_OFFLINE){ setSyncEnabled(false); syncStatus('Офлайн-версия — без облачной синхронизации','off'); return; }
  if(!sbReady()){ setSyncEnabled(false); syncStatus('Нет соединения','off'); return; }
  if(!_syncUser){ setSyncEnabled(false); syncStatus('Войдите, чтобы синхронизировать',''); return; }
  setSyncEnabled(true);
  if(lastSyncAt){
    const n=dirtyCount();
    syncStatus(n>0 ? ('Изменено: '+n+' · не синхронизировано') : ('В сети · синхр. '+fmtHM(lastSyncAt)), 'ok');
  }else{
    syncStatus('В сети · ещё не синхронизировалось','ok');
  }
}
function fmtHM(ts){ const d=new Date(ts); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
// Локальных строк свежее облака — для подсказки «Изменено: N».
function dirtyCount(){
  let n=0;
  // карточки всех языков (облако теперь синхронизирует всё); свежее — если любая часть новее.
  for(const it of items){
    const c=cloudRecs[it.id];
    if(c===undefined) n++;
    else if((it.updated_at||0)>(c.u||0) || (it.prog_at||0)>(c.pu||0)) n++;
  }
  if((settings.updated_at||0)>cloudSettingsU) n++;
  // статистика: каждый язык сверяем со своим облачным updated_at
  for(const lg of Object.keys(statsByLang)){
    if((statsByLang[lg].updated_at||0)>cloudStatsUOf(lg)) n++;
  }
  return Math.min(n,100);
}
// Сериализация карточки для облака: только JSON-значения. Аудио уходит как метаданные
// (speed + имя файла + путь в Storage); blob-URL и служебные флаги исключаются, сам mp3
// хранится в Supabase Storage (Фаза 6), а не в JSON.
function cloudCard(it){
  const o={};
  for(const k of Object.keys(it)){
    if(k==='recordings'||k==='__sig'||k==='__sigC'||k==='__sigP') continue;
    const v=it[k], t=typeof v;
    if(t==='string'||t==='number'||t==='boolean'||v===null) o[k]=v;
  }
  if(!o.lang) o.lang=langOf(it);
  if(o.prog_at===undefined) o.prog_at=it.prog_at||0;
  o.recordings=cloudRecordings(it);
  return o;
}
// Метаданные аудио для облака: слот + имя файла + путь в Storage (без blob-URL и без base64).
// path тут НЕ выдумывается: файл ссылается на Storage только после реальной выгрузки (r.path ставит uploadAudio).
function cloudRecordings(it){
  const out=[];
  for(const r of (it.recordings||[])){
    if(!r || !r.speed) continue;
    out.push({speed:r.speed, name:r.name||'', path:r.path||null});
  }
  return out;
}
// Путь файла в bucket: user_id/<card_id>/<slot>.mp3. Без user_id (не вошли) — файл пока не в облаке (path=null).
function audioPathOf(cardId, slot){ return _syncUser?(_syncUser.id+'/'+cardId+'/'+slot+'.mp3'):null; }
// Восстановление карточки из облака: числовые поля приводим к числам; аудио — как метаданные
// со ссылкой-путём (blob-кэш подтянется локально при hydrateRecordings, если файл есть на устройстве).
function cardFromCloud(data, u, pu){
  const src=data||{};                 // data может быть null — не падаем, трактуем как пустую карточку
  const recs=(src.recordings||[]).map(r=>({speed:r.speed, name:r.name||'', path:r.path||null, url:null}));
  const it={...src,
    recordings:recs,
    box:Math.max(1,Math.min(5,+src.box||1)),
    dueSess:+src.dueSess||0, correct:+src.correct||0, wrong:+src.wrong||0,
    correctStreak:+src.correctStreak||0, correctStreakDays:+src.correctStreakDays||0,
    nsStreak:+src.nsStreak||0, nsSess:+src.nsSess||0,
    nsGood:+src.nsGood||0,
    nsDoneSess:src.nsDoneSess==null?null:src.nsDoneSess,
    nsLastGoodShow:src.nsLastGoodShow==null?null:src.nsLastGoodShow,
    lastShowN:+src.lastShowN||0, lastSeen:+src.lastSeen||0, nextDue:+src.nextDue||0,
    newDone:+src.newDone||0, starred:!!src.starred,
    lastCorrectDay:src.lastCorrectDay||'', learnedOn:src.learnedOn||'', addedOn:src.addedOn||'', addedAt:+src.addedAt||0,
    lang:src.lang||'zh',
    // Фаза 8: авторитетные метки читаем из колонок; data.* — только запасной вариант (для старых row).
    updated_at:(u!==undefined ? (+u||0) : (+src.updated_at||0)),
    prog_at:(pu!==undefined ? (+pu||0) : (+src.prog_at||0))
  };
  seedCardSigs(it);
  return it;
}
// Склейка календарей по датам (union): activity {дата→счёт}, words {дата→[id]}.
function unionArr(a,b){ const s={}; (a||[]).forEach(x=>s[x]=1); (b||[]).forEach(x=>s[x]=1); return Object.keys(s); }
function mergeCalendars(local, remote){
  const out={...local};
  for(const k of Object.keys(remote||{})){
    if(!out[k]){ out[k]=remote[k]; continue; }
    if(Array.isArray(remote[k]) || Array.isArray(out[k])) out[k]=unionArr(out[k], remote[k]);
    else out[k]=Math.max(out[k]||0, remote[k]||0);
  }
  return out;
}
// Есть ли у статистики хоть какая-то реальная история (не пустышка после чистки кэша).
function statsHasData(s){
  if(!s) return false;
  if(Object.keys(s.activity||{}).length>0) return true;
  if(Object.keys(s.words||{}).length>0) return true;
  if((s.streak||0)>0) return true;
  return false;
}
// METADATA (кэш синхронизации в IndexedDB)
// Фаза 8: recs теперь id → {u,pu}; старые кэши с числовым значением чинятся в boot() со сбросом до числа.
const META='sync-meta';
function syncMeta(){ return {lang:SYNC_LANG, email:_syncUser?_syncUser.email:null, lastSync:lastSyncAt, recs:cloudRecs, settingsU:cloudSettingsU, statsU:cloudStatsU}; }
async function saveMeta(){ await DB.put(META, syncMeta()); }
// Приводим кэш облака из IndexedDB к новому виду {u,pu} (старый кэш хранил число = updated_at).
function normalizeCloudRecs(recs){
  const out={};
  for(const id of Object.keys(recs||{})){
    const v=recs[id];
    out[id]=(typeof v==='number') ? {u:v, pu:0} : {u:(v&&v.u)||0, pu:(v&&v.pu)||0};
  }
  return out;
}

// ---------- PULL (Supabase → память) ----------
// Дедупликация облака: три одинаковые карточки (но с разными случайными id) после чистки
// кэша размножились в базе. Здесь «лишние» строки детерминированно отбрасываются (остаётся
// наименьший id) и удаляются из облака, чтобы повторный синк не вернул их снова.
// Ключ совпадения — язык+слово (свёрнутое), payload читаем из jsonb-колонки data.
function dedupeCloudCards(cards){
  const dead=new Set();
  const seen=new Map();
  for(const row of cards){
    const c=cardFromCloud(row.data||{}, row.updated_at, row.prog_at);
    c.lang=row.lang||c.lang;
    const k=dupKeyOfLang(c);
    const s=seen.get(k);
    if(s===undefined){ seen.set(k,row.id); continue; }
    if(row.id<s){ dead.add(s); seen.set(k,row.id); }   // выживает меньший id
    else dead.add(row.id);
  }
  return {cards:cards.filter(r=>!dead.has(r.id)), removed:dead.size, deadIds:Array.from(dead)};
}
async function pullCloudRows(u){
  let cards=[];
  let from=0;
  for(;;){
    const r=await sbClient().from('cards').select('id,lang,data,updated_at,prog_at').eq('user_id',u.id).range(from,from+999);
    if(r.error) throw r.error;
    const rows=r.data||[]; cards.push(...rows);
    if(rows.length<1000) break; from+=1000;
  }
  // Дедупликация облака: одинаковые строки сворачиваются, лишние удаляем из базы сразу
  // (их не должен увидеть мерж ниже). Ошибку удаления не роняем: строки просто останутся,
  // а защиту на следующем синке повторит этот же блок.
  const dd=dedupeCloudCards(cards);
  if(dd.removed){
    try{ await sbClient().from('cards').delete().eq('user_id',u.id).in('id',dd.deadIds); }
    catch(e){ /* не удалились — повторим при следующей синхронизации */ }
  }
  cards=dd.cards;
  const sR=await sbClient().from('user_settings').select('data,updated_at').eq('user_id',u.id).limit(1).maybeSingle();
  if(sR.error) throw sR.error;
  const stR=await sbClient().from('user_stats').select('lang,data,updated_at').eq('user_id',u.id);
  if(stR.error) throw stR.error;
  return {cards, settings:sR.data||null, stats:stR.data||[]};
}
// ---------- АУДИО В Storage (Фаза 6): upload/download + перенос локальных записей ----------
// Модель: публичный bucket `recordings`, путь user_id/<card_id>/<slot>.mp3. В карточке — только
// строка path (постоянный URL), сам mp3 кэшируется локально в IndexedDB (aud:<id>:<slot>).
function publicAudioUrl(it, slot){
  const r=(it.recordings||[]).find(x=>x.speed===slot&&x.path);
  return r && r.path && sbClient() ? sbClient().storage.from('recordings').getPublicUrl(r.path).data.publicUrl : null;
}
// Текущая запись слота (если есть).
function liveRec(it, slot){
  return (it.recordings||[]).find(x=>x.speed===slot) || null;
}
// Кэшируем файл из Storage локально (играет офлайн и без повторной скачки).
async function cacheRemoteAudio(it, slot){
  const rec=liveRec(it, slot);
  if(!rec || rec.url) return;
  const path=rec.path;
  if(!path || !sbClient()) return;
  const local=await DB.get('aud:'+it.id+':'+slot);
  if(local){ rec.url=URL.createObjectURL(new Blob([local.buf],{type:local.type})); return; }
  // Пробуем публичный URL; если bucket остался приватным (403) — подписанный URL.
  const urls=[sbClient().storage.from('recordings').getPublicUrl(path).data.publicUrl];
  try{
    const {data,error}=await sbClient().storage.from('recordings').createSignedUrl(path, 3600);
    if(!error && data && data.signedUrl) urls.push(data.signedUrl);
  }catch(e){ /* подписанный не нужен — публичный сработает */ }
  for(const url of urls){
    try{
      const resp=await fetch(url);
      if(!resp.ok) continue;                  // 403/404 — пробуем следующий источник
      const buf=new Uint8Array(await resp.arrayBuffer());
      const type=resp.headers.get('content-type')||'audio/mpeg';
      await DB.put('aud:'+it.id+':'+slot, {name:rec.name||'audio', type, buf});
      rec.url=URL.createObjectURL(new Blob([buf],{type}));
      return;
    }catch(e){ /* офлайн/сеть упала — следующий источник или TTS */ }
  }
  // файла нет ни по одному адресу — останется TTS
}
// Подтягиваем mp3 для указанных слотов перед проигрыванием (облачные записи приходят
// с path, но без локального файла — url пуст). После этого у записи есть url,
// и playlist/экзамен играют файл вместо синтеза речи. Безопасно для офлайн-версии:
// publicAudioUrl вернёт null (нет клиента) — ничего не делаем.
async function ensureCardAudio(it, slots){
  if(!it) return;
  for(const s of (slots||AUDIO_SLOTS)){
    const r=liveRec(it, s);
    if(r && r.path && !r.url) await cacheRemoteAudio(it, s);
  }
}
// После успешной синхронизации докачиваем mp3 для записей, у которых есть path из облака,
// но нет локального кэша (например, новое устройство). Это делает «Данные → База аудио»
// одинаковой на всех устройствах и гарантирует звук без предварительного открытия карточки.
// Идём последовательно и не ждём завершения (фон), чтобы синк не подвисал.
async function prefetchCloudAudio(){
  if(!_syncUser || !sbClient()) return;
  let n=0;
  for(const it of items){
    for(const r of (it.recordings||[])){
      if(!r || !r.speed || !AUDIO_SLOTS.includes(r.speed)) continue;
      if(!r.path || r.url) continue;
      const local=await DB.get('aud:'+it.id+':'+r.speed);
      if(local) continue;
      try{ await cacheRemoteAudio(it, r.speed); n++; }catch(e){ /* сеть/офлайн — доберём при следующем синке */ }
      if(n>=200) return;
    }
  }
}
// Поднимаем локальную запись в Storage (если ещё не там) и проставляем path карточке.
async function uploadAudio(it, slot){
  const rec=liveRec(it, slot);
  if(!rec || !_syncUser || !sbClient()) return;
  const path=audioPathOf(it.id, slot);
  if(!path) return;
  if(rec.path) return;                    // уже выгружена (на этом или другом устройстве)
  if(!rec.url || !rec.url.startsWith('blob:')) return;  // локального файла нет — нечего грузить
  let buf=null;
  try{ const resp=await fetch(rec.url); buf=new Uint8Array(await resp.arrayBuffer()); }
  catch(e){ return; }
  if(!buf) return;
  const {error}=await sbClient().storage.from('recordings').upload(path, buf, {
    contentType:'audio/mpeg', cacheControl:'3600', upsert:true
  });
  if(error) throw error;
  rec.path=path;
}
// Обходим карточки: локальные записи без path и с файлом на устройстве — в облако
// (перенос существующих mp3 владельца). Вызывается до LWW-мержа; таймстампы НЕ трогаем,
// чтобы сам факт выгрузки не делал карточку победителем над облачной версией.
async function uploadPendingAudio(){
  if(!_syncUser || !sbClient()) return;
  for(const it of items){
    for(const r of (it.recordings||[])){
      if(!r || !r.speed || !AUDIO_SLOTS.includes(r.speed)) continue;
      if(r.path || it.id.startsWith('_tmp')) continue;
      try{ await uploadAudio(it, r.speed); }
      catch(e){ /* не выгрузился — попробуем в следующую синхронизацию */ }
    }
  }
}
// Удаляем файл из Storage (когда запись снята с карточки).
async function removeAudioRemote(it, slot){
  if(!_syncUser || !sbClient()) return;
  const path=audioPathOf(it.id, slot);
  if(!path) return;
  try{ await sbClient().storage.from('recordings').remove([path]); }catch(e){}
}
// ---------- MERGE + PUSH (Фаза 8: контент/прогресс по отдельности) ----------
// Пуш одной карточки: две авторитетные колонки updated_at (контент) и prog_at (прогресс).
// Серверные guard-триггеры не дадут записать метку меньше хранимой даже от багнутого/старого клиента.
async function pushCard(it, u){
  const r=await sbClient().from('cards').upsert({
    id:it.id, user_id:u.id, lang:langOf(it), data:cloudCard(it),
    updated_at:it.updated_at||0, prog_at:it.prog_at||0
  },{onConflict:'id'});
  if(r.error) throw r.error;
}
// Копируем контент из источника (облако) в цель. Аудио: облачные слоты (speed+name+path),
// но локальный blob-кэш — поверх path, чтобы играть офлайн на этом устройстве.
function applyContentSrc(dst, src){
  for(const k of C_FIELDS){ if(src[k]!==undefined) dst[k]=src[k]; }
  const keepLocal=(dst.recordings||[]).filter(r=>r&&r.url&&r.url.startsWith('blob:'));
  const by={}; for(const r of keepLocal) by[r.speed]=r;
  // Локальный path mp3 не должен исчезать при pull: если облачная копия слота ещё без path
  // (старая версия не доставила ссылку), подставляем локальный путь поверх облачного null.
  // Иначе pull «съедает» ссылку на файл — и другие устройства так и не получают mp3, а это
  // устройство после пулла перестаёт играть запись (TTS вместо файла).
  const localPath={}; for(const r of (dst.recordings||[])){ if(r && r.path) localPath[r.speed]=r.path; }
  dst.recordings=(src.recordings||[]).map(r=>({
    ...r,
    path: (!r.path && localPath[r.speed]) ? localPath[r.speed] : r.path,
    url: by[r.speed] ? by[r.speed].url : (r.url||null)
  }));
  dst.updated_at=src.updated_at||0;
}
// Копируем прогресс из источника (облако) в цель.
function applyProgressSrc(dst, src){
  for(const k of P_FIELDS){ if(src[k]!==undefined) dst[k]=src[k]; }
  dst.prog_at=src.prog_at||0;
}
// True, если локальная карточка знает path слота, которого нет (или иной) у облачной версии.
// Нужно для Фазы 6.2: path проставляется после реальной выгрузки файла, но в recSig НЕ входит
// (смена URL не должна делать карточку «новее»), поэтому при равенстве таймстампов decidePart
// говорит 'none' и обычного пуша нет — path так и не доходил до облака, и другие устройства
// играли TTS вместо mp3.
function missingCloudPaths(loc, cl){
  const c={}; for(const r of (cl.recordings||[])) if(r && r.path) c[r.speed]=r.path;
  for(const r of (loc.recordings||[])){ if(r && r.path && c[r.speed]!==r.path) return true; }
  return false;
}
// Обратное направление: облако знает path слота, а локальная запись — нет (или name пуст).
// Такое бывает при 'none' (таймстампы и recSig равны → ни pull, ни push не срабатывают):
// на устройстве, которое ещё не видело mp3, path так и оставался null и играл TTS.
// Здесь мы молча перенимаем path из облака (метаданные — не влияют ни на recSig, ни на updated_at),
// после чего prefetchCloudAudio докачает сам файл.
function adoptCloudPaths(loc, cl){
  const c={}; for(const r of (cl.recordings||[])){ if(r && r.path) c[r.speed]={path:r.path,name:r.name||''}; }
  let changed=false;
  for(const r of (loc.recordings||[])){
    if(!r || !r.speed || r.path) continue;
    const v=c[r.speed];
    // Берём path из облака только если это ТА ЖЕ запись (совпало имя) или локальное имя пустое.
    // Если имя разное — это другая запись, чужой path не подставляем.
    if(v && (!r.name || r.name===v.name)){ r.path=v.path; if(!r.name) r.name=v.name; changed=true; }
  }
  return changed;
}
// Как решается каждая часть при авто-мерже: push/pull/none/conflict.
// Конфликт — когда обе стороны реально меняли часть (оба ts>0) с разным payload.
function decidePart(part, loc, cl){
  const locT = part==='content' ? (loc.updated_at||0) : (loc.prog_at||0);
  const remT = part==='content' ? (cl.updated_at||0) : (cl.prog_at||0);
  const sigE = part==='content'
    ? itemContentSig(loc)!==itemContentSig(cl)
    : itemProgSig(loc)!==itemProgSig(cl);
  // Прогресс (SRS) авто-варешается по чистому LWW: чей таймстамп новее, та версия и побеждает.
  // Экран конфликтов для прогресса НЕ показываем: из-за того, что коробку меняет каждое занятие,
  // обе стороны почти всегда «меняли» одну и ту же карточку, и каждое устройство, выбрав
  // «Локально», перезаписывало свежий прогресс другого — прогресс не сходился никогда.
  // Конфликт показываем ТОЛЬКО когда таймстампы равны (часы устройств сошлись / совпали
  // до миллисекунды), но стороны меняли часть по-разному. Обе стороны реально «свежие»
  // одновременно — авто-выбор невозможен, нужен человек.
  if(locT===remT && locT>0 && sigE) return 'conflict';
  // Явно свежая сторона → чистое LWW, окно конфликтов не показываем (как и для прогресса).
  if(locT>remT) return 'push';
  if(locT<remT) return 'pull';
  return 'none';
}
// Превью части для экрана конфликтов.
function contentPreview(it){ return (it.translation||'').trim() || (it.pinyin||'').trim() || '—'; }
function progressPreview(it){ return 'Коробка '+it.box+' · верно '+it.correct+' · ошибок '+it.wrong; }
// Дата/время из epoch-ms (для сравнения сторон в конфликте).
function fmtDT(ts){
  if(!ts) return 'нет данных';
  const d=new Date(ts);
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear()+' '+hh+':'+mm;
}
// Экран конфликтов: rows = [{it, cloudIt, content:bool, progress:bool}]. Возвращает Promise
// карты id → {content:'local'|'cloud', progress:...} только для спорных частей.
// Решение принимается глобально по частям «Контент» и «Прогресс» (не на каждое слово);
// список со сравнением дат — только справка для обдумывания.
function modalSyncConflicts(rows){
  return new Promise(resolve=>{
    closeAllModals();
    const m=document.getElementById('modalSyncConflicts');
    // Сколько спорных карточек по каждой части и чья версия чаще свежее.
    const cnt={content:{n:0,local:0,cloud:0}, progress:{n:0,local:0,cloud:0}};
    for(const row of rows){
      if(row.content){ cnt.content.n++;
        if((row.it.updated_at||0)>(row.cloudIt.updated_at||0)) cnt.content.local++; else cnt.content.cloud++; }
      if(row.progress){ cnt.progress.n++;
        if((row.it.prog_at||0)>(row.cloudIt.prog_at||0)) cnt.progress.local++; else cnt.progress.cloud++; }
    }
    // По умолчанию сторона, где свежих изменений больше (если ничья — локально).
    const def=p=> cnt[p].local>=cnt[p].cloud ? 'local' : 'cloud';
    // Глобальный выбор по частям — единый для всех спорных карточек.
    const g={content:def('content'), progress:def('progress')};
    const freshSide=(part,row)=>{
      const lt=part==='content'?(row.it.updated_at||0):(row.it.prog_at||0);
      const rt=part==='content'?(row.cloudIt.updated_at||0):(row.cloudIt.prog_at||0);
      return lt>rt?'local':(lt<rt?'cloud':'none');
    };
    const sideHTML=(part,label,locPrev,clPrev)=>{
      return `<div class="cf-global">
        <div class="cf-g-head"><b>${label}</b><span class="spacer"></span><span class="muted">${cnt[part].n} карт.</span></div>
        <div class="muted cf-g-sum">Свежих локально: <b>${cnt[part].local}</b> · в облаке: <b>${cnt[part].cloud}</b></div>
        <div class="seg sm">
          <button class="cf-seg-btn ${g[part]==='local'?'on':''}" data-part="${part}" data-val="local">Локально</button>
          <button class="cf-seg-btn ${g[part]==='cloud'?'on':''}" data-part="${part}" data-val="cloud">Облако</button>
        </div>
      </div>`;
    };
    let html='<div class="sheet"><div class="row"><h2>Конфликты синхронизации</h2><div class="spacer"></div></div>';
    html+='<div class="muted">Обе стороны меняли одни и те же карточки. Выберите, какую сторону оставить.</div>';
    // Переключатель части показываем, только если по ней есть реальные конфликты
    // (иначе блок с «0 карт.» выглядел бы пустым и вводил в заблуждение).
    if(cnt.content.n) html+=sideHTML('content','Контент (слова, переводы, аудио)');
    if(cnt.progress.n) html+=sideHTML('progress','Прогресс (уровень, ответы)');
    // Детали: показываем только 2 самые свежие карточки (считая по обеим сторонам),
    // чтобы список не разрастался при массовом переносе базы что на одном устройстве,
    // что на другом. Остальные — общим счётчиком «+ ещё N».
    const DETAIL_MAX=2;
    const byAge=(a,b)=>{
      const t=x=>Math.max(x.it.updated_at||0, x.it.prog_at||0, x.cloudIt.updated_at||0, x.cloudIt.prog_at||0);
      return t(b)-t(a);
    };
    const shown=[...rows].sort(byAge).slice(0, DETAIL_MAX);
    const restN=rows.length-shown.length;
    html+='<div class="cf-list-lbl">Детали для сравнения</div>';
    for(const row of shown){
      const loc=row.it, cl=row.cloudIt;
      const langName=(LANG_MAP[loc.lang||cl.lang]||LANGS[0]).name;
      html+=`<div class="conflict-card">
        <div class="row"><span class="conflict-face ${hasStrokes()?'zh':''}">${escapeHtml((loc.hanzi||cl.hanzi||'?'))}</span><span class="spacer"></span><span class="muted">${escapeHtml(langName)}</span></div>`;
      if(row.content){
        const fr=freshSide('content',row);
        html+=`<div class="cf-part">Контент</div>
          <div class="cf-cmp-row">
            <div class="cf-cmp-side ${fr==='local'?'fresh':''}"><span class="cf-tag">Это устройство${fr==='local'?' · новее':''}</span><span class="cf-dt">${fmtDT(loc.updated_at)}</span><span class="cf-prev">${escapeHtml(contentPreview(loc))}</span></div>
            <div class="cf-cmp-side ${fr==='cloud'?'fresh':''}"><span class="cf-tag">Облако${fr==='cloud'?' · новее':''}</span><span class="cf-dt">${fmtDT(cl.updated_at)}</span><span class="cf-prev">${escapeHtml(contentPreview(cl))}</span></div>
          </div>`;
      }
      if(row.progress){
        const fr=freshSide('progress',row);
        html+=`<div class="cf-part">Прогресс</div>
          <div class="cf-cmp-row">
            <div class="cf-cmp-side ${fr==='local'?'fresh':''}"><span class="cf-tag">Это устройство${fr==='local'?' · новее':''}</span><span class="cf-dt">${fmtDT(loc.prog_at)}</span><span class="cf-prev">${escapeHtml(progressPreview(loc))}</span></div>
            <div class="cf-cmp-side ${fr==='cloud'?'fresh':''}"><span class="cf-tag">Облако${fr==='cloud'?' · новее':''}</span><span class="cf-dt">${fmtDT(cl.prog_at)}</span><span class="cf-prev">${escapeHtml(progressPreview(cl))}</span></div>
          </div>`;
      }
      html+=`</div>`;
    }
    if(restN>0) html+=`<div class="muted" style="text-align:center; padding:4px 0 10px">+ ещё ${restN} ${pluralRu(restN,'карточка','карточки','карточек')}</div>`;
    html+=`<div class="cf-apply-row"><button class="btn" id="cfApply" style="width:100%">Применить</button></div>`;
    html+=`</div>`;
    m.innerHTML=html;
    m.classList.remove('hidden');
    const refreshSegs=()=>{
      m.querySelectorAll('.cf-seg-btn').forEach(b=>{
        b.classList.toggle('on', g[b.dataset.part]===b.dataset.val);
      });
    };
    m.querySelectorAll('.cf-seg-btn').forEach(b=>{
      b.onclick=()=>{ g[b.dataset.part]=b.dataset.val; refreshSegs(); };
    });
    // Пока идёт синхронизация, Esc и клик по фону НЕ закрывают экран конфликтов (нельзя потерять выбор).
    const escGuard=e=>{ if(e.key==='Escape'){ e.stopPropagation(); e.preventDefault(); } };
    const pdGuard=e=>{ if(e.target===m){ e.stopPropagation(); } };
    document.addEventListener('keydown', escGuard, true);
    m.addEventListener('pointerdown', pdGuard, true);
    let done=false;
    const finish=()=>{
      if(done) return; done=true;
      document.removeEventListener('keydown', escGuard, true);
      m.removeEventListener('pointerdown', pdGuard, true);
      closeModal('modalSyncConflicts');
      // Возвращаем единый выбор для всех спорных карточек по обеим частям.
      const out={};
      for(const row of rows) out[row.it.id]=g;
      resolve(out);
    };
    m.querySelector('#cfApply').onclick=finish;
  });
}
async function doSync(){
  if(syncBusy || syncNetDown()) return;
  syncBusy=true; setSyncEnabled(false); syncStatus('Синхронизация…','spin');
  // Снапшот для отката: если сеть оборвётся на полпути, локальные данные не должны пострадать.
  const snap={items:items.slice(), settings:{...settings}, statsByLang:JSON.parse(JSON.stringify(statsByLang)), sigSet:_sigSet, sigStats:{..._sigStatsMap}};
  let pulledN=0, pushedN=0;
  // Счётчики направления для журнала (Фаза 9): «что откуда и куда ушло» по частям.
  let cPush=0, cPull=0, pPush=0, pPull=0;
  let confContent=0, confContentLocal=0, confContentCloud=0;
  let confProgress=0, confProgressLocal=0, confProgressCloud=0;
  const syncStartedAt=now();
  try{
    const u=_syncUser;
    if(!u) throw new Error('Сначала войдите в аккаунт');
    const cloud=await pullCloudRows(u);
    // Фаза 6: локальные mp3 без path выгружаем ДО мержа, чтобы пуш шёл уже со ссылкой на файл.
    // Локальная запись при выгрузке получит path, но НЕ таймстамп — карточка не должна
    // «победить» облачную лишь из-за того, что на этом устройстве оказался файл.
    await uploadPendingAudio();
    const cloudById={};                 // облачные карточки ВСЕХ языков
    for(const row of cloud.cards) cloudById[row.id]={u:row.updated_at||0, pu:row.prog_at||0, data:row.data, lang:row.lang};

    // --- крос-дедупликация: одинаковый материал (язык+слово) с РАЗНЫМИ id ---
    // По-id мерж такие не ловит (id случайны). Если локальная и облачная копии — дубли,
    // склеиваем их детерминированно (меньший id выживает), прогресс — максимумы.
    for(let i=0;i<items.length;i++){
      const it=items[i];
      if(!String(it.hanzi||'').trim()) continue;
      const k=dupKeyOfLang(it);
      // находим облачную копию с тем же ключом, но другим id
      let clRow=null;
      for(const rid of Object.keys(cloudById)){
        if(rid===it.id) continue;
        const row=cloudById[rid];
        if(row._dupKey===undefined) row._dupKey=dupKeyOfLang(cardFromCloud(row.data||{}, row.u, row.pu));
        if(row._dupKey===k){ clRow={id:rid, row}; break; }
      }
      if(!clRow) continue;
      const cloudIt=cardFromCloud(clRow.row.data||{}, clRow.row.u, clRow.row.pu);
      let survIt, loserIt;
      if(it.id<clRow.id){
        survIt=it; loserIt=cloudIt;
        // выживает локальная: вливаем прогресс облака и удаляем облачную строку
        delete cloudById[clRow.id];
        const dr=await sbClient().from('cards').delete().eq('user_id',u.id).eq('id',clRow.id);
        if(dr.error) throw dr.error;
      }else{
        survIt=cloudIt; loserIt=it;
        // выживает облачная: из локальной забираем только прогресс; локальную убираем из items
        mergeDupInto(survIt, loserIt);
        revokeAll(it);
        items.splice(i,1); i--;
        // облачную строку обновим обычным пушем: проставим merged-прогресс выжившему
        cloudById[clRow.id]={u:survIt.updated_at||0, pu:survIt.prog_at||0, data:cloudCard(survIt), lang:survIt.lang};
        const pu=await sbClient().from('cards').upsert({id:clRow.id, user_id:u.id, lang:survIt.lang, data:cloudCard(survIt), updated_at:survIt.updated_at||0, prog_at:survIt.prog_at||0},{onConflict:'id'});
        if(pu.error) throw pu.error;
        continue;
      }
      mergeDupInto(it, cloudIt);
    }
    // подписи после крос-склейки (таймстампы могли сдвинуться максимумами)
    for(const it of items) seedCardSigs(it);

    // --- карточки (все языки): план мержа по каждой части ---
    const localSeen={};
    const plans=[];                     // {it, rec?, cloudIt?, content, progress}
    const conflictRows=[];              // строки для экрана конфликтов
    for(let i=0;i<items.length;i++){
      const it=items[i];
      localSeen[it.id]=1;
      const rec=cloudById[it.id];
      if(!rec){ plans.push({it, rec:null}); continue; }
      const cloudIt=cardFromCloud(rec.data||{}, rec.u, rec.pu);
      const cd=decidePart('content', it, cloudIt);
      const pd=decidePart('progress', it, cloudIt);
      plans.push({it, rec, cloudIt, content:cd, progress:pd});
      if(cd==='conflict' || pd==='conflict'){
        conflictRows.push({it, cloudIt, content:cd==='conflict', progress:pd==='conflict'});
      }
    }

    // Экран конфликтов, если есть спорные карточки (синхронизация ждёт выбора).
    const choice = conflictRows.length ? await modalSyncConflicts(conflictRows) : null;
    // {id → {content:'local'|'cloud', progress:...}} по тем частям, что были спорными
    for(const row of conflictRows){
      const ch=choice ? (choice[row.it.id]||{}) : {};
      if(row.content){ confContent++;
        if(ch.content==='cloud') confContentCloud++; else confContentLocal++; }
      if(row.progress){ confProgress++;
        if(ch.progress==='cloud') confProgressCloud++; else confProgressLocal++; }
    }

    // --- применяем план ---
    for(const plan of plans){
      const it=plan.it;
      if(!plan.rec){
        // локальна, в облаке нет → push целиком (если часть свежая — считаем её по направлению)
        if(!it.updated_at && !it.prog_at){ const ts=now(); it.updated_at=ts; it.prog_at=ts; }
        await pushCard(it, u);
        pushedN++;
        if(it.updated_at>0) cPush++;          // контент новый (или только что помечен)
        if(it.prog_at>0) pPush++;
        cloudRecs[it.id]={u:it.updated_at||0, pu:it.prog_at||0};
        continue;
      }
      const ch=choice ? (choice[it.id]||{}) : {};
      const resolvePart=(auto, picked)=> auto==='conflict' ? (picked==='local'?'push':'pull') : auto;
      const cd=resolvePart(plan.content, ch.content);
      const pd=resolvePart(plan.progress, ch.progress);
      // Фаза 6.2: local path mp3 (файл уже в Storage) обязан доехать до облака при ЛЮБОМ
      // исходе мержа — не только при 'none'+равных таймстампах. Раньше при 'pull' или конфликте
      // pushCard не вызывался, и cloud хранил recordings[].path=null → другие устройства играли TTS.
      if(cd==='pull'){ applyContentSrc(it, plan.cloudIt); pulledN++; cPull++; }
      if(pd==='pull'){ applyProgressSrc(it, plan.cloudIt); pulledN++; pPull++; }
      let pushPaths = missingCloudPaths(it, plan.cloudIt);
      // Путь mp3 есть в облаке, а локально не подхватился (не было ни pull, ни push —
      // 'none' при равных сигнатурах) → перенимаем path молча; prefetch докачает файл.
      if(!pushPaths) adoptCloudPaths(it, plan.cloudIt);
      if(cd==='push'){ cPush++; }
      if(pd==='push'){ pPush++; }
      // Проверяем ПОСЛЕ пулла: локальная копия в итоге знает путь, которого нет в облаке?
      // Тогда принудительно пушим метаданные (path), даже если направление мержа было 'pull'.
      pushPaths = missingCloudPaths(it, plan.cloudIt);
      if(cd==='push' || pd==='push' || pushPaths){
        await pushCard(it, u);
        pushedN++;
        if(pushPaths) cPush++;
      }
      cloudRecs[it.id]={u:it.updated_at||0, pu:it.prog_at||0};
      seedCardSigs(it);                 // нейтрализуем persist() после внешних записей
    }
    // облачные карточки, которых нет локально → pull (новое устройство / восстановление)
    for(const id of Object.keys(cloudById)){
      if(localSeen[id]) continue;
      const rec=cloudById[id];
      const n=cardFromCloud(rec.data||{}, rec.u, rec.pu);
      if(!n.id) n.id=id;
      migrateItem(n);
      normalizeAppItem(n);
      items.push(n);
      pulledN++;
      if(n.updated_at>0) cPull++;
      if(n.prog_at>0) pPull++;
      cloudRecs[id]={u:rec.u, pu:rec.pu};
    }

    // --- настройки (один timestamp; серверный триггер не даст затереть свежее) ---
    const locSU=settings.updated_at||0, remSU=cloud.settings?(cloud.settings.updated_at||0):0;
    if(remSU>locSU){
      const d={...cloud.settings.data};
      for(const k of Object.keys(d)){ if(k==='updated_at'||k==='sessN') continue; settings[k]=d[k]; }
      settings.updated_at=remSU;
      pulledN++;
    }else if(locSU>remSU){
      const r=await sbClient().from('user_settings').upsert({user_id:u.id, data:cleanSettings(), updated_at:locSU},{onConflict:'user_id'});
      if(r.error) throw r.error;
      pushedN++;
    }
    cloudSettingsU=Math.max(locSU,remSU);

    // --- статистика: по одному LWW-мержу на каждый язык (Фаза 5) ---
    const stByLang={};                                  // code → {loc, cloud}
    for(const lg of Object.keys(statsByLang)) stByLang[lg]={loc:statsByLang[lg]};
    for(const row of cloud.stats){
      const c=row.lang||'zh';
      if(stByLang[c]) stByLang[c].cloud=row; else stByLang[c]={loc:statsFor(c), cloud:row};
    }
    for(const lg of Object.keys(stByLang)){
      const stLoc=stByLang[lg].loc;
      const stCloud=stByLang[lg].cloud||null;
      const slU=stLoc.updated_at||0, sRU=stCloud?(stCloud.updated_at||0):0;
      // Статистика — монотонная (activity/words только растут). Пустышка не может быть
      // «свежей истиной»: если облако новее, но ПУСТОЕ, а локально есть история —
      // значит облако затерли пустышкой (баг перештамповки) → восстанавливаем историю.
      const locHas=statsHasData(stLoc);
      const remHas=stCloud?statsHasData(stCloud.data):false;
      if(sRU>slU && !(locHas && !remHas)){
        const d=stCloud.data||{};
        stLoc.activity=mergeCalendars(stLoc.activity||{}, d.activity||{});
        stLoc.words=mergeCalendars(stLoc.words||{}, d.words||{});
        for(const k of Object.keys(d)){ if(k==='activity'||k==='words'||k==='updated_at') continue; stLoc[k]=d[k]; }
        stLoc.updated_at=sRU;
        pulledN++;
      }else if(locHas && (slU>sRU || !remHas)){
        // пуш свежего (slU>sRU) либо восстановление истории поверх затёртой пустышки.
        // В случае восстановления время серверной записи берём «сейчас» — guard-триггер
        // примет её (иначе более старая метка была бы отброшена как устаревшая).
        const pushU = slU>sRU ? slU : now();
        const r=await sbClient().from('user_stats').upsert({user_id:u.id, lang:lg, data:cleanStatsOf(lg), updated_at:pushU},{onConflict:'user_id,lang'});
        if(r.error) throw r.error;
        pushedN++;
      }
      cloudStatsU[lg]=Math.max(slU,sRU);
    }

    // --- аудио (Фаза 6): записи, пришедшие из облака с path, но без локального кэша, подтягиваем
    // фоновой предзагрузкой после успешного мержа — иначе «База аудио» разнится между устройствами,
    // а свежесинхронная запись не играет файл, пока её карточку не откроют вручную.

    // --- сохранение локально (подписи подгоняем, чтобы persist не сдвинул таймстампы) ---
    _sigSet=settingsSig(settings);
    for(const lg of Object.keys(statsByLang)) _sigStatsMap[lg]=statsSig(statsByLang[lg]);
    await persist(); await refreshAll();
    lastSyncAt=now();
    await saveMeta();
    // Фоновая докачка mp3 из облака (не блокирует финал синхронизации).
    if(_syncUser && sbClient()) prefetchCloudAudio();
    // Журнал синхронизации (что откуда и куда ушло) — отдельная запись в БД, не влияет на мерж.
    await logSyncEvent({
      startedAt:syncStartedAt, durationMs:now()-syncStartedAt,
      deviceLabel:deviceLabel(),
      pushedCards:pushedN, pulledCards:pulledN,
      contentPush:cPush, contentPull:cPull, progressPush:pPush, progressPull:pPull,
      conflictContent:confContent, conflictContentLocal:confContentLocal, conflictContentCloud:confContentCloud,
      conflictProgress:confProgress, conflictProgressLocal:confProgressLocal, conflictProgressCloud:confProgressCloud
    });
    syncStatus('Синхронизировано · '+(pulledN?('принято '+pulledN):'')+(pushedN?((pulledN?' · ':'')+'отправлено '+pushedN):''), 'ok');
    // П.13: если вкладка «Синхронизация» открыта — сразу обновляем её журнал после успешного синка
    if(moreTab==='sync') renderSyncPanel();
  }catch(e){
    // откат к снапшоту — локальные данные не тронуты
    items=snap.items; settings=snap.settings; statsByLang=snap.statsByLang; stats=statsByLang[activeLang]; _sigSet=snap.sigSet; _sigStatsMap=snap.sigStats;
    const msg=String(e&&e.message||e);
    if(/fetch|network|Failed to fetch/i.test(msg)) syncStatus('Нет соединения — не синхронизировано','off');
    else if(/войдите|Сначала/i.test(msg)) syncStatus('Войдите, чтобы синхронизировать','');
    else syncStatus('Ошибка синхронизации','off');
  }finally{
    syncBusy=false; setSyncEnabled(!!_syncUser && !syncNetDown());
  }
}
// Настройки без служебных полей (updated_at/sessN) — то, что уходит в облако.
function cleanSettings(){
  const o={};
  for(const k of Object.keys(settings)){ if(k==='updated_at'||k==='sessN') continue; if(settings[k]!==undefined) o[k]=settings[k]; }
  return o;
}
// Статистика языка без метки updated_at — то, что уходит в облако.
function cleanStatsOf(lang){
  const s=statsByLang[lang]||{};
  const o={};
  for(const k of Object.keys(s)){ if(k==='updated_at') continue; if(s[k]!==undefined) o[k]=s[k]; }
  return o;
}
function sbReady(){ return !SB_OFFLINE && !!window.supabase && typeof window.supabase.createClient==='function'; }
function sbClient(){
  if(!SB && sbReady()){ SB=window.supabase.createClient(SB_URL, SB_ANON); }
  return SB;
}
async function localSessionUser(){
  const c=sbClient(); if(!c) return null;
  try{
    // getSession читает локальную сессию (без запроса к серверу): вход переживает
    // перезагрузку страницы и не «теряется» при кратком отсутствии сети на старте.
    const {data}=await c.auth.getSession();
    return data && data.session && data.session.user ? data.session.user : null;
  }catch(e){ return null; }
}
async function renderAuth(){
  const box=document.getElementById('authBox'); if(!box) return;
  if(SB_OFFLINE){
    box.innerHTML='<div class="auth-hint">Офлайн-версия — без облачной синхронизации. Откройте онлайн-версию, чтобы войти.</div>';
    return;
  }
  if(!sbReady()){
    box.innerHTML='<div class="auth-hint">Не удалось загрузить Supabase — проверьте подключение к интернету.</div>';
    return;
  }
  const u=await localSessionUser();
  _syncUser=u;
  if(u){
    const shown=settings.userName || u.email || '';
    box.innerHTML=`<div class="auth-line"><span class="mail">${escapeHtml(shown)}</span><span class="spacer"></span>
      <button class="btn sec" style="width:auto; padding:9px 14px" id="btnSignOut">Выйти</button></div>
      ${settings.userName?`<div class="auth-hint">${escapeHtml(u.email||'')}</div>`:''}
      <div class="auth-hint">Вы вошли. Нажмите «Синхронизировать» в Словаре, чтобы перенести данные в облако.</div>`;
    document.getElementById('btnSignOut').onclick=authSignOut;
  }else{
    box.innerHTML=`<div class="auth-line"><span class="auth-hint" style="margin:0">Вы не вошли.</span><span class="spacer"></span>
      <button class="btn" style="width:auto; padding:9px 14px" id="btnOpenAuth">Войти</button></div>
      <div class="auth-hint">Вход по email: пришлём письмо со ссылкой для входа. Без пароля.</div>`;
    document.getElementById('btnOpenAuth').onclick=openAuthModal;
  }
  refreshSyncUI();
}
function openAuthModal(){
  closeAllModals();
  const m=document.getElementById('modalAuth');
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Вход по email</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalAuth')">✕</button></div>
    <div class="auth-hint" style="margin-top:6px" id="authHint">Введите email — пришлём на него ссылку для входа. Пароль не нужен.</div>
    <input type="email" id="authEmail" placeholder="you@example.com" style="margin-top:10px" inputmode="email" autocomplete="email">
    <button class="btn" id="authSend" style="margin-top:10px">Отправить ссылку</button>
    <div class="auth-hint" id="authMsg" style="margin-top:8px"></div>
    <div class="auth-hint" id="authDiag" style="margin-top:6px;font-size:11px;font-family:ui-monospace,monospace;word-break:break-all;opacity:.75"></div>
  </div>`;
  m.classList.remove('hidden');
  const inp=document.getElementById('authEmail');
  const send=document.getElementById('authSend');
  const msg=document.getElementById('authMsg');
  const hint=document.getElementById('authHint');
  const diag=document.getElementById('authDiag');
  if(inp) setTimeout(()=>inp.focus(),60);
  // После успешной отправки прячем поля и показываем явный итог: письмо ушло, ждём клик по ссылке.
  const showSent=(email)=>{
    const sheet=m.querySelector('.sheet');
    if(sheet) sheet.innerHTML=`<div class="row"><h2>Проверьте почту</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalAuth')">✕</button></div>
      <div class="auth-hint" style="margin-top:10px;font-size:14px">Мы отправили ссылку для входа на <b>${escapeHtml(email)}</b>.</div>
      <div class="auth-hint" style="margin-top:6px">Откройте письмо и нажмите в нём ссылку — вы вернётесь в приложение уже вошедшим. Если письма нет, загляните в «Спам».</div>
      <button class="btn" id="authDone" style="margin-top:14px">Готово</button>`;
    const done=m.querySelector('#authDone');
    if(done) done.onclick=()=>closeModal('modalAuth');
  };
  send.onclick=async ()=>{
    const email=inp.value.trim();
    if(!email){ msg.textContent='Введите email.'; return; }
    // Защитный интервал: Supabase не разрешает повторную отправку ссылки чаще, чем раз
    // в несколько секунд. Не даём слать повторно — иначе сервер вернёт «only request this
    // after 3 seconds», и приложение покажет ошибку вместо уже ушедшего письма.
    const wait=Date.now()-_lastOtpReq;
    if(wait<15000){
      msg.textContent='Ссылка уже отправляется. Подождите несколько секунд и проверьте почту.';
      return;
    }
    const c=sbClient();
    if(!c){ msg.textContent='Модуль Supabase недоступен — проверьте интернет.'; return; }
    send.disabled=true; send.textContent='Отправляем…';
    // Диагностика: Supabase отвечает status кодом даже когда письмо реально не доставлено
    // (лимит, спам-фильтр, неверный redirect). Ловим и показываем честный ответ, чтобы
    // отличать «просьба ушла, письмо потерялось» от «запрос вообще отклонён».
    let res=null;
    try{
      res=await c.auth.signInWithOtp({
        email,
        options:{ emailRedirectTo: location.origin + location.pathname }
      });
    }catch(e){
      res={ error:{ message:e && e.message ? e.message : String(e) } };
    }
    send.disabled=false; send.textContent='Отправить ссылку';
    const status=res && res.error && res.error.status ? res.error.status : '';
    const code=res && res.error && res.error.__isAuthError
      ? (res.error.code||'') : '';
    const errMsg=res && res.error ? (res.error.message||res.error.msg||'') : '';
    const diagLine=[status?('HTTP '+status):'', code, 'redirect: '+(location.origin + location.pathname)]
      .filter(Boolean).join(' · ');
    if(diag) diag.textContent=diagLine;
    if(res && !res.error){
      _lastOtpReq=Date.now();
      showSent(email);
    }else{
      // Повторный тап быстрее лимита → почти наверняка ссылка уже ушла. Говорим по-человечески.
      if(/only request this after|security reason|too many|rate limit/i.test(errMsg)){
        _lastOtpReq=Date.now();
        msg.textContent='Ссылка уже отправлена. Проверьте почту (в т.ч. папку «Спам»); повторно запросить можно через минуту.';
      }else if(/email not confirmed|not allowed|provider|signup is disabled|not enabled/i.test(errMsg)){
        msg.textContent='Провайдер письма отключён: '+errMsg+' — проверьте настройку Auth → Email в Supabase.';
      }else{
        toastShort('Ошибка: '+errMsg);
        msg.textContent='Ошибка: '+(errMsg||'нет ответа от сервера');
      }
    }
  };
}
// Мягкий вопрос имени после первого входа (необязательно, показываем в аккаунте)
function maybeAskName(){
  const m=document.getElementById('modalAuth');
  m.innerHTML=`<div class="sheet">
    <div class="row"><h2>Как к вам обращаться?</h2><div class="spacer"></div><button class="btn ghost" style="width:auto" onclick="closeModal('modalAuth')">✕</button></div>
    <div class="auth-hint" style="margin-top:6px">Необязательно. Имя покажем в аккаунте и приветствии.</div>
    <input type="text" id="authName" placeholder="Ваше имя" style="margin-top:10px" maxlength="40">
    <div style="display:flex; gap:8px; margin-top:12px">
      <button class="btn sec" id="authNameSkip" style="flex:1">Пропустить</button>
      <button class="btn" id="authNameSave" style="flex:1">Сохранить</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  const inp=m.querySelector('#authName');
  m.querySelector('#authNameSkip').onclick=()=>closeModal('modalAuth');
  m.querySelector('#authNameSave').onclick=async ()=>{
    settings.userName=(inp.value||'').trim()||null;
    await persist();
    closeModal('modalAuth');
    renderAuth();
    toast('Имя сохранено');
  };
}
async function authSignOut(){
  const c=sbClient();
  if(c){ const {error}=await c.auth.signOut(); if(error){ toast('Ошибка выхода: '+error.message); return; } }
  _syncUser=null;
  renderAuth();
  toast('Вы вышли из аккаунта');
}
function initAuthState(){
  renderAuth();
  if(!sbReady()) return;
  const c=sbClient();
  // ВАЖНО: TOKEN_REFRESHED обновляет сессию в фоне раз в час — это НЕ действия пользователя,
  // поэтому не дёргаем renderAuth/refreshSyncUI, иначе при простое всплывает
  // «Изменено: N · не синхронизировано» без причины. Рендерим только на SIGNED_IN/SIGNED_OUT.
  c.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_IN'){
      renderAuth();
      // Мягкий вопрос имени — один раз, после первого входа/при первом открытии
      // со входом. Флаг в localStorage, чтобы не спрашивать при каждом запуске.
      if(!settings.userName && !localStorage.getItem('askedName')){
        localStorage.setItem('askedName','1');
        maybeAskName();
      }
    }
    else if(event==='SIGNED_OUT') renderAuth();
  });
}

// ============================== СИНХРОНИЗАЦИЯ ТОЛЬКО ВРУЧНУЮ ==============================
// Авто-синк при открытии/возврате НЕ запускаем: программа должна обновиться на устройстве
// ДО синхронизации, поэтому синхронизируемся только кнопкой «Синхронизировать» в Словаре.

// ============================== BOOT ==============================
async function boot(){
  await DB.open();
  items=(await DB.get(ITEMS))||[];
  settings={...{hint:2,voiceURI:'',studyVoice:'',mulH:1,mulP:1,mulT:1,writeOrder:'rand',writeHint:'on',writeHintSize:1,writeNavSize:1,examTf:true,examChoice:true,examChoiceN:8,examAudio:true,examAllTr:true,studyAudio:true,studyPy:true,studyTr:true,studyHanzi:true,sessN:0,activeLang:'zh'}, ...((await DB.get(SET))||{})};
  // 1.8.10: «сотня» в ползунках теперь равна прежнему виду при 60/60/70 — один раз ставим ползунки на 100%,
  // чтобы пользователю не пришлось докручивать вручную (мультипликативный флаг нельзя: 0.6 уже сохранён и неотличим от выбранного).
  if(!settings.studySizeStd){
    if(settings.mulH===0.6) settings.mulH=1;
    if(settings.mulP===0.6) settings.mulP=1;
    if(settings.mulT===0.7) settings.mulT=1;
    settings.studySizeStd=true;
  }
  studyAudioOn=settings.studyAudio!==false;
  studyPyOn=settings.studyPy!==false;
  studyTrOn=settings.studyTr!==false;
  studyHanziOn=settings.studyHanzi!==false;
  applyStudyToggles();
  activeLang=LANG_MAP[settings.activeLang]?settings.activeLang:'zh';
  // Статистика по языкам (Фаза 5): если ещё нет карты — мигрируем старую статистику в язык activeLang.
  statsByLang=(await DB.get(DB_STATS_ALL))||{};
  const _legacy=await DB.get(STATS);
  if(_legacy){ if(!statsByLang[activeLang] || !statsByLang[activeLang].updated_at) statsByLang[activeLang]=_legacy; }
  if(!statsByLang[activeLang]) statsByLang[activeLang]={streak:0,lastDay:'',activity:{}};
  if(!statsByLang.zh) statsByLang.zh={streak:0,lastDay:'',activity:{}};
  stats=statsByLang[activeLang];
  examSettings={tf:settings.examTf!==false, choice:settings.examChoice!==false, choiceN:settings.examChoiceN||8, match:false};
  examAudioOn=settings.examAudio!==false;
  examAllTr=settings.examAllTr!==false;
  SESS=settings.sessN||0;
  for(const it of items) migrateItem(it);
  for(const it of items) await migrateNormAudio(it);
  for(const it of items) normalizeAppItem(it);   // Фаза 8: скаляры + сеем __sigC/__sigP; таймстампы НЕ трогаем
  const dupMerged=makeLocalUnique();             // склейка одинаковых карточек (язык+слово) до синка
  SHOW_N=items.reduce((m,it)=>Math.max(m, it.lastShowN||0), 0);
  for(const it of items) await hydrateRecordings(it);
  // Фаза 8 (жёсткое правило): таймстампы НЕ ставим в now() при загрузке/миграции.
  // settings без метки = «возраст неизвестен» → 0; в LWW победит облако, а не пустышка.
  if(!settings.updated_at) settings.updated_at=0;
  // Статистика языка без метки = никогда не занимались (или пусто после чистки кэша).
  // 0 = не побеждает облачную статистику → нельзя затереть календарь/историю/серии.
  for(const lg of Object.keys(statsByLang)) if(!statsByLang[lg].updated_at) statsByLang[lg].updated_at=0;
  _sigSet=settingsSig(settings);
  for(const lg of Object.keys(statsByLang)) _sigStatsMap[lg]=statsSig(statsByLang[lg]);
  // восстанавливаем кэш последней синхронизации (для «В сети · синхр.» и «Изменено: N»)
  const _meta=await DB.get(META);
  if(_meta){ lastSyncAt=_meta.lastSync||0; cloudRecs=normalizeCloudRecs(_meta.recs); cloudSettingsU=_meta.settingsU||0; cloudStatsU=_meta.statsU||{}; }
  renderLangSeg();
  await persist();
  maybeOfferSamples();
  refreshSyncUI();
  bindSettings();
  bindThemeControls();
  bindAudioSlot();
  bindAudioLifecycle();
  refreshAll();
  initAuthState();
}
boot().catch(e=>{ console.error(e); toast('Ошибка запуска: '+e.message); });

// PWA: service worker только на https/localhost (иначе — просто кэш браузера).
// updateViaCache:'none' — браузер всегда берёт свежий sw.js, не кэшированный старый.
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){
  navigator.serviceWorker.register('sw.js?v='+encodeURIComponent(APP_VERSION), {updateViaCache:'none'}).catch(()=>{});
}
