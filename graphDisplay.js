import { eBPreferences } from './eBPreferences.js';
import { getGraphDisplay, getHolonGraphModel, setGraphDisplay } from './holonGraph.js';

const STORAGE_KEY = 'eB-Governance.graphDisplay';
const PROFILE_KEY = 'graph.display';
const DEFAULT_NESTING_NAMES = new Set([
  'circle of',
  'member of',
  'process within',
  'role of',
  'subcircle of',
  'tension within',
  'within',
]);

let state = loadLocalState();
let panel = null;
let reportElement = null;

function loadLocalState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      mode: stored.mode === 'nested' ? 'nested' : 'edges',
      relationshipTypeIds: Array.isArray(stored.relationshipTypeIds) ? stored.relationshipTypeIds.map(String) : [],
      containerShape: ['rounded', 'circles', 'concentric'].includes(stored.containerShape) ? stored.containerShape : 'circles',
      configured: stored.configured === true,
    };
  } catch {
    return { mode: 'edges', relationshipTypeIds: [], containerShape: 'circles', configured: false };
  }
}

function saveLocalState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function scheduleProfileSave() {
  eBPreferences.schedule(PROFILE_KEY, state, { errorMessage: 'Unable to save graph display settings' });
}

function defaultRelationshipTypeIds() {
  return (getHolonGraphModel().relationshipTypes || [])
    .filter(type => DEFAULT_NESTING_NAMES.has(String(type.name || '').trim().toLowerCase()))
    .map(type => String(type.id));
}

function ensureDefaults() {
  if (state.configured || !(getHolonGraphModel().relationshipTypes || []).length) return;
  state.relationshipTypeIds = defaultRelationshipTypeIds();
}

function applyState() {
  ensureDefaults();
  saveLocalState();
  setGraphDisplay({ mode: state.mode, relationshipTypeIds: state.relationshipTypeIds, containerShape: state.containerShape });
  document.querySelectorAll('[data-graph-display-mode]').forEach(button => {
    const selected = button.dataset.graphDisplayMode === state.mode;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[name="graphContainerShape"]').forEach(input => {
    input.checked = input.value === state.containerShape;
  });
}

async function loadProfileState() {
  const remote = await eBPreferences.get(PROFILE_KEY);
  if (remote && typeof remote === 'object') {
    state = {
      mode: remote.mode === 'nested' ? 'nested' : 'edges',
      relationshipTypeIds: Array.isArray(remote.relationshipTypeIds) ? remote.relationshipTypeIds.map(String) : [],
      containerShape: ['rounded', 'circles', 'concentric'].includes(remote.containerShape) ? remote.containerShape : 'circles',
      configured: remote.configured === true,
    };
  } else if (state.configured || state.mode === 'nested') {
    await eBPreferences.set(PROFILE_KEY, state);
  }
  applyState();
  renderRelationshipChoices();
}

