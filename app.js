// eBliss graph experiment bootstrap and UI operations.
// Main workspace: Holarchy graph + contextual property editor.

import { initAuth } from './auth.js';
import { eBliss } from './eBSDK.js';
import { loadHolons } from './holons.js';
import { eBStatus } from './eBStatus.js';
import { createHolonGraph, updateHolonGraph, destroyHolonGraph, setGraphRoot, setGraphDepth } from './holonGraph.js';
import { createEBComboBox, holonComboOptions } from './eBComboBox.js';
import { createEBGrid } from './eBGrid.js';
import { showModal } from './eBModal.js';

const status = eBStatus;
const GRAPH_ROOT_STORAGE_KEY = 'eB-Holarchy.graphRoot';
const elements = {
  app: document.getElementById('app'), auth: document.getElementById('auth'), graph: document.getElementById('holonGraph'), graphRoot: document.getElementById('graphRoot'), graphDepth: document.getElementById('graphDepth'),
  inspector: document.getElementById('holonInspector'), inspectorContent: document.getElementById('holonInspectorContent'),
  refresh: document.getElementById('refresh'), refreshApp: document.getElementById('refreshApp'), debugApp: document.getElementById('debugApp'),
  newHolon: document.getElementById('newHolon'), newRelationship: document.getElementById('newRelationship'), newHolonType: document.getElementById('newHolonType'),
  testStatusSuccess: document.getElementById('testStatusSuccess'), testStatusWarn: document.getElementById('testStatusWarn'), testStatusError: document.getElementById('testStatusError'),
};
let holons = [], relationships = [], relationshipTypes = [], holonTypes = [];
let graph = null, graphRootCombo = null, propertyGrid = null, selectedHolon = null;

function setStatus(text, level = 'info') { if (!text) return status.clear(); status[level](text); }
function formatPropertyValue(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'object') { try { return JSON.stringify(value, null, 2); } catch { return String(value); } } return String(value); }
function labelForKey(key) { return key.replace(/_id$/i, ' ID').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase()); }
function translateId(key, value) { if (value === null || value === undefined || value === '') return '—'; const id = String(value); if (key === 'holon_type_id') { const type = holonTypes.find(item => String(item.id) === id); return type ? type.name : id; } if (key === 'parent_holon_id' || key === 'source_holon_id' || key === 'target_holon_id') { const holon = holons.find(item => String(item.id) === id); return holon ? (holon.name || '(unnamed Holon)') : id; } if (key === 'relationship_type_id') { const type = relationshipTypes.find(item => String(item.id) === id); return type ? (type.name || '(unnamed relationship)') : id; } return id; }
function propertyValueForDisplay(key, value) { return /_id$/i.test(key) ? translateId(key, value) : formatPropertyValue(value); }
function isEditableHolonProperty(key) { return key !== 'id' && key !== 'created_at'; }
function getStoredGraphRoot() { try { return localStorage.getItem(GRAPH_ROOT_STORAGE_KEY); } catch { return null; } }
function storeGraphRoot(rootId) { try { if (rootId) localStorage.setItem(GRAPH_ROOT_STORAGE_KEY, String(rootId)); else localStorage.removeItem(GRAPH_ROOT_STORAGE_KEY); } catch { /* Storage may be unavailable; graph still works for this session. */ } }

