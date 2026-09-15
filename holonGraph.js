import { toggledOn } from './eBToggles.js';
import { eBPreferences } from './eBPreferences.js';

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
let graphInteractionsCleanup = null;
let hoverPreview = null;
let viewportResizeObserver = null;
let viewportResizeFrame = 0;
let singleClickTimer = 0;
let hiddenNodeIds = new Set();
let hiddenRelationshipIds = new Set();
let graphDisplayMode = 'edges';
let nestingRelationshipTypeIds = new Set();
let nestingContainerShape = 'circles';
let nestingReport = { nestedCount: 0, conflicts: [], cycles: [] };
let hiddenPreferencesInstalled = false;

const GRAPH_DEPTH_STORAGE_KEY = 'eB-Holarchy.graphDepth';
const GRAPH_HIDDEN_STORAGE_KEY = 'eB-Governance.graphHidden';

function restorePersistedHidden() {
  try {
    const saved = JSON.parse(localStorage.getItem(GRAPH_HIDDEN_STORAGE_KEY) || '{}');
    hiddenNodeIds = new Set((saved.nodes || []).map(String));
    hiddenRelationshipIds = new Set((saved.relationships || []).map(String));
  } catch (_) {
    hiddenNodeIds = new Set();
    hiddenRelationshipIds = new Set();
  }
}

function hiddenState() {
  return {
    nodes: [...hiddenNodeIds],
    relationships: [...hiddenRelationshipIds],
    configured: true,
  };
}

function persistHiddenLocally() {
  try {
    localStorage.setItem(GRAPH_HIDDEN_STORAGE_KEY, JSON.stringify(hiddenState()));
  } catch (_) {}
}

function persistHidden() {
  persistHiddenLocally();
  eBPreferences.schedule('graph.hidden', hiddenState(), { errorMessage: 'Unable to save hidden graph items' });
}

async function loadProfileHidden() {
  const remote = await eBPreferences.get('graph.hidden');
  if (remote && typeof remote === 'object' && remote.configured === true) {
    hiddenNodeIds = new Set((remote.nodes || []).map(String));
    hiddenRelationshipIds = new Set((remote.relationships || []).map(String));
    pruneHiddenToModel();
    persistHiddenLocally();
  } else {
    await eBPreferences.set('graph.hidden', hiddenState());
  }
  render();
}

function installHiddenPreferences() {
  if (hiddenPreferencesInstalled) return;
  hiddenPreferencesInstalled = true;
  window.addEventListener('preferences:profileChanged', () => {
    void loadProfileHidden().catch(error => window.ebStatus?.error?.(error?.message || 'Unable to load hidden graph items'));
  });
  void loadProfileHidden().catch(error => window.ebStatus?.error?.(error?.message || 'Unable to load hidden graph items'));
}

function pruneHiddenToModel() {
  if (!currentModel.holons.length && !currentModel.relationships.length) return;
  const nodeIds = new Set(currentModel.holons.map(holon => String(holon.id)));
  const relationshipIds = new Set(currentModel.relationships.map(relationship => String(relationship.id)));
  const nextNodes = new Set([...hiddenNodeIds].filter(id => nodeIds.has(id)));
  const nextRelationships = new Set([...hiddenRelationshipIds].filter(id => relationshipIds.has(id)));
  if (nextNodes.size === hiddenNodeIds.size && nextRelationships.size === hiddenRelationshipIds.size) return;
  hiddenNodeIds = nextNodes;
  hiddenRelationshipIds = nextRelationships;
  persistHidden();
}