function installStyles() {
  if (document.getElementById('eb-graph-display-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-graph-display-style';
  style.textContent = `
    .eb-graph-display-tools { position:absolute; right:86px; z-index:8; display:flex; min-height:30px; border:1px solid var(--eb-border-strong,#777); border-radius:6px; background:var(--eb-input-bg,#fff); color:var(--eb-text,#222); overflow:hidden; }
    .eb-graph-display-tools button { padding:5px 7px; border:0; border-left:1px solid var(--eb-border,#aaa); background:transparent; color:inherit; cursor:pointer; font-size:12px; }
    .eb-graph-display-tools button:first-child { border-left:0; }
    .eb-graph-display-tools button:hover, .eb-graph-display-tools button:focus-visible { background:var(--eb-hover,#eee); outline:none; }
    .eb-graph-display-tools button.is-active { background:#5b8def; color:#fff; }
    .eb-graph-display-panel { position:absolute; right:86px; z-index:9; width:min(320px,calc(100% - 20px)); padding:10px; overflow:auto; border:1px solid var(--eb-border-strong,#777); border-radius:8px; background:var(--eb-input-bg,#fff); color:var(--eb-text,#222); box-shadow:0 8px 24px rgba(0,0,0,.25); }
    .eb-graph-display-panel[hidden] { display:none; }
    .eb-graph-display-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; font-weight:700; }
    .eb-graph-display-head button { border:0; background:transparent; color:inherit; cursor:pointer; font-size:16px; }
    .eb-graph-display-help { margin:0 0 9px; font-size:11px; opacity:.75; }
    .eb-graph-display-shapes { display:flex; flex-wrap:wrap; gap:5px; margin:0 0 9px; padding:0 0 9px; border:0; border-bottom:1px solid var(--eb-border,#aaa); }
    .eb-graph-display-shapes legend { width:100%; padding:0; font-size:11px; font-weight:700; }
    .eb-graph-display-shapes label { display:flex; align-items:center; gap:3px; font-size:11px; }
    .eb-graph-display-types { display:grid; gap:3px; }
    .eb-graph-display-type { display:flex; align-items:center; gap:7px; padding:4px 5px; border-radius:4px; font-size:12px; cursor:pointer; }
    .eb-graph-display-type:hover { background:var(--eb-hover,#eee); }
    .eb-graph-display-report { margin-top:9px; padding-top:8px; border-top:1px solid var(--eb-border,#aaa); font-size:11px; }
    .eb-graph-display-report.is-warning { color:#b45309; font-weight:600; }
  `;
  document.head.appendChild(style);
}

function renderRelationshipChoices() {
  if (!panel) return;
  const container = panel.querySelector('.eb-graph-display-types');
  const types = [...(getHolonGraphModel().relationshipTypes || [])]
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  container.replaceChildren();
  for (const type of types) {
    const label = document.createElement('label');
    label.className = 'eb-graph-display-type';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.relationshipTypeIds.includes(String(type.id));
    checkbox.addEventListener('change', () => {
      const ids = new Set(state.relationshipTypeIds);
      if (checkbox.checked) ids.add(String(type.id));
      else ids.delete(String(type.id));
      state.relationshipTypeIds = [...ids];
      state.configured = true;
      applyState();
      scheduleProfileSave();
    });
    label.append(checkbox, document.createTextNode(type.name || '(unnamed relationship type)'));
    container.appendChild(label);
  }
}

function renderReport(report = getGraphDisplay().report) {
  if (!reportElement) return;
  const conflictCount = report.conflicts?.length || 0;
  const cycleCount = report.cycles?.length || 0;
  reportElement.classList.toggle('is-warning', conflictCount > 0 || cycleCount > 0);
  if (state.mode !== 'nested') {
    reportElement.textContent = 'Nested mode uses the checked relationship types as visual containment.';
  } else if (conflictCount || cycleCount) {
    const parts = [];
    if (conflictCount) parts.push(`${conflictCount} multiple-parent conflict${conflictCount === 1 ? '' : 's'}`);
    if (cycleCount) parts.push(`${cycleCount} node${cycleCount === 1 ? '' : 's'} in nesting cycles`);
    const model = getHolonGraphModel();
    const names = new Map((model.holons || []).map(holon => [String(holon.id), holon.name || '(unnamed)']));
    const examples = (report.conflicts || []).slice(0, 3).map(conflict => {
      const parents = conflict.parentIds.map(id => names.get(String(id)) || id).join(', ');
      return `${names.get(String(conflict.childId)) || conflict.childId} has parents: ${parents}`;
    });
    reportElement.textContent = `${parts.join(' and ')} remain visible as edges.${examples.length ? ` ${examples.join(' · ')}` : ''}`;
  } else {
    reportElement.textContent = `${report.nestedCount || 0} node${report.nestedCount === 1 ? '' : 's'} nested. No conflicts.`;
  }
}

function setMode(mode) {
  state.mode = mode === 'nested' ? 'nested' : 'edges';
  applyState();
  scheduleProfileSave();
}

export async function initGraphDisplay() {
  installStyles();
  const graph = document.getElementById('holonGraph');
  if (!graph?.parentElement || document.getElementById('graphDisplayTools')) return;

  const tools = document.createElement('div');
  tools.id = 'graphDisplayTools';
  tools.className = 'eb-graph-display-tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Graph display');
  for (const [mode, label] of [['edges', 'Edges'], ['nested', 'Nested']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.graphDisplayMode = mode;
    button.addEventListener('click', () => setMode(mode));
    tools.appendChild(button);
  }
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.textContent = '⚙';
  settingsButton.title = 'Choose which relationship types create nesting';
  settingsButton.setAttribute('aria-label', 'Configure nested relationships');
  tools.appendChild(settingsButton);

  panel = document.createElement('div');
  panel.className = 'eb-graph-display-panel';
  panel.hidden = true;
  panel.innerHTML = '<div class="eb-graph-display-head"><span>Nested Relationships</span><button type="button" aria-label="Close">×</button></div><p class="eb-graph-display-help">Checked relationship types place the source node inside the target node. Other relationships remain edges.</p><fieldset class="eb-graph-display-shapes"><legend>Container shape</legend><label><input type="radio" name="graphContainerShape" value="rounded">Rounded</label><label><input type="radio" name="graphContainerShape" value="circles">Circles</label><label><input type="radio" name="graphContainerShape" value="concentric">Concentric</label></fieldset><div class="eb-graph-display-types"></div><div class="eb-graph-display-report"></div>';
  panel.querySelector('.eb-graph-display-head button').addEventListener('click', () => { panel.hidden = true; });
  reportElement = panel.querySelector('.eb-graph-display-report');
  panel.querySelectorAll('[name="graphContainerShape"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.containerShape = input.value;
      applyState();
      scheduleProfileSave();
    });
  });
  settingsButton.addEventListener('click', () => { panel.hidden = !panel.hidden; });

  const graphPanel = graph.parentElement;
  graphPanel.append(tools, panel);
  const positionOverGraph = () => {
    const graphTop = graph.offsetTop;
    tools.style.top = `${graphTop + 10}px`;
    panel.style.top = `${graphTop + 46}px`;
    panel.style.maxHeight = `${Math.max(120, graph.clientHeight - 56)}px`;
  };
  positionOverGraph();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(positionOverGraph);
    observer.observe(graph);
  }

  window.addEventListener('holonGraph:modelChanged', () => {
    const wasConfigured = state.configured;
    ensureDefaults();
    renderRelationshipChoices();
    if (!wasConfigured) applyState();
  });
  window.addEventListener('holonGraph:nestingReport', event => renderReport(event.detail));
  window.addEventListener('preferences:profileChanged', () => {
    void loadProfileState().catch(error => window.ebStatus?.error?.(error?.message || 'Unable to load graph display settings'));
  });
  document.addEventListener('click', event => {
    if (panel.hidden || panel.contains(event.target) || tools.contains(event.target)) return;
    panel.hidden = true;
  });

  applyState();
  renderRelationshipChoices();
  renderReport();
  try { await loadProfileState(); }
  catch (error) { window.ebStatus?.error?.(error?.message || 'Unable to load graph display settings'); }
}
