import { getHolonGraph } from './holonGraph.js';

const STORAGE_KEY = 'eB-Holarchy.coseOptions';
const PRESETS_STORAGE_KEY = 'eB-Holarchy.cosePresets';
const defaults = Object.freeze({
  nodeRepulsion: 400000,
  idealEdgeLength: 100,
  edgeElasticity: 100,
  nestingFactor: 5,
  gravity: 80,
  numIter: 1000,
  initialTemp: 200,
  coolingFactor: 0.95,
  minTemp: 1,
});

function loadValues() {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) }; }
  catch { return { ...defaults }; }
}

let values = loadValues();
let presets = loadPresets();
let panel = null;

function loadPresets() {
  try {
    const stored = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch { return {}; }
}

function savePresets() {
  try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets)); } catch {}
}

function saveValues() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch {}
}

function runLayout() {
  const cy = getHolonGraph();
  if (!cy) return;
  cy.layout({ name: 'cose', animate: false, fit: true, padding: 40, randomize: true, ...values }).run();
}

function field(label, key, min, max, step = 1, help = '') {
  const row = document.createElement('label');
  row.className = 'eb-cose-row';
  const caption = document.createElement('span');
  caption.className = 'eb-cose-caption';
  caption.append(document.createTextNode(label));
  if (help) {
    const info = document.createElement('span');
    info.className = 'eb-cose-info';
    info.textContent = 'i';
    info.title = help;
    info.setAttribute('aria-label', `${label}: ${help}`);
    info.tabIndex = 0;
    caption.append(info);
  }
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(values[key]);
  input.dataset.coseKey = key;
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) return;
    values[key] = next;
    saveValues();
  });
  row.append(caption, input);
  return row;
}

