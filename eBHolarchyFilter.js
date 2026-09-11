import { getHolonGraph, setGraphDepth, setShowProvenance } from './holonGraph.js';
import { createEBFilter } from './eBFilter.js';
import './eBProvInspector.js';

const FILTER_STORAGE_KEY = 'eB-Holarchy.graphFilter';
const GRAPH_ROOT_STORAGE_KEY = 'eB-Holarchy.graphRoot';
const GRAPH_FIT_PADDING = 56;
const GRAPH_MIN_AUTO_ZOOM = 0.45;
const GRAPH_MAX_AUTO_ZOOM = 1.25;
const GRAPH_ATTACH_RETRY_MS = 50;
const GRAPH_ATTACH_MAX_ATTEMPTS = 100;
const FIELD_RELATIONSHIP_NAME = 'field of';
let filter = null;
let graphListenersInstalledFor = null;
let graphAttachTimer = null;

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

function currentFilterValues()
{
  return filter?.values?.() || {};
}

function currentHolonType()
{
  return String(currentFilterValues().holonType || '').trim();
}

function showFields()
{
  return currentFilterValues().fields === true;
}

function syncHolonTypeOptions(cy)
{
  const select = document.getElementById('graphHolonType');
  if (!select || !cy) return;

  const selected = currentHolonType() || select.value || '';
  const types = [...new Set(
    cy.nodes()
      .map(node => String(node.data('type') || '').trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));

  select.replaceChildren();

  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All';
  select.appendChild(all);

  for (const type of types)
  {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  }

  if (selected && !types.includes(selected))
  {
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = selected;
    select.appendChild(option);
  }

  select.value = selected;
}

function isFieldRelationship(edge)
{
  return String(edge?.data?.('label') || '').trim().toLowerCase() === FIELD_RELATIONSHIP_NAME;
}

function isFieldOnlyNode(node)
{
  const edges = node.connectedEdges();
  return edges.length > 0 && edges.every(isFieldRelationship);
}

function applyGraphFilters(cy, values = currentFilterValues())
{
  if (!cy) return;

  const wantedType = String(values.holonType || '').trim().toLowerCase();
  const fieldsVisible = values.fields === true;

  cy.batch(() =>
  {
    cy.nodes().forEach(node =>
    {
      const type = String(node.data('type') || '').trim().toLowerCase();
      const typeMatches = !wantedType || type === wantedType;
      const layerMatches = fieldsVisible || !isFieldOnlyNode(node);
      node.style('display', typeMatches && layerMatches ? 'element' : 'none');
    });

    cy.edges().forEach(edge =>
    {
      const layerMatches = fieldsVisible || !isFieldRelationship(edge);
      const endpointsVisible = edge.source().style('display') !== 'none'
        && edge.target().style('display') !== 'none';
      edge.style('display', layerMatches && endpointsVisible ? 'element' : 'none');
    });
  });
}

function fitGraph(cy)
{
  if (!cy) return;
  const elements = cy.elements(':visible');
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

function installGraphListeners()
{
  const cy = getHolonGraph();
  if (!cy || graphListenersInstalledFor === cy) return Boolean(cy);

  // Cytoscape normally emits tap for clicks, but keep an explicit click path
  // so node selection remains reliable across the graph/render lifecycle.
  cy.on('click', 'node', event =>
  {
    const node = event.target;
    node.select();
    node.trigger('tap');
  });

  // Graph navigation changes root inside holonGraph.js. Persist that same
  // Holon ID so an app refresh restores the root selected by double-click.
  cy.on('dbltap', 'node', event =>
  {
    persistGraphRoot(event.target.data('holonId'));
  });

  // Every root/depth/model render runs a Cytoscape layout. Rebuild any
  // model-driven filter choices, reapply the active filters, then fit only
  // the elements which remain visible.
  cy.on('layoutstop', () =>
  {
    syncHolonTypeOptions(cy);
    applyGraphFilters(cy);
    fitGraph(cy);
  });

  syncHolonTypeOptions(cy);
  applyGraphFilters(cy);

  graphListenersInstalledFor = cy;
  return true;
}

function attachGraphListeners(attempt = 0)
{
  if (installGraphListeners())
  {
    if (graphAttachTimer) clearTimeout(graphAttachTimer);
    graphAttachTimer = null;
    return;
  }

  if (attempt >= GRAPH_ATTACH_MAX_ATTEMPTS || graphAttachTimer) return;
  graphAttachTimer = setTimeout(() =>
  {
    graphAttachTimer = null;
    attachGraphListeners(attempt + 1);
  }, GRAPH_ATTACH_RETRY_MS);
}

function installControls()
{
  if (filter) return filter;

  const root = document.querySelector('.holarchy-filter');
  const depth = document.getElementById('graphDepth');
  const provenance = document.getElementById('graphProvenance');
  if (!root || !depth || !provenance) return null;

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
        name: 'fields',
        label: 'Fields',
        type: 'checkbox',
        elementId: 'graphFields',
        wrapperClass: 'holarchy-filter-prov',
        ariaLabel: 'Show field schema',
        defaultValue: false,
      },
      {
        name: 'provenance',
        label: 'Prov',
        type: 'checkbox',
        elementId: 'graphProvenance',
        defaultValue: false,
      },
      {
        name: 'holonType',
        label: 'Type',
        type: 'select',
        elementId: 'graphHolonType',
        wrapperClass: 'holarchy-filter-field',
        options: [
          { value: '', label: 'All' },
        ],
        defaultValue: '',
      },
    ],
    onChange(values, fieldName)
    {
      if (!fieldName || fieldName === 'depth') setGraphDepth(values.depth || '2');
      if (!fieldName || fieldName === 'provenance') setShowProvenance(values.provenance === true);
      if (!fieldName || fieldName === 'fields' || fieldName === 'holonType')
      {
        const cy = getHolonGraph();
        applyGraphFilters(cy, values);
        fitGraph(cy);
      }
    },
  });

  return filter;
}

export function initHolarchyFilter()
{
  const installedFilter = installControls();
  attachGraphListeners();
  return installedFilter;
}

export function refreshHolarchyFilter()
{
  attachGraphListeners();
  return filter;
}

initHolarchyFilter();
