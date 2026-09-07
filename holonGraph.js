// Holon Graph — visual model of Holons and their relationships.
// Cytoscape is kept as the rendering primitive; the app owns the Holon model.

let cy = null;
let currentModel = { holons: [], relationships: [], relationshipTypes: [] };
let currentRootId = null;
let currentDepth = 2;
let showProvenance = false;
let selectionHandler = null;
let depthListenerInstalled = false;
let provenanceListenerInstalled = false;
let navigationInstalled = false;
let contextMenu = null;
let contextMenuCleanup = null;

const GRAPH_DEPTH_STORAGE_KEY = 'eB-Holarchy.graphDepth';

function readPersistedDepth() {
  try {
    const value = localStorage.getItem(GRAPH_DEPTH_STORAGE_KEY);
    if (value === 'all' || ['1', '2', '3', '4'].includes(value)) return value;
  } catch (_) {}
  return null;
}

function persistDepth(value) {
  try { localStorage.setItem(GRAPH_DEPTH_STORAGE_KEY, String(value)); } catch (_) {}
}

function installStyles() {
  if (document.getElementById('holon-graph-style')) return;
  const style = document.createElement('style');
  style.id = 'holon-graph-style';
  style.textContent = `
    .holon-workspace { display: flex; flex-direction: column; min-height: 0; }
    .holon-workspace .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .graph-context { display: flex; align-items: center; gap: 7px; min-width: 240px; }
    .graph-context label { font-size: 13px; font-weight: 600; }
    .graph-context .hcg-autocomplete { flex: 1; min-width: 220px; }
    .panel-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .panel-actions button { padding: 6px 9px; border: 1px solid var(--eb-border-strong); border-radius: 5px; background: var(--eb-input-bg); color: var(--eb-text); }
    #graphUp { white-space: nowrap; }
    #holonGraph { width: 100%; height: calc(100vh - 190px); min-height: 480px; border: 1px solid var(--eb-border); border-radius: 6px; background: var(--eb-bg); }
    .holon-status-legend { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 2px 0 8px; font-size: 11px; opacity: .9; }
    .holon-status-key { display: inline-flex; align-items: center; gap: 4px; }
    .holon-status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,.18); }
    @media (max-width: 760px) { .graph-context { min-width: 0; flex: 1; } .graph-context .hcg-autocomplete { min-width: 0; } #holonGraph { height: 55vh; min-height: 360px; } }
  `;
  document.head.appendChild(style);
}

function installStatusLegend() {
  if (document.getElementById('holonStatusLegend')) return;
  const graph = document.getElementById('holonGraph');
  if (!graph?.parentElement) return;
  const legend = document.createElement('div');
  legend.id = 'holonStatusLegend';
  legend.className = 'holon-status-legend';
  legend.setAttribute('aria-label', 'Holon status colors');
  legend.innerHTML = `
    <span class="holon-status-key"><span class="holon-status-dot" style="background:#5b8def"></span>Current</span>
    <span class="holon-status-key"><span class="holon-status-dot" style="background:#facc15"></span>Proposed</span>
    <span class="holon-status-key"><span class="holon-status-dot" style="background:#22c55e"></span>Approved</span>
    <span class="holon-status-key"><span class="holon-status-dot" style="background:#ef4444"></span>Denied</span>
  `;
  graph.parentElement.insertBefore(legend, graph);
}

function relationshipLabel(relationship, relationshipTypes) {
  return relationship.relationship_type || relationship.relationship_type_name || relationshipTypes.find(type => type.id === relationship.relationship_type_id)?.name || 'relationship';
}

// Return every Holon within N relationship hops of the root.
// This is intentionally direction-agnostic: a relationship does not imply
// parent/child hierarchy. Direction remains visible on the Cytoscape edge,
// but traversal treats both endpoints as neighbors.
function relatedWithinDepth(rootId, holons, relationships) {
  if (!rootId) return holons;
  const root = String(rootId);
  if (!holons.some(holon => String(holon.id) === root)) return [];

  const distance = new Map([[root, 0]]);
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    const depth = distance.get(current);
    if (currentDepth !== 'all' && depth >= Number(currentDepth)) continue;

    for (const relationship of relationships) {
      const source = String(relationship.source_holon_id ?? '');
      const target = String(relationship.target_holon_id ?? '');
      let neighbor = null;

      if (source === current) neighbor = target;
      else if (target === current) neighbor = source;

      if (!neighbor || distance.has(neighbor)) continue;
      if (!holons.some(holon => String(holon.id) === neighbor)) continue;

      distance.set(neighbor, depth + 1);
      queue.push(neighbor);
    }
  }

  return holons.filter(holon => distance.has(String(holon.id)));
}

