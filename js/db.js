/**
 * js/db.js  –  Data Access Layer per ProjectPlanner v2
 *
 * Wrapper diretto alle REST API del backend (sempre online).
 * Nessuna cache locale / IndexedDB / pending sync.
 *
 * Tutte le funzioni sono async/await.
 */

// ─── Configurazione ───────────────────────────────────────────────────────────

export const API_BASE = 'http://localhost:3001/api';

// ─── API fetch wrapper ─────────────────────────────────────────────────────────

const _AUTH_TOKEN_KEY = 'pp2_auth_token';

async function apiFetch(path, method = 'GET', body) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};

  const token = localStorage.getItem(_AUTH_TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Sessione scaduta. Effettua il login.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Inizializzazione ─────────────────────────────────────────────────────────

/**
 * Avvia il data layer: verifica che il backend sia raggiungibile.
 * Ritorna { online: true }. Lancia eccezione se il server non risponde.
 */
export async function init() {
  const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('Backend non raggiungibile');
  window.dispatchEvent(new CustomEvent('db:connectionChanged', { detail: { online: true } }));
  return { online: true };
}

/** Sempre true — l'app richiede il server. */
export function isOnline() { return true; }

// ─── CRUD generico ─────────────────────────────────────────────────────────────

/** Legge tutti i record di uno store. */
export async function getAll(store) {
  const apiStore = store === 'localHolidays' ? 'holidays/local' : store;
  return apiFetch(`/${apiStore}`);
}

/** Legge un singolo record per id. */
export async function getById(store, id) {
  const apiStore = store === 'localHolidays' ? 'holidays/local' : store;
  return apiFetch(`/${apiStore}/${id}`);
}

/** Crea o aggiorna un record (upsert). */
export async function save(store, data) {
  const apiStore = store === 'localHolidays' ? 'holidays/local' : store;
  return apiFetch(`/${apiStore}/${data.id}`, 'PUT', data);
}

/** Aggiornamento parziale (PATCH) — usato da utenti personal per aggiornare solo i campi consentiti. */
export async function patch(store, id, data) {
  const apiStore = store === 'localHolidays' ? 'holidays/local' : store;
  return apiFetch(`/${apiStore}/${id}`, 'PATCH', data);
}

/** Elimina un record per id. */
export async function remove(store, id) {
  const apiStore = store === 'localHolidays' ? 'holidays/local' : store;
  try {
    await apiFetch(`/${apiStore}/${id}`, 'DELETE');
  } catch (err) {
    // 404 = già eliminato: considerato successo
    if (err.message === 'Non trovato') return true;
    throw err;
  }
  return true;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/** Legge tutte le settings. */
export async function getAllSettings() {
  return apiFetch('/settings');
}

/** Legge una singola setting per chiave. */
export async function getSetting(key) {
  const res = await apiFetch(`/settings/${key}`);
  return res.value;
}

/** Scrive una singola setting. */
export async function setSetting(key, value) {
  await apiFetch(`/settings/${key}`, 'PUT', { value });
}

// ─── Export / Import ──────────────────────────────────────────────────────────

/** Scarica il backup JSON completo. */
export async function exportData() {
  return apiFetch('/export');
}

/** Importa un payload JSON (full replace). */
export async function importData(payload) {
  return apiFetch('/import', 'POST', payload);
}

/** Importa con merge (solo id non esistenti). */
export async function importMerge(payload) {
  return apiFetch('/import/merge', 'POST', payload);
}

/** Svuota completamente il database (operazione solo-admin lato server). */
export async function wipeAll() {
  return apiFetch('/wipe', 'DELETE');
}
