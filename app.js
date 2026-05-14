'use strict';

const DAYS = ['月', '火', '水', '木', '金'];
const PERIODS = [1, 2, 3, 4, 5];
const SYLLABUS_BASE = 'https://kym22-web.ofc.kobe-u.ac.jp/kobe_syllabus/2026/20/data/2026_';
const STORAGE_KEY = 'kyouyou.selected.v1';

const ICON_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ICON_EXT = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const ICON_INBOX = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;

let allCourses = [];
let coursesByCode = new Map();
let activeCategory = 'all';
let searchQuery = '';
let selected = new Set();

// ===================================================
// Markdown parsing
// ===================================================
function parseSyllabus(md) {
  const courses = [];
  const sections = md.split(/^##\s*📚?\s*教養科目（/m).slice(1);

  for (const sec of sections) {
    const closeIdx = sec.indexOf('）');
    if (closeIdx === -1) continue;
    const category = sec.slice(0, closeIdx);
    const body = sec.slice(closeIdx + 1);

    const blocks = body.split(/\n(?=###\s)/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed.startsWith('###')) continue;
      const course = parseCourse(trimmed, category);
      if (course) courses.push(course);
    }
  }
  return courses;
}

function parseCourse(block, category) {
  const lines = block.split('\n');
  const header = lines[0].replace(/^###\s*/, '').trim();
  const parts = header.split('｜').map(s => s.trim());
  if (parts.length < 4) return null;

  const [name, code, teacher, slotRaw] = parts;
  const slot = parseSlot(slotRaw);
  const rest = lines.slice(1).join('\n');
  const fields = extractFields(rest);
  const credits = parseCredits(fields['単位数'] || '');

  return {
    name,
    code,
    teacher,
    slotRaw,
    day: slot.day,
    period: slot.period,
    note: slot.note,
    isIntensive: slot.day === null,
    category,
    format: fields['授業形態'] || '',
    credits: fields['単位数'] || '',
    creditValue: credits,
    theme: fields['授業のテーマ'] || '',
    goal: fields['到達目標'] || '',
    grading: fields['成績評価'] || '',
    notes: fields['履修上の注意'] || '',
    plan: fields['授業の概要と計画'] || '',
    syllabusUrl: SYLLABUS_BASE + encodeURIComponent(code) + '.html',
  };
}

function parseSlot(raw) {
  const m = raw.match(/^([月火水木金])\s*(\d)(?:（(.+)）)?$/);
  if (m) return { day: m[1], period: parseInt(m[2], 10), note: m[3] || '' };
  const intensive = raw.match(/^集中(?:（(.+)）)?$/);
  if (intensive) return { day: null, period: null, note: intensive[1] ? `集中（${intensive[1]}）` : '集中' };
  return { day: null, period: null, note: raw };
}

function extractFields(text) {
  const fields = {};
  const re = /\*\*(.+?)\*\*\s*([\s\S]*?)(?=\*\*[^*]+\*\*|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].trim();
    const val = m[2].replace(/[　\s]+$/g, '').replace(/^\s+/, '').trim();
    fields[key] = val;
  }
  return fields;
}

function parseCredits(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

// ===================================================
// DOM rendering — timetable & cards
// ===================================================
function buildTimetable(courses) {
  const grid = document.getElementById('timetable');

  for (const period of PERIODS) {
    const label = document.createElement('div');
    label.className = 'th th-period';
    label.innerHTML = `<span class="num">${period}</span><span>限</span>`;
    grid.appendChild(label);

    for (const day of DAYS) {
      const cell = document.createElement('div');
      cell.className = `cell col-${day}`;
      cell.id = `cell-${day}-${period}`;
      cell.dataset.day = day;
      cell.dataset.period = String(period);
      grid.appendChild(cell);
    }
  }

  for (const c of courses) {
    if (c.isIntensive) continue;
    const cell = document.getElementById(`cell-${c.day}-${c.period}`);
    if (cell) cell.appendChild(buildCard(c));
  }

  document.getElementById('weekly-count').textContent =
    `${courses.filter(c => !c.isIntensive).length} 科目`;
}

function buildIntensive(courses) {
  const wrap = document.getElementById('intensive');
  const intensives = courses.filter(c => c.isIntensive);
  for (const c of intensives) wrap.appendChild(buildCard(c));
  document.getElementById('intensive-count').textContent = `${intensives.length} 科目`;
}

function buildCard(c) {
  const card = document.createElement('div');
  card.className = `card cat-${c.category}`;
  card.dataset.code = c.code;
  card.dataset.searchText = [c.name, c.teacher, c.code, c.theme, c.category].join(' ').toLowerCase();

  const noteHtml = c.note ? `<span class="note-tag">${escapeHtml(c.note)}</span>` : '';
  card.innerHTML = `
    <div class="name-row">
      <span class="cat-dot" aria-hidden="true"></span>
      <div class="name">${escapeHtml(c.name)}${noteHtml}</div>
    </div>
    <div class="teacher">${escapeHtml(c.teacher)}</div>
    <a class="code-link" href="${c.syllabusUrl}" target="_blank" rel="noopener">${escapeHtml(c.code)}</a>
    <button type="button" class="add-btn" aria-label="履修候補に追加" data-code="${escapeHtml(c.code)}">${ICON_PLUS}</button>
  `;

  card.querySelector('.code-link').addEventListener('click', e => e.stopPropagation());
  card.querySelector('.add-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleSelect(c.code);
  });
  card.addEventListener('click', () => openModal(c));
  return card;
}

// ===================================================
// Modal
// ===================================================
function openModal(c) {
  const dialog = document.getElementById('course-modal');
  const body = document.getElementById('modal-body');

  const isSelected = selected.has(c.code);
  body.innerHTML = `
    <h3 id="modal-title">${escapeHtml(c.name)}</h3>
    <div class="meta">
      <span class="chip chip-cat" data-cat="${escapeHtml(c.category)}">${escapeHtml(c.category)}</span>
      <span class="chip">${escapeHtml(c.slotRaw)}</span>
      ${c.format ? `<span class="chip">${escapeHtml(c.format)}</span>` : ''}
      ${c.credits ? `<span class="chip">${escapeHtml(c.credits)}</span>` : ''}
      <span class="chip">担当 ${escapeHtml(c.teacher)}</span>
      <span class="chip chip-mono">${escapeHtml(c.code)}</span>
    </div>
    <div class="actions">
      <button type="button" class="btn primary modal-add ${isSelected ? 'added' : ''}" data-code="${escapeHtml(c.code)}">
        ${isSelected ? ICON_CHECK : ICON_PLUS}
        <span>${isSelected ? '履修候補から外す' : '履修候補に追加'}</span>
      </button>
      <a class="btn" href="${c.syllabusUrl}" target="_blank" rel="noopener">
        ${ICON_EXT}<span>公式シラバス</span>
      </a>
    </div>
    ${section('授業のテーマ', c.theme)}
    ${section('到達目標', c.goal)}
    ${section('成績評価', c.grading)}
    ${section('履修上の注意', c.notes)}
    ${section('授業の概要と計画', c.plan)}
  `;

  body.querySelector('.modal-add').addEventListener('click', () => {
    toggleSelect(c.code);
    openModal(c); // re-render
  });

  if (!dialog.open) dialog.showModal();
}

function section(title, value) {
  if (!value) return '';
  return `<section><h4>${escapeHtml(title)}</h4><p>${escapeHtml(value)}</p></section>`;
}

function setupModal() {
  const dialog = document.getElementById('course-modal');
  dialog.querySelector('.modal-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      dialog.close();
    }
  });
}

