const STORE_KEY = 'gi-trends-v1';
const STATUSES = [
  { id: 'new', label: 'Новые' },
  { id: 'work', label: 'В работу' },
  { id: 'done', label: 'Сняли' },
  { id: 'skip', label: 'Не подходит' },
];
const STATUS_TAG = { work: 'В работу', done: 'Сняли', skip: 'Не подходит' };

const $ = (id) => document.getElementById(id);
const now = Date.now() / 1000;

let groups = [];
let reels = [];
let collected = {};
let marks = loadMarks();
const view = { query: null, status: 'all', sort: 'plays', period: 0, search: '' };

function loadMarks() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveMarks() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(marks)); return true; } catch { return false; }
}
const statusOf = (code) => marks[code]?.status || 'new';

function short(n) {
  if (n == null) return '—';
  const trim = (x, digits) => x.toFixed(digits).replace(/\.0$/, '').replace('.', ',');
  if (n >= 1e6) return trim(n / 1e6, n >= 1e7 ? 0 : 1) + ' млн';
  if (n >= 1e3) return trim(n / 1e3, n >= 1e5 ? 0 : 1) + ' тыс.';
  return String(n);
}
const full = (n) => (n == null ? '—' : n.toLocaleString('ru-RU'));
const days = (r) => Math.max(1, (now - r.taken) / 86400);
const perDay = (r) => r.plays / days(r);
const er = (r) => (r.plays ? ((r.likes || 0) + (r.comments || 0)) / r.plays : 0);
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
// автор скрыл счётчик лайков: Instagram отдаёт вместо него заглушку «3»
const likesHidden = (r) => r.likes != null && r.likes <= 3 && r.plays > 1000;
const erText = (r) => (likesHidden(r) ? 'лайки скрыты' : 'вовлечённость ' + pct(er(r)));
const dateOf = (ts) => new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');

function age(r) {
  const d = Math.floor(days(r));
  if (d < 1) return 'сегодня';
  if (d < 31) return d + ' дн. назад';
  if (d < 365) return Math.floor(d / 30.4) + ' мес. назад';
  return (d / 365).toFixed(1).replace('.', ',') + ' г. назад';
}

function plural(n, forms) {
  const a = n % 10, b = n % 100;
  return forms[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 1 : 2];
}
const rolikov = (n) => n + ' ' + plural(n, ['ролик', 'ролика', 'роликов']);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

function cover(r) {
  const box = el('span', { class: 'cover' });
  if (r.thumb) box.append(el('img', { src: `thumbs/${r.code}.jpg`, alt: '', loading: 'lazy' }));
  else box.append(el('span', { class: 'cover-initial' }, (r.user || '?')[0].toUpperCase()));
  return box;
}

/* список запросов */

function renderRail() {
  const rail = $('rail');
  rail.replaceChildren(
    el('button', { class: 'rail-all', type: 'button', 'aria-current': String(view.query === null), onclick: () => pick(null) },
      'Все запросы', el('small', {}, String(reels.length))),
  );
  for (const g of groups) {
    const box = el('section', { class: 'rail-group' },
      el('h2', {}, el('span', { class: 'swatch', style: `background:${g.swatch}` }), g.name));
    for (const q of g.queries) {
      const n = reels.filter((r) => r.queries.includes(q)).length;
      const ready = q in collected;
      box.append(el('button', {
        class: 'rail-q' + (ready ? '' : ' is-pending'), type: 'button', disabled: !ready,
        'aria-current': String(view.query === q), onclick: () => pick(q),
      }, q, el('small', {}, ready ? String(n) : 'ещё не собран')));
    }
    rail.append(box);
  }
}

function pick(q) {
  view.query = q;
  history.replaceState(null, '', q ? '#' + encodeURIComponent(q) : location.pathname);
  renderRail();
  render();
  window.scrollTo({ top: 0 });
}

/* выдача */

function visible() {
  const needle = view.search.trim().toLowerCase();
  const list = reels.filter((r) =>
    (view.query === null || r.queries.includes(view.query)) &&
    (view.status === 'all' || statusOf(r.code) === view.status) &&
    (!view.period || days(r) <= view.period) &&
    (!needle || (r.user + ' ' + (r.name || '') + ' ' + (r.caption || '')).toLowerCase().includes(needle)));
  const by = { plays: (r) => r.plays, perday: perDay, er, new: (r) => r.taken }[view.sort];
  return list.sort((a, b) => by(b) - by(a));
}

function renderStatusFilter() {
  const inQuery = reels.filter((r) => view.query === null || r.queries.includes(view.query));
  const items = [{ id: 'all', label: 'Все' }, ...STATUSES];
  $('statusFilter').replaceChildren(...items.map((s) => {
    const n = s.id === 'all' ? inQuery.length : inQuery.filter((r) => statusOf(r.code) === s.id).length;
    return el('button', {
      type: 'button', 'aria-pressed': String(view.status === s.id),
      onclick: () => { view.status = s.id; render(); },
    }, `${s.label} ${n}`);
  }));
}