function isProvenanceHolon(holon) {
  const type = String(holon?.holon_type || holon?.holon_type_name || '').trim().toLowerCase();
  return type === 'provenance';
}

function visibleHolonsByProvenance(holons) {
  if (showProvenance) return holons;
  return holons.filter(holon => !isProvenanceHolon(holon));
}

function visibleModel() {
  const relatedHolons = relatedWithinDepth(currentRootId, currentModel.holons, currentModel.relationships);
  const holons = visibleHolonsByProvenance(relatedHolons);
  const ids = new Set(holons.map(holon => String(holon.id)));
  return {
    holons,
    relationships: currentModel.relationships.filter(r => ids.has(String(r.source_holon_id)) && ids.has(String(r.target_holon_id))),
    relationshipTypes: currentModel.relationshipTypes,
  };
}

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toLowerCase();
  if (value === 'proposed' || value === 'pending' || value === 'pending_review' || value === 'needs_review') return 'proposed';
  if (value === 'approved' || value === 'accepted') return 'approved';
  if (value === 'denied' || value === 'rejected') return 'denied';
  return 'current';
}

function buildElements(holons, relationships, relationshipTypes) {
  const nodes = holons.map(holon => ({ data: { id: String(holon.id), label: holon.name || '(unnamed)', type: holon.holon_type || 'Holon', holonId: holon.id, status: normalizeStatus(holon.status) } }));
  const edges = relationships.map(relationship => ({ data: { id: String(relationship.id), source: String(relationship.source_holon_id), target: String(relationship.target_holon_id), label: relationshipLabel(relationship, relationshipTypes), relationship } }));
  return [...nodes, ...edges];
}

function emitSelection(holon) { if (selectionHandler) selectionHandler(holon || null); window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon || null })); }

function graphParentId() {
  if (!currentRootId) return null;
  return currentModel.relationships.find(item => String(item.source_holon_id) === String(currentRootId))?.target_holon_id ?? null;
}

function updateNavigationButton() {
  const button = document.getElementById('graphUp');
  if (button) button.disabled = !graphParentId();
}

function navigateUp() {
  const parentId = graphParentId();
  if (!parentId) return false;
  currentRootId = String(parentId);
  const parent = currentModel.holons.find(item => String(item.id) === currentRootId);
  const control = document.getElementById('graphRoot');
  if (control) control.value = parent?.name || '';
  render();
  const node = cy?.nodes?.(`[id = "${currentRootId.replaceAll('"', '\\"')}"]`);
  node?.select();
  emitSelection(parent || null);
  updateNavigationButton();
  return true;
}

