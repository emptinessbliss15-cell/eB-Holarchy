import { eBliss } from './eBSDK.js';

// Feature definitions are the source of truth for labels and default modes.
// The database stores only user overrides, so changing a default affects users
// who have not explicitly overridden that feature.
export const toggleDefinitions = Object.freeze({
  'graph.key': {
    label: 'Graph key',
    default: true,
  },
  'graph.hoverInfo': {
    label: 'Hover info',
    default: false,
  },
  'graph.edgeHandles': {
    label: 'Edge handles',
    default: false,
    description: 'Experimental relationship creation',
  },
  'graph.fCoSE': {
    label: 'fCoSE layout',
    default: false,
    description: 'Experimental graph layout',
  },
  'graph.undoRedo': {
    label: 'Undo / redo',
    default: false,
    description: 'Experimental graph editing history',
  },
});

const userOverrides = Object.create(null);
let initialized = false;
let currentUserId = null;

function defaultState() {
  return Object.fromEntries(
    Object.entries(toggleDefinitions).map(([name, definition]) => [name, definition.default === true]),
  );
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

/** Return whether a feature is effectively enabled for the current user. */
export function toggledOn(name) {
  const key = String(name);
  const definition = toggleDefinitions[key];
  if (!definition) return false;
  if (Object.prototype.hasOwnProperty.call(userOverrides, key)) {
    return userOverrides[key] === true;
  }
  return definition.default === true;
}

export async function loadToggles(userId = null) {
  currentUserId = userId;
  clearOverrides();

  if (!userId) return effectiveState();

  const rows = await eBliss.toggles.list();
  for (const row of rows || []) {
    if (row?.feature_name in toggleDefinitions) {
      userOverrides[row.feature_name] = row.enabled === true;
    }
  }
  return effectiveState();
}

export async function setToggle(name, enabled) {
  const key = String(name);
  if (!(key in toggleDefinitions)) return false;
  if (!currentUserId) return toggledOn(key);

  const value = enabled === true;
  await eBliss.toggles.set(key, value);
  userOverrides[key] = value;
  window.dispatchEvent(new CustomEvent('feature:toggle', {
    detail: { name: key, enabled: value },
  }));
  return value;
}

export async function resetToggle(name) {
  const key = String(name);
  if (!(key in toggleDefinitions)) return toggledOn(key);
  if (!currentUserId) return toggledOn(key);

  await eBliss.toggles.reset(key);
  delete userOverrides[key];
  const value = toggledOn(key);
  window.dispatchEvent(new CustomEvent('feature:toggle', {
    detail: { name: key, enabled: value, reset: true },
  }));
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

    for (const [name, definition] of Object.entries(toggleDefinitions)) {
      addToggleRow(menu, name, definition);
    }
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
