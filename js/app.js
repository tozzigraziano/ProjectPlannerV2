/**
 * js/app.js  –  Entry point dell'applicazione v2
 *
 * Responsabilità:
 *  - Inizializzazione del DB (backend o IDB offline)
 *  - Caricamento di tutti i dati nello stato globale
 *  - Gestione tab, tema, indicatore connessione
 *  - Esposizione di tutte le funzioni pubbliche a window
 *    (necessario perché il template HTML usa onclick="...")
 */

import * as db from './db.js';
import * as state from './state.js';
import { hoursToHHMM, formatDateLocal } from './helpers.js';

// ─── Moduli ───────────────────────────────────────────────────────────────────
// Importati man mano che vengono implementati.
// Ogni import viene commentato fino a quando il file non esiste.

import * as Holidays    from './modules/holidays.js';
import * as Resources   from './modules/resources.js';
import * as Projects    from './modules/projects.js';
import * as Tasks       from './modules/tasks.js';
import * as Milestones  from './modules/milestones.js';
import * as Templates   from './modules/templates.js';
import * as Meetings    from './modules/meetings.js';
import * as Plants      from './modules/plants.js';
import * as Gantt       from './modules/gantt.js';
import * as ResourceView from './modules/resourceView.js';
import * as Bacheca     from './modules/bacheca.js';
import * as Warnings    from './modules/warnings.js';
import * as Dashboard   from './modules/dashboard.js';
import * as Annotations from './modules/annotations.js';
import * as Offers      from './modules/offers.js';
import * as ExportImport from './modules/exportImport.js';
import * as ActivityMap from './modules/activityMap.js';
import * as CheckpointCalendar from './modules/checkpointCalendar.js';
import * as TaskReview  from './modules/taskReview.js';
import * as QuickNotes  from './modules/quickNotes.js';
import * as Auth        from './modules/auth.js';
import * as Users       from './modules/users.js';

// ─── Caricamento dati ─────────────────────────────────────────────────────────

async function loadAllData() {
  // Risorse
  let resources = await db.getAll('resources');
  // Assegna ordine a risorse senza (retrocompatibilità)
  let resourcesNeedSave = false;
  resources.forEach((r, i) => {
    if (r.order === undefined) { r.order = i; resourcesNeedSave = true; }
  });
  resources.sort((a, b) => (a.order || 0) - (b.order || 0));
  state.setResources(resources);

  // Festività locali
  state.setLocalHolidays(await db.getAll('localHolidays'));

  // Progetti
  const projects = await db.getAll('projects');
  // Migra completamento per-risorsa (retrocompatibilità)
  let projectsNeedSave = false;
  projects.forEach(project => {
    if (project.tasks) {
      project.tasks.forEach(task => {
        if (task.resources && task.resources.length > 0) {
          task.resources.forEach(res => {
            if (res.completion === undefined) {
              res.completion = task.completion > 0 ? task.completion : 0;
              projectsNeedSave = true;
            }
          });
        }
      });
    }
  });
  state.setProjects(projects);

  // Templates
  state.setTemplates(await db.getAll('templates'));

  // Riunioni globali (con migrazione formato durata)
  let meetings = await db.getAll('meetings');
  let meetingsNeedSave = false;
  meetings.forEach(m => {
    if (m.expectedDuration !== null && m.expectedDuration !== undefined && typeof m.expectedDuration === 'number') {
      m.expectedDuration = hoursToHHMM(m.expectedDuration);
      meetingsNeedSave = true;
    }
    if (m.actualDuration !== null && m.actualDuration !== undefined && typeof m.actualDuration === 'number') {
      m.actualDuration = hoursToHHMM(m.actualDuration);
      meetingsNeedSave = true;
    }
  });
  state.setMeetings(meetings);

  // Stabilimenti
  state.setPlants(await db.getAll('plants'));

  // Appunti calendario (con migrazione formato)
  // QuickNotes sono salvati come setting (non hanno uno store dedicato)
  // Il backend li restituisce già deserializzati; IDB li salva come array
  const rawQN = await db.getSetting('quickNotes');
  let quickNotes = Array.isArray(rawQN) ? rawQN : [];
  // Caso raro: setting salvata come stringa JSON da versioni precedenti
  if (!quickNotes.length && typeof rawQN === 'string') {
    try { quickNotes = JSON.parse(rawQN) ?? []; } catch (_) { /* ignore */ }
  }
  let quickNotesNeedSave = false;
  quickNotes.forEach(note => {
    if (!note.date) {
      note.date = note.createdAt ? note.createdAt.substring(0, 10) : formatDateLocal(new Date());
      quickNotesNeedSave = true;
    }
    if (!note.time) { note.time = '09:00'; quickNotesNeedSave = true; }
    if (!Array.isArray(note.tags)) {
      note.tags = (typeof note.tags === 'string' && note.tags.trim())
        ? note.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      quickNotesNeedSave = true;
    }
    if (typeof note.confirmed !== 'boolean') {
      note.confirmed = false;
      quickNotesNeedSave = true;
    }
  });
  state.setQuickNotes(quickNotes);

  // Impostazioni resourceTypes
  // db.getSetting restituisce già il valore deserializzato (il backend fa JSON.parse)
  const rtSetting = await db.getSetting('resourceTypes');
  if (rtSetting) {
    state.setResourceTypes(rtSetting);
  }
}

// ─── Tema ─────────────────────────────────────────────────────────────────────

export async function toggleTheme() {
  const current  = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  await db.setSetting('theme', newTheme);
}

