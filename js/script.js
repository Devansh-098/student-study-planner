const STORAGE_KEY = 'studyPlannerData';
const THEME_KEY = 'studyPlannerTheme';
const PAGES = ['dashboard', 'subjects', 'planner', 'focus', 'progress', 'settings', 'admin'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const WEEK_NAMES = { '-1': 'Last week', '0': 'This week', '1': 'Next week' };
const SUBJECT_COLORS = ['#5b6ee1', '#8b5cf6', '#0f9d8a', '#e07b39', '#d9486b', '#2f8fd8', '#b7791f', '#64748b'];
const SUBJECT_ICONS = ['book-open', 'sigma', 'calculator', 'code', 'cpu', 'radio', 'atom', 'flask-conical', 'zap', 'database', 'globe', 'pen-tool'];
const FALLBACK_SUBJECT = { name: 'No subject', color: '#94a3b8', icon: 'book-open' };

let state;
let currentPage = 'dashboard';
let weekOffset = 0;
let filters = { subject: 'all', priority: 'all', status: 'all' };
let editingTaskId = null;
let editingSubjectId = null;
let pendingConfirmAction = null;
let activityChart = null;
let authMode = 'signin';
let cloudSaveTimer = null;
let firebaseSignedIn = false;
let pomodoroInterval = null;
let pomodoroRemaining = 25 * 60;
let pomodoroRunning = false;
let pomodoroBreak = false;
let clockInterval = null;
let browserReminderTimers = [];
let browserAlarmTimer = null;
const ALARM_STORAGE_KEY = 'studyPlannerAlarm';
let alarmSoundBlob = null;
let alarmSoundUrl = null;
let alarmSoundNativeUri = '';
let adminAuthorized = false;
let interfaceConfig = { brandName: 'Study Planner', announcement: '', accentColor: '#5a5fd6', features: { subjects: true, planner: true, focus: true, progress: true } };

const byId = id => document.getElementById(id);

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => replacements[character]);
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function todayKey() {
  return toDateKey(new Date());
}

function shiftDate(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function daysBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}

function getLastDays(count) {
  const today = todayKey();
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - count + 1));
}

