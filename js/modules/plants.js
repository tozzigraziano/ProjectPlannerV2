/**
 * js/modules/plants.js
 *
 * Gestione stabilimenti/sedi cliente: CRUD, modal con mappa Leaflet,
 * geocoding via Nominatim.
 *
 * Dipendenze v2:
 *   - ../db.js       → db.save, db.remove
 *   - ../state.js    → state.plants, state.projects, state.setPlants
 *   - ../helpers.js  → openModal, closeModal, escapeHtml, getAllUniqueClients
 */

import * as db    from '../db.js';
import * as state from '../state.js';
import { openModal, closeModal, escapeHtml, getAllUniqueClients, generateId } from '../helpers.js';

// ─── Stato modulo ─────────────────────────────────────────────────────────────

let _editingId   = null;
let _mapInstance = null;
let _mapMarker   = null;

// ─── Mappa Leaflet (modal) ────────────────────────────────────────────────────

function _initPlantModalMap(lat, lng) {
    const container = document.getElementById('plantModalMap');
    if (!container) return;

    if (!window.L) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script  = document.createElement('script');
        script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => _initPlantModalMap(lat, lng);
        document.head.appendChild(script);
        return;
    }

    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
        _mapMarker   = null;
    }

    const defaultLat  = lat || 42.5;
    const defaultLng  = lng || 12.5;
    const defaultZoom = (lat && lng) ? 15 : 6;

    _mapInstance = L.map('plantModalMap').setView([defaultLat, defaultLng], defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(_mapInstance);

    if (lat && lng) {
        _mapMarker = L.marker([lat, lng], { draggable: true }).addTo(_mapInstance);
        _mapMarker.on('dragend', function () {
            const pos = _mapMarker.getLatLng();
            document.getElementById('plantLat').value = pos.lat.toFixed(6);
            document.getElementById('plantLng').value = pos.lng.toFixed(6);
            _reverseGeocode(pos.lat, pos.lng);
        });
    }

    _mapInstance.on('click', function (e) {
        const pos = e.latlng;
        document.getElementById('plantLat').value = pos.lat.toFixed(6);
        document.getElementById('plantLng').value = pos.lng.toFixed(6);
        _reverseGeocode(pos.lat, pos.lng);
        if (_mapMarker) {
            _mapMarker.setLatLng(pos);
        } else {
            _mapMarker = L.marker([pos.lat, pos.lng], { draggable: true }).addTo(_mapInstance);
            _mapMarker.on('dragend', function () {
                const p = _mapMarker.getLatLng();
                document.getElementById('plantLat').value = p.lat.toFixed(6);
                document.getElementById('plantLng').value = p.lng.toFixed(6);
                _reverseGeocode(p.lat, p.lng);
            });
        }
    });
}

async function _reverseGeocode(lat, lng) {
    const statusEl = document.getElementById('geocodeStatus');
    statusEl.textContent = '⏳ Aggiornamento indirizzo...';
    statusEl.style.color = 'var(--text-secondary)';
    try {
        const url = 'https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
            lat: lat,
            lon: lng,
            format: 'json',
            addressdetails: '1'
        });
        const response = await fetch(url, { headers: { 'Accept-Language': 'it' } });
        if (!response.ok) throw new Error('Errore');
        const result = await response.json();
        if (result && result.address) {
            const addr        = result.address;
            const road        = addr.road || '';
            const houseNumber = addr.house_number || '';
            const city        = addr.city || addr.town || addr.village || addr.municipality || '';
            const province    = addr.county || addr.state || '';
            const country     = addr.country || '';
            const fullAddress = [road, houseNumber || null, city, province, country].filter(Boolean).join(', ');
            if (fullAddress) document.getElementById('plantAddress').value = fullAddress;
            statusEl.textContent = '✅ Indirizzo aggiornato';
            statusEl.style.color = '#4CAF50';
        } else {
            statusEl.textContent = '⚠️ Indirizzo non trovato';
            statusEl.style.color = '#FF9800';
        }
    } catch {
        statusEl.textContent = '❌ Errore di rete';
        statusEl.style.color = '#f44336';
    }
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

function _updateMapView() {
    const lat = parseFloat(document.getElementById('plantLat').value);
    const lng = parseFloat(document.getElementById('plantLng').value);
    if (!isNaN(lat) && !isNaN(lng) && _mapInstance) {
        _mapInstance.setView([lat, lng], 15);
        if (_mapMarker) {
            _mapMarker.setLatLng([lat, lng]);
        } else {
            _mapMarker = L.marker([lat, lng], { draggable: true }).addTo(_mapInstance);
            _mapMarker.on('dragend', function () {
                const p = _mapMarker.getLatLng();
                document.getElementById('plantLat').value = p.lat.toFixed(6);
                document.getElementById('plantLng').value = p.lng.toFixed(6);
            });
        }
    }
}