async function loadTheme() {
  const saved = await db.getSetting('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

// ─── Indicatore connessione ────────────────────────────────────────────────────

function updateConnectionIndicator(online) {
  const el = document.getElementById('dbStatusIndicator');
  if (!el) return;
  el.classList.remove('online', 'offline', 'syncing');
  el.classList.add(online ? 'online' : 'offline');
  el.title = online ? 'Database connesso' : 'Backend non raggiungibile';
}

window.addEventListener('db:connectionChanged', (e) => {
  updateConnectionIndicator(e.detail.online);
});

// ─── Tab switching ────────────────────────────────────────────────────────────

export function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  // Il button che ha scatenato il click
  const _ev = window.event;
  if (_ev && _ev.target) _ev.target.classList.add('active');
  const panel = document.getElementById(tabName);
  if (panel) panel.classList.add('active');

  // Lazy render per tab costose
  if (tabName === 'gantt')              Gantt.renderGantt();
  if (tabName === 'resourceView')       { ResourceView.updateResourceViewPeriod?.(); ResourceView.renderResourceView(); }
  if (tabName === 'bacheca')            Bacheca.renderBacheca();
  if (tabName === 'warnings')           Warnings.renderWarnings();
  if (tabName === 'taskReview')         TaskReview.renderTaskReview();
  if (tabName === 'meetings')           { Meetings.renderGlobalMeetings(); Meetings.updateMeetingTagsSuggestions?.(); }
  if (tabName === 'offerte')            Offers.renderOffersOverview();
  if (tabName === 'projects')           Projects.closeProjectDetails();
  if (tabName === 'plants')             Plants.renderPlants();
  if (tabName === 'activityMap')        ActivityMap.renderActivityMap();
  if (tabName === 'annotations')        Annotations.renderAnnotations();
  if (tabName === 'quickNotes')         QuickNotes.renderQuickNotes();
  if (tabName === 'dashboard')          Dashboard.renderDashboard();
  if (tabName === 'checkpointCalendar') CheckpointCalendar.renderCheckpointCalendar();
}

// ─── Restrizioni ruolo personal ──────────────────────────────────────────────

/**
 * Applica le restrizioni UI basate sul ruolo dell'utente corrente.
 * Sempre ripristina tutti i tab prima di applicare le restrizioni specifiche.
 * Imposta body.dataset.userRole usato da helpers.openModal per il viewer.
 */
function applyRoleRestrictions() {
  const user = Auth.getCurrentUser();
  const role = user?.role || '';

  // Aggiorna attributo body (usato da openModal per viewer)
  document.body.dataset.userRole = role;

  // Ripristina sempre tutti i tab (fix: switcher da personal a altro ruolo)
  document.querySelectorAll('.tab').forEach(btn => { btn.style.display = ''; });

  if (role !== 'personal') return;

  const ALLOWED = new Set(['gantt', 'resourceView', 'projects']);

  // Nascondi tab non consentiti
  document.querySelectorAll('.tab').forEach(btn => {
    const m = btn.getAttribute('onclick')?.match(/switchTab\('([^']+)'\)/);
    if (m && !ALLOWED.has(m[1])) btn.style.display = 'none';
  });

  // Attiva il tab gantt
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const ganttBtn = document.querySelector(".tab[onclick*=\"'gantt'\"]");
  const ganttPanel = document.getElementById('gantt');
  if (ganttBtn) ganttBtn.classList.add('active');
  if (ganttPanel) ganttPanel.classList.add('active');
  Gantt.renderGantt();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initApp() {
  try {
    // Connessione al backend
    await db.init();

    // Aggiorna indicatore
    updateConnectionIndicator(db.isOnline());

    // Carica tema prima di tutto il resto (evita FOUC)
    await loadTheme();

    // Carica tutti i dati
    await loadAllData();

    // Inizializza event listener del modal task
    Tasks.initTaskModal?.();

    // Calcola e renderizza
    Holidays.calculateHolidays();
    Resources.renderResources();
    Holidays.renderLocalHolidays();
    Holidays.renderHolidays();
    Projects.renderProjects();
    Templates.renderTemplates();
    Resources.updateResourceSelects();
    Projects.updateProjectSelects();
    Templates.updateTemplateSelects?.();
    Templates.updateApplyTemplateSelect?.();
    Gantt.updateGanttFilters?.();
    ResourceView.updateResourceViewFilters?.();
    Meetings.populateTimeSelect?.('globalMeetingTime');
    Dashboard.renderDashboard();

    // Applica restrizioni UI per ruolo (nasconde tab per personal, setta attributo body per viewer)
    applyRoleRestrictions();

  } catch (err) {
    console.error('Errore inizializzazione:', err);
    alert('Errore nel caricamento dei dati. Verifica la console.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Controlla autenticazione prima di inizializzare l'app
  if (!Auth.isAuthenticated()) {
    Auth.showLoginOverlay();
  } else {
    await initApp();
    Auth.hideLoginOverlay();
    Auth.updateAuthBar();
  }
});

// Login riuscito → carica dati
window.addEventListener('auth:loggedIn', async () => {
  await initApp();
  Auth.updateAuthBar();
});

// Token scaduto / 401
window.addEventListener('auth:unauthorized', () => {
  Auth.logout();
});

// ─── Handler eventi cross-modulo ─────────────────────────────────────────────
// I moduli usano CustomEvent('app:viewRefresh', { detail: { views: [...] } })
// per richiedere l'aggiornamento di viste senza dipendenze circolari.

window.addEventListener('app:viewRefresh', (e) => {
  const views = e.detail?.views ?? [];
  if (views.includes('gantt'))              Gantt.renderGantt?.();
  if (views.includes('resourceView'))       ResourceView.renderResourceView?.();
  if (views.includes('bacheca'))            Bacheca.renderBacheca?.();
  if (views.includes('warnings'))           Warnings.renderWarnings?.();
  if (views.includes('dashboard'))          Dashboard.renderDashboard?.();
  if (views.includes('projects'))           Projects.renderProjects?.();
  if (views.includes('resources'))          Resources.renderResources?.();
  if (views.includes('holidays'))           { Holidays.calculateHolidays?.(); Holidays.renderHolidays?.(); }
  if (views.includes('taskLinks'))          Projects.applyTaskLinks?.();
});

// Handler per apertura task da altri contesti (bacheca, annotations, taskReview)
window.addEventListener('app:openTask', (e) => {
  const { projectId, taskId } = e.detail ?? {};
  if (projectId) state.setCurrentProjectId(projectId);
  if (taskId) Tasks.openTaskModal?.(taskId);
});

// ─── Checklist attività ───────────────────────────────────────────────────────

function _buildChecklistRow(item) {
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.dataset.checklistId = String(item.id);
  div.innerHTML = `
    <input type="checkbox" class="checklist-check" ${item.completed ? 'checked' : ''}
      onchange="this.closest('.checklist-item').classList.toggle('completed', this.checked)">
    <input type="text" class="checklist-text" value="${item.text.replace(/"/g, '&quot;')}"
      placeholder="Descrizione elemento...">
    <button type="button" class="checklist-delete" onclick="this.closest('.checklist-item').remove()" title="Rimuovi">🗑️</button>
  `;
  if (item.completed) div.classList.add('completed');
  return div;
}

window.addChecklistItem = function addChecklistItem() {
  const container = document.getElementById('taskChecklistContainer');
  if (!container) return;
  const item = { id: Date.now(), text: '', completed: false };
  const row  = _buildChecklistRow(item);
  container.appendChild(row);
  row.querySelector('.checklist-text')?.focus();
};

window.loadChecklistItems = function loadChecklistItems(items) {
  const container = document.getElementById('taskChecklistContainer');
  if (!container) return;
  container.innerHTML = '';
  (items || []).forEach(item => container.appendChild(_buildChecklistRow(item)));
};

window.clearChecklistItems = function clearChecklistItems() {
  const container = document.getElementById('taskChecklistContainer');
  if (container) container.innerHTML = '';
};

window.getChecklistItems = function getChecklistItems() {
  const container = document.getElementById('taskChecklistContainer');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.checklist-item')).map(row => ({
    id:        Number(row.dataset.checklistId) || Date.now(),
    text:      row.querySelector('.checklist-text')?.value || '',
    completed: row.querySelector('.checklist-check')?.checked || false,
  }));
};