function getWeekDates(offset) {
  const today = todayKey();
  const daysSinceMonday = (parseDateKey(today).getDay() + 6) % 7;
  const monday = shiftDate(today, offset * 7 - daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

function formatLongDate(date) {
  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDayMonth(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

function formatShortDate(dateKey) {
  const date = parseDateKey(dateKey);
  return `${DAY_NAMES[date.getDay()].slice(0, 3)}, ${formatDayMonth(dateKey)}`;
}

function formatRelativeDay(dateKey) {
  const difference = daysBetween(todayKey(), dateKey);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Tomorrow';
  if (difference === -1) return 'Yesterday';
  return formatShortDate(dateKey);
}

function formatDaysLeft(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function addToStudyLog(log, dateKey, taskChange, minuteChange) {
  const entry = log[dateKey] || { tasks: 0, minutes: 0 };
  entry.tasks = Math.max(0, entry.tasks + taskChange);
  entry.minutes = Math.max(0, entry.minutes + minuteChange);
  if (entry.tasks > 0) {
    log[dateKey] = entry;
  } else {
    delete log[dateKey];
  }
}

function createSampleData() {
  const today = todayKey();
  const day = offset => shiftDate(today, offset);

  const subjects = [
    { id: createId(), name: 'Mathematics IV', color: SUBJECT_COLORS[0], icon: 'sigma', target: 85, examDate: day(14) },
    { id: createId(), name: 'Data Structures', color: SUBJECT_COLORS[1], icon: 'code', target: 90, examDate: day(18) },
    { id: createId(), name: 'Digital Electronics', color: SUBJECT_COLORS[2], icon: 'cpu', target: 80, examDate: day(9) },
    { id: createId(), name: 'Communication Systems', color: SUBJECT_COLORS[3], icon: 'radio', target: 75, examDate: day(23) }
  ];
  const [maths, dataStructures, electronics, communication] = subjects;

  const makeTask = (title, subject, dateOffset, priority, duration, options = {}) => ({
    id: createId(),
    title,
    subjectId: subject.id,
    date: day(dateOffset),
    deadline: options.deadline === undefined ? '' : day(options.deadline),
    priority,
    duration,
    completed: options.doneOn !== undefined,
    completedOn: options.doneOn === undefined ? null : day(options.doneOn)
  });

  const tasks = [
    makeTask('Solve PDE classification problems', maths, 0, 'high', 60),
    makeTask('Practice stack using array', dataStructures, 0, 'medium', 45, { doneOn: 0 }),
    makeTask('Revise Boolean algebra', electronics, 0, 'medium', 40),
    makeTask('Study amplitude modulation', communication, 0, 'low', 30),
    makeTask('Complete previous-year questions', maths, 1, 'high', 90, { deadline: 4 }),
    makeTask('Implement queue using linked list', dataStructures, 1, 'medium', 60),
    makeTask('K-map simplification practice', electronics, 2, 'high', 45, { deadline: 3 }),
    makeTask('Frequency modulation numericals', communication, 2, 'medium', 45),
    makeTask('Revise Fourier series formulas', maths, 3, 'medium', 30),
    makeTask('Binary tree traversals', dataStructures, 4, 'high', 60, { deadline: 6 }),
    makeTask('Flip-flops and counters notes', electronics, 5, 'low', 45),
    makeTask('Sampling theorem derivation', communication, -2, 'medium', 40, { deadline: -1 }),
    makeTask('Laplace transform problem set', maths, -1, 'high', 75, { doneOn: -1 }),
    makeTask('Linked list insertion and deletion', dataStructures, -1, 'medium', 45, { doneOn: -1 }),
    makeTask('Number systems and codes revision', electronics, -2, 'low', 30, { doneOn: -2 }),
    makeTask('Signals and spectra basics', communication, -3, 'medium', 40, { doneOn: -3 }),
    makeTask('Time complexity of array operations', dataStructures, -4, 'low', 35, { doneOn: -4 }),
    makeTask('Probability distributions practice', maths, -6, 'medium', 50, { doneOn: -6 })
  ];

  const studyLog = {};
  tasks
    .filter(task => task.completed)
    .forEach(task => addToStudyLog(studyLog, task.completedOn, 1, task.duration));

  return { subjects, tasks, studyLog };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.subjects) && Array.isArray(saved.tasks)) {
      return {
        subjects: saved.subjects,
        tasks: saved.tasks,
        studyLog: saved.studyLog || {},
        studentName: saved.studentName || ''
      };
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
  const sampleState = { ...createSampleData(), studentName: '' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleState));
  return sampleState;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncTaskReminders();
    if (window.StudyPlannerFirebase?.savePlannerData) {
      clearTimeout(cloudSaveTimer);
      if (firebaseSignedIn) setSyncStatus('syncing');
      cloudSaveTimer = setTimeout(() => {
        window.StudyPlannerFirebase.savePlannerData(JSON.stringify(state));
      }, 700);
    } else {
      setSyncStatus(firebaseSignedIn ? 'error' : 'local');
    }
  } catch (error) {
    setSyncStatus('error');
    showToast('Your changes could not be saved in this browser.', 'error');
  }
}

function setSyncStatus(status) {
  const label = byId('syncStatus');
  if (!label) return;
  const messages = {
    local: 'Saved on this device. Sign in to sync across devices.',
    syncing: 'Saved on this device. Syncing to your account…',
    synced: 'Up to date. Your planner is synced to your account.',
    error: 'Saved on this device, but cloud sync failed. Check your connection and retry.'
  };
  label.textContent = messages[status] || messages.local;
  label.dataset.state = status;
  byId('retrySyncButton').hidden = status !== 'error' || !firebaseSignedIn;
}

function retryCloudSync() {
  if (!firebaseSignedIn || !window.StudyPlannerFirebase?.savePlannerData) return;
  setSyncStatus('syncing');
  window.StudyPlannerFirebase.savePlannerData(JSON.stringify(state));
}

function exportPlannerBackup() {
  const backup = JSON.stringify({
    format: 'student-study-planner-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  }, null, 2);
  const filename = `study-planner-backup-${todayKey()}.json`;
  if (window.StudyPlannerFirebase?.exportBackup) {
    window.StudyPlannerFirebase.exportBackup(filename, backup);
    return;
  }
  const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleBackupImport(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('That backup is larger than 10 MB and cannot be restored.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('Could not read that backup file.', 'error');
  reader.onload = () => {
    try {
      const backup = JSON.parse(String(reader.result || ''));
      if (backup.format !== 'student-study-planner-backup' || ![1].includes(backup.version)) throw new Error('This is not a supported Study Planner backup.');
      const data = backup.data;
      if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.tasks) || !data.studyLog || typeof data.studyLog !== 'object' || Array.isArray(data.studyLog)) throw new Error('The backup file is missing planner data.');
      if (!data.subjects.every(subject => subject && typeof subject.id === 'string' && typeof subject.name === 'string') || !data.tasks.every(task => task && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.subjectId === 'string' && typeof task.date === 'string')) throw new Error('The backup contains invalid subjects or tasks.');
      const restored = {
        subjects: data.subjects,
        tasks: data.tasks,
        studyLog: data.studyLog || {},
        studentName: typeof data.studentName === 'string' ? data.studentName.slice(0, 24) : ''
      };
      askConfirmation({
        title: 'Restore this backup?',
        message: 'This replaces the current planner on this device. If you are signed in, the restored planner will sync to your account and other devices.',
        confirmLabel: 'Restore Backup',
        onConfirm: () => {
          state = restored;
          refresh();
          showToast('Backup restored.', 'success');
        }
      });
    } catch (error) {
      showToast(error.message || 'That backup file could not be restored.', 'error');
    }
  };
  reader.readAsText(file);
}

function refresh() {
  saveState();
  renderAll();
}

function findSubject(subjectId) {
  return state.subjects.find(subject => subject.id === subjectId);
}

function findTask(taskId) {
  return state.tasks.find(task => task.id === taskId);
}

function getTaskSubject(task) {
  return findSubject(task.subjectId) || FALLBACK_SUBJECT;
}

function getSubjectTasks(subjectId) {
  return state.tasks.filter(task => task.subjectId === subjectId);
}

function getProgress(tasks) {
  const completed = tasks.filter(task => task.completed).length;
  return {
    total: tasks.length,
    completed,
    pending: tasks.length - completed,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  };
}

function sumMinutes(tasks) {
  return tasks.reduce((total, task) => total + Number(task.duration || 0), 0);
}

function isOverdue(task) {
  return !task.completed && (task.deadline || task.date) < todayKey();
}

function getTaskStatus(task) {
  if (task.completed) return { key: 'completed', label: 'Completed' };
  if (isOverdue(task)) return { key: 'overdue', label: 'Overdue' };
  return { key: 'pending', label: 'Pending' };
}

function compareTasks(first, second) {
  if (first.completed !== second.completed) return first.completed ? 1 : -1;
  if (first.date !== second.date) return first.date.localeCompare(second.date);
  return PRIORITY_ORDER[first.priority] - PRIORITY_ORDER[second.priority];
}

function getUpcomingExams() {
  const today = todayKey();
  return state.subjects
    .filter(subject => subject.examDate && subject.examDate >= today)
    .sort((first, second) => first.examDate.localeCompare(second.examDate));
}

function hasStudiedOn(dateKey) {
  return Boolean(state.studyLog[dateKey]);
}

function getStudyMinutes(dateKey) {
  return state.studyLog[dateKey] ? state.studyLog[dateKey].minutes : 0;
}

function getCurrentStreak() {
  let dateKey = todayKey();
  if (!hasStudiedOn(dateKey)) dateKey = shiftDate(dateKey, -1);
  let streak = 0;
  while (hasStudiedOn(dateKey)) {
    streak += 1;
    dateKey = shiftDate(dateKey, -1);
  }
  return streak;
}

function getStudyDayCount() {
  return Object.keys(state.studyLog).length;
}

function describeDeadline(deadline) {
  const days = daysBetween(todayKey(), deadline);
  if (days < 0) return { label: `Was due ${formatShortDate(deadline)}`, tone: 'danger' };
  if (days === 0) return { label: 'Due today', tone: 'danger' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'warning' };
  return { label: `Due in ${days} days`, tone: days <= 3 ? 'warning' : 'accent' };
}

function describeExam(examDate) {
  if (!examDate) return 'No exam date set';
  const daysLeft = daysBetween(todayKey(), examDate);
  if (daysLeft < 0) return `Exam was on ${formatShortDate(examDate)}`;
  return `Exam on ${formatShortDate(examDate)} · ${formatDaysLeft(daysLeft)}`;
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function emptyState(icon, title, message, actionHtml = '') {
  return `
    <div class="empty-state">
      <i data-lucide="${icon}"></i>
      <h3>${title}</h3>
      <p>${message}</p>
      ${actionHtml}
    </div>`;
}

function addTaskButton(label = 'Add Task', dateKey = '') {
  const dateAttribute = dateKey ? ` data-date="${dateKey}"` : '';
  return `<button class="btn btn-primary" data-action="add-task"${dateAttribute}><i data-lucide="plus"></i>${label}</button>`;
}

function subjectIcon(subject, sizeClass = '') {
  return `
    <div class="subject-icon ${sizeClass}" style="--subject-color: ${escapeHtml(subject.color)}">
      <i data-lucide="${escapeHtml(subject.icon)}"></i>
    </div>`;
}

function progressBar(percent, target = null) {
  const targetMarker = target === null
    ? ''
    : `<span class="progress-target" style="left: ${target}%" title="Target ${target}%"></span>`;
  return `<div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div>${targetMarker}</div>`;
}

function taskCheckbox(task) {
  return `<input type="checkbox" class="task-check" data-task-checkbox data-id="${task.id}" ${task.completed ? 'checked' : ''} aria-label="Mark ${escapeHtml(task.title)} as ${task.completed ? 'pending' : 'completed'}">`;
}

function renderTaskItem(task, showDetails = false) {
  const subject = getTaskSubject(task);
  const status = getTaskStatus(task);
  const metaItems = [
    `<span><span class="dot" style="background: ${escapeHtml(subject.color)}"></span>${escapeHtml(subject.name)}</span>`,
    showDetails ? `<span><i data-lucide="calendar"></i>${formatRelativeDay(task.date)}</span>` : '',
    `<span><i data-lucide="clock"></i>${formatDuration(task.duration)}</span>`
  ];

  if (task.deadline) {
    const deadline = describeDeadline(task.deadline);
    const toneClass = task.completed ? '' : `text-${deadline.tone}`;
    const label = task.completed ? `Deadline ${formatShortDate(task.deadline)}` : deadline.label;
    metaItems.push(`<span class="${toneClass}"><i data-lucide="flag"></i>${label}</span>`);
  }
  metaItems.push(`<span class="status-${status.key}">${status.label}</span>`);

  const actions = showDetails
    ? `
      <div class="task-actions">
        <button class="icon-btn small" data-action="edit-task" data-id="${task.id}" title="Edit task" aria-label="Edit task"><i data-lucide="pencil"></i></button>
        <button class="icon-btn small danger" data-action="delete-task" data-id="${task.id}" title="Delete task" aria-label="Delete task"><i data-lucide="trash-2"></i></button>
      </div>`
    : '';

  return `
    <div class="task-item ${task.completed ? 'is-done' : ''}">
      ${taskCheckbox(task)}
      <div class="task-body">
        <div class="task-title-row">
          <p class="task-title">${escapeHtml(task.title)}</p>
          <span class="badge badge-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
        </div>
        <div class="task-meta">${metaItems.join('')}</div>
      </div>
      ${actions}
    </div>`;
}

function renderAll() {
  renderHeader();
  renderDashboard();
  renderSubjects();
  renderPlanner();
  renderProgress();
  renderSettings();
  refreshIcons();
}

function renderHeader() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  byId('greeting').textContent = state.studentName ? `${greeting}, ${state.studentName}!` : `${greeting}!`;
  byId('todayDate').textContent = formatLongDate(new Date());
}

function renderDashboard() {
  const today = todayKey();
  const overall = getProgress(state.tasks);
  const todayTasks = state.tasks.filter(task => task.date === today).sort(compareTasks);
  const todayProgress = getProgress(todayTasks);
  const upcomingExams = getUpcomingExams();

  byId('statSubjects').textContent = state.subjects.length;
  byId('statSubjectsNote').textContent = upcomingExams.length
    ? `${pluralize(upcomingExams.length, 'exam')} coming up`
    : 'No exams scheduled';

  byId('statToday').textContent = todayTasks.length;
  if (!todayTasks.length) byId('statTodayNote').textContent = 'Nothing planned yet';
  else if (todayProgress.pending) byId('statTodayNote').textContent = `${todayProgress.pending} still pending`;
  else byId('statTodayNote').textContent = 'All done for today';

  byId('statCompleted').textContent = overall.completed;
  byId('statCompletedNote').textContent = `out of ${pluralize(overall.total, 'task')}`;
  byId('statProgress').textContent = `${overall.percent}%`;
  byId('statProgressBar').style.width = `${overall.percent}%`;

  byId('todaySummary').textContent = todayTasks.length
    ? `${todayProgress.completed} of ${todayTasks.length} done · ${formatDuration(sumMinutes(todayTasks))} planned`
    : 'No study sessions planned';

  renderOverdueNotice();
  byId('todayTaskList').innerHTML = todayTasks.length
    ? todayTasks.map(task => renderTaskItem(task)).join('')
    : emptyState('coffee', 'No tasks for today', 'Take a break or plan something to study.', addTaskButton('Plan a Task', today));

  renderExamList(upcomingExams);
  renderStreak();
  renderDeadlines();
  renderProgressOverview(overall);
}

function renderOverdueNotice() {
  const overdueCount = state.tasks.filter(isOverdue).length;
  byId('overdueNotice').innerHTML = overdueCount
    ? `
      <div class="notice">
        <i data-lucide="circle-alert"></i>
        <span>You have ${pluralize(overdueCount, 'overdue task')} from earlier days.</span>
        <button class="link-btn" data-action="show-overdue">Review</button>
      </div>`
    : '';
}

function renderExamList(exams) {
  const list = byId('examList');
  if (!exams.length) {
    list.innerHTML = emptyState(
      'calendar-x',
      'No upcoming exams',
      'Add exam dates to your subjects to see a countdown.',
      '<button class="btn btn-light" data-action="navigate" data-page="subjects">Go to Subjects</button>'
    );
    return;
  }

  list.innerHTML = exams.map(subject => {
    const daysLeft = daysBetween(todayKey(), subject.examDate);
    return `
      <div class="list-item">
        ${subjectIcon(subject, 'small')}
        <div class="list-item-info">
          <p class="list-item-title">${escapeHtml(subject.name)}</p>
          <p class="list-item-meta">${formatShortDate(subject.examDate)} ${parseDateKey(subject.examDate).getFullYear()}</p>
        </div>
        <span class="pill ${daysLeft <= 7 ? 'pill-danger' : 'pill-accent'}">${formatDaysLeft(daysLeft)}</span>
      </div>`;
  }).join('');
}

function renderStreak() {
  const streak = getCurrentStreak();
  const today = todayKey();

  byId('streakCount').textContent = pluralize(streak, 'day');
  byId('streakDays').textContent = getStudyDayCount();
  byId('streakWeek').innerHTML = getLastDays(7).map(dateKey => {
    const studied = hasStudiedOn(dateKey);
    const dayLetter = DAY_NAMES[parseDateKey(dateKey).getDay()].charAt(0);
    return `
      <div class="streak-day ${studied ? 'active' : ''} ${dateKey === today ? 'today' : ''}" title="${formatShortDate(dateKey)}">
        <span class="streak-box">${studied ? '<i data-lucide="check"></i>' : ''}</span>
        ${dayLetter}
      </div>`;
  }).join('');

  let message = 'Complete a task today to start a new streak.';
  if (hasStudiedOn(today)) message = 'You have studied today. Keep it up!';
  else if (streak) message = 'Complete a task today to keep your streak going.';
  byId('streakMessage').textContent = message;
}

function renderDeadlines() {
  const lastDay = shiftDate(todayKey(), 14);
  const upcoming = state.tasks
    .filter(task => !task.completed && task.deadline && task.deadline <= lastDay)
    .sort((first, second) => first.deadline.localeCompare(second.deadline))
    .slice(0, 5);

  const list = byId('deadlineList');
  if (!upcoming.length) {
    list.innerHTML = '<p class="muted-text">No deadlines in the next two weeks.</p>';
    return;
  }

  list.innerHTML = upcoming.map(task => {
    const subject = getTaskSubject(task);
    const deadline = describeDeadline(task.deadline);
    const pillLabel = deadline.tone === 'danger' && task.deadline < todayKey() ? 'Overdue' : deadline.label;
    return `
      <div class="list-item">
        <div class="list-item-info">
          <p class="list-item-title">${escapeHtml(task.title)}</p>
          <p class="list-item-meta"><span class="dot" style="background: ${escapeHtml(subject.color)}"></span>${escapeHtml(subject.name)}</p>
        </div>
        <span class="pill pill-${deadline.tone}">${pillLabel}</span>
      </div>`;
  }).join('');
}

function renderProgressOverview(overall) {
  byId('overallRing').style.setProperty('--value', overall.percent);
  byId('overallRingValue').textContent = `${overall.percent}%`;
  byId('overallRingCaption').textContent = `${overall.completed} of ${pluralize(overall.total, 'task')} done`;

  byId('dashboardSubjectProgress').innerHTML = state.subjects.length
    ? state.subjects.map(subject => {
      const progress = getProgress(getSubjectTasks(subject.id));
      return `
        <div style="--subject-color: ${escapeHtml(subject.color)}">
          <div class="progress-row-head">
            <span>${escapeHtml(subject.name)}</span>
            <span>${progress.completed}/${progress.total} · ${progress.percent}%</span>
          </div>
          ${progressBar(progress.percent)}
        </div>`;
    }).join('')
    : '<p class="muted-text">Add subjects to see subject-wise progress here.</p>';
}

function renderSubjects() {
  const grid = byId('subjectGrid');
  if (!state.subjects.length) {
    grid.innerHTML = emptyState(
      'book-open',
      'No subjects yet',
      'Add the subjects you are studying this semester to start planning.',
      '<button class="btn btn-primary" data-action="add-subject"><i data-lucide="plus"></i>Add Subject</button>'
    );
    return;
  }
  grid.innerHTML = state.subjects.map(renderSubjectCard).join('');
}

function renderSubjectCard(subject) {
  const tasks = getSubjectTasks(subject.id);
  const progress = getProgress(tasks);
  const name = escapeHtml(subject.name);

  return `
    <article class="card subject-card" style="--subject-color: ${escapeHtml(subject.color)}">
      <div class="subject-card-head">
        ${subjectIcon(subject)}
        <div class="subject-card-title">
          <h3>${name}</h3>
          <p><i data-lucide="calendar"></i>${describeExam(subject.examDate)}</p>
        </div>
      </div>
      <div class="subject-stats">
        <div><strong>${progress.total}</strong><span>Tasks</span></div>
        <div><strong>${progress.completed}</strong><span>Completed</span></div>
        <div><strong>${formatDuration(sumMinutes(tasks))}</strong><span>Planned</span></div>
      </div>
      <div>
        <div class="progress-row-head">
          <span>Progress ${progress.percent}%</span>
          <span>Target ${subject.target}%</span>
        </div>
        ${progressBar(progress.percent, subject.target)}
      </div>
      <div class="subject-card-footer">
        <button class="btn btn-light" data-action="view-subject-tasks" data-id="${subject.id}">
          <i data-lucide="list-checks"></i>View Tasks
        </button>
        <button class="icon-btn" data-action="edit-subject" data-id="${subject.id}" title="Edit subject" aria-label="Edit ${name}"><i data-lucide="pencil"></i></button>
        <button class="icon-btn danger" data-action="delete-subject" data-id="${subject.id}" title="Delete subject" aria-label="Delete ${name}"><i data-lucide="trash-2"></i></button>
      </div>
    </article>`;
}

function renderPlanner() {
  renderWeek();
  renderFilterControls();
  renderTaskList();
}

function renderWeek() {
  const weekDates = getWeekDates(weekOffset);
  const today = todayKey();
  const weekName = WEEK_NAMES[weekOffset] ? `${WEEK_NAMES[weekOffset]} · ` : '';
  const year = parseDateKey(weekDates[6]).getFullYear();
  byId('weekRangeLabel').textContent = `${weekName}${formatDayMonth(weekDates[0])} – ${formatDayMonth(weekDates[6])} ${year}`;

  byId('weekGrid').innerHTML = weekDates.map(dateKey => {
    const dayName = DAY_NAMES[parseDateKey(dateKey).getDay()];
    const dayTasks = state.tasks.filter(task => task.date === dateKey).sort(compareTasks);
    const isToday = dateKey === today;
    const tasksHtml = dayTasks.length
      ? dayTasks.map(renderPlanChip).join('')
      : '<p class="day-empty">No tasks planned</p>';
    const footer = dayTasks.length
      ? `<p class="day-total">${pluralize(dayTasks.length, 'task')} · ${formatDuration(sumMinutes(dayTasks))}</p>`
      : '';

    return `
      <div class="day-column ${isToday ? 'is-today' : ''}">
        <div class="day-header">
          <div>
            <p class="day-name">${dayName}</p>
            <p class="day-date">${formatDayMonth(dateKey)}</p>
          </div>
          <button class="icon-btn small" data-action="add-task" data-date="${dateKey}" title="Add task on ${dayName}" aria-label="Add task on ${dayName}">
            <i data-lucide="plus"></i>
          </button>
        </div>
        <div class="day-tasks">${tasksHtml}</div>
        ${footer}
      </div>`;
  }).join('');
}

function renderPlanChip(task) {
  const subject = getTaskSubject(task);
  return `
    <div class="plan-chip ${task.completed ? 'is-done' : ''}" style="--subject-color: ${escapeHtml(subject.color)}">
      <button class="plan-chip-title" data-action="edit-task" data-id="${task.id}" title="Click to edit">${escapeHtml(task.title)}</button>
      <div class="plan-chip-footer">
        ${taskCheckbox(task)}
        <span class="plan-chip-meta">${escapeHtml(subject.name)} · ${formatDuration(task.duration)}</span>
      </div>
    </div>`;
}

function renderFilterControls() {
  if (filters.subject !== 'all' && !findSubject(filters.subject)) filters.subject = 'all';

  const subjectOptions = state.subjects
    .map(subject => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
    .join('');
  byId('filterSubject').innerHTML = `<option value="all">All subjects</option>${subjectOptions}`;
  byId('filterSubject').value = filters.subject;
  byId('filterPriority').value = filters.priority;
  byId('filterStatus').value = filters.status;
  byId('clearFiltersBtn').hidden = Object.values(filters).every(value => value === 'all');
}

function getFilteredTasks() {
  return state.tasks
    .filter(task => {
      if (filters.subject !== 'all' && task.subjectId !== filters.subject) return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.status === 'pending' && task.completed) return false;
      if (filters.status === 'completed' && !task.completed) return false;
      if (filters.status === 'overdue' && !isOverdue(task)) return false;
      return true;
    })
    .sort(compareTasks);
}

function renderTaskList() {
  const visibleTasks = getFilteredTasks();
  const list = byId('allTaskList');
  byId('taskCountLabel').textContent = `Showing ${visibleTasks.length} of ${pluralize(state.tasks.length, 'task')}`;

  if (visibleTasks.length) {
    list.innerHTML = visibleTasks.map(task => renderTaskItem(task, true)).join('');
  } else if (state.tasks.length) {
    list.innerHTML = emptyState('search-x', 'No matching tasks', 'Try changing or clearing the filters above.');
  } else {
    list.innerHTML = emptyState('clipboard-list', 'No tasks yet', 'Plan your first study session to get started.', addTaskButton());
  }
}

function renderProgress() {
  const overall = getProgress(state.tasks);
  const weekMinutes = getLastDays(7).reduce((total, dateKey) => total + getStudyMinutes(dateKey), 0);

  byId('progOverall').textContent = `${overall.percent}%`;
  byId('progCompleted').textContent = overall.completed;
  byId('progPending').textContent = overall.pending;
  byId('progHours').textContent = formatDuration(weekMinutes);

  renderPriorityBreakdown();
  renderSubjectCompletion();
  if (currentPage === 'progress') renderActivityChart();
}

function renderPriorityBreakdown() {
  const pendingTasks = state.tasks.filter(task => !task.completed);
  const container = byId('priorityBreakdown');

  if (!pendingTasks.length) {
    container.innerHTML = emptyState('party-popper', 'Nothing pending', 'Every planned task is completed.');
    return;
  }

  const rows = PRIORITIES.map(priority => {
    const tasks = pendingTasks.filter(task => task.priority === priority);
    const share = Math.round((tasks.length / pendingTasks.length) * 100);
    return `
      <div class="priority-${priority}">
        <div class="progress-row-head">
          <span class="badge badge-${priority}">${PRIORITY_LABELS[priority]}</span>
          <span>${pluralize(tasks.length, 'task')} · ${formatDuration(sumMinutes(tasks))}</span>
        </div>
        ${progressBar(share)}
      </div>`;
  }).join('');

  container.innerHTML = `${rows}<p class="card-footnote">Total pending study time: <strong>${formatDuration(sumMinutes(pendingTasks))}</strong></p>`;
}

function renderSubjectCompletion() {
  const container = byId('subjectCompletionList');
  if (!state.subjects.length) {
    container.innerHTML = emptyState('chart-column', 'Nothing to show yet', 'Add subjects and tasks to see your progress here.');
    return;
  }

  container.innerHTML = state.subjects.map(subject => {
    const progress = getProgress(getSubjectTasks(subject.id));
    const gap = subject.target - progress.percent;
    const targetStatus = gap <= 0
      ? '<span class="status-completed">Target reached</span>'
      : `<span>${gap}% below target</span>`;
    return `
      <div style="--subject-color: ${escapeHtml(subject.color)}">
        <div class="completion-head">
          ${subjectIcon(subject, 'small')}
          <div class="completion-info">
            <p class="completion-name">${escapeHtml(subject.name)}</p>
            <p class="completion-meta">${progress.completed} of ${pluralize(progress.total, 'task')} done · Target ${subject.target}% · ${targetStatus}</p>
          </div>
          <strong class="completion-percent">${progress.percent}%</strong>
        </div>
        ${progressBar(progress.percent, subject.target)}
      </div>`;
  }).join('');
}

function readCssVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildChartOptions() {
  const textColor = readCssVariable('--text-muted');
  const gridColor = readCssVariable('--border');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: context => ` ${context.parsed.y} hours studied`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textColor }
      },
      y: {
        beginAtZero: true,
        suggestedMax: 2,
        border: { display: false },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: value => `${value}h` }
      }
    }
  };
}

