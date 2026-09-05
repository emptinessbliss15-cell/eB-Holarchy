// Holon Graph — visual model of Holons and their relationships.
// Cytoscape is kept as the rendering primitive; the app owns the Holon model.

let cy = null;
let currentModel = { holons: [], relationships: [], relationshipTypes: [] };
let currentRootId = null;
let currentDepth = 2;
let selectionHandler = null;
let depthListenerInstalled = false;

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
    #holonGraph { width: 100%; height: calc(100vh - 190px); min-height: 480px; border: 1px solid var(--eb-border); border-radius: 6px; background: var(--eb-bg); }
    @media (max-width: 760px) { .graph-context { min-width: 0; flex: 1; } .graph-context .hcg-autocomplete { min-width: 0; } #holonGraph { height: 55vh; min-height: 360px; } }
  `;
  document.head.appendChild(style);
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

function buildElements(holons, relationships, relationshipTypes) {
  const nodes = holons.map(holon => ({ data: { id: String(holon.id), label: holon.name || '(unnamed)', type: holon.holon_type || 'Holon', holonId: holon.id } }));
  const edges = relationships.map(relationship => ({ data: { id: String(relationship.id), source: String(relationship.source_holon_id), target: String(relationship.target_holon_id), label: relationshipLabel(relationship, relationshipTypes), relationship } }));
  return [...nodes, ...edges];
}

function emitSelection(holon) { if (selectionHandler) selectionHandler(holon || null); window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon || null })); }

function render() {
  if (!cy) return;
  const model = visibleModel();
  cy.elements().remove();
  cy.add(buildElements(model.holons, model.relationships, model.relationshipTypes));
  if (model.holons.length) cy.layout({ name: 'cose', animate: false, fit: true, padding: 40 }).run();
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
  installStyles(); installDepthControl(); cy?.destroy(); selectionHandler = onSelect;
  currentModel = { holons, relationships, relationshipTypes };
  currentRootId = rootId || null;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const surface = dark ? '#242424' : '#fff'; const text = dark ? '#eeeeee' : '#222'; const edge = dark ? '#aaaaaa' : '#777';
  const model = visibleModel();
  cy = window.cytoscape({ container: element, elements: buildElements(model.holons, model.relationships, model.relationshipTypes), layout: { name: 'cose', animate: false, fit: true, padding: 40 }, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.25, style: [
    { selector: 'node', style: { label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#5b8def', color: '#fff', 'font-size': 13, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 110, width: 'label', height: 'label', padding: '14px', shape: 'roundrectangle', 'border-width': 2, 'border-color': '#3769c5' } },
    { selector: 'node:selected', style: { 'background-color': '#f59e0b', 'border-color': '#b45309', 'border-width': 3 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', width: 2, 'line-color': edge, 'target-arrow-color': edge, 'target-arrow-shape': 'triangle', label: 'data(label)', color: text, 'font-size': 11, 'text-background-color': surface, 'text-background-opacity': 0.9, 'text-background-padding': 2 } },
    { selector: 'edge:selected', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', width: 3 } },
  ] });
  cy.on('tap', 'node', event => { const id = String(event.target.data('holonId')); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('dbltap', 'node', event => { const id = String(event.target.data('holonId')); if (!currentModel.holons.some(item => String(item.id) === id)) return; currentRootId = id; const control = document.getElementById('graphRoot'); if (control) control.value = currentModel.holons.find(item => String(item.id) === id)?.name || ''; render(); const node = cy.nodes(`[id = \"${id.replaceAll('"', '\\\"')}\"]`); node.select(); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('click', 'node', event => { const id = String(event.target.data('holonId')); emitSelection(currentModel.holons.find(item => String(item.id) === id) || null); });
  cy.on('tap', event => { if (event.target === cy) emitSelection(null); });
  return cy;
}

export function setGraphRoot(rootId) {
  const normalized = rootId == null ? null : String(rootId).trim();
  currentRootId = normalized && currentModel.holons.some(holon => String(holon.id) === normalized) ? normalized : null;
  render();
}

export function getGraphRoot() { return currentRootId; }

export function getGraphParent() {
  if (!currentRootId) return null;
  const relationship = currentModel.relationships.find(item => String(item.source_holon_id) === String(currentRootId));
  return relationship?.target_holon_id ?? null;
}

export function setGraphDepth(depth) { currentDepth = depth || 'all'; render(); }
export function updateHolonGraph(model) { if (!cy) return; currentModel = model || { holons: [], relationships: [], relationshipTypes: [] }; if (currentRootId && !currentModel.holons.some(h => String(h.id) === String(currentRootId))) currentRootId = null; render(); }
export function destroyHolonGraph() { cy?.destroy(); cy = null; currentRootId = null; selectionHandler = null; currentModel = { holons: [], relationships: [], relationshipTypes: [] }; }
export function getHolonGraph() { return cy; }