// ===================================================
// Filters / Search
// ===================================================
function setupFilters() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      applyCategory();
    });
  });
}

function applyCategory() {
  const timetable = document.getElementById('timetable');
  const intensive = document.getElementById('intensive');
  [timetable, intensive].forEach(el => {
    el.classList.remove('filter-人文系', 'filter-社会系', 'filter-総合系');
    if (activeCategory !== 'all') el.classList.add(`filter-${activeCategory}`);
  });
}

function setupSearch() {
  const wrapper = document.querySelector('.search');
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const suggest = document.getElementById('suggest');
  let activeIdx = -1;

  const update = () => {
    searchQuery = input.value.trim().toLowerCase();
    clearBtn.hidden = !searchQuery;
    wrapper.classList.toggle('has-value', !!searchQuery);
    document.body.classList.toggle('searching', !!searchQuery);
    applySearch();
    activeIdx = -1;
    renderSuggest();
  };

  const renderSuggest = () => {
    if (!searchQuery || document.activeElement !== input) {
      suggest.hidden = true;
      suggest.innerHTML = '';
      return;
    }
    const matches = allCourses.filter(c =>
      [c.name, c.teacher, c.code].some(v => v.toLowerCase().includes(searchQuery))
    ).slice(0, 8);

    if (matches.length === 0) {
      suggest.innerHTML = `<li class="s-empty">該当する科目はありません</li>`;
    } else {
      suggest.innerHTML = matches.map((c, i) => `
        <li role="option" data-code="${escapeHtml(c.code)}" class="cat-${c.category}" data-idx="${i}">
          <span class="s-name">${highlight(c.name, searchQuery)}</span>
          <span class="s-meta">${escapeHtml(c.slotRaw)} · ${escapeHtml(c.code)}</span>
        </li>
      `).join('');
    }
    suggest.hidden = false;

    suggest.querySelectorAll('li[data-code]').forEach(li => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        focusCourse(li.dataset.code);
      });
    });
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', renderSuggest);
  input.addEventListener('blur', () => {
    setTimeout(() => { suggest.hidden = true; }, 150);
  });

  input.addEventListener('keydown', (e) => {
    const items = suggest.querySelectorAll('li[data-code]');
    if (!items.length) {
      if (e.key === 'Escape') input.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      updateActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      updateActive(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = activeIdx >= 0 ? items[activeIdx] : items[0];
      if (target) focusCourse(target.dataset.code);
    } else if (e.key === 'Escape') {
      suggest.hidden = true;
      input.blur();
    }
  });

  const updateActive = (items) => {
    items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  };

  clearBtn.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });
}