function renderActivityChart() {
  if (!window.Chart) {
    byId('chartBox').hidden = true;
    byId('chartFallback').hidden = false;
    return;
  }

  const days = getLastDays(7);
  const labels = days.map((dateKey, index) => (
    index === days.length - 1 ? 'Today' : DAY_NAMES[parseDateKey(dateKey).getDay()].slice(0, 3)
  ));
  const hours = days.map(dateKey => Number((getStudyMinutes(dateKey) / 60).toFixed(1)));
  const barColor = readCssVariable('--accent');

  if (activityChart) {
    activityChart.resize();
    activityChart.data.labels = labels;
    activityChart.data.datasets[0].data = hours;
    activityChart.data.datasets[0].backgroundColor = barColor;
    activityChart.options = buildChartOptions();
    activityChart.update();
    return;
  }

  activityChart = new Chart(byId('activityChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours studied',
        data: hours,
        backgroundColor: barColor,
        borderRadius: 6,
        maxBarThickness: 40
      }]
    },
    options: buildChartOptions()
  });
}

function renderSettings() {
  byId('dataSummary').innerHTML = `
    <li><strong>${state.subjects.length}</strong>Subjects</li>
    <li><strong>${state.tasks.length}</strong>Tasks</li>
    <li><strong>${getStudyDayCount()}</strong>Study days</li>`;
  byId('dataStorageCopy').textContent = firebaseSignedIn
    ? 'Your planner is saved on this device and synced to your Firebase account.'
    : 'Your planner is saved only in this browser until you sign in.';
}

