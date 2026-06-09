/* =============================================
   ToDoList - 앱 로직 (app.js)
   =============================================
   기능:
   - Todo CRUD (추가/수정/삭제/완료)
   - localStorage 자동 저장/로드
   - 드래그 앤 드롭 (HTML5 D&D API)
   - 카테고리 직접 추가/삭제
   - 브라우저 알림 (Web Notification API)
   - 엑셀(CSV) 내보내기
   - 반복 할 일 (daily/weekly/monthly)
   - 실시간 검색 + 필터/정렬 + D-Day
   - 다크/라이트 테마 전환
   ============================================= */

'use strict';

// ============================================================
//  상수 & 기본 카테고리
// ============================================================
const BUILTIN_CATEGORIES = ['업무', '개인', '쇼핑', '기타'];
const STORAGE_KEYS = {
  todos: 'todolist_todos',
  categories: 'todolist_categories',
  theme: 'todolist_theme',
};

// ============================================================
//  할 일 템플릿 데이터
// ============================================================
const TEMPLATE_DATA = {
  '운동': { icon: '🏋️', items: ['스쿼트 3세트', '런닝 30분', '플랭크 1분', '푸쉬업 20개', '스트레칭 10분'] },
  '공부': { icon: '📚', items: ['영어 단어 암기', '수학 문제 풀기', '프로그래밍 실습', '독서 30분', '강의 듣기'] },
  '식단': { icon: '🍎', items: ['아침 식사 챙기기', '물 2L 마시기', '영양제 복용', '건강한 저녁 식사'] },
  '생활': { icon: '🏠', items: ['방 청소하기', '분리수거 하기', '장보기', '가계부 작성', '일기 쓰기'] }
};

// ============================================================
//  상태
// ============================================================
let todos = [];
let categories = [];
let activeCategory = '전체';
let editingId = null;
let dragSrcIndex = null;

// ============================================================
//  DOM 참조
// ============================================================
const $ = (id) => document.getElementById(id);

const todoInput      = $('todoInput');
const categorySelect = $('categorySelect');
const prioritySelect = $('prioritySelect');
const repeatSelect   = $('repeatSelect');
const dueDateInput   = $('dueDateInput');
const addBtn         = $('addBtn');

const categoryTabs   = $('categoryTabs');
const catManageBtn   = $('catManageBtn');
const searchInput    = $('searchInput');
const sortSelect     = $('sortSelect');
const showDoneToggle = $('showDoneToggle');

const todoList       = $('todoList');
const emptyState     = $('emptyState');
const clearDoneBtn   = $('clearDoneBtn');

const statTotal      = $('statTotal');
const statDone       = $('statDone');
const statPending    = $('statPending');
const progressBar    = $('progressBar');
const progressPercent= $('progressPercent');
const headerDate     = $('headerDate');

const exportBtn      = $('exportBtn');
const notifBtn       = $('notifBtn');
const themeToggle    = $('themeToggle');

// 모달
const catModal       = $('catModal');
const catModalClose  = $('catModalClose');
const catList        = $('catList');
const newCatInput    = $('newCatInput');
const addCatBtn      = $('addCatBtn');

const editModal      = $('editModal');
const editModalClose = $('editModalClose');
const editTextInput  = $('editTextInput');
const editCategorySelect = $('editCategorySelect');
const editPrioritySelect = $('editPrioritySelect');
const editRepeatSelect   = $('editRepeatSelect');
const editDueDateInput   = $('editDueDateInput');
const editCancelBtn  = $('editCancelBtn');
const editSaveBtn    = $('editSaveBtn');

// 템플릿
const templateBtn        = $('templateBtn');
const templateModal      = $('templateModal');
const templateModalClose = $('templateModalClose');
const templateTabs       = $('templateTabs');
const templateList       = $('templateList');

const toastContainer = $('toastContainer');

// ============================================================
//  로컬스토리지 유틸
// ============================================================
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 스토리지 꽉 찬 경우 */ }
};
const load = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch { return fallback; }
};