// ─── Markdown Editor ──────────────────────────────────────────────────────────

/** ID del textarea collegato al modal fullscreen in uso. */
let _fmdSourceId = null;

/** Aggiorna la preview inline del wrapper associato a `textareaId`. */
function _refreshInlinePreview(textareaId) {
  const textarea = document.getElementById(textareaId);
  const wrap     = document.querySelector('.md-inline-wrap[data-for="' + textareaId + '"]');
  if (!wrap || !textarea) return;
  const preview = wrap.querySelector('.md-inline-preview');
  if (!preview) return;
  preview.innerHTML = typeof marked !== 'undefined'
    ? marked.parse(textarea.value || '')
    : (textarea.value || '<em style="color:var(--text-tertiary)">Nessun contenuto</em>');
}

/**
 * Converte un textarea in un campo markdown con anteprima inline e pulsanti fullscreen.
 * - ✏️ apre il modal fullscreen in modalità modifica
 * - 👁️ apre il modal fullscreen in modalità sola lettura
 * Idempotente: se già inizializzato aggiorna solo l'anteprima.
 *
 * @param {string}      textareaId  - ID del textarea sorgente
 * @param {string|null} containerId - ID del container (opzionale, default: parentElement)
 * @param {boolean}     isViewOnly  - se true nasconde il pulsante ✏️
 */
window.createMarkdownEditor = function createMarkdownEditor(textareaId, containerId, isViewOnly) {
  const textarea  = document.getElementById(textareaId);
  if (!textarea) return;
  const container = containerId
    ? document.getElementById(containerId)
    : textarea.parentElement;
  if (!container) return;

  // Idempotenza: se il wrapper esiste già aggiorna preview, visibilità pulsante
  // e — se mancava — aggiunge il pulsante ✏️
  const existing = container.querySelector('.md-inline-wrap[data-for="' + textareaId + '"]');
  if (existing) {
    _refreshInlinePreview(textareaId);
    const header  = existing.querySelector('.md-inline-header');
    let editBtn   = existing.querySelector('.md-btn-edit');
    if (!isViewOnly && !editBtn && header) {
      // Il wrapper era stato creato in modalità viewOnly: aggiunge il bottone mancante
      editBtn = document.createElement('button');
      editBtn.type      = 'button';
      editBtn.className = 'md-btn-edit';
      editBtn.title     = 'Modifica a tutto schermo';
      editBtn.textContent = '✏️ Modifica';
      editBtn.addEventListener('click', () => {
        window.openFullscreenNoteEditor(textareaId, textarea.dataset.mdTitle || '📝 Modifica Note', false);
      });
      const viewBtn = header.querySelector('.md-btn-view');
      if (viewBtn) header.insertBefore(editBtn, viewBtn);
      else header.appendChild(editBtn);
    }
    if (editBtn) editBtn.style.display = isViewOnly ? 'none' : '';
    return;
  }

  // Nascondi il textarea (resta nel DOM come sorgente dati)
  textarea.style.display = 'none';

  // Crea wrapper
  const wrap = document.createElement('div');
  wrap.className = 'md-inline-wrap';
  wrap.setAttribute('data-for', textareaId);

  // Header con label e pulsanti
  const header = document.createElement('div');
  header.className = 'md-inline-header';
  header.innerHTML =
    '<span class="md-inline-label">Markdown</span>' +
    (isViewOnly ? '' : '<button type="button" class="md-btn-edit" title="Modifica a tutto schermo">✏️ Modifica</button>') +
    '<button type="button" class="md-btn-view" title="Visualizza a tutto schermo">👁️ Visualizza</button>';

  // Preview inline
  const previewDiv = document.createElement('div');
  previewDiv.className = 'markdown-preview active md-inline-preview';
  previewDiv.innerHTML = typeof marked !== 'undefined'
    ? marked.parse(textarea.value || '')
    : (textarea.value || '<em style="color:var(--text-tertiary)">Nessun contenuto</em>');

  wrap.appendChild(header);
  wrap.appendChild(previewDiv);
  container.insertBefore(wrap, textarea);

  // Pulsante ✏️ — apre fullscreen in modalità edit
  if (!isViewOnly) {
    header.querySelector('.md-btn-edit').addEventListener('click', () => {
      window.openFullscreenNoteEditor(textareaId, textarea.dataset.mdTitle || '📝 Modifica Note', false);
    });
  }
  // Pulsante 👁️ — apre fullscreen in sola lettura
  header.querySelector('.md-btn-view').addEventListener('click', () => {
    window.openFullscreenNoteEditor(textareaId, textarea.dataset.mdTitle || '📄 Visualizza Note', true);
  });
};

/** Apre il modal fullscreen collegato al textarea `textareaId`. */
window.openFullscreenNoteEditor = function openFullscreenNoteEditor(textareaId, title, viewOnly) {
  const textarea = document.getElementById(textareaId);
  const modal    = document.getElementById('fullscreenNoteModal');
  if (!textarea || !modal) return;

  _fmdSourceId = textareaId;

  const titleEl = document.getElementById('fmdTitle');
  if (titleEl) titleEl.textContent = title || '📝 Note';

  const fmdTA = document.getElementById('fmdTextarea');
  if (fmdTA) fmdTA.value = textarea.value || '';

  const fmdPrev = document.getElementById('fmdPreview');
  if (fmdPrev && fmdTA) {
    fmdPrev.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(fmdTA.value)
      : fmdTA.value;
  }

  // Adatta la UI per view-only vs edit
  const editorCol  = modal.querySelector('.fmd-col:first-child');
  const saveBtn    = modal.querySelector('.fmd-footer button:last-child');
  const previewCol = modal.querySelector('.fmd-col:last-child');
  if (editorCol)  editorCol.style.display  = viewOnly ? 'none' : '';
  if (saveBtn)    saveBtn.style.display    = viewOnly ? 'none' : '';
  if (previewCol) previewCol.style.flex    = viewOnly ? '1' : '';

  modal.classList.add('active');
  if (!viewOnly && fmdTA) setTimeout(() => fmdTA.focus(), 50);
};

