import { getHolonGraph, setGraphDepth, setShowProvenance } from './holonGraph.js';

const FILTER_STORAGE_KEY = 'eB-Holarchy.graphFilter';
let installed = false;

function readFilter() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      depth: ['1', '2', '3', '4', 'all'].includes(String(parsed.depth)) ? String(parsed.depth) : null,
      provenance: parsed.provenance === true,
    };
  } catch (_) {
    return { depth: null, provenance: false };
  }
}

function writeFilter(next) {
  try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
}

function install() {
  if (installed) return;
  const depth = document.getElementById('graphDepth');
  const provenance = document.getElementById('graphProvenance');
  if (!depth || !provenance) return;

  const stored = readFilter();
  if (stored.depth) {
    depth.value = stored.depth;
    setGraphDepth(stored.depth);
  } else {
    setGraphDepth(depth.value || '2');
  }
  provenance.checked = stored.provenance;
  setShowProvenance(stored.provenance);

  depth.addEventListener('change', () => {
    setGraphDepth(depth.value || '2');
    writeFilter({ depth: depth.value || '2', provenance: provenance.checked });
  });

  provenance.addEventListener('change', () => {
    setShowProvenance(provenance.checked);
    writeFilter({ depth: depth.value || '2', provenance: provenance.checked });
  });

  // Cytoscape normally emits tap for clicks, but keep an explicit click path
  // so node selection remains reliable across the graph/render lifecycle.
  const cy = getHolonGraph();
  cy?.on('click', 'node', event => {
    const node = event.target;
    node.select();
    node.trigger('tap');
  });

  installed = true;
}

export function initHolarchyFilter() { install(); }

install();