restorePersistedHidden();

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
    #graphUp {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        min-height: 30px;
        padding: 3px 8px;
        white-space: nowrap;
        border: 0;
        border-left: 1px solid var(--eb-border, #ccc);
        background: transparent;
        color: var(--eb-text, #222);
    }
    #graphUp:disabled { opacity: .45; cursor: default; }
    #holonGraph {
        position: relative;
        width: 100%; 
        height: var(--eb-graph-viewport-height, calc(100dvh - 190px));
        min-height: 0;
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
    .holon-hover-nesting { margin-bottom: 6px; font-size: 11px; color: #2563eb; }
    .holon-hover-content { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 760px) { .graph-context { min-width: 0; flex: 1; } .graph-context .hcg-autocomplete { min-width: 0; } }
  `;
  document.head.appendChild(style);
}

function fitGraphToViewport() {
  const graph = document.getElementById('holonGraph');
  if (!graph || graph.hidden || !graph.offsetParent) return;
  const viewportHeight = window.visualViewport?.height || document.documentElement.clientHeight;
  const top = graph.getBoundingClientRect().top;
  const bottomGap = 12;
  const availableHeight = Math.max(0, Math.floor(viewportHeight - top - bottomGap));
  graph.style.setProperty('--eb-graph-viewport-height', `${availableHeight}px`);
  cy?.resize?.();
}

function scheduleGraphViewportFit() {
  cancelAnimationFrame(viewportResizeFrame);
  viewportResizeFrame = requestAnimationFrame(fitGraphToViewport);
}

function installViewportSizing() {
  if (viewportResizeObserver) return;
  window.addEventListener('resize', scheduleGraphViewportFit);
  window.visualViewport?.addEventListener('resize', scheduleGraphViewportFit);
  viewportResizeObserver = new ResizeObserver(scheduleGraphViewportFit);
  [
    document.getElementById('header'),
    document.getElementById('status'),
    document.querySelector('#app > .eb-operating-nav'),
    document.querySelector('.workspace-grids'),
    document.querySelector('.holarchy-heading'),
  ].filter(Boolean).forEach(element => viewportResizeObserver.observe(element));
  scheduleGraphViewportFit();
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
  const value = holon?.Content ?? holon?.content ?? holon?.description ?? holon?.body ?? holon?.summary ?? holon?.notes ?? '';
  let text = String(value ?? '').trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const lines = [];
        const legacyContent = String(parsed._legacyContent ?? '').trim();
        if (legacyContent) lines.push(legacyContent);
        for (const [fieldId, fieldValue] of Object.entries(parsed._eBFields || {})) {
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') continue;
          const field = currentModel.holons.find(item => String(item.id) === String(fieldId));
          const label = field?.name || 'Field';
          const displayValue = typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : String(fieldValue);
          lines.push(`${label}: ${displayValue}`);
        }
        for (const [key, itemValue] of Object.entries(parsed)) {
          if (key.startsWith('_') || itemValue === null || itemValue === undefined || itemValue === '') continue;
          const label = key.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
          const displayValue = typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue);
          lines.push(`${label}: ${displayValue}`);
        }
        text = lines.join('\n');
      }
    } catch { /* Plain text which happens to begin with a brace. */ }
  }
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
  const nestingReason = event.target?.data?.('nestingReason') || '';
  hoverPreview.innerHTML = `<div class="holon-hover-title">${escapeHtml(holon.name || '(unnamed)')}</div><div class="holon-hover-type">${escapeHtml(type)}</div>${nestingReason ? `<div class="holon-hover-nesting">${escapeHtml(nestingReason)}</div>` : ''}${content ? `<div class="holon-hover-content">${escapeHtml(content)}</div>` : ''}`;
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
  const holons = visibleHolonsByProvenance(relatedHolons).filter(holon => !hiddenNodeIds.has(String(holon.id)));
  const ids = new Set(holons.map(holon => String(holon.id)));
  return {
    holons,
    relationships: currentModel.relationships.filter(r => !hiddenRelationshipIds.has(String(r.id)) && ids.has(String(r.source_holon_id)) && ids.has(String(r.target_holon_id))),
    relationshipTypes: currentModel.relationshipTypes,
  };
}

function adjacencyWithout(relationshipId = null) {
  const neighbors = new Map();
  const connect = (from, to, edgeId) => {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push({ id: to, edgeId });
  };
  for (const relationship of currentModel.relationships) {
    const edgeId = String(relationship.id);
    if (edgeId === String(relationshipId ?? '') || hiddenRelationshipIds.has(edgeId)) continue;
    const source = String(relationship.source_holon_id || '');
    const target = String(relationship.target_holon_id || '');
    if (!source || !target || hiddenNodeIds.has(source) || hiddenNodeIds.has(target)) continue;
    connect(source, target, edgeId);
    connect(target, source, edgeId);
  }
  return neighbors;
}

function connectedIds(startId, relationshipId = null) {
  const start = String(startId || '');
  if (!start) return new Set();
  const neighbors = adjacencyWithout(relationshipId);
  const found = new Set([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of neighbors.get(queue[cursor]) || []) {
      if (found.has(neighbor.id)) continue;
      found.add(neighbor.id);
      queue.push(neighbor.id);
    }
  }
  return found;
}

function shortestPathToRoot(startId) {
  if (!currentRootId || String(startId) === String(currentRootId)) return [];
  const start = String(startId);
  const root = String(currentRootId);
  const neighbors = adjacencyWithout();
  const previous = new Map([[start, null]]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (id === root) break;
    for (const neighbor of neighbors.get(id) || []) {
      if (previous.has(neighbor.id)) continue;
      previous.set(neighbor.id, { id, edgeId: neighbor.edgeId });
      queue.push(neighbor.id);
    }
  }
  if (!previous.has(root)) return [];
  const path = [];
  let id = root;
  while (id !== start) {
    const step = previous.get(id);
    path.push({ from: step.id, to: id, edgeId: step.edgeId });
    id = step.id;
  }
  return path.reverse();
}

function directedBranchIds(startId) {
  const found = new Set([String(startId)]);
  const queue = [String(startId)];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor];
    for (const relationship of currentModel.relationships) {
      if (hiddenRelationshipIds.has(String(relationship.id))) continue;
      if (String(relationship.target_holon_id) !== parentId) continue;
      const childId = String(relationship.source_holon_id || '');
      if (!childId || found.has(childId)) continue;
      found.add(childId);
      queue.push(childId);
    }
  }
  return found;
}

function applyHidden() {
  persistHidden();
  closeContextMenu();
  render();
}

function hideNode(id) {
  hiddenNodeIds.add(String(id));
  applyHidden();
}

function hideNodeBranch(id) {
  const nodeId = String(id);
  const path = shortestPathToRoot(nodeId);
  if (!path.length) {
    directedBranchIds(nodeId).forEach(value => hiddenNodeIds.add(value));
  } else {
    const cutEdgeId = path[0].edgeId;
    connectedIds(nodeId, cutEdgeId).forEach(value => hiddenNodeIds.add(value));
    hiddenRelationshipIds.add(String(cutEdgeId));
  }
  applyHidden();
}

function hideRelationshipBranch(relationship) {
  const edgeId = String(relationship.id);
  const sourceIds = connectedIds(relationship.source_holon_id, edgeId);
  const targetIds = connectedIds(relationship.target_holon_id, edgeId);
  hiddenRelationshipIds.add(edgeId);
  if ([...sourceIds].some(id => targetIds.has(id))) return applyHidden();
  let branch;
  if (currentRootId && sourceIds.has(String(currentRootId))) branch = targetIds;
  else if (currentRootId && targetIds.has(String(currentRootId))) branch = sourceIds;
  else branch = sourceIds.size <= targetIds.size ? sourceIds : targetIds;
  branch.forEach(id => hiddenNodeIds.add(id));
  applyHidden();
}

function restoreHidden() {
  hiddenNodeIds.clear();
  hiddenRelationshipIds.clear();
  applyHidden();
}

function hiddenCount() {
  return hiddenNodeIds.size + hiddenRelationshipIds.size;
}

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toLowerCase();
  if (value === 'proposed' || value === 'pending' || value === 'pending_review' || value === 'needs_review') return 'proposed';
  if (value === 'approved' || value === 'accepted') return 'approved';
  if (value === 'denied' || value === 'rejected') return 'denied';
  return 'current';
}

function nestingAssignments(holons, relationships, relationshipTypes) {
  const nodeIds = new Set(holons.map(holon => String(holon.id)));
  const candidates = new Map();
  const relationshipByChild = new Map();

  for (const relationship of relationships) {
    if (!nestingRelationshipTypeIds.has(String(relationship.relationship_type_id))) continue;
    const childId = String(relationship.source_holon_id);
    const parentId = String(relationship.target_holon_id);
    if (!nodeIds.has(childId) || !nodeIds.has(parentId) || childId === parentId) continue;
    if (!candidates.has(childId)) candidates.set(childId, new Set());
    candidates.get(childId).add(parentId);
    if (!relationshipByChild.has(childId)) relationshipByChild.set(childId, []);
    relationshipByChild.get(childId).push(relationship);
  }

  const parents = new Map();
  const conflicts = [];
  for (const [childId, parentIds] of candidates) {
    if (parentIds.size === 1) parents.set(childId, [...parentIds][0]);
    else conflicts.push({ childId, parentIds: [...parentIds] });
  }

  const cycleIds = new Set();
  for (const childId of parents.keys()) {
    const path = [];
    const positions = new Map();
    let currentId = childId;
    while (parents.has(currentId)) {
      if (positions.has(currentId)) {
        path.slice(positions.get(currentId)).forEach(id => cycleIds.add(id));
        break;
      }
      positions.set(currentId, path.length);
      path.push(currentId);
      currentId = parents.get(currentId);
    }
  }
  cycleIds.forEach(id => parents.delete(id));

  const nestedRelationshipIds = new Set();
  const reasons = new Map();
  const names = new Map(holons.map(holon => [String(holon.id), holon.name || '(unnamed)']));
  for (const [childId, parentId] of parents) {
    for (const relationship of relationshipByChild.get(childId) || []) {
      if (String(relationship.target_holon_id) === parentId) {
        nestedRelationshipIds.add(String(relationship.id));
        if (!reasons.has(childId)) reasons.set(childId, `Nested in ${names.get(parentId)} because: ${relationshipLabel(relationship, relationshipTypes)}`);
      }
    }
  }

  return {
    parents,
    reasons,
    nestedRelationshipIds,
    report: {
      nestedCount: parents.size,
      conflicts,
      cycles: [...cycleIds],
    },
  };
}

function buildElements(holons, relationships, relationshipTypes) {
  const nesting = graphDisplayMode === 'nested'
    ? nestingAssignments(holons, relationships, relationshipTypes)
    : { parents: new Map(), reasons: new Map(), nestedRelationshipIds: new Set(), report: { nestedCount: 0, conflicts: [], cycles: [] } };
  nestingReport = nesting.report;
  const nodes = holons.map(holon => ({ data: {
    id: String(holon.id),
    label: holon.name || '(unnamed)',
    type: holon.holon_type || 'Holon',
    holonId: holon.id,
    status: normalizeStatus(holon.status),
    containerShape: nestingContainerShape,
    nestingReason: nesting.reasons.get(String(holon.id)) || '',
    ...(nesting.parents.has(String(holon.id)) ? { parent: nesting.parents.get(String(holon.id)) } : {}),
  } }));
  const edges = relationships
    .filter(relationship => !nesting.nestedRelationshipIds.has(String(relationship.id)))
    .map(relationship => ({ data: { id: String(relationship.id), source: String(relationship.source_holon_id), target: String(relationship.target_holon_id), label: relationshipLabel(relationship, relationshipTypes), relationship } }));
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
    button.textContent = '↑';
    button.title = 'Back up one Holon level (Backspace)';
    button.setAttribute('aria-label', 'Back up one Holon level');
    button.addEventListener('click', navigateUp);
    filter.prepend(button);
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
      add('Inspect Node', () => emitSelection(holon));
      add('Set as Graph Root', () => { currentRootId = String(holon.id); const control = document.getElementById('graphRoot'); if (control) control.value = holon.name || ''; render(); target.select(); emitSelection(holon); });
      if (['company', 'circle'].includes(String(holon.holon_type || '').trim().toLowerCase())) add('Operate within', () => window.dispatchEvent(new CustomEvent('holon:operatewithin', { detail: { holon } })));
      add('Create Node Here', () => window.dispatchEvent(new CustomEvent('holon:contextcreate', { detail: { parent: holon } })));
      add('New Relationship', () => document.getElementById('newRelationship')?.click());
      add('Hide Node', () => hideNode(holon.id));
      add('Hide Branch', () => hideNodeBranch(holon.id));
      separator();
      add('Edit Node', () => window.dispatchEvent(new CustomEvent('holon:contextedit', { detail: { holon } })));
      add('Delete Node', () => window.dispatchEvent(new CustomEvent('holon:contextdelete', { detail: { holon } })), true);
    } else if (kind === 'edge' && relationship) {
      add('Inspect Relationship', () => window.dispatchEvent(new CustomEvent('relationship:selected', { detail: relationship })));
      add('Hide Relationship', () => { hiddenRelationshipIds.add(String(relationship.id)); applyHidden(); });
      add('Hide Connected Branch', () => hideRelationshipBranch(relationship));
      add('Delete Relationship', event => {
        if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
        window.dispatchEvent(new CustomEvent('relationship:contextdelete', { detail: { relationship, x: event.detail ? event.clientX : x, y: event.detail ? event.clientY : y, returnFocus: container } }));
      }, true);
    } else {
      add('New Node', () => window.dispatchEvent(new CustomEvent('holon:contextcreate')));
      if (hiddenCount()) add(`Restore Hidden (${hiddenCount()})`, restoreHidden);
    }
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    contextMenu = menu;
  }
  function targetAtClientPoint(clientX, clientY) {
    if (!cy) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const nodes = cy.nodes(':visible').filter(node => {
      const box = node.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
      return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
    });
    if (nodes.length) {
      return nodes.reduce((smallest, node) => {
        const box = node.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
        const smallestBox = smallest.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
        return box.w * box.h < smallestBox.w * smallestBox.h ? node : smallest;
      });
    }
    return null;
  }
  const onContext = event => {
    event.preventDefault();
    const rendered = event.position || { x: 0, y: 0 };
    const target = cy?.getElementById?.(event.target?.data?.('id')) || (event.target?.isNode?.() || event.target?.isEdge?.() ? event.target : null);
    showMenu(target, event.originalEvent?.clientX ?? rendered.x, event.originalEvent?.clientY ?? rendered.y);
  };
  cy?.on('cxttap', onContext);
  const onNativeContext = event => {
    event.preventDefault();
    event.stopPropagation();
    showMenu(targetAtClientPoint(event.clientX, event.clientY), event.clientX, event.clientY);
  };
  container.addEventListener('contextmenu', onNativeContext);
  const onDocumentClick = event => { if (!contextMenu?.contains(event.target)) closeContextMenu(); };
  document.addEventListener('click', onDocumentClick);
  const onDocumentContext = event => { if (!container.contains(event.target)) closeContextMenu(); };
  document.addEventListener('contextmenu', onDocumentContext);
  contextMenuCleanup = () => {
    cy?.off('cxttap', onContext);
    container.removeEventListener('contextmenu', onNativeContext);
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('contextmenu', onDocumentContext);
    closeContextMenu();
  };
}

function installGraphInteractions() {
  if (!cy || graphInteractionsCleanup) return;
  const setNodeAsRoot = node => {
    clearTimeout(singleClickTimer);
    singleClickTimer = 0;
    const holon = currentModel.holons.find(item => String(item.id) === String(node?.data?.('holonId')));
    if (!holon) return false;
    currentRootId = String(holon.id);
    const control = document.getElementById('graphRoot');
    if (control) control.value = holon.name || '';
    render();
    const renderedNode = cy?.nodes?.(`[id = "${currentRootId.replaceAll('"', '\\"')}"]`);
    renderedNode?.select();
    emitSelection(holon);
    updateNavigationButton();
    return true;
  };
  cy.on('tap', 'node', event => {
    const holon = currentModel.holons.find(item => String(item.id) === String(event.target.data('holonId')));
    clearTimeout(singleClickTimer);
    singleClickTimer = window.setTimeout(() => {
      singleClickTimer = 0;
      emitSelection(holon || null);
    }, 400);
  });
  cy.on('dbltap', 'node', event => {
    setNodeAsRoot(event.target);
  });
  const container = document.getElementById('holonGraph');
  const onNativeDoubleClick = event => {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nodes = cy.nodes(':visible').filter(item => {
      const box = item.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
      return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
    });
    const node = nodes.length ? nodes.reduce((smallest, item) => {
      const box = item.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
      const smallestBox = smallest.renderedBoundingBox({ includeLabels: true, includeOverlays: true });
      return box.w * box.h < smallestBox.w * smallestBox.h ? item : smallest;
    }) : null;
    if (!node?.length || !setNodeAsRoot(node)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  container?.addEventListener('dblclick', onNativeDoubleClick);
  graphInteractionsCleanup = () => {
    clearTimeout(singleClickTimer);
    singleClickTimer = 0;
    container?.removeEventListener('dblclick', onNativeDoubleClick);
    graphInteractionsCleanup = null;
  };
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
    window.dispatchEvent(new CustomEvent('holonGraph:nestingReport', { detail: nestingReport }));

    cy.one('layoutstop', () => {
        if (generation === renderGeneration) {
            if (graphDisplayMode === 'nested' && nestingContainerShape !== 'rounded') {
              cy.nodes(':parent').forEach(node => {
                const box = node.boundingBox({ includeLabels: false, includeOverlays: false });
                const size = Math.ceil(Math.max(box.w, box.h));
                node.style({ 'min-width': size, 'min-height': size });
              });
            }
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
  installViewportSizing();
  installHiddenPreferences();
  if (!element) return null;
  if (!cy) {
    cy = window.cytoscape({ container: element, elements: [], style: [
      { selector: 'node', style: { 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#5b8def', 'color': '#fff', 'font-size': 11, 'width': 42, 'height': 42, 'text-wrap': 'wrap', 'text-max-width': 70 } },
      { selector: '$node > node', style: { 'background-opacity': 0.18, 'border-width': 2, 'border-color': '#5b8def', 'padding': 24, 'text-valign': 'top', 'text-halign': 'center' } },
      { selector: '$node > node[containerShape = "rounded"]', style: { 'shape': 'roundrectangle' } },
      { selector: '$node > node[containerShape = "circles"]', style: { 'shape': 'ellipse' } },
      { selector: '$node > node[containerShape = "concentric"]', style: { 'shape': 'ellipse', 'background-opacity': 0.04, 'border-width': 3 } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'line-color': '#999', 'target-arrow-color': '#999', 'width': 2, 'label': 'data(label)', 'font-size': 9, 'text-background-color': '#fff', 'text-background-opacity': 0.7, 'text-background-padding': 2 } },
      { selector: ':selected', style: { 'overlay-color': '#f59e0b', 'overlay-opacity': 0.18, 'overlay-padding': 5 } },
    ] });
    installHoverPreview();
    installNavigation();
    installGraphInteractions();
    installContextMenu();
  }
  currentModel = { holons, relationships, relationshipTypes };
  pruneHiddenToModel();
  window.dispatchEvent(new CustomEvent('holonGraph:modelChanged', { detail: currentModel }));
  selectionHandler = onSelect || selectionHandler;
  render();
  return cy;
}

export function updateHolonGraph({ holons = [], relationships = [], relationshipTypes = [], rootId } = {}) {
  currentModel = { holons, relationships, relationshipTypes };
  pruneHiddenToModel();
  window.dispatchEvent(new CustomEvent('holonGraph:modelChanged', { detail: currentModel }));
  if (rootId !== undefined) currentRootId = rootId ? String(rootId) : null;
  render();
}

export function destroyHolonGraph() {
    renderGeneration += 1;
    setGraphBusy(false);

    contextMenuCleanup?.();
    contextMenuCleanup = null;
    graphInteractionsCleanup?.();
    cancelAnimationFrame(viewportResizeFrame);
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = null;
    window.removeEventListener('resize', scheduleGraphViewportFit);
    window.visualViewport?.removeEventListener('resize', scheduleGraphViewportFit);
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

export function setGraphDisplay({ mode = 'edges', relationshipTypeIds = [], containerShape = 'circles' } = {}) {
  graphDisplayMode = mode === 'nested' ? 'nested' : 'edges';
  nestingRelationshipTypeIds = new Set(relationshipTypeIds.map(String));
  nestingContainerShape = ['rounded', 'circles', 'concentric'].includes(containerShape) ? containerShape : 'circles';
  render();
}

export function getGraphDisplay() {
  return {
    mode: graphDisplayMode,
    relationshipTypeIds: [...nestingRelationshipTypeIds],
    containerShape: nestingContainerShape,
    report: nestingReport,
  };
}

export function getHolonGraphModel() {
  return currentModel;
}

export function getHolonGraph() { return cy; }
