// Holon Graph — visual model of Holons and their relationships.
// Cytoscape is kept as the rendering primitive; the app owns the Holon model.

let cy = null;
let currentModel = { holons: [], relationships: [], relationshipTypes: [] };
let currentRootId = null;
let currentDepth = 2;
let selectionHandler = null;
let depthListenerInstalled = false;
let navigationInstalled = false;

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

function descendants(rootId, holons, relationships) {
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
      if (String(relationship.target_holon_id) !== current) continue;
      const child = String(relationship.source_holon_id);
      if (distance.has(child)) continue;
      distance.set(child, depth + 1);
      queue.push(child);
    }
  }
  return holons.filter(holon => distance.has(String(holon.id)));
}

function visibleModel() {
  const holons = descendants(currentRootId, currentModel.holons, currentModel.relationships);
  const ids = new Set(holons.map(holon => String(holon.id)));
  return { holons, relationships: currentModel.relationships.filter(r => ids.has(String(r.source_holon_id)) && ids.has(String(r.target_holon_id))), relationshipTypes: currentModel.relationshipTypes };
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

function render() {
  if (!cy) return;
  const model = visibleModel();
  cy.elements().remove();
  cy.add(buildElements(model.holons, model.relationships, model.relationshipTypes));
  if (model.holons.length) cy.layout({ name: 'cose', animate: false, fit: true, padding: 40 }).run();
  updateNavigationButton();
}

function installDepthControl() {
  if (depthListenerInstalled) return;
  const control = document.getElementById('graphDepth');
  if (!control) return;
  currentDepth = control.value || 2;
  control.addEventListener('change', () => { currentDepth = control.value || 2; render(); });
  depthListenerInstalled = true;
}

export function createHolonGraph({ element, holons, relationships, relationshipTypes = [], rootId = null, onSelect = null }) {
  if (!element) return null;
  if (!window.cytoscape) throw new Error('Cytoscape is not loaded');
  installStyles(); installStatusLegend(); installDepthControl(); installNavigation(); cy?.destroy(); selectionHandler = onSelect;
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

export function setGraphDepth(depth) { currentDepth = depth || 'all'; render(); }
export function updateHolonGraph(model) { if (!cy) return; currentModel = model || { holons: [], relationships: [], relationshipTypes: [] }; if (currentRootId && !currentModel.holons.some(h => String(h.id) === String(currentRootId))) currentRootId = null; render(); }
export function destroyHolonGraph() { cy?.destroy(); cy = null; currentRootId = null; selectionHandler = null; currentModel = { holons: [], relationships: [], relationshipTypes: [] }; }
export function getHolonGraph() { return cy; }