function highlight(text, query) {
  const escaped = escapeHtml(text);
  if (!query) return escaped;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return escaped;
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function focusCourse(code) {
  const course = coursesByCode.get(code);
  if (!course) return;

  const wrapper = document.querySelector('.search');
  const input = document.getElementById('search-input');
  input.value = '';
  searchQuery = '';
  document.getElementById('search-clear').hidden = true;
  document.body.classList.remove('searching');
  wrapper.classList.remove('has-value');
  document.getElementById('suggest').hidden = true;
  applySearch();

  if (course.day && window.innerWidth <= 720) {
    document.querySelector(`.day-tab[data-day="${course.day}"]`)?.click();
  }

  requestAnimationFrame(() => {
    const card = document.querySelector(`.card[data-code="${code}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('highlight');
    void card.offsetWidth;
    card.classList.add('highlight');
    setTimeout(() => card.classList.remove('highlight'), 1500);
  });
}

function applySearch() {
  const cards = document.querySelectorAll('.card');
  let timetableHits = 0;
  let intensiveHits = 0;

  cards.forEach(card => {
    const match = !searchQuery || card.dataset.searchText.includes(searchQuery);
    card.classList.toggle('search-hidden', !match);
    if (match) {
      if (card.parentElement.classList.contains('cell')) timetableHits++;
      else intensiveHits++;
    }
  });

  document.getElementById('timetable-empty').hidden = !(searchQuery && timetableHits === 0);
  document.getElementById('intensive-empty').hidden = !(searchQuery && intensiveHits === 0);
}

// ===================================================
// Day tabs (mobile)
// ===================================================
function setupDayTabs() {
  const tabs = document.querySelectorAll('.day-tab');
  const timetable = document.getElementById('timetable');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      timetable.dataset.activeDay = tab.dataset.day;
    });
  });
}

// ===================================================
// Schedule builder
// ===================================================
function loadSelected() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveSelected() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
  } catch {}
}

function ingestUrlParam() {
  try {
    const url = new URL(window.location.href);
    const codes = url.searchParams.get('c');
    if (!codes) return;
    codes.split(',').map(s => s.trim()).filter(Boolean).forEach(c => selected.add(c));
    // Clean URL so reloads don't keep re-importing
    url.searchParams.delete('c');
    window.history.replaceState(null, '', url.toString());
    showToast(`URLから ${codes.split(',').length} 科目を読み込みました`);
  } catch {}
}

function toggleSelect(code) {
  if (selected.has(code)) selected.delete(code);
  else selected.add(code);
  saveSelected();
  updateSelectedUI();
}

function removeSelect(code) {
  if (!selected.has(code)) return;
  selected.delete(code);
  saveSelected();
  updateSelectedUI();
}

function clearAll() {
  if (selected.size === 0) return;
  if (!confirm(`履修候補 ${selected.size} 科目をすべて削除しますか？`)) return;
  selected.clear();
  saveSelected();
  updateSelectedUI();
  showToast('履修候補をクリアしました');
}

function updateSelectedUI() {
  document.querySelectorAll('.card').forEach(card => {
    const isSel = selected.has(card.dataset.code);
    card.classList.toggle('selected', isSel);
    const btn = card.querySelector('.add-btn');
    if (btn) {
      btn.innerHTML = isSel ? ICON_CHECK : ICON_PLUS;
      btn.setAttribute('aria-label', isSel ? '履修候補から外す' : '履修候補に追加');
    }
  });
  renderPanel();
}

function selectedCourses() {
  const arr = [];
  for (const code of selected) {
    const c = coursesByCode.get(code);
    if (c) arr.push(c);
  }
  // sort: day order, period, then intensives last
  const dayOrder = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5 };
  arr.sort((a, b) => {
    if (a.isIntensive !== b.isIntensive) return a.isIntensive ? 1 : -1;
    const da = dayOrder[a.day] || 9;
    const db = dayOrder[b.day] || 9;
    if (da !== db) return da - db;
    return (a.period || 0) - (b.period || 0);
  });
  return arr;
}

function totalCredits(list) {
  return (list || selectedCourses()).reduce((s, c) => s + (c.creditValue || 0), 0);
}

function renderFab() {
  const list = selectedCourses();
  const total = totalCredits(list);
  document.getElementById('fab-count').textContent = list.length;
  document.getElementById('fab-credits').textContent = total.toFixed(1) + '単位';
}

function renderPanel() {
  renderFab();
  const list = selectedCourses();
  document.getElementById('panel-total-count').textContent = list.length;
  document.getElementById('panel-total-credits').textContent = totalCredits(list).toFixed(1);

  for (const cat of ['人文系', '社会系', '総合系']) {
    const sum = list.filter(c => c.category === cat).reduce((s, c) => s + (c.creditValue || 0), 0);
    const el = document.getElementById(`cat-${cat}-credits`);
    if (el) el.textContent = sum.toFixed(1);
  }

  const body = document.getElementById('panel-body');
  if (list.length === 0) {
    body.innerHTML = `
      <div class="panel-empty">
        <span class="icon">${ICON_INBOX}</span>
        <strong>履修候補はまだありません</strong>
        各科目カードの「＋」を押すと、ここに追加されます。
      </div>
    `;
    return;
  }

  // Mini-grid (weekly only)
  const cellMap = new Map(); // "day|period" -> course[]
  for (const c of list) {
    if (c.isIntensive) continue;
    const key = `${c.day}|${c.period}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(c);
  }

  let miniHtml = `<div class="panel-mini-grid">`;
  miniHtml += `<div class="mh"></div>`;
  for (const d of DAYS) miniHtml += `<div class="mh">${d}</div>`;
  for (const p of PERIODS) {
    miniHtml += `<div class="mh mh-period">${p}</div>`;
    for (const d of DAYS) {
      const arr = cellMap.get(`${d}|${p}`) || [];
      if (arr.length === 0) {
        miniHtml += `<div class="mc"></div>`;
      } else if (arr.length === 1) {
        miniHtml += `<div class="mc has cat-${arr[0].category}" title="${escapeHtml(arr[0].name)}">${escapeHtml(truncate(arr[0].name, 4))}</div>`;
      } else {
        miniHtml += `<div class="mc has conflict" title="${arr.map(c => c.name).join(' / ')}">×${arr.length}</div>`;
      }
    }
  }
  miniHtml += `</div>`;

  // Build conflict map for list badges
  const conflictCodes = new Set();
  for (const [, arr] of cellMap.entries()) {
    if (arr.length > 1) for (const c of arr) conflictCodes.add(c.code);
  }

  // Weekly list
  const weekly = list.filter(c => !c.isIntensive);
  const intensives = list.filter(c => c.isIntensive);

  let listHtml = '';
  if (weekly.length > 0) {
    listHtml += `
      <div class="panel-section">
        <div class="panel-section-title">
          <span>週の時間割</span>
          <span class="pst-count">${weekly.length}</span>
        </div>
        ${weekly.map(c => itemHtml(c, conflictCodes.has(c.code))).join('')}
      </div>
    `;
  }
  if (intensives.length > 0) {
    listHtml += `
      <div class="panel-section">
        <div class="panel-section-title">
          <span>集中・特殊枠</span>
          <span class="pst-count">${intensives.length}</span>
        </div>
        ${intensives.map(c => itemHtml(c, false)).join('')}
      </div>
    `;
  }

  body.innerHTML = miniHtml + listHtml;

  body.querySelectorAll('.panel-item').forEach(el => {
    const code = el.dataset.code;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.pi-remove')) return;
      const course = coursesByCode.get(code);
      if (course) {
        closePanel();
        openModal(course);
      }
    });
    el.querySelector('.pi-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSelect(code);
    });
  });
}