// ─── Geocoding indirizzo ──────────────────────────────────────────────────────

/** Geocodifica l'indirizzo inserito e aggiorna lat/lng + mappa. */
export async function geocodePlantAddress() {
    const address  = document.getElementById('plantAddress').value.trim();
    const statusEl = document.getElementById('geocodeStatus');

    if (!address) {
        alert('Inserisci un indirizzo per geocodificare.');
        return;
    }

    statusEl.textContent = '⏳ Ricerca in corso...';
    statusEl.style.color = 'var(--text-secondary)';

    try {
        const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
            q: address,
            format: 'json',
            limit: '1',
            addressdetails: '1'
        });
        const response = await fetch(url, { headers: { 'Accept-Language': 'it' } });
        if (!response.ok) throw new Error('Errore nella richiesta');
        const results = await response.json();

        if (results.length > 0) {
            document.getElementById('plantLat').value = parseFloat(results[0].lat).toFixed(6);
            document.getElementById('plantLng').value = parseFloat(results[0].lon).toFixed(6);
            statusEl.textContent = '✅ Coordinate trovate';
            statusEl.style.color = '#4CAF50';
            _updateMapView();
        } else {
            statusEl.textContent = '❌ Nessun risultato trovato';
            statusEl.style.color = '#f44336';
        }
    } catch {
        statusEl.textContent = '❌ Errore di rete';
        statusEl.style.color = '#f44336';
    }

    setTimeout(() => { statusEl.textContent = ''; }, 5000);
}

// ─── CRUD Stabilimenti ────────────────────────────────────────────────────────

/** Apre il modal per creare o modificare uno stabilimento. */
export function openPlantModal(id = null) {
    _editingId = id;
    const modal = document.getElementById('plantModal');
    const title = document.getElementById('plantModalTitle');

    // Popola suggerimenti clienti
    const clientSuggestions = document.getElementById('plantClientSuggestions');
    clientSuggestions.innerHTML = '';
    getAllUniqueClients(state.projects, state.plants).forEach(client => {
        const option   = document.createElement('option');
        option.value   = client;
        clientSuggestions.appendChild(option);
    });

    if (id) {
        title.textContent = 'Modifica Stabilimento';
        const plant = state.plants.find(p => p.id == id);
        if (plant) {
            document.getElementById('plantName').value    = plant.name    || '';
            document.getElementById('plantClient').value  = plant.client  || '';
            document.getElementById('plantAddress').value = plant.address || (plant.city ? [plant.city, plant.province].filter(Boolean).join(', ') : '');
            document.getElementById('plantLat').value     = plant.lat     || '';
            document.getElementById('plantLng').value     = plant.lng     || '';
            document.getElementById('plantNotes').value   = plant.notes   || '';
        }
    } else {
        title.textContent = 'Nuovo Stabilimento';
        clearPlantForm();
    }

    openModal(modal);

    // Inizializza mappa dopo che il modal è visibile
    setTimeout(() => {
        const lat = parseFloat(document.getElementById('plantLat').value) || null;
        const lng = parseFloat(document.getElementById('plantLng').value) || null;
        _initPlantModalMap(lat, lng);
    }, 200);
}

/** Chiude il modal e distrugge l'istanza mappa. */
export function closePlantModal() {
    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
        _mapMarker   = null;
    }
    closeModal(document.getElementById('plantModal'));
    clearPlantForm();
}

/** Azzera i campi del form stabilimento. */
export function clearPlantForm() {
    _editingId = null;
    document.getElementById('plantName').value    = '';
    document.getElementById('plantClient').value  = '';
    document.getElementById('plantAddress').value = '';
    document.getElementById('plantLat').value     = '';
    document.getElementById('plantLng').value     = '';
    document.getElementById('plantNotes').value   = '';
    document.getElementById('geocodeStatus').textContent = '';
}

/** Salva (crea o aggiorna) uno stabilimento. */
export async function savePlant() {
    const name   = document.getElementById('plantName').value.trim();
    const client = document.getElementById('plantClient').value.trim();

    if (!name) {
        alert('Il nome dello stabilimento è obbligatorio');
        return;
    }

    const plant = {
        id:      _editingId || generateId(),
        name,
        client,
        address: document.getElementById('plantAddress').value.trim(),
        lat:     parseFloat(document.getElementById('plantLat').value) || null,
        lng:     parseFloat(document.getElementById('plantLng').value) || null,
        notes:   document.getElementById('plantNotes').value.trim()
    };

    const updated = [...state.plants];
    if (_editingId) {
        const index = updated.findIndex(p => p.id == _editingId);
        if (index !== -1) updated[index] = plant;
    } else {
        updated.push(plant);
    }
    state.setPlants(updated);

    await db.save('plants', plant);
    renderPlants();
    closePlantModal();
}