function installNavigation() {
  if (navigationInstalled) return;
  const filter = document.querySelector('.holarchy-filter');
  if (filter && !document.getElementById('graphUp')) {
    const button = document.createElement('button');
    button.id = 'graphUp';
    button.type = 'button';
    button.textContent = '↑ Up';
    button.title = 'Back up one Holon level (Backspace)';
    button.setAttribute('aria-label', 'Back up one Holon level');
    button.addEventListener('click', navigateUp);
    filter.appendChild(button);
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Backspace') return;
    const target = event.target;
    if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (navigateUp()) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  navigationInstalled = true;
  updateNavigationButton();
}

function closeContextMenu() {
  contextMenu?.remove();
  contextMenu = null;
}

function installContextMenu() {
  if (contextMenuCleanup) return;
  const container = document.getElementById('holonGraph');
  if (!container) return;
  const style = document.createElement('style');
  style.id = 'holon-graph-context-style';
  style.textContent = `
    .holon-context-menu { position: fixed; z-index: 10000; min-width: 170px; padding: 4px; border: 1px solid var(--eb-border-strong, #888); border-radius: 7px; background: var(--eb-input-bg, #fff); color: var(--eb-text, #222); box-shadow: 0 8px 24px rgba(0,0,0,.22); }
    .holon-context-menu button { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 4px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .holon-context-menu button:hover, .holon-context-menu button:focus-visible { background: var(--eb-border, #ddd); outline: none; }
    .holon-context-menu button.danger { color: #b91c1c; }
    .holon-context-menu .context-separator { height: 1px; margin: 4px 2px; background: var(--eb-border, #ddd); }
  `;
  document.head.appendChild(style);

  function showMenu(target, x, y) {
    closeContextMenu();
    const kind = target?.isNode?.() ? 'node' : target?.isEdge?.() ? 'edge' : 'background';
    const menu = document.createElement('div');
    menu.className = 'holon-context-menu';
    menu.setAttribute('role', 'menu');
    const add = (label, action, danger = false) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
      if (danger) button.classList.add('danger');
      button.addEventListener('click', () => { closeContextMenu(); action(); });
      menu.appendChild(button);
    };
    const separator = () => { const line = document.createElement('div'); line.className = 'context-separator'; menu.appendChild(line); };
    const holon = kind === 'node' ? currentModel.holons.find(item => String(item.id) === String(target.data('holonId'))) : null;
    const relationship = kind === 'edge' ? target.data('relationship') : null;
    if (kind === 'node' && holon) {
      add('Inspect Holon', () => emitSelection(holon));
      add('Set as Graph Root', () => { currentRootId = String(holon.id); const control = document.getElementById('graphRoot'); if (control) control.value = holon.name || ''; render(); target.select(); emitSelection(holon); });
      add('Create Holon Here', () => window.dispatchEvent(new CustomEvent('holon:contextcreate', { detail: { parent: holon } })));
      separator();
      add('Edit Holon', () => window.dispatchEvent(new CustomEvent('holon:contextedit', { detail: { holon } })));
      add('Delete Holon', () => window.dispatchEvent(new CustomEvent('holon:contextdelete', { detail: { holon } })), true);
    } else if (kind === 'edge' && relationship) {
      add('Inspect Relationship', () => window.dispatchEvent(new CustomEvent('relationship:selected', { detail: relationship })));
      add('Delete Relationship', () => window.dispatchEvent(new CustomEvent('relationship:contextdelete', { detail: { relationship } })), true);
    } else {
      add('New Holon', () => window.dispatchEvent(new CustomEvent('holon:contextcreate')));
    }
    document.body.appendChild(menu);
    contextMenu = menu;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
    menu.querySelector('button')?.focus();
  }

  const handler = event => { if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu(); };
  document.addEventListener('pointerdown', handler, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeContextMenu(); });
  contextMenuCleanup = () => { document.removeEventListener('pointerdown', handler, true); closeContextMenu(); style.remove(); contextMenuCleanup = null; };
  cy?.on('cxttap', event => showMenu(event.target === cy ? null : event.target, event.originalEvent?.clientX ?? event.renderedPosition.x, event.originalEvent?.clientY ?? event.renderedPosition.y));
}

function render() {
  if (!cy) return;
  const model = visibleModel();
  const elements = buildElements(model.holons, model.relationships, model.relationshipTypes);

  cy.batch(() => {
    cy.elements().remove();
    if (elements.length) cy.add(elements);
  });

  if (model.holons.length) {
    cy.layout({ name: 'cose', animate: false, fit: true, padding: 40 }).run();
    cy.fit(cy.nodes(), 40);
  }
  updateNavigationButton();
}

function installDepthControl() {
  if (depthListenerInstalled) return;
  const control = document.getElementById('graphDepth');
  if (!control) return;
  const persisted = readPersistedDepth();
  currentDepth = persisted || control.value || 2;
  control.value = String(currentDepth);
  control.addEventListener('change', () => {
    currentDepth = control.value || 2;
    persistDepth(currentDepth);
    render();
  });
  persistDepth(currentDepth);
  depthListenerInstalled = true;
}

