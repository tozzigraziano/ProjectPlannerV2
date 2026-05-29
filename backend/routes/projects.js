'use strict';

/**
 * Route per i progetti.
 * - Utenti personal: GET filtrato ai soli progetti in cui sono assegnati
 * - Scritture (POST/PUT/DELETE): solo admin ed editor
 */
const { Router } = require('express');
const { getAll, getById, upsert, deleteById } = require('../db');

const router = Router();
const WRITE_ROLES = ['admin', 'editor'];

// Controlla se un utente personal è assegnato al progetto
function _personalHasAccess(project, resourceId) {
  return project.tasks?.some(t =>
    t.resources?.some(r => r.resourceId === resourceId)
  ) ?? false;
}

// GET / – lista progetti (filtrata per personal)
router.get('/', (req, res) => {
  let projects = getAll('projects');
  if (req.user.role === 'personal' && req.user.resourceId) {
    projects = projects.filter(p => _personalHasAccess(p, req.user.resourceId));
  }
  res.json(projects);
});

// GET /:id
router.get('/:id', (req, res) => {
  const item = getById('projects', req.params.id);
  if (!item) return res.status(404).json({ error: 'Non trovato' });
  if (req.user.role === 'personal' && req.user.resourceId) {
    if (!_personalHasAccess(item, req.user.resourceId))
      return res.status(403).json({ error: 'Accesso negato' });
  }
  res.json(item);
});

// POST / – solo admin ed editor
router.post('/', (req, res) => {
  if (!WRITE_ROLES.includes(req.user?.role))
    return res.status(403).json({ error: 'Accesso negato: sola lettura' });
  const data = req.body;
  if (!data?.id) return res.status(400).json({ error: 'id mancante' });
  res.status(201).json(upsert('projects', data.id, data));
});

// PUT /:id – solo admin ed editor
router.put('/:id', (req, res) => {
  if (!WRITE_ROLES.includes(req.user?.role))
    return res.status(403).json({ error: 'Accesso negato: sola lettura' });
  const data = req.body;
  if (!data) return res.status(400).json({ error: 'Body mancante' });
  data.id = req.params.id;
  res.json(upsert('projects', req.params.id, data));
});

// PATCH /:id – aggiornamento parziale di un task (completion/status/risorsa propria)
// Consente agli utenti personal di salvare i propri avanzamenti.
router.patch('/:id', (req, res) => {
  const user    = req.user;
  const project = getById('projects', req.params.id);
  if (!project) return res.status(404).json({ error: 'Non trovato' });

  const { taskId, status, completion, resources } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId mancante' });

  const task = project.tasks?.find(t => String(t.id) === String(taskId));
  if (!task) return res.status(404).json({ error: 'Task non trovato' });

  if (user.role === 'personal') {
    // Verifica che l'utente sia assegnato al task
    const assigned = task.resources?.some(r => String(r.resourceId) === String(user.resourceId));
    if (!assigned) return res.status(403).json({ error: 'Non assegnato a questo task' });
    // Aggiorna solo i campi consentiti
    if (status     !== undefined) task.status     = status;
    if (completion !== undefined) task.completion = completion;
    if (Array.isArray(resources)) {
      resources.forEach(patch => {
        // Il personal può aggiornare solo il completamento della propria risorsa
        if (String(patch.resourceId) !== String(user.resourceId)) return;
        const entry = task.resources.find(r => String(r.resourceId) === String(patch.resourceId));
        if (entry) entry.completion = patch.completion;
      });
    }
  } else if (WRITE_ROLES.includes(user.role)) {
    if (status     !== undefined) task.status     = status;
    if (completion !== undefined) task.completion = completion;
    if (Array.isArray(resources)) {
      resources.forEach(patch => {
        const entry = task.resources.find(r => String(r.resourceId) === String(patch.resourceId));
        if (entry) entry.completion = patch.completion;
      });
    }
  } else {
    return res.status(403).json({ error: 'Accesso negato: sola lettura' });
  }

  res.json(upsert('projects', req.params.id, project));
});

// DELETE /:id – solo admin ed editor
router.delete('/:id', (req, res) => {
  if (!WRITE_ROLES.includes(req.user?.role))
    return res.status(403).json({ error: 'Accesso negato: sola lettura' });
  const deleted = deleteById('projects', req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Non trovato' });
  res.json({ success: true });
});

module.exports = router;