/** Elimina uno stabilimento. */
export async function deletePlant(id) {
    if (!confirm('Sei sicuro di voler eliminare questo stabilimento?')) return;
    state.setPlants(state.plants.filter(p => p.id != id));
    await db.remove('plants', id);
    renderPlants();
}

// ─── Helpers selettore stabilimento nel modal attività ────────────────────────

/**
 * Ritorna il cliente del progetto corrente (da state), o null.
 */
function _getCurrentProjectClient() {
    const project = state.projects.find(p => p.id == state.currentProjectId);
    return project?.client || null;
}

/**
 * Popola il select #taskPlantId con gli stabilimenti filtrati per cliente
 * del progetto corrente. Preserva il valore selezionato se ancora disponibile.
 */
export function updatePlantSelect() {
    const sel = document.getElementById('taskPlantId');
    if (!sel) return;
    const current = sel.value;
    const client  = _getCurrentProjectClient();

    // Filtra per cliente se disponibile, altrimenti mostra tutti
    const filtered = client
        ? state.plants.filter(p => (p.client || '').toLowerCase() === client.toLowerCase())
        : state.plants;

    sel.innerHTML = '';
    if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.value   = '';
        opt.textContent = client
            ? `Nessuno stabilimento per "${client}"`
            : 'Nessuno stabilimento presente';
        opt.disabled = true;
        sel.appendChild(opt);
    } else {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- Seleziona Stabilimento --';
        sel.appendChild(placeholder);
        filtered.forEach(p => {
            const opt = document.createElement('option');
            opt.value       = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        if (current && filtered.some(p => String(p.id) === String(current))) {
            sel.value = current;
        }
    }
}

/**
 * Mostra/nasconde il select stabilimenti e il badge info in base a #taskLocationType.
 * Quando si mostra, aggiorna anche la lista degli stabilimenti filtrata per cliente.
 */
export function togglePlantSelector() {
    const locationType = document.getElementById('taskLocationType')?.value;
    const plantSel     = document.getElementById('taskPlantId');
    const plantInfo    = document.getElementById('taskPlantInfo');
    if (!plantSel) return;
    const isCliente = locationType === 'cliente';
    plantSel.style.display = isCliente ? '' : 'none';
    if (isCliente) {
        updatePlantSelect();
    } else {
        plantSel.value = '';
        if (plantInfo) { plantInfo.style.display = 'none'; plantInfo.textContent = ''; }
    }
}

/**
 * Aggiorna il badge #taskPlantInfo con indirizzo (e coordinate) dello stabilimento selezionato.
 */
export function updatePlantInfoBadge() {
    const sel   = document.getElementById('taskPlantId');
    const badge = document.getElementById('taskPlantInfo');
    if (!sel || !badge) return;
    const plant = state.plants.find(p => String(p.id) === String(sel.value));
    if (plant && sel.value) {
        const parts = [];
        if (plant.address) parts.push('📍 ' + plant.address);
        if (plant.lat && plant.lng) parts.push(`(${plant.lat.toFixed(4)}, ${plant.lng.toFixed(4)})`);
        badge.textContent   = parts.length ? parts.join(' ') : plant.name;
        badge.style.display = '';
    } else {
        badge.textContent   = '';
        badge.style.display = 'none';
    }
}

/** Renderizza la tabella degli stabilimenti con filtri attivi. */
export function renderPlants() {
    const tbody = document.querySelector('#plantsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filterName    = (document.getElementById('plantFilterName')?.value    || '').toLowerCase();
    const filterClient  = (document.getElementById('plantFilterClient')?.value  || '').toLowerCase();
    const filterAddress = (document.getElementById('plantFilterAddress')?.value || '').toLowerCase();

    const filtered = state.plants.filter(p => {
        if (filterName    && !(p.name    || '').toLowerCase().includes(filterName))    return false;
        if (filterClient  && !(p.client  || '').toLowerCase().includes(filterClient))  return false;
        if (filterAddress && !(p.address || '').toLowerCase().includes(filterAddress)) return false;
        return true;
    });

    if (filtered.length === 0) {
        const row  = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan       = 5;
        cell.textContent   = 'Nessuno stabilimento trovato.';
        cell.style.textAlign  = 'center';
        cell.style.fontStyle  = 'italic';
        cell.style.padding    = '20px';
        return;
    }

    filtered.forEach(plant => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(plant.name)}</strong></td>
            <td>${escapeHtml(plant.client || '-')}</td>
            <td>${escapeHtml(plant.address || '-')}</td>
            <td>${(plant.lat && plant.lng) ? `${plant.lat.toFixed(4)}, ${plant.lng.toFixed(4)}` : '-'}</td>
            <td class="action-buttons">
                <button onclick="openPlantModal('${plant.id}')">✏️</button>
                <button class="delete" onclick="deletePlant('${plant.id}')">🗑️</button>
            </td>
        `;
    });
}