function installProvenanceControl() {
  if (provenanceListenerInstalled) return;
  const control = document.getElementById('graphProvenance');
  if (!control) return;
  showProvenance = control.checked;
  control.addEventListener('change', () => { showProvenance = control.checked; render(); });
  provenanceListenerInstalled = true;
}

export function createHolonGraph({ element, holons, relationships, relationshipTypes = [], rootId = null, onSelect = null }) {
  if (!element) return null;
  if (!window.cytoscape) throw new Error('Cytoscape is not loaded');
  installStyles(); installStatusLegend(); installDepthControl(); installProvenanceControl(); installNavigation(); cy?.destroy(); closeContextMenu(); selectionHandler = onSelect;
  currentModel = { holons, relationships, relationshipTypes };
  currentRootId = rootId || null;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const surface = dark ? '#242424' : '#fff'; const text = dark ? '#eeeeee' : '#222'; const edge = dark ? '#aaaaaa' : '#777';
  const model = visibleModel();
  cy = window.cytoscape({ container: element, elements: buildElements(model.holons, model.relationships, model.relationshipTypes), layout: { name: 'cose', animate: false, fit: true, padding: 40 }, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.25, style: [
    { selector: 'node', style: { label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#5b8def', color: '#fff', 'font-size': 13, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 110, width: 'label', height: 'label', padding: '14px', shape: 'roundrectangle', 'border-width': 2, 'border-color': '#3769c5' } },
    { selector: 'node[status = "proposed"]', style: { 'background-color': '#facc15', 'border-color': '#a16207', color: '#222' } },
    { selector: 'node[status = "approved"]', style: { 'background-color': '#22c55e', 'border-color': '#15803d' } },
    { selector: 'node[status = "denied"]', style: { 'background-color': '#ef4444', 'border-color': '#b91c1c' } },
    { selector: 'node:selected', style: { 'border-color': '#f59e0b', 'border-width': 4 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', width: 2, 'line-color': edge, 'target-arrow-color': edge, 'target-arrow-shape': 'triangle', label: 'data(label)', color: text, 'font-size': 11, 'text-background-color': surface, 'text-background-opacity': 0.9, 'text-background-padding': 2 } },
    { selector: 'edge:selected', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', width: 3 } },
  ] });
  cy.on('tap', 'node', event => { const id = String(event.target.data('holonId')); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('dbltap', 'node', event => { const id = String(event.target.data('holonId')); if (!currentModel.holons.some(item => String(item.id) === id)) return; currentRootId = id; const control = document.getElementById('graphRoot'); if (control) control.value = currentModel.holons.find(item => String(item.id) === id)?.name || ''; render(); const node = cy.nodes(`[id = "${id.replaceAll('"', '\\"')}"]`); node.select(); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('click', 'node', event => { const id = String(event.target.data('holonId')); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('tap', event => { if (event.target === cy) emitSelection(null); });
  installContextMenu();
  updateNavigationButton();
  return cy;
}

export function setGraphRoot(rootId) {
  const normalized = rootId == null ? null : String(rootId).trim();
  currentRootId = normalized && currentModel.holons.some(holon => String(holon.id) === normalized) ? normalized : null;
  render();
}

export function getGraphRoot() { return currentRootId; }

export function getGraphParent() { return graphParentId(); }

export function setGraphDepth(depth) {
  currentDepth = depth || 'all';
  persistDepth(currentDepth);
  const control = document.getElementById('graphDepth');
  if (control) control.value = String(currentDepth);
  render();
}
export function setGraphProvenance(enabled) { showProvenance = Boolean(enabled); const control = document.getElementById('graphProvenance'); if (control) control.checked = showProvenance; render(); }
export function updateHolonGraph(model) { if (!cy) return; currentModel = model || { holons: [], relationships: [], relationshipTypes: [] }; if (currentRootId && !currentModel.holons.some(h => String(h.id) === String(currentRootId))) currentRootId = null; render(); }
export function destroyHolonGraph() { contextMenuCleanup?.(); cy?.destroy(); cy = null; currentRootId = null; selectionHandler = null; currentModel = { holons: [], relationships: [], relationshipTypes: [] }; }
export function getHolonGraph() { return cy; }