// ============================================================
//  초기화
// ============================================================
function init() {
  // 저장된 데이터 불러오기
  todos = load(STORAGE_KEYS.todos, []);
  categories = load(STORAGE_KEYS.categories, [...BUILTIN_CATEGORIES]);

  // 빌트인 카테고리 누락 시 앞에 추가
  BUILTIN_CATEGORIES.slice().reverse().forEach(cat => {
    if (!categories.includes(cat)) categories.unshift(cat);
  });

  // 테마
  const savedTheme = load(STORAGE_KEYS.theme, 'dark');
  document.documentElement.dataset.theme = savedTheme;

  // 날짜 표시
  updateHeaderDate();

  // UI 초기화
  renderCategorySelects();
  renderCategoryTabs();
  renderTodos();

  // 알림 권한 확인
  checkNotificationPermission();

  // 마감 알림 체크 (하루에 한 번 정도)
  scheduleDeadlineNotifications();
}

// ============================================================
//  날짜 포맷 유틸
// ============================================================
function todayStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}.${m}.${d}`;
}

function getDDay(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr); due.setHours(0,0,0,0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function getDDayLabel(diff) {
  if (diff === null) return null;
  if (diff === 0) return { text: 'D-Day', cls: 'today' };
  if (diff < 0)  return { text: `D+${Math.abs(diff)}`, cls: 'overdue' };
  if (diff <= 3) return { text: `D-${diff}`, cls: 'upcoming' };
  return { text: `D-${diff}`, cls: 'far' };
}

function updateHeaderDate() {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  headerDate.textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

// ============================================================
//  ID 생성
// ============================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
//  카테고리 렌더링
// ============================================================
function renderCategorySelects() {
  // 입력 폼 select
  const currentVal = categorySelect.value;
  categorySelect.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
  if (categories.includes(currentVal)) categorySelect.value = currentVal;

  // 편집 모달 select
  const editVal = editCategorySelect.value;
  editCategorySelect.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    editCategorySelect.appendChild(opt);
  });
  if (categories.includes(editVal)) editCategorySelect.value = editVal;
}

function renderCategoryTabs() {
  categoryTabs.innerHTML = '';

  const allTab = createTabEl('전체', activeCategory === '전체');
  categoryTabs.appendChild(allTab);

  categories.forEach(cat => {
    const tab = createTabEl(cat, activeCategory === cat);
    categoryTabs.appendChild(tab);
  });
}

function createTabEl(name, isActive) {
  const btn = document.createElement('button');
  btn.className = 'cat-tab' + (isActive ? ' active' : '');
  btn.textContent = name;
  btn.dataset.cat = name;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  btn.addEventListener('click', () => {
    activeCategory = name;
    renderCategoryTabs();
    renderTodos();
  });
  return btn;
}

// ============================================================
//  할 일 추가
// ============================================================
function addTodo() {
  const text = todoInput.value.trim();
  if (!text) { showToast('할 일 내용을 입력해주세요!', 'warning'); todoInput.focus(); return; }

  const todo = {
    id: genId(),
    text,
    category: categorySelect.value || (categories[0] || '기타'),
    priority: prioritySelect.value,
    repeat: repeatSelect.value,
    dueDate: dueDateInput.value || null,
    done: false,
    createdAt: new Date().toISOString(),
    order: todos.length,
  };

  todos.unshift(todo);
  saveTodos();
  renderTodos();
  updateStats();

  todoInput.value = '';
  dueDateInput.value = '';
  repeatSelect.value = 'none';
  todoInput.focus();

  showToast('할 일이 추가되었어요! ✦', 'success');
}

// ============================================================
//  할 일 완료 토글
// ============================================================
function toggleDone(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  todo.done = !todo.done;

  // 반복 할 일: 완료 시 다음 날짜로 자동 갱신
  if (todo.done && todo.repeat !== 'none' && todo.dueDate) {
    const next = getNextRepeatDate(todo.dueDate, todo.repeat);
    todo.dueDate = next;
    todo.done = false; // 반복이면 완료 상태 리셋
    showToast(`🔁 반복 할 일이 ${formatDate(next)}로 갱신됐어요!`, 'info');
  }

  saveTodos();
  renderTodos();
  updateStats();
}

function getNextRepeatDate(dateStr, repeat) {
  const d = new Date(dateStr);
  if (repeat === 'daily')   d.setDate(d.getDate() + 1);
  if (repeat === 'weekly')  d.setDate(d.getDate() + 7);
  if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// ============================================================
//  할 일 삭제
// ============================================================
function deleteTodo(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add('removing');
    card.addEventListener('animationend', () => {
      todos = todos.filter(t => t.id !== id);
      saveTodos();
      renderTodos();
      updateStats();
    }, { once: true });
  } else {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodos();
    updateStats();
  }
  showToast('삭제되었어요.', 'info');
}

// ============================================================
//  완료 항목 일괄 삭제
// ============================================================
function clearDone() {
  const doneCount = todos.filter(t => t.done).length;
  if (doneCount === 0) { showToast('완료된 항목이 없어요!', 'warning'); return; }
  todos = todos.filter(t => !t.done);
  saveTodos();
  renderTodos();
  updateStats();
  showToast(`완료된 ${doneCount}개 항목을 삭제했어요.`, 'success');
}

// ============================================================
//  편집 모달 열기 / 저장
// ============================================================
function openEditModal(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  editingId = id;

  editTextInput.value = todo.text;
  renderCategorySelects();
  editCategorySelect.value = todo.category;
  editPrioritySelect.value = todo.priority;
  editRepeatSelect.value = todo.repeat || 'none';
  editDueDateInput.value = todo.dueDate || '';

  editModal.hidden = false;
  editTextInput.focus();
}

function saveEdit() {
  const text = editTextInput.value.trim();
  if (!text) { showToast('내용을 입력해주세요!', 'warning'); return; }

  const todo = todos.find(t => t.id === editingId);
  if (!todo) return;

  todo.text = text;
  todo.category = editCategorySelect.value;
  todo.priority = editPrioritySelect.value;
  todo.repeat = editRepeatSelect.value;
  todo.dueDate = editDueDateInput.value || null;

  saveTodos();
  renderTodos();
  updateStats();
  closeEditModal();
  showToast('수정되었어요! ✦', 'success');
}

function closeEditModal() {
  editModal.hidden = true;
  editingId = null;
}

// ============================================================
//  필터링 & 정렬된 목록 가져오기
// ============================================================
function getFilteredSorted() {
  const query = searchInput.value.trim().toLowerCase();
  const showDone = showDoneToggle.checked;
  const sort = sortSelect.value;

  let result = todos.filter(t => {
    if (!showDone && t.done) return false;
    if (activeCategory !== '전체' && t.category !== activeCategory) return false;
    if (query && !t.text.toLowerCase().includes(query) && !t.category.toLowerCase().includes(query)) return false;
    return true;
  });

  if (sort === 'priority') {
    const order = { high: 0, medium: 1, low: 2 };
    result.sort((a, b) => order[a.priority] - order[b.priority]);
  } else if (sort === 'dueDate') {
    result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  } else if (sort === 'name') {
    result.sort((a, b) => a.text.localeCompare(b.text, 'ko'));
  } else if (sort === 'createdAt') {
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // default: todos 배열 순서 (order 필드)

  return result;
}

// ============================================================
//  렌더링
// ============================================================
function renderTodos() {
  todoList.innerHTML = '';
  const list = getFilteredSorted();

  if (list.length === 0) {
    emptyState.classList.add('visible');
    emptyState.setAttribute('aria-hidden', 'false');
  } else {
    emptyState.classList.remove('visible');
    emptyState.setAttribute('aria-hidden', 'true');
  }

  list.forEach((todo, idx) => {
    const card = createTodoCard(todo, idx);
    todoList.appendChild(card);
  });

  // 완료 버튼 표시 여부
  const hasDone = todos.some(t => t.done);
  $('listFooter').style.display = hasDone ? 'flex' : 'none';
}

function createTodoCard(todo, idx) {
  const diff = getDDay(todo.dueDate);
  const ddayInfo = getDDayLabel(diff);

  const repeatLabels = { daily: '매일', weekly: '매주', monthly: '매월', none: '' };

  const card = document.createElement('div');
  card.className = [
    'todo-card',
    `priority-${todo.priority}`,
    todo.done ? 'done' : '',
  ].filter(Boolean).join(' ');
  card.dataset.id = todo.id;
  card.dataset.idx = idx;
  card.setAttribute('role', 'listitem');
  card.setAttribute('draggable', 'true');

  card.innerHTML = `
    <button class="todo-check" aria-label="${todo.done ? '완료 취소' : '완료 처리'}" title="${todo.done ? '완료 취소' : '완료 처리'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </button>
    <div class="todo-content">
      <span class="todo-text">${escapeHtml(todo.text)}</span>
      <div class="todo-meta">
        <span class="todo-badge badge-category">${escapeHtml(todo.category)}</span>
        <span class="todo-badge badge-priority-${todo.priority}">
          ${todo.priority === 'high' ? '🔴 높음' : todo.priority === 'medium' ? '🟡 보통' : '🟢 낮음'}
        </span>
        ${ddayInfo ? `<span class="todo-badge badge-dday ${ddayInfo.cls}" title="${formatDate(todo.dueDate)}">${ddayInfo.text}</span>` : (todo.dueDate ? `<span class="todo-badge badge-dday far" title="${formatDate(todo.dueDate)}">${formatDate(todo.dueDate)}</span>` : '')}
        ${todo.repeat && todo.repeat !== 'none' ? `<span class="todo-badge badge-repeat">🔁 ${repeatLabels[todo.repeat]}</span>` : ''}
      </div>
    </div>
    <div class="todo-actions">
      <button class="action-btn edit-btn" aria-label="편집" title="편집">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="action-btn delete-btn" aria-label="삭제" title="삭제">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  `;

  // 이벤트 바인딩
  card.querySelector('.todo-check').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDone(todo.id);
  });

  card.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(todo.id);
  });

  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  // 더블클릭으로 편집
  card.addEventListener('dblclick', () => openEditModal(todo.id));

  // 드래그 앤 드롭
  bindDragEvents(card, todo.id);

  return card;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ============================================================
//  통계 업데이트
// ============================================================
function updateStats() {
  const total   = todos.length;
  const done    = todos.filter(t => t.done).length;
  const pending = total - done;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  statTotal.textContent   = total;
  statDone.textContent    = done;
  statPending.textContent = pending;
  progressBar.style.width = pct + '%';
  progressPercent.textContent = pct + '%';
}

// ============================================================
//  저장
// ============================================================
function saveTodos() { save(STORAGE_KEYS.todos, todos); }
function saveCategories() { save(STORAGE_KEYS.categories, categories); }

// ============================================================
//  드래그 앤 드롭
// ============================================================
function bindDragEvents(card, id) {
  card.addEventListener('dragstart', (e) => {
    dragSrcIndex = Array.from(todoList.children).indexOf(card);
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.todo-card').forEach(c => c.classList.remove('drag-over'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.todo-card').forEach(c => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const destIndex = Array.from(todoList.children).indexOf(card);
    if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

    const filtered = getFilteredSorted();
    const srcTodo  = filtered[dragSrcIndex];
    const destTodo = filtered[destIndex];
    if (!srcTodo || !destTodo) return;

    // todos 배열에서 위치 교환
    const srcIdx  = todos.findIndex(t => t.id === srcTodo.id);
    const destIdx = todos.findIndex(t => t.id === destTodo.id);
    if (srcIdx === -1 || destIdx === -1) return;

    todos.splice(destIdx, 0, todos.splice(srcIdx, 1)[0]);
    saveTodos();
    renderTodos();
    dragSrcIndex = null;
  });
}

// ============================================================
//  카테고리 관리 모달
// ============================================================
function renderCatModalList() {
  catList.innerHTML = '';
  categories.forEach(cat => {
    const isBuiltin = BUILTIN_CATEGORIES.includes(cat);
    const item = document.createElement('div');
    item.className = 'cat-item' + (isBuiltin ? ' builtin' : '');
    item.innerHTML = `
      <span>${escapeHtml(cat)}${isBuiltin ? ' <small style="opacity:.5">(기본)</small>' : ''}</span>
      <button class="cat-item-del" title="삭제" ${isBuiltin ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>✕</button>
    `;
    if (!isBuiltin) {
      item.querySelector('.cat-item-del').addEventListener('click', () => {
        // 해당 카테고리 사용중인 할일이 있으면 '기타'로 이동
        todos.forEach(t => { if (t.category === cat) t.category = '기타'; });
        categories = categories.filter(c => c !== cat);
        saveCategories();
        saveTodos();
        renderCategorySelects();
        renderCategoryTabs();
        renderCatModalList();
        if (activeCategory === cat) activeCategory = '전체';
        renderTodos();
        showToast(`'${cat}' 카테고리 삭제됨`, 'info');
      });
    }
    catList.appendChild(item);
  });
}

function addCategory() {
  const name = newCatInput.value.trim();
  if (!name) { showToast('카테고리 이름을 입력해주세요!', 'warning'); return; }
  if (categories.includes(name)) { showToast('이미 있는 카테고리예요!', 'warning'); return; }
  if (name.length > 20) { showToast('20자 이내로 입력해주세요!', 'warning'); return; }

  categories.push(name);
  saveCategories();
  renderCategorySelects();
  renderCategoryTabs();
  renderCatModalList();
  newCatInput.value = '';
  newCatInput.focus();
  showToast(`'${name}' 카테고리 추가됨! ✦`, 'success');
}

// ============================================================
//  할 일 템플릿 모달 로직
// ============================================================
let activeTemplateTab = '운동';

function renderTemplateTabs() {
  templateTabs.innerHTML = '';
  Object.keys(TEMPLATE_DATA).forEach(cat => {
    const data = TEMPLATE_DATA[cat];
    const btn = document.createElement('button');
    btn.className = 'template-tab' + (activeTemplateTab === cat ? ' active' : '');
    btn.textContent = `${data.icon} ${cat}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', activeTemplateTab === cat ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeTemplateTab = cat;
      renderTemplateTabs();
      renderTemplateItems();
    });
    templateTabs.appendChild(btn);
  });
}

