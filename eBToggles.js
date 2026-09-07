import { eBliss } from './eBSDK.js';

const DEFAULTS = Object.freeze({
  'graph.key': true,
  'graph.hoverInfo': false,
  'graph.edgeHandles': false,
  'graph.fCoSE': false,
  'graph.undoRedo': false,
});
const state = Object.create(null);
let initialized = false;
let currentUserId = null;

function resetToDefaults() {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, DEFAULTS);
}

export function toggleDon(name) {
  return state[String(name)] === true;
}

export async function loadToggles(userId = null) {
  currentUserId = userId;
  resetToDefaults();
  if (!userId) return { ...state };
  const rows = await eBliss.toggles.list();
  for (const row of rows || []) state[row.feature_name] = row.enabled === true;
  return { ...state };
}

export async function setToggle(name, enabled) {
  if (!currentUserId) return false;
  const value = enabled === true;
  await eBliss.toggles.set(name, value);
  state[String(name)] = value;
  window.dispatchEvent(new CustomEvent('feature:toggle', { detail: { name: String(name), enabled: value } }));
  return value;
}

function addToggleRow(panel, name, label, description = '') {
  const row = document.createElement('label');
  row.className = 'eb-feature-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = toggleDon(name);
  checkbox.addEventListener('change', () => void setToggle(name, checkbox.checked).catch(error => {
    checkbox.checked = !checkbox.checked;
    console.error(error);
  }));
  const text = document.createElement('span');
  text.textContent = label;
  if (description) text.title = description;
  row.append(checkbox, text);
  panel.appendChild(row);
}

export async function initToggles() {
  if (initialized) return;
  initialized = true;
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
    addToggleRow(menu, 'graph.key', 'Graph key');
    addToggleRow(menu, 'graph.hoverInfo', 'Hover info');
    addToggleRow(menu, 'graph.edgeHandles', 'Edge handles', 'Experimental relationship creation');
    addToggleRow(menu, 'graph.fCoSE', 'fCoSE layout', 'Experimental graph layout');
    addToggleRow(menu, 'graph.undoRedo', 'Undo / redo', 'Experimental graph editing history');
  }

  eBliss.auth.onAuthStateChange(async (_event, session) => {
    await loadToggles(session?.user?.id || null);
    window.dispatchEvent(new CustomEvent('features:loaded', { detail: { ...state } }));
  });
}

export const eBToggles = Object.freeze({
  is: toggleDon,
  load: loadToggles,
  set: setToggle,
});
