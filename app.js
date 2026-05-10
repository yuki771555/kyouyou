'use strict';

const DAYS = ['月', '火', '水', '木', '金'];
const PERIODS = [1, 2, 3, 4, 5];
const SYLLABUS_BASE = 'https://kym22-web.ofc.kobe-u.ac.jp/kobe_syllabus/2026/20/data/2026_';

let allCourses = [];
let activeCategory = 'all';
let searchQuery = '';

// ---------- Markdown parsing ----------
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

// ---------- DOM rendering ----------
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
}

function buildIntensive(courses) {
  const wrap = document.getElementById('intensive');
  for (const c of courses) {
    if (c.isIntensive) wrap.appendChild(buildCard(c));
  }
}

function buildCard(c) {
  const card = document.createElement('div');
  card.className = `card cat-${c.category}`;
  card.dataset.code = c.code;
  card.dataset.searchText = [c.name, c.teacher, c.code, c.theme, c.category].join(' ').toLowerCase();

  const noteHtml = c.note ? `<span class="note-tag">${escapeHtml(c.note)}</span>` : '';
  card.innerHTML = `
    <div class="name">${escapeHtml(c.name)}${noteHtml}</div>
    <div class="teacher">${escapeHtml(c.teacher)}</div>
    <a class="code-link" href="${c.syllabusUrl}" target="_blank" rel="noopener">${escapeHtml(c.code)}</a>
  `;

  card.querySelector('.code-link').addEventListener('click', (e) => e.stopPropagation());
  card.addEventListener('click', () => openModal(c));
  return card;
}

// ---------- Modal ----------
function openModal(c) {
  const dialog = document.getElementById('course-modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <div class="meta">
      <span class="chip">${escapeHtml(c.category)}</span>
      <span class="chip">${escapeHtml(c.slotRaw)}</span>
      <span>${escapeHtml(c.format)}</span>
      <span>${escapeHtml(c.credits)}</span>
      <span>担当: ${escapeHtml(c.teacher)}</span>
      <span>コード: ${escapeHtml(c.code)}</span>
    </div>
    ${section('授業のテーマ', c.theme)}
    ${section('到達目標', c.goal)}
    ${section('成績評価', c.grading)}
    ${section('履修上の注意', c.notes)}
    ${section('授業の概要と計画', c.plan)}
    <a class="official-link" href="${c.syllabusUrl}" target="_blank" rel="noopener">公式シラバスを開く →</a>
  `;
  dialog.showModal();
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

// ---------- Filters / Search ----------
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
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  const update = () => {
    searchQuery = input.value.trim().toLowerCase();
    clearBtn.hidden = !searchQuery;
    document.body.classList.toggle('searching', !!searchQuery);
    applySearch();
  };

  input.addEventListener('input', update);
  clearBtn.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
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

// ---------- Day tabs (mobile) ----------
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

// ---------- utils ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- bootstrap ----------
async function main() {
  try {
    const res = await fetch('./data/syllabus.md');
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const md = await res.text();
    allCourses = parseSyllabus(md);
    console.log(`Loaded ${allCourses.length} courses`);

    buildTimetable(allCourses);
    buildIntensive(allCourses);
    setupFilters();
    setupSearch();
    setupDayTabs();
    setupModal();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="padding:20px;background:#fee;color:#900;">読み込みに失敗しました: ${escapeHtml(err.message)}<br>ローカル環境では <code>python -m http.server</code> でサーバーを起動してください。</div>`
    );
  }
}

main();
