// eBliss graph experiment bootstrap and UI operations.
// Main workspace: Holarchy graph + contextual property editor.

import { initAuth } from './auth.js';
import { eBliss } from './eBSDK.js';
import { loadHolons } from './holons.js';
import { eBStatus } from './eBStatus.js';
import { createHolonGraph, updateHolonGraph, destroyHolonGraph, setGraphRoot } from './holonGraph.js';
import { createEBComboBox, holonComboOptions } from './eBComboBox.js';
import { showModal } from './eBModal.js';

const status = eBStatus;
const elements = {
  app: document.getElementById('app'), auth: document.getElementById('auth'), graph: document.getElementById('holonGraph'), graphRoot: document.getElementById('graphRoot'),
  refresh: document.getElementById('refresh'), refreshApp: document.getElementById('refreshApp'), debugApp: document.getElementById('debugApp'),
  newHolon: document.getElementById('newHolon'), newRelationship: document.getElementById('newRelationship'), newHolonType: document.getElementById('newHolonType'),
  testStatusSuccess: document.getElementById('testStatusSuccess'), testStatusWarn: document.getElementById('testStatusWarn'), testStatusError: document.getElementById('testStatusError'),
};
let holons = [], relationships = [], relationshipTypes = [], holonTypes = [];
let graph = null, graphRootCombo = null;
let graphRelationshipDropInstalled = false;

function setStatus(text, level = 'info') { if (!text) return status.clear(); status[level](text); }

function openHolon(holon) {
  if (!holon) return;
  graph?.nodes?.(`[id = "${String(holon.id).replaceAll('"', '\\"')}"]`).select();
  window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon }));
}

function refreshGraphRootCombo() {
  if (!elements.graphRoot) return;
  graphRootCombo?.destroy?.();
  graphRootCombo = createEBComboBox(elements.graphRoot, {
    source: holonComboOptions(holons), minChars: 0, clearable: true,
    placeholder: 'Choose a root Holon…',
    onChange: value => setGraphRoot((Array.isArray(value) ? value[0] : value) || null),
    onSelect: value => {
      const rootId = typeof value === 'object' ? value?.value : value;
      if (rootId) setGraphRoot(rootId);
    },
  });
}

function holonTypeOptions(selected = '') {
  const options = holonTypes.map(type => ({ value: type.name, label: type.name }));
  if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selected });
  return options;
}

function defaultHolonType() {
  return holonTypes.find(type => type.name === 'Holon')?.name
    || holonTypes.find(type => type.name === 'Tree Branch')?.name
    || holonTypes[0]?.name || '';
}

function holonOptions(includeNone = false, selected = '') {
  const options = holons.map(h => ({ value: h.id, label: h.name || '(unnamed)' }));
  if (includeNone) options.unshift({ value: '', label: '— None —' });
  if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' });
  return options;
}

function relationshipTypeOptions(includeNone = false, selected = '') {
  const options = relationshipTypes.map(t => ({ value: t.id, label: t.name || '(unnamed)' }));
  if (includeNone) options.unshift({ value: '', label: '— None —' });
  if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' });
  return options;
}

async function deleteHolon(holon) {
  const name = holon.name || '(unnamed)';
  if (!confirm(`Delete “${name}”?`)) return;
  setStatus(`Deleting ${name}…`);
  try { await eBliss.holons.delete(holon.id); await loadModel(); setStatus(`Deleted ${name}`, 'success'); }
  catch (error) { setStatus(error.message || 'Unable to delete Holon', 'error'); }
}