function renderFocusClock() {
  const now = new Date();
  const updateTile = (id, value) => {
    const tile = byId(id);
    if (tile.textContent !== value) {
      tile.textContent = value;
      tile.classList.remove('flip-change');
      void tile.offsetWidth;
      tile.classList.add('flip-change');
    }
  };
  updateTile('flipHours', String(now.getHours()).padStart(2, '0'));
  updateTile('flipMinutes', String(now.getMinutes()).padStart(2, '0'));
  updateTile('flipSeconds', String(now.getSeconds()).padStart(2, '0'));
  byId('focusDateLabel').textContent = formatLongDate(now);
}

function renderPomodoro() {
  const minutes = Math.floor(pomodoroRemaining / 60);
  const seconds = pomodoroRemaining % 60;
  byId('pomodoroDisplay').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  byId('pomodoroMode').textContent = pomodoroBreak ? 'Break · 5 minutes' : 'Focus session · 25 minutes';
  byId('pomodoroStart').textContent = pomodoroRunning ? 'Pause' : 'Start';
  const total = (pomodoroBreak ? 5 : 25) * 60;
  byId('pomodoroProgress').style.width = `${Math.max(0, Math.min(100, ((total - pomodoroRemaining) / total) * 100))}%`;
}

function startPomodoro() {
  pomodoroRunning = !pomodoroRunning;
  if (pomodoroRunning) {
    pomodoroInterval = setInterval(() => {
      pomodoroRemaining -= 1;
      if (pomodoroRemaining <= 0) {
        clearInterval(pomodoroInterval);
        pomodoroRunning = false;
        notifyUser(pomodoroBreak ? 'Break finished' : 'Focus session finished', pomodoroBreak ? 'Time to get back to studying.' : 'Great work. Take a 5 minute break.');
        pomodoroBreak = !pomodoroBreak;
        pomodoroRemaining = (pomodoroBreak ? 5 : 25) * 60;
      }
      renderPomodoro();
    }, 1000);
  } else clearInterval(pomodoroInterval);
  renderPomodoro();
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroRunning = false;
  pomodoroBreak = false;
  pomodoroRemaining = 25 * 60;
  renderPomodoro();
}

function notifyUser(title, body) {
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
    window.StudyPlannerFirebase.showNotification(title, body);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else showToast(`${title}: ${body}`, 'info');
}

function openPlannerMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('studyPlannerMedia', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('media');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeAlarmSound(blob, name) {
  const db = await openPlannerMediaDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('media', 'readwrite');
    transaction.objectStore('media').put({ blob, name }, 'alarmSound');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readAlarmSound() {
  const db = await openPlannerMediaDb();
  const record = await new Promise((resolve, reject) => {
    const transaction = db.transaction('media', 'readonly');
    const request = transaction.objectStore('media').get('alarmSound');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function clearStoredAlarmSound() {
  const db = await openPlannerMediaDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('media', 'readwrite');
    transaction.objectStore('media').delete('alarmSound');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function showAlarmSound(name, blob) {
  if (alarmSoundUrl) URL.revokeObjectURL(alarmSoundUrl);
  alarmSoundBlob = blob || null;
  alarmSoundUrl = blob ? URL.createObjectURL(blob) : null;
  byId('alarmSoundName').textContent = name || 'Default notification sound';
  byId('alarmSoundPreview').hidden = !blob;
  byId('alarmSoundPreview').src = alarmSoundUrl || '';
  byId('clearAlarmSound').hidden = !blob && !alarmSoundNativeUri;
}

async function onAlarmSoundSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') {
    showToast('Please choose an MP3 audio file.', 'error');
    event.target.value = '';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast('Choose an MP3 smaller than 12 MB.', 'error');
    event.target.value = '';
    return;
  }
  try {
    await storeAlarmSound(file, file.name);
    showAlarmSound(file.name, file);
    if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      alarmSoundNativeUri = window.StudyPlannerFirebase.saveAlarmSound(String(dataUrl).split(',')[1], file.name) || '';
      if (!alarmSoundNativeUri) {
        showToast('Could not save this MP3 for Android alarms. The preview is still available while the app is open.', 'error');
      }
    }
    const alarm = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || 'null');
    if (alarm && alarmSoundNativeUri && window.StudyPlannerFirebase?.isNativeNotifications?.()) {
      window.StudyPlannerFirebase.scheduleAlarm(alarm.timestamp, 'Study alarm', alarmSoundNativeUri);
    }
    showToast('Alarm sound saved on this device. Use Preview to listen.');
  } catch (error) {
    showToast('Could not save that MP3 on this device.', 'error');
  }
}

async function loadAlarmSound() {
  try {
    if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
      alarmSoundNativeUri = window.StudyPlannerFirebase.getAlarmSoundUri() || '';
    }
    const record = await readAlarmSound();
    if (record?.blob) showAlarmSound(record.name, record.blob);
    else if (alarmSoundNativeUri) {
      byId('alarmSoundName').textContent = 'Custom MP3 saved on this device';
      byId('clearAlarmSound').hidden = false;
    }
  } catch (_) { /* Browser storage may be unavailable; the default alarm remains usable. */ }
}

async function removeAlarmSound() {
  try { await clearStoredAlarmSound(); } catch (_) { }
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
    window.StudyPlannerFirebase.clearAlarmSound();
    alarmSoundNativeUri = '';
  }
  showAlarmSound('', null);
  const alarm = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || 'null');
  if (alarm && window.StudyPlannerFirebase?.isNativeNotifications?.()) {
    window.StudyPlannerFirebase.scheduleAlarm(alarm.timestamp, 'Study alarm', '');
  }
  showToast('Using the default alarm sound.');
}

function playAlarmSound() {
  if (!alarmSoundUrl) return false;
  const audio = byId('alarmSoundPreview');
  audio.currentTime = 0;
  audio.play().catch(() => showToast('Tap Preview once before the alarm so this browser can play the MP3.', 'info'));
  return true;
}

async function requestNotifications() {
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
    window.StudyPlannerFirebase.requestNotificationPermission();
    return true;
  }
  if (!('Notification' in window)) {
    showToast('Notifications are not available in this browser.', 'info');
    return false;
  }
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission === 'granted') syncTaskReminders();
  if (permission !== 'granted') showToast('Allow notifications in your browser settings to receive reminders.', 'info');
  return permission === 'granted';
}

function syncTaskReminders() {
  const reminders = state.tasks.filter(task => !task.completed && task.reminderTime).map(task => ({ id: task.id, title: task.title, date: task.date, time: task.reminderTime }));
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) {
    window.StudyPlannerFirebase.scheduleTaskReminders(JSON.stringify(reminders));
    return;
  }
  browserReminderTimers.forEach(clearTimeout);
  browserReminderTimers = [];
  if (!('Notification' in window) || Notification.permission === 'default' || Notification.permission === 'denied') {
    // Keep an in-page reminder available while the web planner remains open.
  }
  const now = Date.now();
  reminders.forEach(task => {
    const at = new Date(`${task.date}T${task.time}`).getTime();
    if (at > now && at - now < 2147480000) browserReminderTimers.push(setTimeout(() => notifyUser('Study task reminder', task.title), at - now));
  });
}

function initAlarmControls() {
  byId('alarmHour').innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${String(index + 1).padStart(2, '0')}</option>`).join('');
  byId('alarmMinute').innerHTML = Array.from({ length: 60 }, (_, minute) => `<option value="${minute}">${String(minute).padStart(2, '0')}</option>`).join('');
  const soon = new Date();
  soon.setSeconds(0, 0);
  soon.setMinutes(Math.ceil((soon.getMinutes() + 1) / 5) * 5);
  const hour24 = soon.getHours();
  byId('alarmHour').value = String(hour24 % 12 || 12);
  byId('alarmMinute').value = String(soon.getMinutes());
  byId('alarmPeriod').value = hour24 >= 12 ? 'PM' : 'AM';
}

function readAlarmTime() {
  const hour12 = Number(byId('alarmHour').value);
  const minute = Number(byId('alarmMinute').value);
  const isPm = byId('alarmPeriod').value === 'PM';
  const hour24 = (hour12 % 12) + (isPm ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatAlarmTime(time) {
  const [hour24, minute] = time.split(':').map(Number);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function setAlarmStatus(message, active = false) {
  byId('alarmStatus').textContent = message;
  byId('alarmStatusBox').classList.toggle('alarm-is-set', active);
  byId('alarmStatusIcon').setAttribute('data-lucide', active ? 'bell-ring' : 'bell-off');
  refreshIcons();
}

function fireStudyAlarm() {
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) notifyUser('Study alarm', 'It is time for your planned study session.');
  else {
    if (!playAlarmSound()) notifyUser('Study alarm', 'It is time for your planned study session.');
    else showToast('Your study alarm is ringing.');
  }
  localStorage.removeItem(ALARM_STORAGE_KEY);
  byId('alarmSetButton').innerHTML = '<i data-lucide="bell"></i> Set alarm';
  byId('alarmCancelButton').hidden = true;
  setAlarmStatus('Your alarm went off. Ready for a study session?', false);
}

function loadSavedAlarm() {
  try {
    const alarm = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || 'null');
    if (!alarm) return;
    const [hour24, minute] = alarm.time.split(':').map(Number);
    byId('alarmHour').value = String(hour24 % 12 || 12);
    byId('alarmMinute').value = String(minute);
    byId('alarmPeriod').value = hour24 >= 12 ? 'PM' : 'AM';
    const at = new Date(alarm.timestamp).getTime();
    const delay = at - Date.now();
    if (delay <= 0) {
      localStorage.removeItem(ALARM_STORAGE_KEY);
      setAlarmStatus('Your previous alarm time passed. Choose a new time.');
      return;
    }
    setAlarmStatus(`Alarm set for ${formatAlarmTime(alarm.time)}.`, true);
    byId('alarmSetButton').innerHTML = '<i data-lucide="bell"></i> Update alarm';
    byId('alarmCancelButton').hidden = false;
    if (window.StudyPlannerFirebase?.isNativeNotifications?.()) window.StudyPlannerFirebase.scheduleAlarm(alarm.timestamp, 'Study alarm', alarmSoundNativeUri);
    else if (delay < 2147480000) {
      clearTimeout(browserAlarmTimer);
      browserAlarmTimer = setTimeout(fireStudyAlarm, delay);
    }
  } catch (_) { localStorage.removeItem(ALARM_STORAGE_KEY); }
}

function setStudyAlarm(event) {
  event.preventDefault();
  const time = readAlarmTime();
  requestNotifications();
  const [hours, minutes] = time.split(':').map(Number);
  const when = new Date();
  when.setHours(hours, minutes, 0, 0);
  if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
  const alarm = { time, timestamp: when.getTime() };
  localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarm));
  clearTimeout(browserAlarmTimer);
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) window.StudyPlannerFirebase.scheduleAlarm(alarm.timestamp, 'Study alarm', alarmSoundNativeUri);
  else browserAlarmTimer = setTimeout(fireStudyAlarm, when.getTime() - Date.now());
  const dayLabel = when.toDateString() === new Date().toDateString() ? 'today' : 'tomorrow';
  setAlarmStatus(`Alarm set for ${formatAlarmTime(time)} ${dayLabel}.`, true);
  byId('alarmSetButton').innerHTML = '<i data-lucide="bell"></i> Update alarm';
  byId('alarmCancelButton').hidden = false;
  refreshIcons();
  showToast(`Alarm set for ${formatAlarmTime(time)} ${dayLabel}.`);
}

function cancelStudyAlarm() {
  localStorage.removeItem(ALARM_STORAGE_KEY);
  clearTimeout(browserAlarmTimer);
  if (window.StudyPlannerFirebase?.isNativeNotifications?.()) window.StudyPlannerFirebase.cancelAlarm();
  setAlarmStatus('Alarm cancelled. Choose another time whenever you’re ready.');
  byId('alarmSetButton').innerHTML = '<i data-lucide="bell"></i> Set alarm';
  byId('alarmCancelButton').hidden = true;
  refreshIcons();
}

function showPage(pageName) {
  currentPage = PAGES.includes(pageName) ? pageName : 'dashboard';
  if (currentPage === 'admin' && !adminAuthorized) currentPage = 'dashboard';
  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.id === `page-${currentPage}`);
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === currentPage);
  });
  history.replaceState(null, '', `#${currentPage}`);
  window.scrollTo(0, 0);
  if (currentPage === 'progress') renderActivityChart();
  if (currentPage === 'admin') loadAdminUsers();
}