function installStyles() {
  if (document.getElementById('eb-cose-tuner-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-cose-tuner-style';
  style.textContent = `
    .eb-cose-tuner-button { position:absolute; top:10px; right:10px; z-index:8; padding:5px 8px; border:1px solid var(--eb-border-strong,#777); border-radius:6px; background:var(--eb-input-bg,#fff); color:var(--eb-text,#222); cursor:pointer; font-size:12px; }
    .eb-cose-tuner { position:absolute; top:42px; right:10px; z-index:9; width:250px; padding:10px; border:1px solid var(--eb-border-strong,#777); border-radius:8px; background:var(--eb-input-bg,#fff); color:var(--eb-text,#222); box-shadow:0 8px 24px rgba(0,0,0,.25); }
    .eb-cose-tuner[hidden] { display:none; }
    .eb-cose-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:700; }
    .eb-cose-head button { border:0; background:transparent; color:inherit; cursor:pointer; font-size:16px; }
    .eb-cose-row { display:grid; grid-template-columns:minmax(0,1fr) 86px; align-items:center; gap:8px; margin:5px 0; font-size:11px; }
    .eb-cose-caption { display:flex; align-items:center; gap:5px; min-width:0; }
    .eb-cose-info { display:inline-flex; align-items:center; justify-content:center; flex:0 0 14px; width:14px; height:14px; border:1px solid currentColor; border-radius:50%; opacity:.65; font-size:9px; font-weight:700; font-style:normal; line-height:1; cursor:help; }
    .eb-cose-info:hover, .eb-cose-info:focus { opacity:1; outline:none; }
    .eb-cose-row input { width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid var(--eb-border,#aaa); border-radius:4px; background:var(--eb-bg,#fff); color:var(--eb-text,#222); }
    .eb-cose-presets { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; margin-bottom:9px; }
    .eb-cose-presets select { min-width:0; padding:4px 5px; border:1px solid var(--eb-border,#aaa); border-radius:4px; background:var(--eb-bg,#fff); color:var(--eb-text,#222); }
    .eb-cose-presets button { padding:4px 7px; white-space:nowrap; border:1px solid var(--eb-border-strong,#777); border-radius:5px; background:var(--eb-bg,#fff); color:var(--eb-text,#222); cursor:pointer; }
    .eb-cose-actions { display:flex; gap:6px; margin-top:9px; }
    .eb-cose-actions button { flex:1; padding:5px 7px; border:1px solid var(--eb-border-strong,#777); border-radius:5px; background:var(--eb-bg,#fff); color:var(--eb-text,#222); cursor:pointer; }
  `;
  document.head.appendChild(style);
}

export function initCoseTuner() {
  installStyles();
  const graph = document.getElementById('holonGraph');
  if (!graph?.parentElement || document.getElementById('coseTunerButton')) return;

  const button = document.createElement('button');
  button.id = 'coseTunerButton';
  button.type = 'button';
  button.className = 'eb-cose-tuner-button';
  button.textContent = 'COSE ⚙';
  button.title = 'Tune CoSE layout';

  panel = document.createElement('div');
  panel.className = 'eb-cose-tuner';
  panel.hidden = true;
  panel.innerHTML = '<div class="eb-cose-head"><span>CoSE Layout</span><button type="button" aria-label="Close">×</button></div>';
  panel.querySelector('button').addEventListener('click', () => { panel.hidden = true; });

  const presetControls = document.createElement('div');
  presetControls.className = 'eb-cose-presets';
  const presetSelect = document.createElement('select');
  presetSelect.setAttribute('aria-label', 'Saved CoSE settings');
  const renderPresets = selectedName => {
    presetSelect.replaceChildren(new Option('Saved settings…', ''));
    Object.keys(presets).sort((a, b) => a.localeCompare(b)).forEach(name => {
      presetSelect.add(new Option(name, name, false, name === selectedName));
    });
  };
  const syncFields = () => {
    panel.querySelectorAll('[data-cose-key]').forEach(input => { input.value = String(values[input.dataset.coseKey]); });
  };
  presetSelect.addEventListener('change', () => {
    const preset = presets[presetSelect.value];
    if (!preset) return;
    values = { ...defaults, ...preset };
    saveValues();
    syncFields();
    runLayout();
  });
  const saveAs = document.createElement('button');
  saveAs.type = 'button';
  saveAs.textContent = 'Save As';
  saveAs.addEventListener('click', () => {
    const suggestedName = presetSelect.value || 'New Settings';
    const name = window.prompt('Save CoSE settings as:', suggestedName)?.trim();
    if (!name) return;
    presets[name] = { ...values };
    savePresets();
    renderPresets(name);
  });
  renderPresets();
  presetControls.append(presetSelect, saveAs);
  panel.appendChild(presetControls);

  const fields = [
    ['Node repulsion', 'nodeRepulsion', 0, 2000000, 10000, 'How strongly nodes push apart. Higher values create more space between nodes.'],
    ['Ideal edge length', 'idealEdgeLength', 10, 500, 5, 'The preferred distance between connected nodes. Higher values make edges longer.'],
    ['Edge elasticity', 'edgeElasticity', 1, 1000, 5, 'How strongly edges resist being stretched. Higher values pull connected nodes toward their ideal distance more firmly.'],
    ['Nesting factor', 'nestingFactor', 0, 20, 0.5, 'Adds extra spacing for compound or nested nodes. Higher values spread nested levels farther apart.'],
    ['Gravity', 'gravity', 0, 500, 5, 'Pulls disconnected or distant nodes toward the graph center. Higher values make the layout more compact.'],
    ['Iterations', 'numIter', 10, 10000, 50, 'Maximum layout calculation steps. More iterations may improve settling but take longer.'],
    ['Initial temp', 'initialTemp', 1, 1000, 10, 'How freely nodes can move when layout begins. Higher values allow larger early movements.'],
    ['Cooling factor', 'coolingFactor', 0.01, 0.999, 0.01, 'How gradually movement slows. Values nearer 1 cool more slowly and explore longer.'],
    ['Minimum temp', 'minTemp', 0.01, 100, 0.1, 'The movement threshold for stopping. Lower values let the layout settle more precisely.'],
  ];
  fields.forEach(args => panel.appendChild(field(...args)));

  const actions = document.createElement('div');
  actions.className = 'eb-cose-actions';
  const apply = document.createElement('button');
  apply.type = 'button'; apply.textContent = 'Apply / Relayout';
  apply.addEventListener('click', runLayout);
  const reset = document.createElement('button');
  reset.type = 'button'; reset.textContent = 'Defaults';
  reset.addEventListener('click', () => {
    values = { ...defaults };
    saveValues();
    presetSelect.value = '';
    syncFields();
    runLayout();
  });
  actions.append(apply, reset);
  panel.appendChild(actions);

  button.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  graph.parentElement.append(button, panel);
}

export function getCoseOptions() { return { ...values }; }