function itemHtml(c, isConflict) {
  return `
    <div class="panel-item cat-${escapeHtml(c.category)}" data-code="${escapeHtml(c.code)}">
      <div class="pi-main">
        <div class="pi-name">${escapeHtml(c.name)}</div>
        <div class="pi-meta">
          <span>${escapeHtml(c.slotRaw)}</span>
          <span>·</span>
          <span>${escapeHtml(c.creditValue ? c.creditValue.toFixed(1) + '単位' : c.credits || '—')}</span>
          <span>·</span>
          <span>${escapeHtml(c.teacher)}</span>
          ${isConflict ? `<span class="pi-conflict">競合</span>` : ''}
        </div>
      </div>
      <button type="button" class="pi-remove" aria-label="削除">${ICON_X}</button>
    </div>
  `;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) : s;
}

function setupPanel() {
  const fab = document.getElementById('schedule-fab');
  const panel = document.getElementById('schedule-panel');
  const overlay = document.getElementById('panel-overlay');
  const closeBtn = document.getElementById('panel-close');
  const clearBtn = document.getElementById('panel-clear');
  const shareBtn = document.getElementById('panel-share');

  fab.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  clearBtn.addEventListener('click', clearAll);
  shareBtn.addEventListener('click', shareUrl);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.getAttribute('aria-hidden') === 'false') {
      closePanel();
    }
  });
}