function renderAdminConfigForm() {
  if (!adminAuthorized) return;
  byId('adminBrandName').value = interfaceConfig.brandName || 'Study Planner';
  byId('adminAnnouncement').value = interfaceConfig.announcement || '';
  byId('adminAccentColor').value = /^#[0-9a-f]{6}$/i.test(interfaceConfig.accentColor || '') ? interfaceConfig.accentColor : '#5a5fd6';
  ['subjects', 'planner', 'focus', 'progress'].forEach(key => {
    byId(`adminFeature${key[0].toUpperCase()}${key.slice(1)}`).checked = interfaceConfig.features?.[key] !== false;
  });
}

function applyGlobalInterfaceConfig(config) {
  if (!config || typeof config !== 'object') return;
  interfaceConfig = {
    brandName: typeof config.brandName === 'string' ? config.brandName.slice(0, 32) : 'Study Planner',
    announcement: typeof config.announcement === 'string' ? config.announcement.slice(0, 180) : '',
    accentColor: /^#[0-9a-f]{6}$/i.test(config.accentColor || '') ? config.accentColor : '#5a5fd6',
    features: { subjects: true, planner: true, focus: true, progress: true, ...(config.features || {}) }
  };
  document.documentElement.style.setProperty('--accent', interfaceConfig.accentColor);
  document.querySelectorAll('.brand-name').forEach(el => { el.textContent = interfaceConfig.brandName; });
  const announcement = byId('globalAnnouncement');
  announcement.textContent = interfaceConfig.announcement;
  announcement.hidden = !interfaceConfig.announcement;
  ['subjects', 'planner', 'focus', 'progress'].forEach(key => {
    const enabled = interfaceConfig.features[key] !== false;
    const link = document.querySelector(`.nav-link[data-page="${key}"]`);
    const page = byId(`page-${key}`);
    if (link) link.hidden = !enabled;
    if (page) page.hidden = !enabled;
    if (!enabled && currentPage === key) showPage('dashboard');
  });
  if (adminAuthorized) renderAdminConfigForm();
}

function loadAdminUsers() {
  if (!adminAuthorized || !window.StudyPlannerFirebase?.loadAdminUsers) return;
  byId('adminUsersStatus').textContent = 'Loading accounts…';
  window.StudyPlannerFirebase.loadAdminUsers();
}

function renderAdminUsers(users) {
  const list = byId('adminUsersList');
  const records = Array.isArray(users) ? users : [];
  const subjectTotal = records.reduce((sum, user) => sum + (user.subjects?.length || 0), 0);
  const taskTotal = records.reduce((sum, user) => sum + (user.tasks?.length || 0), 0);
  byId('adminUserCount').textContent = records.length;
  byId('adminSubjectCount').textContent = subjectTotal;
  byId('adminTaskCount').textContent = taskTotal;
  byId('adminUsersStatus').textContent = records.length ? `${records.length} account${records.length === 1 ? '' : 's'} found. Select an account to inspect its planner.` : 'No accounts found yet.';
  list.innerHTML = records.map(user => {
    const identity = escapeHtml(user.email || user.uid || 'Account');
    const name = escapeHtml(user.studentName || user.email || user.uid || 'Study Planner user');
    const subjectNames = (user.subjects || []).map(subject => `<li>${escapeHtml(subject.name || 'Subject')}</li>`).join('') || '<li>No subjects</li>';
    const taskRows = (user.tasks || []).map(task => `<li><strong>${escapeHtml(task.title || 'Task')}</strong><span>${escapeHtml(task.date || '')} · ${task.completed ? 'Completed' : 'Pending'}</span></li>`).join('') || '<li>No tasks</li>';
    const blocked = user.disabled === true;
    return `<article class="admin-user-card ${blocked ? 'is-disabled' : ''}"><div class="admin-user-head"><div class="admin-user-avatar"><i data-lucide="user-round"></i></div><div class="admin-user-identity"><strong>${name}</strong><span>${identity}</span><small>${escapeHtml(user.uid || '')}</small></div><span class="admin-user-state ${blocked ? 'blocked' : ''}">${blocked ? 'Paused' : 'Active'}</span></div><div class="admin-user-metrics"><span><b>${(user.subjects || []).length}</b> subjects</span><span><b>${(user.tasks || []).length}</b> tasks</span><span><b>${(user.tasks || []).filter(task => task.completed).length}</b> done</span></div><details class="admin-user-details"><summary>View planner data</summary><div class="admin-data-columns"><div><h4>Subjects</h4><ul>${subjectNames}</ul></div><div><h4>Tasks</h4><ul>${taskRows}</ul></div></div></details><button class="btn ${blocked ? 'btn-light' : 'btn-danger'} admin-access-button" type="button" data-admin-disabled="${!blocked}" data-admin-uid="${escapeHtml(user.uid || '')}" ${!user.uid ? 'disabled' : ''}>${blocked ? 'Restore account access' : 'Pause account access'}</button></article>`;
  }).join('');
  refreshIcons();
}

function saveAdminInterface(event) {
  event.preventDefault();
  if (!adminAuthorized) return;
  const features = Object.fromEntries(['subjects', 'planner', 'focus', 'progress'].map(key => [key, byId(`adminFeature${key[0].toUpperCase()}${key.slice(1)}`).checked]));
  const config = { brandName: byId('adminBrandName').value.trim() || 'Study Planner', announcement: byId('adminAnnouncement').value.trim(), accentColor: byId('adminAccentColor').value, features };
  byId('adminConfigStatus').textContent = 'Publishing to web and app…';
  window.StudyPlannerFirebase?.saveInterfaceConfig?.(JSON.stringify(config));
}

function handleAdminClick(event) {
  const button = event.target.closest('[data-admin-uid]');
  if (!button || !adminAuthorized) return;
  const disabled = button.dataset.adminDisabled === 'true';
  const uid = button.dataset.adminUid;
  if (!uid) return;
  if (!window.confirm(`${disabled ? 'Pause' : 'Restore'} this account's app access?`)) return;
  byId('adminUsersStatus').textContent = 'Updating account access…';
  window.StudyPlannerFirebase?.setUserDisabled?.(uid, disabled);
}

function setFilters(newFilters) {
  filters = { subject: 'all', priority: 'all', status: 'all', ...newFilters };
  renderPlanner();
  refreshIcons();
}

function showFilteredTasks(newFilters) {
  setFilters(newFilters);
  showPage('planner');
  byId('allTasksCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changeWeek(offset) {
  weekOffset = offset;
  renderWeek();
  refreshIcons();
}

function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  byId('darkModeSwitch').checked = theme === 'dark';

  const toggleLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const themeToggle = byId('themeToggle');
  themeToggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  themeToggle.title = toggleLabel;
  themeToggle.setAttribute('aria-label', toggleLabel);

  if (currentPage === 'progress') renderActivityChart();
  refreshIcons();
}

