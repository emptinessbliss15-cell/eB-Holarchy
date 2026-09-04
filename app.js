// eBliss app bootstrap and UI operations.
// Freeform Holon creation is handled through the normal New Holon modal.

console.log("=== NEW APP.JS LOADED ===");

import { initAuth } from './auth.js';
import { eBliss } from './eBSDK.js';
import { loadHolons } from './holons.js';
import { createTree, updateTree } from './tree.js';
import { eBStatus } from './eBStatus.js';
import { createHolonGrid, createRelationshipGrid, setRelationships } from './grid.js';
import { showModal } from './eBModal.js';
import { createHolonGraph } from './graph.js';

const status = eBStatus;
const elements = {
  app: document.getElementById('app'), auth: document.getElementById('auth'), tree: document.getElementById('treeGrid'),
  treeRoot: document.getElementById('treeRoot'), treeRelationship: document.getElementById('treeRelationship'), grid: document.getElementById('grid'),
  detailGrid: document.getElementById('detailGrid'), activeList: document.getElementById('activeList'), listMode: document.getElementById('listMode'),
  refresh: document.getElementById('refresh'), refreshApp: document.getElementById('refreshApp'), debugApp: document.getElementById('debugApp'),
  newHolon: document.getElementById('newHolon'), newHolonType: document.getElementById('newHolonType'), testComboBox: document.getElementById('testComboBox'),
  testStatusSuccess: document.getElementById('testStatusSuccess'), testStatusWarn: document.getElementById('testStatusWarn'), testStatusError: document.getElementById('testStatusError'),
  graph: document.getElementById('holonGraph'), graphDepth: document.getElementById('graphDepth'),
};
let holons = [], relationships = [], relationshipTypes = [], holonTypes = [];
let treeGrid = null, holonGrid = null, relationshipGrid = null, holonGraph = null;

