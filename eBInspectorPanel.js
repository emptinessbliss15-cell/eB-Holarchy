// eB Inspector Panel — show properties only when useful, with an optional session pin.

import { getHolonGraph } from './holonGraph.js';

let pinned = false;
let hasSelection = false;
let graph = null;
let backgroundHandler = null;

function workspace() { return document.querySelector('.workspace-primary'); }
function inspector() { return document.getElementById('holonInspector'); }

function resizeGraph() {
  const cy = getHolonGraph();
  if (!cy) return;
  requestAnimationFrame(() => {
    cy.resize();
    requestAnimationFrame(() => cy.resize());
  });
}

function sync() {
  const shell = workspace();
  const panel = inspector();
  if (!shell || !panel) return;
  const visible = pinned || hasSelection;
  shell.classList.toggle('inspector-hidden', !visible);
  panel.hidden = !visible;
  const pin = document.getElementById('holonInspectorPin');
  if (pin) {
    pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pin.title = pinned ? 'Allow properties to auto-hide' : 'Keep properties open';
    pin.textContent = pinned ? '📌' : '📍';
  }
  resizeGraph();
}

function installPin() {
  const panel = inspector();
  const heading = panel?.querySelector('.panel-heading');
  if (!heading || document.getElementById('holonInspectorPin')) return;
  const button = document.createElement('button');
  button.id = 'holonInspectorPin';
  button.type = 'button';
  button.className = 'holon-inspector-pin';
  button.setAttribute('aria-label', 'Pin properties panel');
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    pinned = !pinned;
    sync();
  });
  heading.appendChild(button);
}

function installProvenanceStrip() {
  if (document.querySelector('.eb-provenance-strip')) return;
  const shell = workspace();
  const control = document.querySelector('.holarchy-filter-prov');
  if (!shell || !control) return;

  const strip = document.createElement('section');
  strip.className = 'eb-provenance-strip';
  strip.setAttribute('aria-label', 'Provenance');

  const title = document.createElement('span');
  title.className = 'eb-provenance-strip-title';
  title.textContent = 'Provenance';

  const label = control.querySelector('label');
  if (label) label.textContent = 'Show on graph';

  strip.append(title, control);
  shell.parentElement?.insertBefore(strip, shell);
}

function attachGraphBackground() {
  const cy = getHolonGraph();
  if (!cy || cy === graph) return;
  if (graph && backgroundHandler) graph.off('tap', backgroundHandler);
  backgroundHandler = event => {
    if (event.target !== cy) return;
    hasSelection = false;
    sync();
  };
  cy.on('tap', backgroundHandler);
  graph = cy;
}

export function initInspectorPanel() {
  installPin();
  installProvenanceStrip();
  hasSelection = false;
  sync();

  window.addEventListener('holon:selected', event => {
    hasSelection = Boolean(event.detail);
    sync();
  });
  window.addEventListener('relationship:selected', event => {
    hasSelection = Boolean(event.detail);
    sync();
  });
  window.addEventListener('eB:modelChanged', attachGraphBackground);
  window.addEventListener('features:loaded', attachGraphBackground);
  attachGraphBackground();
}