function toggleTheme() {
  const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

function openDialog(dialogId) {
  const dialog = byId(dialogId);
  if (!dialog.open) dialog.showModal();
}

function showToast(message, type = 'success') {
  const icons = { success: 'circle-check', info: 'info', error: 'circle-alert' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type]}"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  byId('toastContainer').appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

function askConfirmation({ title, message, confirmLabel, onConfirm }) {
  byId('confirmTitle').textContent = title;
  byId('confirmMessage').textContent = message;
  byId('confirmButton').textContent = confirmLabel;
  pendingConfirmAction = onConfirm;
  openDialog('confirmDialog');
}

function runConfirmedAction() {
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  byId('confirmDialog').close();
  if (action) action();
}

function openTaskModal(taskId = null, presetDate = '') {
  if (!state.subjects.length) {
    showPage('subjects');
    showToast('Add a subject first, then you can plan tasks for it.', 'info');
    return;
  }

  const task = taskId ? findTask(taskId) : null;
  editingTaskId = task ? task.id : null;

  byId('taskSubject').innerHTML = state.subjects
    .map(subject => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
    .join('');

  const defaultSubject = filters.subject !== 'all' ? filters.subject : state.subjects[0].id;
  byId('taskDialogTitle').textContent = task ? 'Edit Task' : 'Add Task';
  byId('taskSubmitBtn').textContent = task ? 'Save Changes' : 'Add Task';
  byId('taskTitle').value = task ? task.title : '';
  byId('taskSubject').value = task && findSubject(task.subjectId) ? task.subjectId : defaultSubject;
  byId('taskDate').value = task ? task.date : presetDate || todayKey();
  byId('taskDeadline').value = task ? task.deadline || '' : '';
  byId('taskPriority').value = task ? task.priority : 'medium';
  byId('taskDuration').value = task ? task.duration : 45;
  byId('taskReminder').value = task ? task.reminderTime || '' : '';

  openDialog('taskDialog');
  byId('taskTitle').focus();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const taskData = {
    title: byId('taskTitle').value.trim(),
    subjectId: byId('taskSubject').value,
    date: byId('taskDate').value,
    deadline: byId('taskDeadline').value,
    priority: byId('taskPriority').value,
    duration: Number(byId('taskDuration').value),
    reminderTime: byId('taskReminder').value
  };

  const existingTask = editingTaskId ? findTask(editingTaskId) : null;
  if (taskData.reminderTime) requestNotifications();
  if (existingTask) {
    if (existingTask.completed && existingTask.completedOn) {
      addToStudyLog(state.studyLog, existingTask.completedOn, 0, taskData.duration - existingTask.duration);
    }
    Object.assign(existingTask, taskData);
  } else {
    state.tasks.push({ id: createId(), ...taskData, completed: false, completedOn: null });
  }

  byId('taskDialog').close();
  refresh();
  showToast(existingTask ? 'Task updated.' : 'Task added to your planner.');
}

function toggleTaskCompletion(taskId, isCompleted) {
  const task = findTask(taskId);
  if (!task) return;

  if (isCompleted) {
    task.completed = true;
    task.completedOn = todayKey();
    addToStudyLog(state.studyLog, task.completedOn, 1, task.duration);
  } else {
    if (task.completedOn) addToStudyLog(state.studyLog, task.completedOn, -1, -task.duration);
    task.completed = false;
    task.completedOn = null;
  }

  refresh();

  if (isCompleted) notifyUser('Task completed', task.title);

  if (!isCompleted) {
    showToast('Task moved back to pending.', 'info');
  } else if (state.studyLog[todayKey()].tasks === 1) {
    showToast(`First task of the day done! Streak: ${pluralize(getCurrentStreak(), 'day')}.`);
  } else {
    showToast('Task marked as completed.');
  }
}

function confirmDeleteTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;
  askConfirmation({
    title: 'Delete this task?',
    message: `"${task.title}" will be removed from your planner.`,
    confirmLabel: 'Delete Task',
    onConfirm: () => {
      state.tasks = state.tasks.filter(item => item.id !== taskId);
      refresh();
      showToast('Task deleted.', 'info');
    }
  });
}

function checkRadioOption(form, name, value) {
  const options = Array.from(form.querySelectorAll(`input[name="${name}"]`));
  const selected = options.find(option => option.value === value) || options[0];
  selected.checked = true;
}

function updateTargetLabel() {
  byId('subjectTargetValue').textContent = `${byId('subjectTarget').value}%`;
}

function openSubjectModal(subjectId = null) {
  const subject = subjectId ? findSubject(subjectId) : null;
  const form = byId('subjectForm');
  editingSubjectId = subject ? subject.id : null;

  form.reset();
  byId('subjectName').setCustomValidity('');
  byId('subjectDialogTitle').textContent = subject ? 'Edit Subject' : 'Add Subject';
  byId('subjectSubmitBtn').textContent = subject ? 'Save Changes' : 'Add Subject';
  byId('subjectName').value = subject ? subject.name : '';
  byId('subjectExamDate').value = subject ? subject.examDate || '' : '';
  byId('subjectTarget').value = subject ? subject.target : 80;
  updateTargetLabel();

  const nextColor = SUBJECT_COLORS[state.subjects.length % SUBJECT_COLORS.length];
  checkRadioOption(form, 'subjectColor', subject ? subject.color : nextColor);
  checkRadioOption(form, 'subjectIcon', subject ? subject.icon : SUBJECT_ICONS[0]);

  openDialog('subjectDialog');
  byId('subjectName').focus();
}

function handleSubjectSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const nameInput = byId('subjectName');
  const name = nameInput.value.trim();
  const isDuplicate = state.subjects.some(subject => (
    subject.id !== editingSubjectId && subject.name.toLowerCase() === name.toLowerCase()
  ));

  if (isDuplicate) {
    nameInput.setCustomValidity('You already have a subject with this name.');
    nameInput.reportValidity();
    return;
  }

  const subjectData = {
    name,
    examDate: byId('subjectExamDate').value,
    target: Number(byId('subjectTarget').value),
    color: form.elements.subjectColor.value,
    icon: form.elements.subjectIcon.value
  };

  const existingSubject = editingSubjectId ? findSubject(editingSubjectId) : null;
  if (existingSubject) {
    Object.assign(existingSubject, subjectData);
  } else {
    state.subjects.push({ id: createId(), ...subjectData });
  }

  byId('subjectDialog').close();
  refresh();
  showToast(existingSubject ? 'Subject updated.' : `${name} added to your subjects.`);
}

function confirmDeleteSubject(subjectId) {
  const subject = findSubject(subjectId);
  if (!subject) return;
  const taskCount = getSubjectTasks(subjectId).length;
  const taskText = taskCount ? ` and its ${pluralize(taskCount, 'task')}` : '';

  askConfirmation({
    title: 'Delete this subject?',
    message: `"${subject.name}"${taskText} will be deleted permanently.`,
    confirmLabel: 'Delete Subject',
    onConfirm: () => {
      state.subjects = state.subjects.filter(item => item.id !== subjectId);
      state.tasks = state.tasks.filter(task => task.subjectId !== subjectId);
      refresh();
      showToast(`${subject.name} deleted.`, 'info');
    }
  });
}

function handleProfileSubmit(event) {
  event.preventDefault();
  state.studentName = byId('studentNameInput').value.trim();
  byId('studentNameInput').value = state.studentName;
  refresh();
  showToast(state.studentName ? `Saved. Hello, ${state.studentName}!` : 'Name removed from the greeting.');
}

function confirmLoadSampleData() {
  askConfirmation({
    title: 'Load sample data?',
    message: 'Your current subjects, tasks and streak history will be replaced with the sample semester data.',
    confirmLabel: 'Load Sample Data',
    onConfirm: () => {
      state = { ...createSampleData(), studentName: state.studentName };
      weekOffset = 0;
      filters = { subject: 'all', priority: 'all', status: 'all' };
      refresh();
      showToast('Sample data loaded.');
    }
  });
}

function confirmClearData() {
  askConfirmation({
    title: 'Clear all data?',
    message: 'All subjects, tasks and streak history will be deleted from this browser. This cannot be undone.',
    confirmLabel: 'Clear Data',
    onConfirm: () => {
      state = { subjects: [], tasks: [], studyLog: {}, studentName: state.studentName };
      filters = { subject: 'all', priority: 'all', status: 'all' };
      refresh();
      showToast('All data cleared. You can start fresh now.', 'info');
    }
  });
}

function buildSubjectFormOptions() {
  byId('colorOptions').innerHTML = SUBJECT_COLORS.map(color => `
    <label class="swatch" title="${color}">
      <input type="radio" name="subjectColor" value="${color}">
      <span style="background: ${color}"></span>
    </label>`).join('');

  byId('iconOptions').innerHTML = SUBJECT_ICONS.map(icon => `
    <label class="icon-option" title="${icon.replace(/-/g, ' ')}">
      <input type="radio" name="subjectIcon" value="${icon}">
      <span><i data-lucide="${icon}"></i></span>
    </label>`).join('');
}

