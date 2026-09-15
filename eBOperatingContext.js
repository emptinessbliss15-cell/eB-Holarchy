import { renderCircleView } from './eBCircleView.js';

const STORAGE_KEY = 'eB-Holarchy.operatingContext';
const VIEW_STORAGE_KEY = 'eB-Holarchy.operatingView';
const OPERATING_TYPES = new Set(['company', 'circle']);

let model = { holons: [], relationships: [], relationshipTypes: [] };
let contextId = null;
let currentView = 'graph';
let initialized = false;

function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key, value) { try { if (value) localStorage.setItem(key, String(value)); else localStorage.removeItem(key); } catch { /* Session-only fallback. */ } }
function holonById(id) { return model.holons.find(item => String(item.id) === String(id)); }
function isOperatingHolon(holon) { return OPERATING_TYPES.has(String(holon?.holon_type || '').trim().toLowerCase()); }
function context() { return holonById(contextId) || null; }

function scopedIds(rootId) {
  const ids = new Set(rootId ? [String(rootId)] : []);
  if (!rootId) return ids;
  let changed = true;
  while (changed) {
    changed = false;
    for (const relationship of model.relationships) {
      const source = String(relationship.source_holon_id || '');
      const target = String(relationship.target_holon_id || '');
      if (ids.has(target) && source && !ids.has(source)) { ids.add(source); changed = true; }
    }
  }
  return ids;
}

function renderHeader() {
  const host = document.getElementById('operatingContext');
  if (!host) return;
  host.replaceChildren();
  const active = context();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'eb-operating-context-button';
  button.textContent = active ? `Within: ${active.name || '(unnamed)'}` : 'Choose context';
  button.title = active ? `Operating within ${active.name || '(unnamed)'}` : 'Choose a Company or Circle to operate within';
  const select = document.createElement('select');
  select.className = 'eb-operating-context-select'; select.setAttribute('aria-label', 'Operate within'); select.hidden = true;
  const none = document.createElement('option'); none.value = ''; none.textContent = '— No operating context —'; select.appendChild(none);
  for (const holon of model.holons.filter(isOperatingHolon).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))) {
    const option = document.createElement('option'); option.value = holon.id; option.textContent = `${holon.name || '(unnamed)'} · ${holon.holon_type}`; select.appendChild(option);
  }
  select.value = active?.id || '';
  button.addEventListener('click', () => { select.hidden = !select.hidden; if (!select.hidden) select.focus(); });
  select.addEventListener('change', () => { setOperatingContext(select.value || null); select.hidden = true; });
  select.addEventListener('blur', () => { window.setTimeout(() => { select.hidden = true; }, 100); });
  host.append(button, select);
}

function renderContextView() {
  const panel = document.getElementById('operatingViewPanel');
  const graphContent = document.getElementById('graphWorkspace');
  document.querySelectorAll('[data-operating-view]').forEach(button => button.classList.toggle('is-active', button.dataset.operatingView === currentView));
  if (!panel || !graphContent) return;
  const showGraph = currentView === 'graph'; graphContent.hidden = !showGraph; panel.hidden = showGraph;
  if (showGraph) return;
  panel.replaceChildren();
  const active = context();
  if (currentView === 'circles') {
    renderCircleView({
      container: panel, context: active, ...model,
      onOpen: holon => { setView('graph'); window.dispatchEvent(new CustomEvent('holon:open', { detail: { holon } })); },
      onOperate: holon => setOperatingContext(holon),
      onCreate: (type, parent) => window.dispatchEvent(new CustomEvent('holon:contextcreate', { detail: { type, parent } })),
      onCreateRelationship: parent => window.dispatchEvent(new CustomEvent('relationship:contextcreate', { detail: { parent } })),
      onEdit: holon => window.dispatchEvent(new CustomEvent('holon:contextedit', { detail: { holon } })),
      onDelete: holon => window.dispatchEvent(new CustomEvent('holon:contextdelete', { detail: { holon } })),
    });
    return;
  }
  const heading = document.createElement('div'); heading.className = 'panel-heading';
  const title = document.createElement('h3'); title.textContent = currentView[0].toUpperCase() + currentView.slice(1);
  const scope = document.createElement('span'); scope.className = 'muted'; scope.textContent = active ? `within ${active.name}` : 'choose an operating context';
  heading.append(title, scope); panel.appendChild(heading);
  if (!active) {
    const empty = document.createElement('div'); empty.className = 'eb-operating-empty'; empty.textContent = 'Choose a Company or Circle above, or use “Operate within” on a Holon.'; panel.appendChild(empty); return;
  }
  const singular = currentView === 'processes' ? 'process' : currentView.slice(0, -1);
  const ids = scopedIds(active.id);
  const matches = model.holons.filter(holon => ids.has(String(holon.id)) && String(holon.holon_type || '').trim().toLowerCase() === singular);
  if (!matches.length) {
    const empty = document.createElement('div'); empty.className = 'eb-operating-empty'; empty.textContent = `No ${currentView} are currently connected within ${active.name}.`; panel.appendChild(empty); return;
  }
  const list = document.createElement('div'); list.className = 'eb-operating-list';
  for (const holon of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = holon.name || '(unnamed)';
    button.addEventListener('click', () => { setView('graph'); window.dispatchEvent(new CustomEvent('holon:open', { detail: { holon } })); });
    list.appendChild(button);
  }
  panel.appendChild(list);
}

function setView(view) { if (!['graph', 'circles', 'tensions', 'roles', 'processes'].includes(view)) return; currentView = view; write(VIEW_STORAGE_KEY, view); renderContextView(); }

export function setOperatingContext(value) {
  const next = value ? holonById(value.id ?? value) : null;
  if (next && !isOperatingHolon(next)) return false;
  contextId = next ? String(next.id) : null; write(STORAGE_KEY, contextId); renderHeader(); renderContextView();
  window.dispatchEvent(new CustomEvent('eB:operatingContextChanged', { detail: { context: next } }));
  return true;
}

export function getOperatingContext() { return context(); }

export function updateOperatingModel(nextModel = {}) {
  model = { holons: nextModel.holons || [], relationships: nextModel.relationships || [], relationshipTypes: nextModel.relationshipTypes || [] };
  const saved = contextId || read(STORAGE_KEY);
  contextId = saved && holonById(saved) && isOperatingHolon(holonById(saved)) ? String(saved) : null;
  if (saved && !contextId) write(STORAGE_KEY, null);
  renderHeader(); renderContextView();
}

export function initOperatingContext() {
  if (initialized) return; initialized = true; currentView = read(VIEW_STORAGE_KEY) || 'graph';
  if (!['graph', 'circles', 'tensions', 'roles', 'processes'].includes(currentView)) currentView = 'graph';
  document.querySelectorAll('[data-operating-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.operatingView)));
  document.getElementById('newHolon')?.addEventListener('click', event => {
    const active = context();
    if (!active) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('holon:contextcreate', { detail: { parent: active } }));
  }, true);
  window.addEventListener('holon:operatewithin', event => setOperatingContext(event.detail?.holon || null));
  renderHeader(); renderContextView();
}