async function saveInspectorProperty(holon, key, value) {
  if (!isEditableHolonProperty(key)) {
    setStatus(`${labelForKey(key)} is read-only`, 'warn');
    renderHolonInspector(holon);
    return;
  }
  const nextValue = key === 'Content' ? String(value ?? '') : String(value ?? '').trim();
  if (key === 'name' && !nextValue) { setStatus('Name cannot be empty', 'warn'); renderHolonInspector(holon); return; }
  if (nextValue === String(holon[key] ?? '')) return;
  setStatus(`Updating ${labelForKey(key)}…`);
  try {
    await eBliss.holons.update(holon.id, { [key]: nextValue });
    await loadModel();
    const updated = holons.find(item => String(item.id) === String(holon.id)) || { ...holon, [key]: nextValue };
    selectedHolon = updated;
    renderHolonInspector(updated);
    const node = graph?.nodes?.(`[id = "${String(updated.id).replaceAll('"', '\\"')}"]`);
    node?.select();
    if (node?.nonempty?.()) graph.center(node);
    const displayValue = propertyValueForDisplay(key, nextValue);
    setStatus(`${labelForKey(key)}: "${displayValue}"`, 'success');
  } catch (error) {
    setStatus(error.message || `Unable to update ${labelForKey(key)}`, 'error');
    renderHolonInspector(holon);
  }
}

function renderHolonInspector(holon) {
  if (!elements.inspectorContent) return;
  propertyGrid?.destroy?.();
  propertyGrid = null;
  elements.inspectorContent.replaceChildren();
  if (!holon) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Select a Holon to inspect its properties.';
    elements.inspectorContent.appendChild(empty);
    return;
  }

  selectedHolon = holon;
  const title = document.createElement('div');
  title.className = 'holon-inspector-title';
  title.textContent = holon.name || '(unnamed Holon)';
  elements.inspectorContent.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'holon-inspector-actions';
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit Holon';
  editButton.addEventListener('click', () => editHolon(holon));
  actions.appendChild(editButton);
  elements.inspectorContent.appendChild(actions);

  const gridElement = document.createElement('div');
  gridElement.className = 'holon-property-grid';
  gridElement.setAttribute('aria-label', `${holon.name || 'Holon'} properties`);
  elements.inspectorContent.appendChild(gridElement);

  const rows = Object.entries(holon)
    .filter(([key]) => key !== 'children')
    .map(([key, value]) => ({ key, property: labelForKey(key), value: propertyValueForDisplay(key, value) }));

  propertyGrid = createEBGrid(gridElement, {
    data: rows,
    columns: [
      { key: 'property', label: 'Property', sortable: true },
      {
        key: 'value',
        label: 'Value',
        sortable: true,
        editor: row => row.key === 'holon_type'
          ? { type: 'combobox', options: holonTypeOptions(holon.holon_type), value: holon.holon_type, minChars: 0, allowCustom: false }
          : row.key === 'Content' ? { type: 'textarea', rows: 8 }
          : row.key === 'id' || row.key === 'created_at' ? null : { type: 'text' },
      },
    ],
    pageSize: Math.max(rows.length, 10),
    pagination: false,
    filterable: false,
    sortable: true,
    resizableColumns: true,
    editableRows: true,
    keyboardNavigation: true,
    contextMenu: false,
    onRowEdit: (row, field, newValue) => {
      if (field !== 'value') return;
      const key = row.key;
      const rawValue = String(newValue ?? '');
      const originalValue = propertyValueForDisplay(key, holon[key]);
      if (rawValue === originalValue) return;
      void saveInspectorProperty(holon, key, rawValue);
    },
  });
}

function selectHolonInInspector(holon) { if (!holon) return; renderHolonInspector(holon); const node = graph?.nodes?.(`[id = "${String(holon.id).replaceAll('"', '\\"')}"]`); node?.select(); if (node?.nonempty?.()) graph.center(node); }
function openHolon(holon) { if (!holon) return; selectHolonInInspector(holon); window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon })); }