/** Chiude il modal fullscreen senza salvare. */
window.closeFullscreenNoteEditor = function closeFullscreenNoteEditor() {
  document.getElementById('fullscreenNoteModal')?.classList.remove('active');
  document.getElementById('fmdEmojiPanel')?.classList.remove('open');
  _fmdSourceId = null;
};

/** Salva il contenuto nel textarea origine, aggiorna la preview inline e chiude. */
window.saveAndCloseFullscreenNoteEditor = function saveAndCloseFullscreenNoteEditor() {
  const fmdTA = document.getElementById('fmdTextarea');
  if (fmdTA && _fmdSourceId) {
    const textarea = document.getElementById(_fmdSourceId);
    if (textarea) {
      textarea.value = fmdTA.value;
      // Notifica i listener oninput (es. saveProjectGeneralInfo)
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      _refreshInlinePreview(_fmdSourceId);
    }
  }
  window.closeFullscreenNoteEditor();
};

/** Inserisce sintassi markdown nel fmdTextarea alla posizione del cursore. */
window.fmdInsert = function fmdInsert(type) {
  const ta = document.getElementById('fmdTextarea');
  if (!ta) return;
  const s   = ta.selectionStart;
  const e   = ta.selectionEnd;
  const sel = ta.value.substring(s, e);
  const map = {
    bold:      ['**',     '**',    sel || 'testo'],
    italic:    ['*',      '*',     sel || 'testo'],
    strike:    ['~~',     '~~',    sel || 'testo'],
    h1:        ['# ',     '',      sel || 'Titolo 1'],
    h2:        ['## ',    '',      sel || 'Titolo 2'],
    h3:        ['### ',   '',      sel || 'Titolo 3'],
    ul:        ['- ',     '',      sel || 'elemento'],
    ol:        ['1. ',    '',      sel || 'elemento'],
    quote:     ['> ',     '',      sel || 'citazione'],
    code:      ['`',      '`',     sel || 'codice'],
    codeblock: ['```\n',  '\n```', sel || 'codice'],
    table:     ['| Col1 | Col2 |\n|------|------|\n| ', ' | val2 |', sel || 'val1'],
    link:      ['[',      '](https://)', sel || 'testo'],
    hr:        ['\n---\n', '',     ''],
  };
  const parts = map[type];
  if (!parts) return;
  const [before, after, body] = parts;
  ta.setRangeText(before + (sel || body) + after, s, e, 'select');
  const prev = document.getElementById('fmdPreview');
  if (prev) prev.innerHTML = typeof marked !== 'undefined' ? marked.parse(ta.value) : ta.value;
  ta.focus();
};

/** Inserisce un emoji nel fmdTextarea alla posizione del cursore. */
window.fmdInsertEmoji = function fmdInsertEmoji(emoji) {
  const ta = document.getElementById('fmdTextarea');
  if (!ta) return;
  ta.setRangeText(emoji, ta.selectionStart, ta.selectionEnd, 'end');
  const prev = document.getElementById('fmdPreview');
  if (prev) prev.innerHTML = typeof marked !== 'undefined' ? marked.parse(ta.value) : ta.value;
  document.getElementById('fmdEmojiPanel')?.classList.remove('open');
  ta.focus();
};

/** Mostra/nasconde il pannello emoji del fullscreen editor. */
window.fmdToggleEmojiPanel = function fmdToggleEmojiPanel(event) {
  event.stopPropagation();
  document.getElementById('fmdEmojiPanel')?.classList.toggle('open');
};

// Chiudi emoji panel cliccando fuori
document.addEventListener('click', () => {
  document.getElementById('fmdEmojiPanel')?.classList.remove('open');
});

// Preview fullscreen in tempo reale mentre si digita
document.getElementById('fmdTextarea')?.addEventListener('input', () => {
  const ta   = document.getElementById('fmdTextarea');
  const prev = document.getElementById('fmdPreview');
  if (ta && prev) prev.innerHTML = typeof marked !== 'undefined' ? marked.parse(ta.value) : ta.value;
});

// Chiudi fullscreen con ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('fullscreenNoteModal');
    if (modal?.classList.contains('active')) window.closeFullscreenNoteEditor();
  }
});

// ─── Esposizione globale ──────────────────────────────────────────────────────
// Le funzioni usate negli handler onclick="" del template HTML devono essere
// accessibili globalmente. Le esportiamo su window.

// App
window.switchTab   = switchTab;
window.toggleTheme = toggleTheme;

// Holidays
window.calculateHolidays        = Holidays.calculateHolidays;
window.renderHolidays           = Holidays.renderHolidays;
window.openLocalHolidayModal    = Holidays.openLocalHolidayModal;
window.closeLocalHolidayModal   = Holidays.closeLocalHolidayModal;
window.saveLocalHoliday         = Holidays.saveLocalHoliday;
window.deleteLocalHoliday       = Holidays.deleteLocalHoliday;

// Resources
window.saveResource             = Resources.saveResource;
window.renderResources          = Resources.renderResources;
window.editResource             = Resources.editResource;
window.deleteResource           = Resources.deleteResource;
window.openResourceModal        = Resources.openResourceModal;
window.closeResourceModal       = Resources.closeResourceModal;
window.moveResourceUp           = Resources.moveResourceUp;
window.moveResourceDown         = Resources.moveResourceDown;
window.toggleResourceVisibility = Resources.toggleResourceVisibility;
window.updateResourceSelects    = Resources.updateResourceSelects;
window.resourcesModule          = Resources;  // namespace usato nell'HTML generato da renderResources

// Projects
window.saveProject              = Projects.saveProject;
window.renderProjects           = Projects.renderProjects;
window.openProjectModal         = Projects.openProjectModal;
window.closeProjectModal        = Projects.closeProjectModal;
window.openProjectDetails       = Projects.openProjectDetails;
window.closeProjectDetails      = Projects.closeProjectDetails;
window.deleteProject            = Projects.deleteProject;
window.updateProjectSelects     = Projects.updateProjectSelects;
window.duplicateProject         = Projects.duplicateProject;

