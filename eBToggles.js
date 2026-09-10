import { eBliss } from './eBSDK.js';
import { mountAppBar } from './eBAppBarInit.js';

// Feature definitions are the source of truth for labels and default modes.
// The database stores only user overrides, so changing a default affects users
// who have not explicitly overridden that feature.
export const toggleDefinitions = Object.freeze({
  'graph.key': { label: 'Graph key', default: true },
  'graph.hoverInfo': { label: 'Hover info', default: false },
  'graph.edgeHandles': { label: 'Edge handles', default: false, description: 'Experimental relationship creation' },
  'graph.fCoSE': { label: 'fCOSE layout', default: false, description: 'Experimental graph layout' },
  'graph.undoRedo': { label: 'Undo / redo', default: false, description: 'Experimental graph editing history' },
});

const userOverrides = Object.create(null);
let initialized = false;
let currentUserId = null;

function defaultState() {
  return Object.fromEntries(Object.entries(toggleDefinitions).map(([name, definition]) => [name, definition.default === true]));
}

function effectiveState() {
  const state = defaultState();
  for (const [name, enabled] of Object.entries(userOverrides)) {
    if (name in toggleDefinitions) state[name] = enabled === true;
  }
  return state;
}

function clearOverrides() {
  for (const key of Object.keys(userOverrides)) delete userOverrides[key];
}

export function toggledOn(name) {
  const key = String(name);
  const definition = toggleDefinitions[key];
  if (!definition) return false;
  if (Object.prototype.hasOwnProperty.call(userOverrides, key)) return userOverrides[key] === true;
  return definition.default === true;
}

function syncFeatureDom(name, enabled) {
  if (name !== 'graph.key') return;
  const legend = document.getElementById('holonStatusLegend');
  if (!legend) return;
  // The graph's legend has an explicit display:flex rule, which can override
  // the browser's default [hidden] rule. Use inline display so the feature
  // state is authoritative regardless of stylesheet order.
  legend.hidden = !enabled;
  legend.style.display = enabled ? '' : 'none';
}

export async function loadToggles(userId = null) {
  currentUserId = userId;
  clearOverrides();
  if (!userId) {
    syncFeatureDom('graph.key', toggledOn('graph.key'));
    return effectiveState();
  }
  const rows = await eBliss.toggles.list();
  for (const row of rows || []) {
    if (row?.feature_name in toggleDefinitions) userOverrides[row.feature_name] = row.enabled === true;
  }
  syncFeatureDom('graph.key', toggledOn('graph.key'));
  return effectiveState();
}

function notifyToggle(name, value, extra = {}) {
  syncFeatureDom(name, value);
  window.dispatchEvent(new CustomEvent('feature:toggle', { detail: { name, enabled: value, ...extra } }));
}

export async function setToggle(name, enabled) {
  const key = String(name);
  if (!(key in toggleDefinitions)) return false;
  if (!currentUserId) return toggledOn(key);
  const value = enabled === true;
  await eBliss.toggles.set(key, value);
  userOverrides[key] = value;
  notifyToggle(key, value);
  return value;
}

export async function resetToggle(name) {
  const key = String(name);
  if (!(key in toggleDefinitions)) return toggledOn(key);
  if (!currentUserId) return toggledOn(key);
  await eBliss.toggles.reset(key);
  delete userOverrides[key];
  const value = toggledOn(key);
  notifyToggle(key, value, { reset: true });
  return value;
}

function addToggleRow(panel, name, definition) {
  const row = document.createElement('label');
  row.className = 'eb-feature-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = toggledOn(name);
  checkbox.addEventListener('change', () => void setToggle(name, checkbox.checked).catch(error => {
    checkbox.checked = toggledOn(name);
    console.error(error);
  }));
  const text = document.createElement('span');
  text.textContent = definition.label;
  if (definition.description) text.title = definition.description;
  row.append(checkbox, text);
  panel.appendChild(row);
}

export async function initToggles() {
  if (initialized) return;
  initialized = true;
  await mountAppBar();
  const sessionResult = await eBliss.auth.getSession();
  const user = sessionResult?.data?.session?.user || null;
  await loadToggles(user?.id || null);
  const menu = document.querySelector('.eb-logo-menu-panel');
  if (menu) {
    const separator = document.createElement('div');
    separator.className = 'eb-menu-separator';
    const heading = document.createElement('strong');
    heading.className = 'eb-menu-label';
    heading.textContent = 'Features';
    menu.append(separator, heading);
    for (const [name, definition] of Object.entries(toggleDefinitions)) addToggleRow(menu, name, definition);
  }
  eBliss.auth.onAuthStateChange(async (_event, session) => {
    await loadToggles(session?.user?.id || null);
    window.dispatchEvent(new CustomEvent('features:loaded', { detail: effectiveState() }));
  });
}

export const eBToggles = Object.freeze({
  is: toggledOn,
  toggledOn,
  load: loadToggles,
  set: setToggle,
  reset: resetToggle,
  definitions: toggleDefinitions,
});