function openPanel() {
  const panel = document.getElementById('schedule-panel');
  const overlay = document.getElementById('panel-overlay');
  panel.setAttribute('aria-hidden', 'false');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  const panel = document.getElementById('schedule-panel');
  const overlay = document.getElementById('panel-overlay');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 280);
}

async function shareUrl() {
  if (selected.size === 0) {
    showToast('履修候補が空です');
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('c', [...selected].join(','));
  const text = url.toString();
  try {
    await navigator.clipboard.writeText(text);
    showToast('URLをコピーしました');
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('URLをコピーしました'); }
    catch { prompt('このURLをコピーしてください', text); }
    document.body.removeChild(ta);
  }
}

// ===================================================
// Toast
// ===================================================
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 220);
  }, 1800);
}

// ===================================================
// Keyboard shortcut
// ===================================================
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (document.getElementById('course-modal').open) return;
    e.preventDefault();
    document.getElementById('search-input').focus();
  });
}

// ===================================================
// Utils
// ===================================================
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===================================================
// Bootstrap
// ===================================================
async function main() {
  try {
    const res = await fetch('./data/syllabus.md');
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const md = await res.text();
    allCourses = parseSyllabus(md);
    coursesByCode = new Map(allCourses.map(c => [c.code, c]));
    console.log(`Loaded ${allCourses.length} courses`);

    // Load saved schedule, then ingest URL param (merges in)
    selected = new Set(loadSelected());
    ingestUrlParam();
    saveSelected();

    buildTimetable(allCourses);
    buildIntensive(allCourses);
    setupFilters();
    setupSearch();
    setupDayTabs();
    setupModal();
    setupPanel();
    setupKeyboard();

    updateSelectedUI();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="padding:20px;background:#fee;color:#900;">読み込みに失敗しました: ${escapeHtml(err.message)}<br>ローカル環境では <code>python -m http.server</code> でサーバーを起動してください。</div>`
    );
  }
}

main();