// Tasks
window.saveTask                 = Tasks.saveTask;
window.editTask                 = Tasks.editTask;
window.deleteTask               = Tasks.deleteTask;
window.openTaskModal            = Tasks.openTaskModal;
window.closeTaskModal           = Tasks.closeTaskModal;
window.calculateEndDate         = Tasks.calculateEndDate;
window.calculateStartDate       = Tasks.calculateStartDate;
window.onCalcMethodChange       = Tasks.onCalcMethodChange;
window.toggleTaskResourceRow    = Tasks.toggleTaskResourceRow;
window.addTaskResourceRow       = Tasks.addTaskResourceRow;
window.removeTaskResourceRow    = Tasks.removeTaskResourceRow;
window.updateLinkedDates        = Tasks.updateLinkedDates;

// Milestones
window.saveMilestone            = Milestones.saveMilestone;
window.deleteMilestone          = Milestones.deleteMilestone;
window.openMilestoneModal       = Milestones.openMilestoneModal;
window.closeMilestoneModal      = Milestones.closeMilestoneModal;

// Templates
window.saveTemplate             = Templates.saveTemplate;
window.deleteTemplate           = Templates.deleteTemplate;
window.openTemplateModal        = Templates.openTemplateModal;
window.closeTemplateModal       = Templates.closeTemplateModal;
window.applyTemplate            = Templates.applyTemplate;
window.applyTemplateToProject   = Templates.applyTemplateToProject;
window.openTemplateDetails      = Templates.openTemplateDetails;
window.closeTemplateDetails     = Templates.closeTemplateDetails;
window.saveTemplateTask         = Templates.saveTemplateTask;
window.deleteTemplateTask       = Templates.deleteTemplateTask;
window.openTemplateTaskModal    = Templates.openTemplateTaskModal;
window.closeTemplateTaskModal   = Templates.closeTemplateTaskModal;
window.saveTemplateMilestone    = Templates.saveTemplateMilestone;
window.deleteTemplateMilestone  = Templates.deleteTemplateMilestone;
window.openTemplateMilestoneModal  = Templates.openTemplateMilestoneModal;
window.closeTemplateMilestoneModal = Templates.closeTemplateMilestoneModal;
window.openTemplateGroupModal      = Templates.openTemplateGroupModal;
window.closeTemplateGroupModal     = Templates.closeTemplateGroupModal;
window.saveTemplateGroup           = Templates.saveTemplateGroup;
window.deleteTemplateGroup         = Templates.deleteTemplateGroup;

// Meetings
window.saveGlobalMeeting        = Meetings.saveGlobalMeeting;
window.deleteGlobalMeeting      = Meetings.deleteGlobalMeeting;
window.editGlobalMeeting        = Meetings.editGlobalMeeting;
window.viewGlobalMeeting        = Meetings.viewGlobalMeeting;
window.openGlobalMeetingModal   = Meetings.openGlobalMeetingModal;
window.closeGlobalMeetingModal  = Meetings.closeGlobalMeetingModal;
window.renderGlobalMeetings     = Meetings.renderGlobalMeetings;
window.toggleRecurringFields    = Meetings.toggleRecurringFields;
window.updateMeetingTagsSuggestions = Meetings.updateMeetingTagsSuggestions;
window.saveProjectMeeting       = Meetings.saveProjectMeeting;
window.deleteProjectMeeting     = Meetings.deleteProjectMeeting;
window.openProjectMeetingModal  = Meetings.openProjectMeetingModal;
window.openMeetingModal         = Meetings.openProjectMeetingModal;   // alias usato in index.html
window.closeProjectMeetingModal = Meetings.closeProjectMeetingModal;
window.closeMeetingModal        = Meetings.closeProjectMeetingModal;  // alias usato in #meetingModal
window.saveMeeting              = Meetings.saveProjectMeeting;        // alias usato in #meetingModal

// Plants
window.savePlant                = Plants.savePlant;
window.deletePlant              = Plants.deletePlant;
window.openPlantModal           = Plants.openPlantModal;
window.closePlantModal          = Plants.closePlantModal;
window.renderPlants             = Plants.renderPlants;

// Gantt
window.renderGantt              = Gantt.renderGantt;
window.renderGanttByProjects    = Gantt.renderGanttByProjects;
window.renderGanttByResources   = Gantt.renderGanttByResources;
window.updateGanttFilters       = Gantt.updateGanttFilters;
window.ganttToday               = Gantt.ganttToday;
window.ganttPrev                = Gantt.ganttPrev;
window.ganttNext                = Gantt.ganttNext;

// ResourceView
window.renderResourceView         = ResourceView.renderResourceView;
window.updateResourceViewPeriod   = ResourceView.updateResourceViewPeriod;
window.updateResourceViewFilters  = ResourceView.updateResourceViewFilters;

// Bacheca
window.renderBacheca            = Bacheca.renderBacheca;
window.moveTask                 = Bacheca.moveTask;

// Warnings
window.renderWarnings           = Warnings.renderWarnings;
window.saveWarningFilters       = Warnings.saveWarningFilters;
window.toggleWarningFiltersPanel = Warnings.toggleWarningFiltersPanel;

// TaskReview
window.renderTaskReview         = TaskReview.renderTaskReview;
window.toggleTaskSelection      = TaskReview.toggleTaskSelection;
window.analyzeSelectedTasks     = TaskReview.analyzeSelectedTasks;

// Dashboard
window.renderDashboard          = Dashboard.renderDashboard;

// Annotations
window.renderAnnotations        = Annotations.renderAnnotations;
window.saveAnnotation           = Annotations.saveAnnotation;
window.deleteAnnotation         = Annotations.deleteAnnotation;
window.openAnnotationModal      = Annotations.openAnnotationModal;
window.closeAnnotationModal     = Annotations.closeAnnotationModal;

// Offers
window.renderOffersOverview     = Offers.renderOffersOverview;
window.saveOffer                = Offers.saveOffer;
window.deleteOffer              = Offers.deleteOffer;
window.openOfferModal           = Offers.openOfferModal;
window.closeOfferModal          = Offers.closeOfferModal;

// ExportImport
window.exportData               = ExportImport.exportData;
window.importData               = ExportImport.importData;
window.importDataMerge          = ExportImport.importDataMerge;
window.wipeDatabase             = ExportImport.wipeDatabase;