function renderTemplateItems() {
  templateList.innerHTML = '';
  const items = TEMPLATE_DATA[activeTemplateTab].items;
  items.forEach(itemText => {
    const btn = document.createElement('button');
    btn.className = 'template-item-btn';
    btn.innerHTML = `<span>${TEMPLATE_DATA[activeTemplateTab].icon}</span><span>${escapeHtml(itemText)}</span>`;
    btn.addEventListener('click', () => {
      selectTemplate(activeTemplateTab, itemText);
    });
    templateList.appendChild(btn);
  });
}

function selectTemplate(categoryName, itemText) {
  todoInput.value = itemText;

  // 카테고리가 존재하지 않으면 동적으로 추가
  if (!categories.includes(categoryName)) {
    categories.push(categoryName);
    saveCategories();
    renderCategorySelects();
    renderCategoryTabs();
  }

  categorySelect.value = categoryName;
  templateModal.hidden = true;
  todoInput.focus();
  showToast(`템플릿 '${itemText}'이(가) 선택되었습니다.`, 'success');
}

// ============================================================
//  브라우저 알림 (Web Notification API)
// ============================================================
function checkNotificationPermission() {
  if (!('Notification' in window)) return;
  // 이미 허용된 경우 버튼 스타일 변경
  if (Notification.permission === 'granted') {
    notifBtn.title = '알림 ON';
    notifBtn.style.color = 'var(--accent-green)';
  }
}