async function createHolonType() {
  const values = await showModal({ title: 'New Holon Type', submitLabel: 'Create Type', fields: [
    { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Service' },
    { name: 'description', label: 'Description', placeholder: 'What kind of Holon is this?' },
  ] });
  if (!values?.name?.trim()) return;
  const name = values.name.trim(), description = values.description?.trim() || '';
  setStatus(`Creating Holon type ${name}…`);
  try { await eBliss.holonTypes.create({ name, description }); await loadModel(); setStatus(`Created Holon type ${name}`, 'success'); }
  catch (error) { setStatus(error.message || 'Unable to create Holon type', 'error'); }
}

async function createHolon(prefillName = '', prefillType = '') {
  const type = prefillType || defaultHolonType();
  if (!type) { setStatus('No Holon types are available', 'error'); return null; }
  const values = await showModal({ title: 'New Holon', submitLabel: 'Create Holon', fields: [
    { name: 'name', label: 'Name', required: true, placeholder: 'Holon name', value: prefillName },
    { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(type), value: type, required: true, minChars: 0, allowCustom: false, placeholder: 'Find a Holon type…' },
    { name: 'relationship_type_id', label: 'Initial Relationship', type: 'select', options: relationshipTypeOptions(true), value: '' },
    { name: 'parent_holon_id', label: 'Parent Holon', type: 'combobox', options: holonOptions(true), value: '', required: false, minChars: 0, allowCustom: false, placeholder: 'Find a Holon related to…' },
    { name: 'position', label: 'Position', type: 'number', value: '0' },
  ] });

  if (!values?.name?.trim()) return null;
  if ((values.relationship_type_id && !values.parent_holon_id) || (!values.relationship_type_id && values.parent_holon_id)) {
    setStatus('Choose both an initial relationship and a parent Holon, or leave both empty', 'warn'); return null;
  }
  const name = values.name.trim();
  setStatus(`Creating ${name}…`);
  try {
    const holon = await eBliss.holons.create({ name, holon_type: values.holon_type });
    if (values.relationship_type_id && values.parent_holon_id) await eBliss.relationships.create({ source_holon_id: holon.id, target_holon_id: values.parent_holon_id, relationship_type_id: values.relationship_type_id, position: Number(values.position) || 0 });
    await loadModel(); openHolon(holon); setStatus(`Created ${name}`, 'success'); return holon;
  } catch (error) { setStatus(error.message || 'Unable to create Holon', 'error'); return null; }
}

async function editHolon(holon) {
  const currentType = holon.holon_type || defaultHolonType();
  const values = await showModal({ title: 'Edit Holon', submitLabel: 'Save Changes', fields: [
    { name: 'name', label: 'Name', required: true, value: holon.name || '' },
    { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(currentType), value: currentType, required: true, minChars: 0, allowCustom: false },
  ] });
  if (!values) return;
  const name = values.name.trim(), holonType = values.holon_type.trim();
  if (!name || !holonType) return setStatus('Name and type are required', 'warn');
  setStatus('Updating Holon…');
  try { await eBliss.holons.update(holon.id, { name, holon_type: holonType }); await loadModel(); openHolon(holons.find(h => h.id === holon.id) || { ...holon, name, holon_type: holonType }); setStatus('Holon updated', 'success'); }
  catch (error) { setStatus(error.message || 'Unable to update Holon', 'error'); }
}

async function createRelationship() {
  if (holons.length < 2 || !relationshipTypes.length) return setStatus('Need at least two Holons and one relationship type', 'warn');
  const values = await showModal({ title: 'New Relationship', submitLabel: 'Create Relationship', fields: [
    { name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions(), required: true },
    { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(), required: true },
    { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions(), required: true },
    { name: 'position', label: 'Position', type: 'number', value: '0' },
  ] });
  if (!values) return;
  setStatus('Creating relationship…');
  try { await eBliss.relationships.create({ source_holon_id: values.source_holon_id, relationship_type_id: values.relationship_type_id, target_holon_id: values.target_holon_id, position: Number(values.position) || 0 }); await loadModel(); setStatus('Relationship created', 'success'); }
  catch (error) { setStatus(error.message || 'Unable to create relationship', 'error'); }
}

async function createDroppedRelationship(sourceId, targetId) {
  if (!sourceId || !targetId || String(sourceId) === String(targetId)) return;
  const source = holons.find(item => String(item.id) === String(sourceId));
  const target = holons.find(item => String(item.id) === String(targetId));
  if (!source || !target) return;
  if (!relationshipTypes.length) return setStatus('No relationship types are available', 'warn');

  const values = await showModal({
    title: `Relate ${source.name || '(unnamed)'} → ${target.name || '(unnamed)'}`,
    submitLabel: 'Create Relationship',
    fields: [
      { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(), required: true },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });
  if (!values?.relationship_type_id) return;

  setStatus(`Creating ${source.name || 'Holon'} → ${target.name || 'Holon'} relationship…`);
  try {
    await eBliss.relationships.create({
      source_holon_id: source.id,
      relationship_type_id: values.relationship_type_id,
      target_holon_id: target.id,
      position: Number(values.position) || 0,
    });
    await loadModel();
    setStatus('Relationship created', 'success');
  } catch (error) { setStatus(error.message || 'Unable to create relationship', 'error'); }
}

function installGraphRelationshipDrop() {
  if (!graph || graphRelationshipDropInstalled) return;
  graphRelationshipDropInstalled = true;
  let draggedNodeId = null;

  graph.on('grab', 'node', event => {
    draggedNodeId = String(event.target.id());
  });

  graph.on('free', 'node', event => {
    const sourceId = draggedNodeId || String(event.target.id());
    draggedNodeId = null;
    const sourceNode = event.target;
    const point = sourceNode.renderedPosition();
    const tolerance = 14;
    const targetNode = graph.nodes().filter(node => {
      if (String(node.id()) === sourceId) return false;
      const box = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      return point.x >= box.x1 - tolerance && point.x <= box.x2 + tolerance
        && point.y >= box.y1 - tolerance && point.y <= box.y2 + tolerance;
    }).first();

    if (!targetNode?.length) return;
    createDroppedRelationship(sourceId, String(targetNode.id()));
  });
}

async function loadModel() {
  setStatus('Loading Holon model…');
  try {
    const model = await loadHolons(eBliss);
    holons = model.holons; relationships = model.relationships; relationshipTypes = model.relationshipTypes; holonTypes = model.holonTypes || [];
    if (!graph) {
      graph = createHolonGraph({ element: elements.graph, holons, relationships, relationshipTypes, rootId: null });
      installGraphRelationshipDrop();
    } else updateHolonGraph({ holons, relationships, relationshipTypes });
    refreshGraphRootCombo();
    setStatus(`${holons.length} Holons · ${relationships.length} relationships`, 'success');
  } catch (error) { setStatus(error.message || 'Unable to load Holon model', 'error'); }
}

async function applySession(session) {
  const user = session?.user || null;
  elements.app.hidden = !user;
  if (elements.refresh) elements.refresh.disabled = !user;
  if (user) return loadModel();
  holons = []; relationships = []; relationshipTypes = []; holonTypes = [];
  destroyHolonGraph(); graph = null; graphRootCombo?.destroy?.(); graphRootCombo = null; graphRelationshipDropInstalled = false;
  setStatus('Sign in to open the Holon Workspace');
}

elements.refresh?.addEventListener('click', loadModel);
elements.newHolon?.addEventListener('click', () => createHolon());
elements.newRelationship?.addEventListener('click', createRelationship);
elements.newHolonType?.addEventListener('click', createHolonType);
elements.refreshApp?.addEventListener('click', () => location.reload());
elements.debugApp?.addEventListener('click', () => { setStatus('Debugger paused', 'warn'); debugger; });
elements.testStatusSuccess?.addEventListener('click', () => setStatus('Test success message', 'success'));
elements.testStatusWarn?.addEventListener('click', () => setStatus('Test warning message', 'warn'));
elements.testStatusError?.addEventListener('click', () => setStatus('Test error message', 'error'));

const authResult = initAuth({ api: eBliss, container: elements.auth, setStatus, onSession: applySession });
authResult.then(({ data, error }) => { if (error) setStatus(error.message, 'error'); else applySession(data.session); });
