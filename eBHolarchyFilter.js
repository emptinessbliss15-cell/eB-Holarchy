import { getHolonGraph, setGraphDepth, setShowProvenance } from './holonGraph.js';
import { createEBFilter } from './eBFilter.js';
import './eBProvInspector.js';

const FILTER_STORAGE_KEY = 'eB-Holarchy.graphFilter';
const GRAPH_ROOT_STORAGE_KEY = 'eB-Holarchy.graphRoot';
const GRAPH_FIT_PADDING = 56;
const GRAPH_MIN_AUTO_ZOOM = 0.45;
const GRAPH_MAX_AUTO_ZOOM = 1.25;
let installed = false;
let filter = null;

function persistGraphRoot(rootId)
{
  try
  {
    if (rootId) localStorage.setItem(GRAPH_ROOT_STORAGE_KEY, String(rootId));
    else localStorage.removeItem(GRAPH_ROOT_STORAGE_KEY);
  }
  catch
  {
    // Storage may be unavailable; graph navigation still works for this session.
  }
}

function fitGraph(cy)
{
  if (!cy) return;
  const elements = cy.elements();
  if (!elements.length) return;

  cy.fit(elements, GRAPH_FIT_PADDING);

  const fittedZoom = cy.zoom();
  const clampedZoom = Math.max(
    GRAPH_MIN_AUTO_ZOOM,
    Math.min(GRAPH_MAX_AUTO_ZOOM, fittedZoom),
  );

  if (clampedZoom !== fittedZoom)
  {
    cy.zoom(clampedZoom);
    cy.center(elements);
  }
}

function install()
{
  if (installed) return;
  const root = document.querySelector('.holarchy-filter');
  const depth = document.getElementById('graphDepth');
  const provenance = document.getElementById('graphProvenance');
  if (!root || !depth || !provenance) return;

  filter = createEBFilter(root, {
    storageKey: FILTER_STORAGE_KEY,
    fields: [
      {
        name: 'depth',
        label: 'Depth',
        type: 'select',
        elementId: 'graphDepth',
        defaultValue: depth.value || '2',
      },
      {
        name: 'provenance',
        label: 'Prov',
        type: 'checkbox',
        elementId: 'graphProvenance',
        defaultValue: false,
      },
    ],
    onChange(values, fieldName)
    {
      if (!fieldName || fieldName === 'depth') setGraphDepth(values.depth || '2');
      if (!fieldName || fieldName === 'provenance') setShowProvenance(values.provenance === true);
    },
  });

  // Cytoscape normally emits tap for clicks, but keep an explicit click path
  // so node selection remains reliable across the graph/render lifecycle.
  const cy = getHolonGraph();
  cy?.on('click', 'node', event =>
  {
    const node = event.target;
    node.select();
    node.trigger('tap');
  });

  // Graph navigation changes root inside holonGraph.js. Persist that same
  // Holon ID so an app refresh restores the root selected by double-click.
  cy?.on('dbltap', 'node', event =>
  {
    persistGraphRoot(event.target.data('holonId'));
  });

  // Every root/depth/model render runs a Cytoscape layout. Fit the resulting
  // graph to the available viewport, but keep tiny graphs from becoming huge
  // and large graphs from shrinking beyond a useful working scale.
  cy?.on('layoutstop', () => fitGraph(cy));

  installed = true;
}

export function initHolarchyFilter()
{
  install();
  return filter;
}

install();