function requestNotification() {
  if (!('Notification' in window)) {
    showToast('이 브라우저는 알림을 지원하지 않아요.', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('알림이 이미 허용되어 있어요! ✦', 'success');
    scheduleDeadlineNotifications();
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      notifBtn.style.color = 'var(--accent-green)';
      notifBtn.title = '알림 ON';
      showToast('알림 허용됐어요! 마감일 임박 시 알려드릴게요.', 'success');
      scheduleDeadlineNotifications();
    } else {
      showToast('알림 권한이 거부됐어요.', 'error');
    }
  });
}

function scheduleDeadlineNotifications() {
  if (Notification.permission !== 'granted') return;
  const today = todayStr();

  todos.forEach(todo => {
    if (todo.done || !todo.dueDate) return;
    const diff = getDDay(todo.dueDate);

    let msg = null;
    if (diff === 0) msg = `🔴 오늘 마감! "${todo.text}"`;
    else if (diff === 1) msg = `🟡 내일 마감! "${todo.text}"`;
    else if (diff < 0) msg = `⚠️ 마감 초과 (D+${Math.abs(diff)}) "${todo.text}"`;

    if (msg) {
      new Notification('📋 ToDoList 알림', {
        body: msg,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">✦</text></svg>',
      });
    }
  });
}