const clickActions = {
  'navigate': button => showPage(button.dataset.page),
  'toggle-theme': toggleTheme,
  'add-task': button => openTaskModal(null, button.dataset.date),
  'edit-task': button => openTaskModal(button.dataset.id),
  'delete-task': button => confirmDeleteTask(button.dataset.id),
  'add-subject': () => openSubjectModal(),
  'edit-subject': button => openSubjectModal(button.dataset.id),
  'delete-subject': button => confirmDeleteSubject(button.dataset.id),
  'view-subject-tasks': button => showFilteredTasks({ subject: button.dataset.id }),
  'show-overdue': () => showFilteredTasks({ status: 'overdue' }),
  'clear-filters': () => setFilters({}),
  'week-prev': () => changeWeek(weekOffset - 1),
  'week-next': () => changeWeek(weekOffset + 1),
  'week-current': () => changeWeek(0),
  'close-dialog': button => button.closest('dialog').close(),
  'confirm-action': runConfirmedAction,
  'load-sample': confirmLoadSampleData,
  'clear-data': confirmClearData
};

function handleActionClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = clickActions[trigger.dataset.action];
  if (action) action(trigger);
}

function handleTaskCheckbox(event) {
  if (event.target.matches('[data-task-checkbox]')) {
    toggleTaskCompletion(event.target.dataset.id, event.target.checked);
  }
}

function bindEvents() {
  document.addEventListener('click', handleActionClick);
  document.addEventListener('change', handleTaskCheckbox);
  document.addEventListener('click', handleAdminClick);

  byId('taskForm').addEventListener('submit', handleTaskSubmit);
  byId('subjectForm').addEventListener('submit', handleSubjectSubmit);
  byId('profileForm').addEventListener('submit', handleProfileSubmit);
  byId('signInForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!window.StudyPlannerFirebase) {
      byId('authNote').textContent = 'Connecting to Firebase… please try again in a moment.';
      return;
    }
    const email = byId('signInEmail').value.trim();
    const password = byId('signInPassword').value;
    byId('authNote').textContent = authMode === 'signup' ? 'Creating your account…' : 'Signing in…';
    if (authMode === 'signup') window.StudyPlannerFirebase.createAccount(email, password);
    else window.StudyPlannerFirebase.signIn(email, password);
  });
  byId('authModeToggle').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    byId('signInForm').querySelector('button[type="submit"]').textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
    byId('authModeToggle').textContent = authMode === 'signup' ? 'Already have an account? Sign in' : 'Create an account';
    byId('signInPassword').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
    byId('authNote').textContent = authMode === 'signup' ? 'Choose a password with at least 6 characters.' : 'Sign in with the account you use in the Android app.';
  });
  byId('continueOffline').addEventListener('click', () => {
    firebaseSignedIn = false;
    setSyncStatus('local');
    document.body.classList.add('planner-open');
    byId('welcomeScreen').hidden = true;
    showToast('You are using this device only. Sign in to sync your planner.', 'info');
  });
  byId('signOutButton').addEventListener('click', () => window.StudyPlannerFirebase?.signOut());
  byId('retrySyncButton').addEventListener('click', retryCloudSync);
  byId('exportBackupButton').addEventListener('click', exportPlannerBackup);
  byId('importBackupFile').addEventListener('change', handleBackupImport);
  byId('subjectTarget').addEventListener('input', updateTargetLabel);
  byId('subjectName').addEventListener('input', () => byId('subjectName').setCustomValidity(''));
  byId('darkModeSwitch').addEventListener('change', event => applyTheme(event.target.checked ? 'dark' : 'light'));
  byId('pomodoroStart').addEventListener('click', startPomodoro);
  byId('pomodoroReset').addEventListener('click', resetPomodoro);
  byId('alarmForm').addEventListener('submit', setStudyAlarm);
  byId('alarmCancelButton').addEventListener('click', cancelStudyAlarm);
  byId('alarmSoundFile').addEventListener('change', onAlarmSoundSelected);
  byId('clearAlarmSound').addEventListener('click', removeAlarmSound);
  byId('adminConfigForm').addEventListener('submit', saveAdminInterface);
  byId('refreshAdminUsers').addEventListener('click', loadAdminUsers);

  const filterInputs = { subject: 'filterSubject', priority: 'filterPriority', status: 'filterStatus' };
  Object.entries(filterInputs).forEach(([filterName, inputId]) => {
    byId(inputId).addEventListener('change', event => {
      filters[filterName] = event.target.value;
      renderPlanner();
      refreshIcons();
    });
  });

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });
}

window.onFirebaseLoginResult = (success, email, plannerJson) => {
  const note = byId('authNote');
  if (!success) {
    note.textContent = plannerJson || 'Sign-in failed. Check your email and password, then try again.';
    byId('signInPassword').value = '';
    return;
  }
  firebaseSignedIn = true;
  if (plannerJson) {
    try {
      const cloudState = JSON.parse(plannerJson);
      if (!cloudState || !Array.isArray(cloudState.subjects) || !Array.isArray(cloudState.tasks)) {
        throw new Error('Invalid planner data');
      }
      state = cloudState;
    } catch (_) {
      note.textContent = 'You are signed in, but your saved planner data could not be read.';
      return;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  byId('signInPassword').value = '';
  byId('accountEmail').textContent = email;
  byId('accountCard').hidden = false;
  setSyncStatus(plannerJson ? 'synced' : 'syncing');
  byId('welcomeScreen').hidden = true;
  document.body.classList.add('planner-open');
  byId('studentNameInput').value = state.studentName || '';
  syncTaskReminders();
  renderAll();
  showToast(plannerJson ? 'Signed in. Your planner is synced.' : 'Account ready. Your planner is syncing.', 'success');
  if (!plannerJson) saveState();
};

window.onFirebaseCloudData = plannerJson => {
  try {
    const cloudState = JSON.parse(plannerJson);
    if (!cloudState || !Array.isArray(cloudState.subjects) || !Array.isArray(cloudState.tasks)) return;
    if (JSON.stringify(state) === JSON.stringify(cloudState)) return;
    state = cloudState;
    firebaseSignedIn = true;
    setSyncStatus('synced');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    byId('studentNameInput').value = state.studentName || '';
    syncTaskReminders();
    renderAll();
    showToast('Planner updated from your other device.', 'info');
  } catch (_) {
    // Ignore malformed cloud data and keep the last valid local copy.
  }
};

window.onFirebaseSyncState = status => {
  if (status === 'synced' || status === 'syncing' || status === 'error') setSyncStatus(status);
};

window.onFirebaseSignedOut = () => {
  firebaseSignedIn = false;
  setSyncStatus('local');
  adminAuthorized = false;
  byId('adminNavLink').hidden = true;
  if (currentPage === 'admin') showPage('dashboard');
  byId('accountCard').hidden = true;
  byId('welcomeScreen').hidden = false;
  document.body.classList.remove('planner-open');
  byId('authNote').textContent = 'You are signed out. Your data remains saved on this device.';
};

window.onFirebaseAdminAccess = isAdmin => {
  adminAuthorized = isAdmin === true;
  byId('adminNavLink').hidden = !adminAuthorized;
  if (!adminAuthorized && currentPage === 'admin') showPage('dashboard');
  if (adminAuthorized) {
    renderAdminConfigForm();
    if (currentPage === 'admin') loadAdminUsers();
  }
};

window.onGlobalPlannerConfig = config => applyGlobalInterfaceConfig(config);

window.onAdminUsersLoaded = usersJson => {
  try {
    const users = typeof usersJson === 'string' ? JSON.parse(usersJson) : usersJson;
    renderAdminUsers(users);
  } catch (_) {
    byId('adminUsersStatus').textContent = 'Could not read the account list. Check admin access and Firestore rules.';
  }
};

window.onAdminOperation = (success, message) => {
  byId('adminConfigStatus').textContent = message || (success ? 'Changes saved.' : 'Could not save changes.');
  byId('adminUsersStatus').textContent = message || (success ? 'Account access updated.' : 'Could not update account access.');
  if (success) loadAdminUsers();
};

window.onFirebaseSuspended = () => {
  adminAuthorized = false;
  byId('welcomeScreen').hidden = false;
  document.body.classList.remove('planner-open');
  byId('authNote').textContent = 'This account has been paused by the administrator. Contact support if you think this is a mistake.';
  showPage('dashboard');
};

function init() {
  state = loadState();
  if (window.Chart) Chart.defaults.font.family = "'Poppins', 'Segoe UI', sans-serif";

  buildSubjectFormOptions();
  bindEvents();
  byId('studentNameInput').value = state.studentName;
  applyTheme(getSavedTheme());
  initAlarmControls();
  renderFocusClock();
  renderPomodoro();
  loadSavedAlarm();
  loadAlarmSound();
  clockInterval = setInterval(renderFocusClock, 1000);
  renderAll();
  syncTaskReminders();
  showPage(location.hash.slice(1));
}

init();
