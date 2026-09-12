import { toggledOn } from './eBToggles.js';

// Holon Graph — visual model of Holons and their relationships.
// Cytoscape is kept as the rendering primitive; the app owns the Holon model.

let cy = null;
let renderGeneration = 0;
let currentModel = { holons: [], relationships: [], relationshipTypes: [] };
let currentRootId = null;
let currentDepth = 2;
let showProvenance = false;
let selectionHandler = null;
let depthListenerInstalled = false;
let provenanceListenerInstalled = false;
let navigationInstalled = false;
let featureToggleListenerInstalled = false;
let contextMenu = null;
let contextMenuCleanup = null;
let hoverPreview = null;

const GRAPH_DEPTH_STORAGE_KEY = 'eB-Holarchy.graphDepth';

function setGraphBusy(busy) {
    const graph = document.getElementById('holonGraph');
    if (!graph) return;

    graph.classList.toggle('is-busy', Boolean(busy));
    graph.setAttribute('aria-busy', busy ? 'true' : 'false');
}

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
    .holon-workspace {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .holon-workspace .panel-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
    }
    .graph-context {
        display: flex;
        align-items: center;
        gap: 7px; min-width: 240px; }
    .graph-context label {
        font-size: 13px;
        font-weight: 600;
    }
    .graph-context .hcg-autocomplete {
        flex: 1;
        min-width: 220px;
    }
    .panel-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .panel-actions button {
        padding: 6px 9px;
        border: 1px solid var(--eb-border-strong);
        border-radius: 5px;
        background: var(--eb-input-bg);
        color: var(--eb-text);
    }
    #graphUp { white-space: nowrap; }
    #holonGraph {
        position: relative;
        width: 100%; 
        height: calc(100vh - 190px);
        min-height: 480px;
        border: 1px solid var(--eb-border);
        border-radius: 6px;
        background: var(--eb-bg);
    }
    #holonGraph.is-busy {
        pointer-events: none;
    }