function resolveGraphRoot(value) { if (!value) return null; const candidate = typeof value === 'object' ? (value.value ?? value.id ?? '') : value; const text = String(candidate).trim(); if (!text) return null; const byId = holons.find(holon => String(holon.id) === text); if (byId) return byId.id; const normalized = text.toLowerCase(); return holons.find(holon => String(holon.name ?? '').trim().toLowerCase() === normalized)?.id ?? null; }
function applyGraphRoot(value) { const rootId = resolveGraphRoot(value); if (!rootId) { storeGraphRoot(null); setGraphRoot(null); return; } const root = holons.find(holon => String(holon.id) === String(rootId)); elements.graphRoot.value = root?.name || ''; storeGraphRoot(rootId); setGraphRoot(rootId); }
function refreshGraphRootCombo() { if (!elements.graphRoot) return; const currentText = elements.graphRoot.value; graphRootCombo?.destroy?.(); graphRootCombo = createEBComboBox(elements.graphRoot, { source: holonComboOptions(holons), minChars: 0, clearable: true, placeholder: 'Choose a root Holon…', onChange: (_input, value) => applyGraphRoot(Array.isArray(value) ? value[0] : value), onSelect: (_input, item) => applyGraphRoot(item?.value ?? item) }); const restored = resolveGraphRoot(currentText); if (restored) { const selected = holons.find(holon => String(holon.id) === String(restored)); elements.graphRoot.value = selected?.name || ''; } }
function restoreStoredGraphRoot() { const saved = getStoredGraphRoot(); if (!saved) return; const rootId = resolveGraphRoot(saved); if (!rootId) { storeGraphRoot(null); return; } const root = holons.find(holon => String(holon.id) === String(rootId)); if (!root) { storeGraphRoot(null); return; } elements.graphRoot.value = root.name || ''; setGraphRoot(root.id); }
function installGraphDepthControl() { const control = elements.graphDepth; if (!control || control.dataset.ebWired === 'true') return; control.dataset.ebWired = 'true'; control.addEventListener('change', () => setGraphDepth(control.value)); setGraphDepth(control.value || '2'); }
function holonTypeOptions(selected = '') { const options = holonTypes.map(type => ({ value: type.name, label: type.name })); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selected }); return options; }
function defaultHolonType() { return holonTypes.find(type => type.name === 'Holon')?.name || holonTypes.find(type => type.name === 'Tree Branch')?.name || holonTypes[0]?.name || ''; }
function holonOptions(includeNone = false, selected = '') { const options = holons.map(h => ({ value: h.id, label: h.name || '(unnamed)' })); if (includeNone) options.unshift({ value: '', label: '— None —' }); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' }); return options; }
function relationshipTypeOptions(includeNone = false, selected = '') { const options = relationshipTypes.map(t => ({ value: t.id, label: t.name || '(unnamed)' })); if (includeNone) options.unshift({ value: '', label: '— None —' }); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' }); return options; }

async function deleteHolon(holon) { const name = holon.name || '(unnamed)'; if (!confirm(`Delete “${name}”?`)) return; setStatus(`Deleting ${name}…`); try { await eBliss.holons.delete(holon.id); await loadModel(); setStatus(`Deleted ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to delete Holon', 'error'); } }
async function createHolonType() { const values = await showModal({ title: 'New Holon Type', submitLabel: 'Create Type', fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Service' }, { name: 'description', label: 'Description', placeholder: 'What kind of Holon is this?' }] }); if (!values?.name?.trim()) return; const name = values.name.trim(), description = values.description?.trim() || ''; setStatus(`Creating Holon type ${name}…`); try { await eBliss.holonTypes.create({ name, description }); await loadModel(); setStatus(`Created Holon type ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to create Holon type', 'error'); } }
async function createHolon(prefillName = '', prefillType = '') { const type = prefillType || defaultHolonType(); if (!type) { setStatus('No Holon types are available', 'error'); return null; } const values = await showModal({ title: 'New Holon', submitLabel: 'Create Holon', fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'Holon name', value: prefillName }, { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(type), value: type, required: true, minChars: 0, allowCustom: false, placeholder: 'Find a Holon type…' }, { name: 'relationship_type_id', label: 'Initial Relationship', type: 'select', options: relationshipTypeOptions(true), value: '' }, { name: 'parent_holon_id', label: 'Parent Holon', type: 'select', options: holonOptions(true), value: '' }, { name: 'position', label: 'Position', type: 'number', value: '0' }] }); if (!values?.name?.trim()) return null; if ((values.relationship_type_id && !values.parent_holon_id) || (!values.relationship_type_id && values.parent_holon_id)) { setStatus('Choose both an initial relationship and a parent Holon, or leave both empty', 'warn'); return null; } const name = values.name.trim(); setStatus(`Creating ${name}…`); try { const holon = await eBliss.holons.create({ name, holon_type: values.holon_type }); if (values.relationship_type_id && values.parent_holon_id) await eBliss.relationships.create({ source_holon_id: holon.id, target_holon_id: values.parent_holon_id, relationship_type_id: values.relationship_type_id, position: Number(values.position) || 0 }); await loadModel(); openHolon(holon); setStatus(`Created ${name}`, 'success'); return holon; } catch (error) { setStatus(error.message || 'Unable to create Holon', 'error'); return null; } }
async function editHolon(holon) { const currentType = holon.holon_type || defaultHolonType(); const values = await showModal({ title: 'Edit Holon', submitLabel: 'Save Changes', fields: [{ name: 'name', label: 'Name', required: true, value: holon.name || '' }, { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(currentType), value: currentType, required: true, minChars: 0, allowCustom: false }] }); if (!values) return; const name = values.name.trim(), holonType = values.holon_type.trim(); if (!name || !holonType) return setStatus('Name and type are required', 'warn'); setStatus('Updating Holon…'); try { await eBliss.holons.update(holon.id, { name, holon_type: holonType }); await loadModel(); openHolon(holons.find(h => h.id === holon.id) || { ...holon, name, holon_type: holonType }); setStatus('Holon updated', 'success'); } catch (error) { setStatus(error.message || 'Unable to update Holon', 'error'); } }
async function createRelationship() { if (holons.length < 2 || !relationshipTypes.length) return setStatus('Need at least two Holons and one relationship type', 'warn'); const values = await showModal({ title: 'New Relationship', submitLabel: 'Create Relationship', fields: [{ name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions(), required: true }, { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(), required: true }, { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions(), required: true }, { name: 'position', label: 'Position', type: 'number', value: '0' }] }); if (!values) return; setStatus('Creating relationship…'); try { await eBliss.relationships.create({ source_holon_id: values.source_holon_id, relationship_type_id: values.relationship_type_id, target_holon_id: values.target_holon_id, position: Number(values.position) || 0 }); await loadModel(); setStatus('Relationship created', 'success'); } catch (error) { setStatus(error.message || 'Unable to create relationship', 'error'); } }

async function loadModel() { const model = await loadHolons(eBliss); holons = model.holons || []; relationships = model.relationships || []; relationshipTypes = model.relationshipTypes || []; holonTypes = model.holonTypes || []; refreshGraphRootCombo(); updateHolonGraph(graph, holons, relationships); restoreStoredGraphRoot(); if (selectedHolon) { const refreshed = holons.find(h => String(h.id) === String(selectedHolon.id)); renderHolonInspector(refreshed || null); } }

function wireUI() { installGraphDepthControl(); elements.newHolon?.addEventListener('click', () => void createHolon()); elements.newRelationship?.addEventListener('click', () => void createRelationship()); elements.newHolonType?.addEventListener('click', () => void createHolonType()); elements.refresh?.addEventListener('click', () => void loadModel()); elements.refreshApp?.addEventListener('click', () => window.location.reload()); elements.debugApp?.addEventListener('click', () => console.log({ holons, relationships, relationshipTypes, holonTypes })); }

async function start() { wireUI(); try { await initAuth({ authElement: elements.auth, appElement: elements.app, onSignedIn: async () => { graph = createHolonGraph(elements.graph, { onSelect: openHolon, onDoubleClick: openHolon }); await loadModel(); } }); } catch (error) { setStatus(error.message || 'Unable to start application', 'error'); } }

start();