function render() {
  renderStatusFilter();
  const list = visible();
  $('title').textContent = view.query || 'Все запросы';

  const inQuery = reels.filter((r) => view.query === null || r.queries.includes(view.query));
  const best = inQuery.reduce((m, r) => Math.max(m, r.plays), 0);
  $('subtitle').textContent = inQuery.length
    ? `${rolikov(inQuery.length)} в подборке, самый популярный набрал ${short(best)} просмотров.` +
      (view.query && collected[view.query] ? ` Собрано ${dateOf(collected[view.query])}.` : '')
    : '';

  $('grid').replaceChildren(...list.map((r, i) => {
    const s = statusOf(r.code);
    const c = cover(r);
    if (STATUS_TAG[s]) c.append(el('span', { class: 'tag', 'data-s': s }, STATUS_TAG[s]));
    c.append(el('span', { class: 'rank' }, String(i + 1)));
    return el('button', { class: 'card', type: 'button', 'data-s': s, onclick: () => openSheet(r) },
      c,
      el('span', { class: 'views' }, short(r.plays), ' ', el('small', {}, 'просмотров')),
      el('span', { class: 'who' }, '@' + r.user),
      el('span', { class: 'nums' }, `${short(Math.round(perDay(r)))} в день, ${erText(r)}`),
      el('span', { class: 'nums' }, age(r)));
  }));

  const empty = $('empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.textContent = inQuery.length
      ? 'Под эти фильтры ничего не попало. Сбросьте статус, период или поиск.'
      : 'По этому запросу ролики ещё не собраны.';
  }
}

/* карточка ролика */

function openSheet(r) {
  const saved = el('p', { class: 'saved', 'aria-live': 'polite' });
  const flash = (ok) => { saved.textContent = ok ? 'Сохранено в этом браузере' : 'Не удалось сохранить: браузер запретил хранилище'; };

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Статус ролика' });
  const drawSeg = () => seg.replaceChildren(...STATUSES.map((s) => el('button', {
    type: 'button', 'aria-pressed': String(statusOf(r.code) === s.id),
    onclick: () => {
      marks[r.code] = { ...marks[r.code], status: s.id };
      flash(saveMarks()); drawSeg(); render();
    },
  }, s.id === 'new' ? 'Новый' : s.label)));
  drawSeg();

  const note = el('textarea', { placeholder: 'Что берём из ролика: хук, формат, звук', 'aria-label': 'Заметка' });
  note.value = marks[r.code]?.note || '';
  note.addEventListener('change', () => {
    marks[r.code] = { ...marks[r.code], note: note.value };
    flash(saveMarks());
  });

  const stat = (k, v) => el('div', {}, el('dt', {}, k), el('dd', {}, v));
  $('sheetBody').replaceChildren(
    el('div', { class: 'sheet-top' },
      cover(r),
      el('div', {},
        el('h2', { class: 'sheet-author', id: 'sheetAuthor' }, '@' + r.user),
        el('p', { class: 'sheet-name' }, [r.name, dateOf(r.taken), r.dur ? r.dur + ' сек.' : null].filter(Boolean).join(', ')),
        el('a', { class: 'btn btn-solid', href: `https://www.instagram.com/reel/${r.code}/`, target: '_blank', rel: 'noopener' }, 'Открыть в Instagram'))),
    el('h3', {}, 'Цифры'),
    el('dl', { class: 'stats' },
      stat('Просмотры', full(r.plays)),
      stat('Просмотров в день', full(Math.round(perDay(r)))),
      stat('Лайки', likesHidden(r) ? 'скрыты автором' : full(r.likes)),
      stat('Комментарии', full(r.comments)),
      stat('Вовлечённость', likesHidden(r) ? '—' : pct(er(r))),
      stat('Звук', r.audio || 'оригинальный')),
    el('h3', {}, 'Статус'), seg,
    el('h3', {}, 'Заметка'), note, saved,
    el('h3', {}, 'Нашёлся по запросам'),
    el('div', { class: 'chips' }, ...r.queries.map((q) => el('span', { class: 'chip' }, q))),
    el('h3', {}, 'Подпись'),
    el('p', { class: 'caption' }, r.caption || 'Без подписи'),
  );
  $('sheet').showModal();
  $('sheet').scrollTop = 0;
}

function exportWork() {
  const rows = reels.filter((r) => statusOf(r.code) === 'work');
  if (!rows.length) {
    $('export').textContent = 'Сначала отметьте ролики «В работу»';
    setTimeout(() => { $('export').textContent = 'Скачать список «В работу»'; }, 2500);
    return;
  }
  const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [['Ссылка', 'Автор', 'Просмотры', 'Лайки', 'Комментарии', 'Запросы', 'Заметка'],
    ...rows.map((r) => [`https://www.instagram.com/reel/${r.code}/`, '@' + r.user, r.plays, r.likes, r.comments, r.queries.join(', '), marks[r.code]?.note])]
    .map((row) => row.map(cell).join(';')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'gi-beauty-reels-v-rabotu.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function start() {
  try {
    const [q, d] = await Promise.all(['data/queries.json', 'data/reels.json'].map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json())));
    groups = q.groups; reels = d.reels; collected = d.collected || {};
    $('meta').textContent = `Обновлено ${dateOf(d.updated)}, ${rolikov(reels.length)}`;
  } catch {
    $('empty').hidden = false;
    $('empty').textContent = 'Данные не загрузились. Обновите страницу.';
    return;
  }
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash in collected) view.query = fromHash;

  $('sort').addEventListener('change', (e) => { view.sort = e.target.value; render(); });
  $('period').addEventListener('change', (e) => { view.period = Number(e.target.value); render(); });
  $('search').addEventListener('input', (e) => { view.search = e.target.value; render(); });
  $('export').addEventListener('click', exportWork);
  $('sheetClose').addEventListener('click', () => $('sheet').close());
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').close(); });

  renderRail();
  render();
}

start();