#holonGraph.is-busy::after {
  content: "Loading Holarchy…";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--eb-bg);
  color: var(--eb-text);
  font-size: 13px;
}
    .holon-status-legend { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 2px 0 8px; font-size: 11px; opacity: .9; }
    .holon-status-key { display: inline-flex; align-items: center; gap: 4px; }
    .holon-status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,.18); }
    .holon-hover-preview { position: fixed; z-index: 10001; max-width: 320px; padding: 9px 11px; border: 1px solid var(--eb-border-strong, #888); border-radius: 7px; background: var(--eb-input-bg, #fff); color: var(--eb-text, #222); box-shadow: 0 8px 24px rgba(0,0,0,.2); pointer-events: none; font-size: 12px; line-height: 1.4; }
    .holon-hover-preview[hidden] { display: none; }
    .holon-hover-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; overflow-wrap: anywhere; }
    .holon-hover-type { font-size: 11px; opacity: .68; margin-bottom: 6px; }
    .holon-hover-content { white-space: pre-wrap; overflow-wrap: anywhere; }
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

function syncFeatureToggles() {
  const legend = document.getElementById('holonStatusLegend');
  if (legend) legend.hidden = !toggledOn('graph.key');
  if (!toggledOn('graph.hoverInfo')) hideHoverPreview();
}

function installFeatureToggleListener() {
  if (featureToggleListenerInstalled) return;
  window.addEventListener('feature:toggle', event => {
    if (!event.detail?.name?.startsWith('graph.')) return;
    render();
  });
  window.addEventListener('features:loaded', () => render());
  featureToggleListenerInstalled = true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hoverContentFor(holon) {
  const value = holon?.content ?? holon?.description ?? holon?.body ?? holon?.summary ?? holon?.notes ?? '';
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > 240 ? `${text.slice(0, 237).trimEnd()}…` : text;
}

function hideHoverPreview() {
  if (hoverPreview) hoverPreview.hidden = true;
}

function showHoverPreview(holon, event) {
  if (!toggledOn('graph.hoverInfo') || !holon) return;
  if (!hoverPreview) {
    hoverPreview = document.createElement('div');
    hoverPreview.className = 'holon-hover-preview';
    hoverPreview.hidden = true;
    hoverPreview.setAttribute('role', 'tooltip');
    document.body.appendChild(hoverPreview);
  }
  const type = holon.holon_type || holon.holon_type_name || 'Holon';
  const content = hoverContentFor(holon);
  hoverPreview.innerHTML = `<div class="holon-hover-title">${escapeHtml(holon.name || '(unnamed)')}</div><div class="holon-hover-type">${escapeHtml(type)}</div>${content ? `<div class="holon-hover-content">${escapeHtml(content)}</div>` : ''}`;
  hoverPreview.hidden = false;
  const x = event.originalEvent?.clientX ?? event.renderedPosition?.x ?? 0;
  const y = event.originalEvent?.clientY ?? event.renderedPosition?.y ?? 0;
  const gap = 12;
  const rect = hoverPreview.getBoundingClientRect();
  hoverPreview.style.left = `${Math.min(x + gap, window.innerWidth - rect.width - 8)}px`;
  hoverPreview.style.top = `${Math.min(y + gap, window.innerHeight - rect.height - 8)}px`;
}

function installHoverPreview() {
  if (!cy) return;
  cy.on('mouseover', 'node', event => {
    const id = String(event.target.data('holonId'));
    const holon = currentModel.holons.find(item => String(item.id) === id);
    showHoverPreview(holon, event);
  });
  cy.on('mousemove', 'node', event => {
    if (!hoverPreview || hoverPreview.hidden || !toggledOn('graph.hoverInfo')) return;
    const x = event.originalEvent?.clientX ?? event.renderedPosition?.x ?? 0;
    const y = event.originalEvent?.clientY ?? event.renderedPosition?.y ?? 0;
    const rect = hoverPreview.getBoundingClientRect();
    hoverPreview.style.left = `${Math.min(x + 12, window.innerWidth - rect.width - 8)}px`;
    hoverPreview.style.top = `${Math.min(y + 12, window.innerHeight - rect.height - 8)}px`;
  });
  cy.on('mouseout', 'node', hideHoverPreview);
  cy.on('tap', hideHoverPreview);
  cy.on('pan zoom', hideHoverPreview);
}

function relationshipLabel(relationship, relationshipTypes) {
  return relationship.relationship_type || relationship.relationship_type_name || relationshipTypes.find(type => type.id === relationship.relationship_type_id)?.name || 'relationship';
}

function relatedWithinDepth(rootId, holons, relationships) {
  if (!rootId) return holons;
  const root = String(rootId);
  const holonIds = new Set(holons.map(holon => String(holon.id)));
  if (!holonIds.has(root)) return [];
  const neighbors = new Map();
  const connect = (from, to) => {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push(to);
  };
  for (const relationship of relationships) {
    const source = String(relationship.source_holon_id ?? '');
    const target = String(relationship.target_holon_id ?? '');
    if (!source || !target) continue;
    connect(source, target);
    connect(target, source);
  }
  const distance = new Map([[root, 0]]);
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const depth = distance.get(current);
    if (currentDepth !== 'all' && depth >= Number(currentDepth)) continue;
    for (const neighbor of neighbors.get(current) || []) {
      if (distance.has(neighbor) || !holonIds.has(neighbor)) continue;
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
    .holon-context-menu { position: fixed; z-index: 10002; min-width: 170px; padding: 4px; border: 1px solid var(--eb-border-strong, #888); border-radius: 7px; background: var(--eb-input-bg, #fff); color: var(--eb-text, #222); box-shadow: 0 8px 24px rgba(0,0,0,.22); }
    .holon-context-menu button { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 4px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .holon-context-menu button:hover, .holon-context-menu button:focus-visible { background: var(--eb-border, #ddd); outline: none; }
    .holon-context-menu button.danger { color: #b91c1c; }
    .holon-context-menu .context-separator { height: 1px; margin: 4px 2px; background: var(--eb-border, #ddd); }
  `;
  document.head.appendChild(style);
  function showMenu(target, x, y) {
    hideHoverPreview();
    closeContextMenu();
    const kind = target?.isNode?.() ? 'node' : target?.isEdge?.() ? 'edge' : 'background';
    const menu = document.createElement('div');
    menu.className = 'holon-context-menu';
    menu.setAttribute('role', 'menu');
    const add = (label, action, danger = false) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
      if (danger) button.classList.add('danger');
      button.addEventListener('click', event => { closeContextMenu(); action(event); });
      menu.appendChild(button);
    };
    const separator = () => { const line = document.createElement('div'); line.className = 'context-separator'; menu.appendChild(line); };
    const holon = kind === 'node' ? currentModel.holons.find(item => String(item.id) === String(target.data('holonId'))) : null;
    const relationship = kind === 'edge' ? target.data('relationship') : null;
    if (kind === 'node' && holon) {
      add('Inspect Holon', () => emitSelection(holon));
      add('Set as Graph Root', () => { currentRootId = String(holon.id); const control = document.getElementById('graphRoot'); if (control) control.value = holon.name || ''; render(); target.select(); emitSelection(holon); });
      add('Create Holon Here', () => window.dispatchEvent(new CustomEvent('holon:contextcreate', { detail: { parent: holon } })));
      add('New Relationship', () => document.getElementById('newRelationship')?.click());
      separator();
      add('Edit Holon', () => window.dispatchEvent(new CustomEvent('holon:contextedit', { detail: { holon } })));
      add('Delete Holon', () => window.dispatchEvent(new CustomEvent('holon:contextdelete', { detail: { holon } })), true);
    } else if (kind === 'edge' && relationship) {
      add('Inspect Relationship', () => window.dispatchEvent(new CustomEvent('relationship:selected', { detail: relationship })));
      add('Delete Relationship', event => {
        if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
        window.dispatchEvent(new CustomEvent('relationship:contextdelete', { detail: { relationship, x: event.detail ? event.clientX : x, y: event.detail ? event.clientY : y, returnFocus: container } }));
      }, true);
    } else {
      add('New Holon', () => window.dispatchEvent(new CustomEvent('holon:contextcreate')));
    }
    menu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 180)}px`;
    document.body.appendChild(menu);
    contextMenu = menu;
  }
  const onContext = event => {
    event.preventDefault();
    const rendered = event.position || { x: 0, y: 0 };
    const target = cy?.getElementById?.(event.target?.data?.('id')) || (event.target?.isNode?.() || event.target?.isEdge?.() ? event.target : null);
    showMenu(target, event.originalEvent?.clientX ?? rendered.x, event.originalEvent?.clientY ?? rendered.y);
  };
  cy?.on('cxttap', onContext);
  const onDocumentClick = event => { if (!contextMenu?.contains(event.target)) closeContextMenu(); };
  document.addEventListener('click', onDocumentClick);
  const onDocumentContext = event => { if (!container.contains(event.target)) closeContextMenu(); };
  document.addEventListener('contextmenu', onDocumentContext);
  contextMenuCleanup = () => {
    cy?.off('cxttap', onContext);
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('contextmenu', onDocumentContext);
    closeContextMenu();
  };
}

function installGraphInteractions() {
  if (!cy) return;
  cy.on('tap', 'node', event => {
    const holon = currentModel.holons.find(item => String(item.id) === String(event.target.data('holonId')));
    emitSelection(holon || null);
  });
  cy.on('dbltap', 'node', event => {
    const holon = currentModel.holons.find(item => String(item.id) === String(event.target.data('holonId')));
    if (!holon) return;
    currentRootId = String(holon.id);
    const control = document.getElementById('graphRoot');
    if (control) control.value = holon.name || '';
    render();
    const node = cy?.nodes?.(`[id = "${currentRootId.replaceAll('"', '\\"')}"]`);
    node?.select();
    emitSelection(holon);
    updateNavigationButton();
  });
  cy.on('tap', 'edge', event => {
    const relationship = event.target.data('relationship');
    if (relationship) window.dispatchEvent(new CustomEvent('relationship:selected', { detail: relationship }));
  });
  cy.on('mouseover', 'edge', event => { if (toggledOn('graph.hoverInfo')) event.target.style('overlay-opacity', 0.08); });
  cy.on('mouseout', 'edge', event => { event.target.style('overlay-opacity', 0); });
}

function render() {
    if (!cy) return;

    const generation = ++renderGeneration;
    setGraphBusy(true);

    const model = visibleModel();

    cy.elements().remove();
    cy.add(buildElements(model.holons, model.relationships, model.relationshipTypes));

    cy.one('layoutstop', () => {
        if (generation === renderGeneration) {
            setGraphBusy(false);
        }
    });

    cy.layout({
        name: 'cose',
        animate: false
    }).run();

    syncFeatureToggles();
    updateNavigationButton();
}

export function createHolonGraph({ element, holons = [], relationships = [], relationshipTypes = [], onSelect } = {}) {
  installStyles();
  installStatusLegend();
  installFeatureToggleListener();
  if (!element) return null;
  if (!cy) {
    cy = window.cytoscape({ container: element, elements: [], style: [
      { selector: 'node', style: { 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#5b8def', 'color': '#fff', 'font-size': 11, 'width': 42, 'height': 42, 'text-wrap': 'wrap', 'text-max-width': 70 } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'line-color': '#999', 'target-arrow-color': '#999', 'width': 2, 'label': 'data(label)', 'font-size': 9, 'text-background-color': '#fff', 'text-background-opacity': 0.7, 'text-background-padding': 2 } },
      { selector: ':selected', style: { 'overlay-color': '#f59e0b', 'overlay-opacity': 0.18, 'overlay-padding': 5 } },
    ] });
    installHoverPreview();
    installNavigation();
    installGraphInteractions();
    installContextMenu();
  }
  currentModel = { holons, relationships, relationshipTypes };
  selectionHandler = onSelect || selectionHandler;
  render();
  return cy;
}

export function updateHolonGraph({ holons = [], relationships = [], relationshipTypes = [], rootId } = {}) {
  currentModel = { holons, relationships, relationshipTypes };
  if (rootId !== undefined) currentRootId = rootId ? String(rootId) : null;
  render();
}

export function destroyHolonGraph() {
    renderGeneration += 1;
    setGraphBusy(false);

    contextMenuCleanup?.();
    contextMenuCleanup = null;
    hideHoverPreview();
    if (cy) cy.destroy();
    cy = null;
}

export function setGraphRoot(rootId) {
  currentRootId = rootId ? String(rootId) : null;
  persistDepth(currentDepth);
  render();
}

export function setGraphDepth(depth) {
  currentDepth = depth === 'all' ? 'all' : Number(depth) || 2;
  persistDepth(currentDepth);
  render();
}

export function setShowProvenance(value) {
  showProvenance = Boolean(value);
  render();
}

export function getHolonGraph() { return cy; }
