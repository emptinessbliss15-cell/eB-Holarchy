import { getHolonGraph } from './holonGraph.js';

const STORAGE_KEY = 'eB-Holarchy.coseOptions';
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
let panel = null;

function saveValues() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch {}
}

function runLayout() {
  const cy = getHolonGraph();
  if (!cy) return;
  cy.layout({ name: 'cose', animate: false, fit: true, padding: 40, randomize: true, ...values }).run();
}

function field(label, key, min, max, step = 1) {
  const row = document.createElement('label');
  row.className = 'eb-cose-row';
  const caption = document.createElement('span');
  caption.textContent = label;
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
    .eb-cose-row input { width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid var(--eb-border,#aaa); border-radius:4px; background:var(--eb-bg,#fff); color:var(--eb-text,#222); }
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

  const fields = [
    ['Node repulsion', 'nodeRepulsion', 0, 2000000, 10000],
    ['Ideal edge length', 'idealEdgeLength', 10, 500, 5],
    ['Edge elasticity', 'edgeElasticity', 1, 1000, 5],
    ['Nesting factor', 'nestingFactor', 0, 20, 0.5],
    ['Gravity', 'gravity', 0, 500, 5],
    ['Iterations', 'numIter', 10, 10000, 50],
    ['Initial temp', 'initialTemp', 1, 1000, 10],
    ['Cooling factor', 'coolingFactor', 0.01, 0.999, 0.01],
    ['Minimum temp', 'minTemp', 0.01, 100, 0.1],
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
    panel.querySelectorAll('[data-cose-key]').forEach(input => { input.value = String(values[input.dataset.coseKey]); });
    runLayout();
  });
  actions.append(apply, reset);
  panel.appendChild(actions);

  button.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  graph.parentElement.append(button, panel);
}

export function getCoseOptions() { return { ...values }; }