function setStatus(text, level = 'info') { if (!text) return status.clear(); status[level](text); }
function focusGraph(holon) { holonGraph?.focus(holon.id); }
function openHolon(holon) {
  elements.activeList.textContent = holon.name || '(unnamed)';
  elements.listMode.textContent = holon.holon_type || 'Holon';
  setRelationships(relationshipGrid, relationships.filter(r => r.source_holon_id === holon.id || r.target_holon_id === holon.id));
  focusGraph(holon);
}
function populateTreeSelectors() {
  elements.treeRoot.replaceChildren(...holons.map(h => Object.assign(document.createElement('option'), { value: h.id, textContent: h.name || '(unnamed)' })));
  elements.treeRelationship.replaceChildren(...relationshipTypes.map(t => Object.assign(document.createElement('option'), { value: t.id, textContent: t.name || '(unnamed)' })));
  const root = holons.find(h => h.name === 'Lists Tree');
  const relationship = relationshipTypes.find(t => t.name?.toLowerCase() === 'branch of');
  if (root) elements.treeRoot.value = root.id;
  if (relationship) elements.treeRelationship.value = relationship.id;
}
function holonTypeOptions(selected = '') {
  const options = holonTypes.map(type => ({ value: type.name, label: type.name }));
  if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selected });
  return options;
}
function defaultHolonType() {
  return holonTypes.find(type => type.name === 'Tree Branch')?.name || holonTypes[0]?.name || '';
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
  const name = holon.name || '(unnamed)'; if (!confirm(`Delete “${name}”?`)) return; setStatus(`Deleting ${name}…`);
  try { await eBliss.holons.delete(holon.id); await loadModel(); setStatus(`Deleted ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to delete Holon', 'error'); }
}
async function createHolonType() {
  const values = await showModal({
    title: 'New Holon Type',
    submitLabel: 'Create Type',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Service' },
      { name: 'description', label: 'Description', placeholder: 'What kind of Holon is this?' },
    ],
  });
  if (!values?.name?.trim()) return;

  const name = values.name.trim();
  const description = values.description?.trim() || '';
  setStatus(`Creating Holon type ${name}…`);

  try {
    await eBliss.holonTypes.create({ name, description });
    await loadModel();
    setStatus(`Created Holon type ${name}`, 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to create Holon type', 'error');
  }
}

async function createHolon(prefillName = '', prefillType = '') {
  const type = prefillType || defaultHolonType();
  if (!type) {
    setStatus('No Holon types are available', 'error');
    return null;
  }

  const values = await showModal({
    title: 'New Holon',
    submitLabel: 'Create Holon',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'Holon name', value: prefillName },
      { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(type), value: type, required: true, minChars: 0, allowCustom: false, placeholder: 'Find a Holon type…' },
      { name: 'relationship_type_id', label: 'Initial Relationship', type: 'select', options: relationshipTypeOptions(true), value: '' },
      { name: 'parent_holon_id', label: 'Parent Holon', type: 'select', options: holonOptions(true), value: '' },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });
  if (!values?.name?.trim()) return null;
  if ((values.relationship_type_id && !values.parent_holon_id) || (!values.relationship_type_id && values.parent_holon_id)) {
    setStatus('Choose both an initial relationship and a parent Holon, or leave both empty', 'warn');
    return null;
  }

  const name = values.name.trim();
  setStatus(`Creating ${name}…`);
  try {
    const holon = await eBliss.holons.create({ name, holon_type: values.holon_type });
    if (values.relationship_type_id && values.parent_holon_id) {
      await eBliss.relationships.create({ source_holon_id: holon.id, target_holon_id: values.parent_holon_id, relationship_type_id: values.relationship_type_id, position: Number(values.position) || 0 });
    }
    await loadModel();
    setStatus(`Created ${name}`, 'success');
    return holon;
  } catch (error) {
    setStatus(error.message || 'Unable to create Holon', 'error');
    return null;
  }
}

async function testComboBox() {
  const values = await showModal({
    title: 'Combo Box Test',
    submitLabel: 'Test Selection',
    fields: [
      {
        name: 'holons',
        label: 'Holons — find or type new',
        type: 'combobox',
        options: holonOptions(),
        multiple: true,
        allowCustom: true,
        minChars: 0,
        placeholder: 'Type to find or enter a new Holon…',
      },
    ],
  });

  if (!values) return;
  const selected = Array.isArray(values.holons) ? values.holons : [values.holons].filter(Boolean);
  const existing = selected.filter(value => holons.some(h => h.id === value));
  const newNames = selected.filter(value => !holons.some(h => h.id === value));

  // Freeform values do not write directly from the ComboBox. They go through
  // the normal New Holon modal so the user chooses the Holon's type and any
  // initial relationship before the database write occurs.
  for (const name of newNames) {
    await createHolon(name);
  }

  const createdNames = newNames.filter(name => holons.some(h => h.name === name));
  const finalNames = [
    ...existing.map(value => holons.find(h => h.id === value)?.name || value),
    ...createdNames,
  ];
  setStatus(`Combo box submitted ${finalNames.length} value${finalNames.length === 1 ? '' : 's'}: ${finalNames.join(', ') || '(none)'}`, 'success');
  console.log('Combo box test submission:', { existing, requestedNew: newNames, created: createdNames, labels: finalNames });
}

async function editHolon(holon) {
  const currentType = holon.holon_type || defaultHolonType();
  const values = await showModal({
    title: 'Edit Holon',
    submitLabel: 'Save Changes',
    fields: [
      { name: 'name', label: 'Name', required: true, value: holon.name || '' },
      { name: 'holon_type', label: 'Type', type: 'select', options: holonTypeOptions(currentType), value: currentType, required: true },
    ],
  });
  if (!values) return;
  const name = values.name.trim();
  const holonType = values.holon_type.trim();
  if (!name || !holonType) return setStatus('Name and type are required', 'warn');
  setStatus('Updating Holon…');
  try { await eBliss.holons.update(holon.id, { name, holon_type: holonType }); await loadModel(); setStatus('Holon updated', 'success'); } catch (error) { setStatus(error.message || 'Unable to update Holon', 'error'); }
}
async function saveHolonCell(row, field, newValue, oldValue) {
  if (!['name', 'holon_type'].includes(field) || newValue === oldValue) return;
  setStatus(`Updating ${field === 'name' ? 'name' : 'type'}…`);
  try {
    await eBliss.holons.update(row.id, { [field]: String(newValue ?? '').trim() });
    await loadModel();
    setStatus('Holon updated', 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to update Holon', 'error');
    await loadModel();
  }
}
async function deleteRelationship(relationship) {
  if (!confirm('Delete this relationship?')) return; setStatus('Deleting relationship…');
  try { await eBliss.relationships.delete(relationship.id); await loadModel(); setStatus('Relationship deleted', 'success'); } catch (error) { setStatus(error.message || 'Unable to delete relationship', 'error'); }
}
async function createRelationship() {
  if (holons.length < 2 || !relationshipTypes.length) return setStatus('Need at least two holons and one relationship type', 'warn');
  const values = await showModal({
    title: 'New Relationship',
    submitLabel: 'Create Relationship',
    fields: [
      { name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions(), required: true },
      { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(), required: true },
      { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions(), required: true },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });
  if (!values) return;
  setStatus('Creating relationship…');
  try { await eBliss.relationships.create({ source_holon_id: values.source_holon_id, target_holon_id: values.target_holon_id, relationship_type_id: values.relationship_type_id, position: Number(values.position) || 0 }); await loadModel(); setStatus('Relationship created', 'success'); } catch (error) { setStatus(error.message || 'Unable to create relationship', 'error'); }
}
async function editRelationship(relationship) {
  const values = await showModal({
    title: 'Edit Relationship',
    submitLabel: 'Save Changes',
    fields: [
      { name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions(false, relationship.source_holon_id), value: relationship.source_holon_id, required: true },
      { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(false, relationship.relationship_type_id), value: relationship.relationship_type_id, required: true },
      { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions(false, relationship.target_holon_id), value: relationship.target_holon_id, required: true },
      { name: 'position', label: 'Position', type: 'number', value: relationship.position ?? 0 },
    ],
  });
  if (!values) return;
  setStatus('Updating relationship…');
  try { await eBliss.relationships.update(relationship.id, { source_holon_id: values.source_holon_id, relationship_type_id: values.relationship_type_id, target_holon_id: values.target_holon_id, position: Number(values.position) || 0 }); await loadModel(); setStatus('Relationship updated', 'success'); } catch (error) { setStatus(error.message || 'Unable to update relationship', 'error'); }
}
async function saveRelationshipCell(row, field, newValue, oldValue) {
  if (field !== 'position' || newValue === oldValue) return;
  const position = Number(newValue);
  if (!Number.isFinite(position)) {
    setStatus('Position must be a number', 'error');
    await loadModel();
    return;
  }
  setStatus('Updating relationship…');
  try {
    await eBliss.relationships.update(row.id, { position });
    await loadModel();
    setStatus('Relationship updated', 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to update relationship', 'error');
    await loadModel();
  }
}
function holonMenu(event, holon, show) { show([{ label: 'New Holon', action: createHolon }, { label: 'Edit', action: () => editHolon(holon) }, { label: 'Delete', action: () => deleteHolon(holon) }]); }
function relationshipMenu(event, relationship, show) { show([{ label: 'New Relationship', action: createRelationship }, { label: 'Edit', action: () => editRelationship(relationship) }, { label: 'Delete', action: () => deleteRelationship(relationship) }]); }

function createViews() {
  treeGrid?.destroy(); holonGrid?.destroy(); relationshipGrid?.destroy(); holonGraph?.cy.destroy();
  treeGrid = createTree({ element: elements.tree, holons, relationships, rootId: elements.treeRoot.value, relationshipTypeId: elements.treeRelationship.value, onSelect: openHolon, onCreate: createHolon, onEdit: editHolon, onDelete: deleteHolon });
  holonGrid = createHolonGrid({ element: elements.grid, holons, onSelect: openHolon, onContextMenu: holonMenu, onRowEdit: saveHolonCell, onRowDoubleClick: focusGraph });
  relationshipGrid = createRelationshipGrid({ element: elements.detailGrid, relationships, onContextMenu: relationshipMenu, onRowEdit: saveRelationshipCell });
  holonGraph = createHolonGraph({ element: elements.graph, holons, relationships, onSelect: openHolon, depth: elements.graphDepth.value });
}
function updateTreeView() {
  updateTree(treeGrid, holons, relationships, elements.treeRoot.value, elements.treeRelationship.value);
}
async function loadModel() {
  setStatus('Loading Holon model…');
  try { const model = await loadHolons(eBliss); holons = model.holons; relationships = model.relationships; relationshipTypes = model.relationshipTypes; holonTypes = model.holonTypes || []; populateTreeSelectors(); createViews(); setStatus(`${holons.length} holons · ${relationships.length} relationships`, 'success'); }
  catch (error) { setStatus(error.message || 'Unable to load Holon model', 'error'); }
}
async function applySession(session) {
  const user = session?.user || null; elements.app.hidden = !user; elements.refresh.disabled = !user;
  if (user) return loadModel();
  holons = []; relationships = []; relationshipTypes = []; holonTypes = []; treeGrid?.destroy(); holonGrid?.destroy(); relationshipGrid?.destroy(); holonGraph?.cy.destroy(); treeGrid = holonGrid = relationshipGrid = holonGraph = null; setStatus('Sign in to open the Holon Workspace');
}

elements.treeRoot.addEventListener('change', updateTreeView); elements.treeRelationship.addEventListener('change', updateTreeView); elements.graphDepth.addEventListener('change', event => holonGraph?.setDepth(event.target.value)); elements.refresh.addEventListener('click', loadModel);
elements.newHolon.addEventListener('click', () => createHolon());
elements.newHolonType.addEventListener('click', createHolonType);
elements.testComboBox.addEventListener('click', testComboBox);
elements.refreshApp.addEventListener('click', () => location.reload()); elements.debugApp.addEventListener('click', () => { setStatus('Debugger paused', 'warn'); debugger; });
elements.testStatusSuccess.addEventListener('click', () => setStatus('Test success message', 'success')); elements.testStatusWarn.addEventListener('click', () => setStatus('Test warning message', 'warn')); elements.testStatusError.addEventListener('click', () => setStatus('Test error message', 'error'));
const authResult = initAuth({ api: eBliss, container: elements.auth, setStatus, onSession: applySession });
authResult.then(({ data, error }) => { if (error) setStatus(error.message, 'error'); else applySession(data.session); });