// ============================================================
//  CSV(엑셀) 내보내기
// ============================================================
function exportCSV() {
  if (todos.length === 0) { showToast('내보낼 할 일이 없어요!', 'warning'); return; }

  const BOM = '\uFEFF'; // Excel 한글 깨짐 방지
  const headers = ['번호', '내용', '카테고리', '우선순위', '마감일', '반복', '완료여부', '생성일시'];
  const priorityLabel = { high: '높음', medium: '보통', low: '낮음' };
  const repeatLabel   = { none: '없음', daily: '매일', weekly: '매주', monthly: '매월' };

  const rows = todos.map((t, i) => [
    i + 1,
    `"${t.text.replace(/"/g, '""')}"`,
    t.category,
    priorityLabel[t.priority] || t.priority,
    t.dueDate || '',
    repeatLabel[t.repeat] || t.repeat || '없음',
    t.done ? '완료' : '미완료',
    new Date(t.createdAt).toLocaleString('ko-KR'),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ToDoList_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('CSV 파일로 내보냈어요! 📊', 'success');
}

// ============================================================
//  테마 토글
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  save(STORAGE_KEYS.theme, next);
}

// ============================================================
//  토스트 알림
// ============================================================
function showToast(message, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ============================================================
//  이벤트 리스너 등록
// ============================================================
function bindEvents() {
  // 추가 버튼 & Enter
  addBtn.addEventListener('click', addTodo);
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
  });

  // 검색 실시간
  searchInput.addEventListener('input', renderTodos);

  // 정렬 변경
  sortSelect.addEventListener('change', renderTodos);

  // 완료 표시 토글
  showDoneToggle.addEventListener('change', renderTodos);

  // 완료 일괄 삭제
  clearDoneBtn.addEventListener('click', clearDone);

  // 테마 토글
  themeToggle.addEventListener('click', toggleTheme);

  // 내보내기
  exportBtn.addEventListener('click', exportCSV);

  // 알림
  notifBtn.addEventListener('click', requestNotification);

  // 카테고리 모달 열기/닫기
  catManageBtn.addEventListener('click', () => {
    renderCatModalList();
    catModal.hidden = false;
    newCatInput.focus();
  });
  catModalClose.addEventListener('click', () => { catModal.hidden = true; });
  catModal.addEventListener('click', (e) => { if (e.target === catModal) catModal.hidden = true; });

  // 카테고리 추가
  addCatBtn.addEventListener('click', addCategory);
  newCatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCategory(); });

  // 편집 모달 닫기
  editModalClose.addEventListener('click', closeEditModal);
  editCancelBtn.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

  // 템플릿 모달 열기/닫기
  if (templateBtn) {
    templateBtn.addEventListener('click', () => {
      console.log('Template button clicked');
      activeTemplateTab = '운동';
      renderTemplateTabs();
      renderTemplateItems();
      if (templateModal) {
        templateModal.hidden = false;
        console.log('Template modal opened');
      } else {
        console.error('templateModal element not found');
      }
    });
  } else {
    console.error('templateBtn element not found');
  }
  if (templateModalClose) {
    templateModalClose.addEventListener('click', () => { templateModal.hidden = true; });
  }
  if (templateModal) {
    templateModal.addEventListener('click', (e) => { if (e.target === templateModal) templateModal.hidden = true; });
  }

  // 편집 저장
  editSaveBtn.addEventListener('click', saveEdit);
  editTextInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEdit(); });

  // ESC로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      catModal.hidden = true;
      templateModal.hidden = true;
      closeEditModal();
    }
  });
}

// ============================================================
//  앱 시작
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  init();
  bindEvents();
  updateStats();
});
