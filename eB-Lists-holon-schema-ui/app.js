// eBliss app bootstrap and UI operations.
// Main workspace: Holarchy graph + contextual property editor.

console.log("=== NEW APP.JS LOADED ===");

import { initAuth } from './auth.js';
import { eBliss } from './eBSDK.js';
import { loadHolons } from './holons.js';
import { createTree } from './tree.js';
import { eBStatus } from './eBStatus.js';
import { createHolonGraph, updateHolonGraph, destroyHolonGraph, setGraphRoot } from './holonGraph.js';
import { createEBComboBox, holonComboOptions } from './eBComboBox.js';
import { showModal } from './eBModal.js';

const status = eBStatus;
const elements = {
  app: document.getElementById('app'), auth: document.getElementById('auth'), tree: document.getElementById('treeGrid'),
  treeRoot: document.getElementById('treeRoot'), treeRelationship: document.getElementById('treeRelationship'), graph: document.getElementById('holonGraph'), graphRoot: document.getElementById('graphRoot'),
  refresh: document.getElementById('refresh'), refreshApp: document.getElementById('refreshApp'), debugApp: document.getElementById('debugApp'),
  newHolon: document.getElementById('newHolon'), newRelationship: document.getElementById('newRelationship'), newHolonType: document.getElementById('newHolonType'), testComboBox: document.getElementById('testComboBox'),
  testStatusSuccess: document.getElementById('testStatusSuccess'), testStatusWarn: document.getElementById('testStatusWarn'), testStatusError: document.getElementById('testStatusError'),
};
let holons = [], relationships = [], relationshipTypes = [], holonTypes = [];
let treeGrid = null, graph = null, graphRootCombo = null;

function setStatus(text, level = 'info') { if (!text) return status.clear(); status[level](text); }

function openHolon(holon) {
  if (!holon) return;
  graph?.nodes?.(`[id = "${String(holon.id).replaceAll('"', '\\"')}"]`).select();
  window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon }));
}

function populateTreeSelectors() {
  elements.treeRoot.replaceChildren(...holons.map(h => Object.assign(document.createElement('option'), { value: h.id, textContent: h.name || '(unnamed)' })));
  elements.treeRelationship.replaceChildren(...relationshipTypes.map(t => Object.assign(document.createElement('option'), { value: t.id, textContent: t.name || '(unnamed)' })));
  const root = holons.find(h => h.name === 'Lists Tree') || holons.find(h => h.name === 'Holarchy');
  const relationship = relationshipTypes.find(t => t.name?.toLowerCase() === 'branch of');
  if (root) elements.treeRoot.value = root.id;
  if (relationship) elements.treeRelationship.value = relationship.id;
}

function refreshGraphRootCombo() {
  if (!elements.graphRoot) return;
  graphRootCombo?.destroy?.();
  graphRootCombo = createEBComboBox(elements.graphRoot, {
    source: holonComboOptions(holons),
    minChars: 0,
    clearable: true,
    placeholder: 'Choose a root Holon…',
    onChange: value => {
      const rootId = Array.isArray(value) ? value[0] : value;
      setGraphRoot(rootId || null);
    },
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
  const name = values.name.trim();
  const description = values.description?.trim() || '';
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
    { name: 'parent_holon_id', label: 'Parent Holon', type: 'select', options: holonOptions(true), value: '' },
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
    await loadModel();
    openHolon(holon);
    setStatus(`Created ${name}`, 'success');
    return holon;
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

async function deleteRelationship(relationship) {
  if (!confirm('Delete this relationship?')) return;
  setStatus('Deleting relationship…');
  try { await eBliss.relationships.delete(relationship.id); await loadModel(); setStatus('Relationship deleted', 'success'); }
  catch (error) { setStatus(error.message || 'Unable to delete relationship', 'error'); }
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

function holonMenu(event, holon, show) {
  show([{ label: 'New Holon', action: createHolon }, { label: 'Edit', action: () => editHolon(holon) }, { label: 'Delete', action: () => deleteHolon(holon) }]);
}

function createViews() {
  treeGrid?.destroy();
  treeGrid = createTree({ element: elements.tree, holons, relationships, rootId: elements.treeRoot.value, relationshipTypeId: elements.treeRelationship.value, onSelect: openHolon, onCreate: createHolon, onEdit: editHolon, onDelete: deleteHolon });
  if (!graph) graph = createHolonGraph({ element: elements.graph, holons, relationships, relationshipTypes, rootId: null });
  else updateHolonGraph({ holons, relationships, relationshipTypes });
}

async function loadModel() {
  setStatus('Loading Holon model…');
  try {
    const model = await loadHolons(eBliss);
    holons = model.holons; relationships = model.relationships; relationshipTypes = model.relationshipTypes; holonTypes = model.holonTypes || [];
    populateTreeSelectors();
    createViews();
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
  treeGrid?.destroy(); treeGrid = null; destroyHolonGraph(); graph = null; graphRootCombo?.destroy?.(); graphRootCombo = null;
  setStatus('Sign in to open the Holon Workspace');
}

elements.treeRoot.addEventListener('change', createViews);
elements.treeRelationship.addEventListener('change', createViews);
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