/** Esporta il progetto corrente come file Markdown completo con diagramma Gantt Mermaid. */
window.exportProjectMarkdown = function exportProjectMarkdown() {
  const project = state.projects.find(p => p.id == state.currentProjectId);
  if (!project) { alert('Nessun progetto selezionato.'); return; }

  // Helpers
  const esc      = s => (s || '').replace(/\|/g, '\\|');
  const escGantt = s => (s || '').replace(/:/g, '-').replace(/,/g, ' ').replace(/[()\[\]{}";#@&%]/g, '').replace(/\s+/g, ' ').trim() || 'task';
  const resName  = id => {
    const r = state.resources.find(r => String(r.id) === String(id));
    return r ? `${r.firstName || ''} ${r.lastName || ''}`.trim() : id;
  };
  const fmtDate  = d => d ? d.replace(/-/g, '/') : '-';
  const today    = new Date().toISOString().slice(0, 10);

  const lines = [];

  // ── Intestazione ──────────────────────────────────────────────────────────
  lines.push(`# ${project.name || 'Progetto'}`);
  lines.push('');
  const meta = [];
  if (project.client)    meta.push(`**Cliente:** ${project.client}`);
  if (project.code)      meta.push(`**Codice:** ${project.code}`);
  if (project.startDate || project.endDate)
    meta.push(`**Periodo:** ${fmtDate(project.startDate)} — ${fmtDate(project.endDate)}`);
  if (project.status)    meta.push(`**Stato:** ${project.status}`);
  if (meta.length) { lines.push(meta.join('  \n')); lines.push(''); }

  // ── Indice ────────────────────────────────────────────────────────────────
  const toc = [];
  if (project.description || project.generalInfo) toc.push('- [Descrizione e Info Generali](#descrizione-e-info-generali)');
  const hasTasks = project.tasks?.length;
  if (hasTasks)                  toc.push('- [Diagramma Gantt](#diagramma-gantt)');
  if (project.milestones?.length) toc.push('- [Punti di Controllo](#punti-di-controllo)');
  if (hasTasks)                  toc.push('- [Attività per Gruppo](#attività-per-gruppo)');
  if (project.meetings?.length)  toc.push('- [Riunioni](#riunioni)');
  if (project.offers?.length)    toc.push('- [Offerte](#offerte)');
  if (project.issues?.length)    toc.push('- [Issue](#issue)');
  if (project.updates?.length)   toc.push('- [Aggiornamenti](#aggiornamenti)');
  if (toc.length) { lines.push(...toc); lines.push(''); lines.push('---'); lines.push(''); }

  // ── Descrizione e Info Generali ───────────────────────────────────────────
  if (project.description || project.generalInfo) {
    lines.push('## Descrizione e Info Generali');
    lines.push('');
    if (project.description) { lines.push(project.description); lines.push(''); }
    if (project.generalInfo)  { lines.push(project.generalInfo); lines.push(''); }
    lines.push('---'); lines.push('');
  }

  // ── Diagramma Gantt (Mermaid) ─────────────────────────────────────────────
  if (hasTasks) {
    lines.push('## Diagramma Gantt');
    lines.push('');
    lines.push('```mermaid');
    lines.push('gantt');
    lines.push(`    title ${escGantt(project.name || 'Progetto')}`);
    lines.push('    dateFormat YYYY-MM-DD');
    lines.push('    excludes weekends');
    lines.push('    todayMarker on');
    lines.push('');

    const groups   = (project.taskGroups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const tasks    = (project.tasks || []).filter(t => t.startDate && t.endDate && t.status !== 'annullata');
    const taskIdx  = {};  // id → gantt safe id
    tasks.forEach((t, i) => { taskIdx[t.id] = `t${i}`; });

    // Raggruppa i task
    const grouped   = new Map();
    const ungrouped = [];
    tasks.forEach(t => {
      const g = groups.find(g => g.id === t.groupId);
      if (g) {
        if (!grouped.has(g.id)) grouped.set(g.id, { name: g.name, tasks: [] });
        grouped.get(g.id).tasks.push(t);
      } else {
        ungrouped.push(t);
      }
    });

    // Sezione per ogni gruppo
    for (const g of groups) {
      const entry = grouped.get(g.id);
      if (!entry || !entry.tasks.length) continue;
      lines.push(`    section ${escGantt(entry.name)}`);
      entry.tasks.forEach(t => {
        const tid  = taskIdx[t.id];
        const mods = [];
        if (t.status === 'bloccata' || (t.endDate < today && t.completion < 100)) mods.push('crit');
        if (t.completion >= 100) mods.push('done');
        else if (t.startDate <= today && t.endDate >= today) mods.push('active');
        const modStr = mods.length ? mods.join(', ') + ', ' : '';
        lines.push(`        ${escGantt(t.name)} :${modStr ? ' ' + modStr : ' '}${tid}, ${t.startDate}, ${t.endDate}`);
      });
      lines.push('');
    }

    // Sezione attività senza gruppo
    if (ungrouped.length) {
      lines.push('    section Attività');
      ungrouped.forEach(t => {
        const tid  = taskIdx[t.id];
        const mods = [];
        if (t.status === 'bloccata' || (t.endDate < today && t.completion < 100)) mods.push('crit');
        if (t.completion >= 100) mods.push('done');
        else if (t.startDate <= today && t.endDate >= today) mods.push('active');
        const modStr = mods.length ? mods.join(', ') + ', ' : '';
        lines.push(`        ${escGantt(t.name)} :${modStr ? ' ' + modStr : ' '}${tid}, ${t.startDate}, ${t.endDate}`);
      });
      lines.push('');
    }

    // Sezione milestone
    const mils = (project.milestones || []).filter(m => m.date);
    if (mils.length) {
      lines.push('    section Milestone');
      mils.forEach((m, i) => {
        const mod = m.completed ? 'done, ' : '';
        lines.push(`        ${escGantt(m.name)} : ${mod}milestone, ms${i}, ${m.date}, 1d`);
      });
    }

    lines.push('```');
    lines.push('');
    lines.push('---'); lines.push('');
  }

  // ── Punti di Controllo ────────────────────────────────────────────────────
  if (project.milestones?.length) {
    lines.push('## Punti di Controllo');
    lines.push('');
    lines.push('| Nome | Data | Stato |');
    lines.push('|------|------|:-----:|');
    const todayMs = new Date(today).getTime();
    project.milestones
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(m => {
        let stato = '';
        if (m.date) {
          const diff = Math.round((new Date(m.date).getTime() - todayMs) / 86400000);
          if (diff < 0)       stato = '✅ Superata';
          else if (diff === 0) stato = '⚡ Oggi';
          else if (diff === 1) stato = '⏳ Domani';
          else                 stato = `⏳ tra ${diff}gg`;
        }
        lines.push(`| ${esc(m.name)} | ${fmtDate(m.date)} | ${stato} |`);
      });
    lines.push('');
    lines.push('---'); lines.push('');
  }

  // ── Attività per Gruppo ───────────────────────────────────────────────────
  if (hasTasks) {
    lines.push('## Attività per Gruppo');
    lines.push('');

    const allTasks  = project.tasks || [];
    const groups    = (project.taskGroups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const printTask = t => {
      lines.push(`#### ${t.name}${t.status === 'annullata' ? ' ~~(annullata)~~' : ''}`);
      const info = [];
      if (t.startDate)    info.push(`**Inizio:** ${fmtDate(t.startDate)}`);
      if (t.endDate)      info.push(`**Fine:** ${fmtDate(t.endDate)}`);
      if (t.duration)     info.push(`**Durata:** ${t.duration}gg`);
      info.push(`**Completamento:** ${t.completion || 0}%`);
      if (t.status)       info.push(`**Stato:** ${t.status}`);
      if (t.priority)     info.push(`**Priorità:** ${t.priority}`);
      if (t.resources?.length) {
        const names = [...new Set(t.resources.map(r => resName(r.resourceId)))].join(', ');
        info.push(`**Risorse:** ${names}`);
      }
      lines.push(info.join('  \n'));
      if (t.notes) { lines.push(''); lines.push('**Note:**'); lines.push(''); lines.push(t.notes); }
      if (t.checklist?.length) {
        lines.push('');
        lines.push('**Checklist:**');
        t.checklist.forEach(c => lines.push(`- [${c.completed ? 'x' : ' '}] ${c.text}`));
      }
      lines.push('');
    };

    groups.forEach(g => {
      const gTasks = allTasks.filter(t => t.groupId === g.id);
      if (!gTasks.length) return;
      lines.push(`### ${g.name}`);
      lines.push('');
      gTasks.forEach(printTask);
    });

    const ungrouped = allTasks.filter(t => !t.groupId || !groups.find(g => g.id === t.groupId));
    if (ungrouped.length) {
      if (groups.length) { lines.push('### Senza Gruppo'); lines.push(''); }
      ungrouped.forEach(printTask);
    }

    lines.push('---'); lines.push('');
  }

  // ── Riunioni ──────────────────────────────────────────────────────────────
  if (project.meetings?.length) {
    lines.push('## Riunioni');
    lines.push('');
    [...project.meetings]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .forEach(m => {
        lines.push(`### ${fmtDate(m.date)} — ${m.subject || ''}`);
        if (m.participants) lines.push(`**Partecipanti:** ${m.participants}`);
        if (m.topics) { lines.push(''); lines.push(m.topics); }
        lines.push('');
      });
    lines.push('---'); lines.push('');
  }

  // ── Offerte ───────────────────────────────────────────────────────────────
  if (project.offers?.length) {
    lines.push('## Offerte');
    lines.push('');
    lines.push('| Codice | Titolo | Data | Preventivo | Valore | Stato |');
    lines.push('|--------|--------|------|-----------|--------|-------|');
    project.offers.forEach(o => {
      const val = o.value ? `€ ${parseFloat(o.value).toFixed(2)}` : '-';
      lines.push(`| ${esc(o.offerCode||'-')} | ${esc(o.title)} | ${fmtDate(o.date)} | ${esc(o.estimate||'-')} | ${val} | ${esc(o.status||'-')} |`);
    });
    // Note offerte
    project.offers.filter(o => o.notes).forEach(o => {
      lines.push('');
      lines.push(`**Note offerta "${o.title}":**`);
      lines.push('');
      lines.push(o.notes);
    });
    lines.push('');
    lines.push('---'); lines.push('');
  }

  // ── Issue ─────────────────────────────────────────────────────────────────
  if (project.issues?.length) {
    lines.push('## Issue');
    lines.push('');
    lines.push('| Titolo | Priorità | Assegnato a | Stato |');
    lines.push('|--------|----------|-------------|-------|');
    project.issues.forEach(i => {
      const assignee = i.assignee ? resName(i.assignee) : 'Non assegnato';
      lines.push(`| ${esc(i.title)} | ${esc(i.priority||'-')} | ${esc(assignee)} | ${esc(i.status||'-')} |`);
    });
    project.issues.filter(i => i.description).forEach(i => {
      lines.push('');
      lines.push(`**Note issue "${i.title}":**`);
      lines.push('');
      lines.push(i.description);
    });
    lines.push('');
    lines.push('---'); lines.push('');
  }

  // ── Aggiornamenti ─────────────────────────────────────────────────────────
  if (project.updates?.length) {
    lines.push('## Aggiornamenti');
    lines.push('');
    [...project.updates]
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .forEach(u => {
        const d   = u.timestamp ? new Date(u.timestamp).toLocaleString('it-IT') : '-';
        const tag = u.tags?.length ? `  ${u.tags.join(' ')}` : '';
        lines.push(`### ${d}${tag}`);
        lines.push('');
        lines.push(u.text || '');
        lines.push('');
      });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const content  = lines.join('\n');
  const blob     = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const safeName = (project.name || 'progetto').replace(/[^a-z0-9_\-]/gi, '_');
  a.href     = url;
  a.download = `${safeName}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// ActivityMap
window.renderActivityMap        = ActivityMap.renderActivityMap;

// CheckpointCalendar
window.renderCheckpointCalendar = CheckpointCalendar.renderCheckpointCalendar;
window.navigateCheckpointCalendar = (dir) => {
    if (dir === -1) CheckpointCalendar.checkpointCalPrev();
    else if (dir === 1) CheckpointCalendar.checkpointCalNext();
    else CheckpointCalendar.checkpointCalToday();
};

// QuickNotes
window.renderQuickNotes                 = QuickNotes.renderQuickNotes;
window.saveQuickNote                    = QuickNotes.saveQuickNote;
window.deleteQuickNote                  = QuickNotes.deleteQuickNote;
window.openQuickNoteModal               = QuickNotes.openQuickNoteModal;
window.closeQuickNoteModal              = QuickNotes.closeQuickNoteModal;
window.toggleQuickNoteConfirmed         = QuickNotes.toggleQuickNoteConfirmed;
window.addQuickNote                     = QuickNotes.saveQuickNote;

// Tasks (funzioni aggiuntive usate inline nell'HTML)
window.changeTaskStatus                 = Tasks.changeTaskStatus;
window.deleteTaskFromModal              = Tasks.deleteTaskFromModal;
window.toggleFlexibleDate               = Tasks.toggleFlexibleDate;
window.showAbsenceWarning               = Tasks.showAbsenceWarning;
window.sendTaskEmail                    = Tasks.sendTaskEmail;
window.clearEmailSentDate               = Tasks.clearEmailSentDate;
window.toggleTaskAnalysisSelection      = Tasks.toggleTaskAnalysisSelection;
window.updateTaskSelectionBar           = Tasks.updateTaskSelectionBar;
window.clearTaskAnalysisSelection       = Tasks.clearTaskAnalysisSelection;
window.analizzaRisorsePerAttivita       = Tasks.analizzaRisorsePerAttivita;
window.renderTasks                      = Tasks.renderTasks;
window.updateTrackingDaysDiff           = Tasks.updateTrackingDaysDiff;
window.applyTaskLinks                   = Projects.applyTaskLinks;
// Task Groups
window.openGroupModal                   = Tasks.openGroupModal;
window.closeGroupModal                  = Tasks.closeGroupModal;
window.saveGroup                        = Tasks.saveGroup;
window.deleteGroup                      = Tasks.deleteGroup;

// Projects (funzioni aggiuntive)
window.calculateProjectStats            = Projects.calculateProjectStats;
window.renderProjectDaysSummary         = Projects.renderProjectDaysSummary;
window.showProjectsStatistics           = Projects.showProjectsStatistics;
window.renderProjectGeneralInfo         = Projects.renderProjectGeneralInfo;
window.saveProjectGeneralInfo           = Projects.saveProjectGeneralInfo;
window.addProjectUpdate                 = Projects.addProjectUpdate;
window.deleteProjectUpdate              = Projects.deleteProjectUpdate;
window.viewUpdate                       = Projects.viewUpdate;
window.closeUpdateModal                 = Projects.closeUpdateModal;

// Resources (funzioni aggiuntive)
window.openResourceTypesSettings        = Resources.openResourceTypesSettings;
window.closeResourceTypesSettings       = Resources.closeResourceTypesSettings;
window.addResourceType                  = Resources.addResourceType;
window.renderResourceTypes              = Resources.renderResourceTypesList;
window.saveResourceTypes                = Resources.saveResourceTypes;
window.addResourceTypeRow               = Resources.addResourceType;
window.removeResourceTypeRow            = Resources.removeResourceType;
window.addAbsenceRow                    = Resources.addAbsenceRange;
window.removeAbsenceRow                 = Resources.removeAbsenceRange;
window.addPermessoRow                   = Resources.addPermitRange;
window.removePermessoRow                = Resources.removePermitRange;
window.previewResourceCalendar          = Resources.renderResourceCalendarPreview;
window.navigateResourceCalendar         = Resources.navigateResourceCalendar;
window.resourceCalPrev                  = () => Resources.navigateResourceCalendar(-1);
window.resourceCalNext                  = () => Resources.navigateResourceCalendar(1);
window.exportResourceMarkdown           = Resources.exportResourceMarkdown;

// Plants (funzioni aggiuntive)
window.geocodePlantAddress              = Plants.geocodePlantAddress;
window.updatePlantSelect                = Plants.updatePlantSelect;
window.updatePlantInfoBadge             = Plants.updatePlantInfoBadge;
window.togglePlantSelector              = Plants.togglePlantSelector;

// Meetings (funzioni aggiuntive)
window.populateTimeSelect               = Meetings.populateTimeSelect;
window.filterMeetings                   = Meetings.filterMeetings;
window.exportMeetingICS                 = Meetings.exportMeetingICS;
window.renderProjectMeetings            = Meetings.renderProjectMeetings;

// Gantt (funzioni aggiuntive)
window.ganttZoomIn                      = Gantt.ganttZoomIn;
window.ganttZoomOut                     = Gantt.ganttZoomOut;
window.switchGanttView                  = Gantt.switchGanttView;

// ResourceView (funzioni aggiuntive)
window.resourceViewPrev                 = ResourceView.resourceViewPrev;
window.resourceViewNext                 = ResourceView.resourceViewNext;
window.resourceViewToday                = ResourceView.resourceViewToday;
window.expandAllResources               = ResourceView.expandAllResources;
window.collapseAllResources             = ResourceView.collapseAllResources;
window.toggleResourceCollapse           = ResourceView.toggleResourceCollapse;
window.openFlexibleTaskFromResourceView = ResourceView.openFlexibleTaskFromResourceView;

// TaskReview (funzioni aggiuntive)
window.updateTaskReviewTotal            = TaskReview.updateTaskReviewTotal;
window.toggleAllTaskReviewSelection     = TaskReview.toggleAllTaskReviewSelection;
window.sendTaskReviewEmail              = TaskReview.sendTaskReviewEmail;
window.openTaskFromReview               = TaskReview.openTaskFromReview;
window.closeTaskReviewAnalysisPanel     = TaskReview.closeTaskReviewAnalysisPanel;

// Dashboard
window.navigateToProject                = Dashboard.navigateToProject;

// Bacheca
window.openTaskFromBacheca              = Bacheca.openTaskFromBacheca;

// Annotations
window.openTaskFromAnnotations          = Annotations.openTaskFromAnnotations;

// Offers
window.openIssueModal                   = Offers.openIssueModal;
window.closeIssueModal                  = Offers.closeIssueModal;
window.saveIssue                        = Offers.saveIssue;
window.deleteIssue                      = Offers.deleteIssue;
window.editOffer                        = Offers.editOffer;
window.editIssue                        = Offers.editIssue;

// Auth
window.doLogin                  = Auth.doLogin;
window.authLogout               = Auth.logout;
window.openChangePasswordModal  = Auth.openChangePasswordModal;
window.closeChangePasswordModal = Auth.closeChangePasswordModal;
window.doChangePassword         = Auth.doChangePassword;

// Users
window.openUsersModal        = Users.openUsersModal;
window.closeUsersModal       = Users.closeUsersModal;
window.saveUser              = Users.saveUser;
window.editUser              = Users.editUser;
window.deleteUser            = Users.deleteUser;
window.updateUserFormForRole = Users.updateUserFormForRole;

// CheckpointCalendar
window.checkpointCalPrev                = CheckpointCalendar.checkpointCalPrev;
window.checkpointCalNext                = CheckpointCalendar.checkpointCalNext;
window.checkpointCalToday               = CheckpointCalendar.checkpointCalToday;

// ActivityMap
window.activityMapPrev                  = ActivityMap.activityMapPrev;
window.activityMapNext                  = ActivityMap.activityMapNext;
window.activityMapToday                 = ActivityMap.activityMapToday;
