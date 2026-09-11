import { eBConfirm } from './eBConfirm.js';
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
const DYNAMIC_FIELDS_KEY = '_eBFields';
const LEGACY_CONTENT_KEY = '_legacyContent';
const elements = {
  app: document.getElementById('app'), auth: document.getElementById('auth'), graph: document.getElementById('holonGraph'), graphRoot: document.getElementById('graphRoot'), graphDepth: document.getElementById('graphDepth'),
  inspector: document.getElementById('holonInspector'), inspectorContent: document.getElementById('holonInspectorContent'),
  refresh: document.getElementById('refresh'), refreshApp: document.getElementById('refreshApp'), debugApp: document.getElementById('debugApp'),
  newHolon: document.getElementById('newHolon'), newRelationship: document.getElementById('newRelationship'), newHolonType: document.getElementById('newHolonType'), newRelationshipType: document.getElementById('newRelationshipType'),
  testStatusSuccess: document.getElementById('testStatusSuccess'), testStatusWarn: document.getElementById('testStatusWarn'), testStatusError: document.getElementById('testStatusError'),
};
let holons = [], relationships = [], relationshipTypes = [], holonTypes = [];
let graph = null, graphRootCombo = null, propertyGrid = null, selectedHolon = null, selectedRelationship = null;

function setStatus(text, level = 'info') { if (!text) return status.clear(); status[level](text); }
function formatPropertyValue(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'object') { try { return JSON.stringify(value, null, 2); } catch { return String(value); } } return String(value); }
function labelForKey(key) { return key.replace(/_id$/i, ' ID').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase()); }
function translateId(key, value) { if (value === null || value === undefined || value === '') return '—'; const id = String(value); if (key === 'holon_type_id') { const type = holonTypes.find(item => String(item.id) === id); return type ? type.name : id; } if (key === 'parent_holon_id' || key === 'source_holon_id' || key === 'target_holon_id') { const holon = holons.find(item => String(item.id) === id); return holon ? (holon.name || '(unnamed Holon)') : id; } if (key === 'relationship_type_id') { const type = relationshipTypes.find(item => String(item.id) === id); return type ? (type.name || '(unnamed relationship)') : id; } return id; }
function propertyValueForDisplay(key, value) { return /_id$/i.test(key) ? translateId(key, value) : formatPropertyValue(value); }
function isEditableHolonProperty(key) { return key !== 'id' && key !== 'created_at'; }
function getStoredGraphRoot() { try { return localStorage.getItem(GRAPH_ROOT_STORAGE_KEY); } catch { return null; } }
function storeGraphRoot(rootId) { try { if (rootId) localStorage.setItem(GRAPH_ROOT_STORAGE_KEY, String(rootId)); else localStorage.removeItem(GRAPH_ROOT_STORAGE_KEY); } catch { /* Storage may be unavailable; graph still works for this session. */ } }

function decodeDynamicContent(raw) {
  if (raw === null || raw === undefined || raw === '') return { fields: {}, legacyContent: '' };
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object' && parsed[DYNAMIC_FIELDS_KEY] && typeof parsed[DYNAMIC_FIELDS_KEY] === 'object') {
      return { fields: { ...parsed[DYNAMIC_FIELDS_KEY] }, legacyContent: String(parsed[LEGACY_CONTENT_KEY] ?? '') };
    }
  } catch { /* Legacy plain-text Content. */ }
  return { fields: {}, legacyContent: String(raw) };
}

function parseFieldDefinition(raw) {
  if (raw === null || raw === undefined || raw === '') return {};
  try { const parsed = JSON.parse(String(raw)); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}

function encodeDynamicContent(fields, legacyContent = '') {
  const cleanFields = Object.fromEntries(Object.entries(fields || {}).filter(([, value]) => value !== undefined));
  if (!Object.keys(cleanFields).length) return String(legacyContent ?? '');
  const envelope = { [DYNAMIC_FIELDS_KEY]: cleanFields };
  if (legacyContent !== null && legacyContent !== undefined && legacyContent !== '') envelope[LEGACY_CONTENT_KEY] = String(legacyContent);
  return JSON.stringify(envelope);
}

function dynamicFieldDefinitions(typeName) {
  const typeHolon = holons.find(h => h.holon_type === 'Holon Type' && String(h.name).trim().toLowerCase() === String(typeName || '').trim().toLowerCase());
  if (!typeHolon) return [];
  const fieldTypeIds = new Set(holonTypes.filter(t => t.name === 'Holon Field').map(t => String(t.id)));
  const fieldIds = new Set(relationships.filter(r => String(r.target_holon_id) === String(typeHolon.id) && relationshipTypes.find(t => String(t.id) === String(r.relationship_type_id))?.name?.toLowerCase() === 'field of').map(r => String(r.source_holon_id)));
  return holons.filter(h => fieldIds.has(String(h.id)) && fieldTypeIds.has(String(h.holon_type_id))).map(field => {
    const meta = parseFieldDefinition(field.Content);
    return { id: field.id, name: field.name || '(unnamed field)', dataType: String(meta.dataType || 'text').toLowerCase(), required: meta.required === true, defaultValue: meta.defaultValue ?? '', order: Number(meta.order ?? 0) };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function normalizeDynamicValue(field, value) {
  const dataType = String(field.dataType || 'text').toLowerCase();
  if (dataType === 'boolean') { if (typeof value === 'boolean') return value; const text = String(value ?? '').trim().toLowerCase(); if (text === '' && !field.required) return false; if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true; if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false; throw new Error(`${field.name} must be true or false`); }
  if (dataType === 'integer') { if (value === '' || value === null || value === undefined) { if (field.required) throw new Error(`${field.name} is required`); return null; } const number = Number(value); if (!Number.isInteger(number)) throw new Error(`${field.name} must be a whole number`); return number; }
  if (dataType === 'number' || dataType === 'float' || dataType === 'double') { if (value === '' || value === null || value === undefined) { if (field.required) throw new Error(`${field.name} is required`); return null; } const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${field.name} must be a number`); return number; }
  if (dataType === 'json' || dataType === 'array') { if (value === '' || value === null || value === undefined) { if (field.required) throw new Error(`${field.name} is required`); return null; } let parsed; try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new Error(`${field.name} must contain valid JSON`); } if (dataType === 'array' && !Array.isArray(parsed)) throw new Error(`${field.name} must contain a JSON array`); return parsed; }
  if (dataType === 'date' || dataType === 'datetime' || dataType === 'time' || dataType === 'uuid' || dataType === 'reference') { const text = String(value ?? '').trim(); if (!text && field.required) throw new Error(`${field.name} is required`); if (dataType === 'uuid' && text && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(`${field.name} must be a valid UUID`); return text; }
  const text = String(value ?? ''); if (!text.trim() && field.required) throw new Error(`${field.name} is required`); return text;
}

function dynamicFieldEditor(field, currentValue) {
  const dataType = String(field.dataType || 'text').toLowerCase();
  if (dataType === 'reference') return { type: 'combobox', options: holonOptions(true, currentValue), value: currentValue ?? '', displayValue: translateId('reference', currentValue), minChars: 0, allowCustom: false, clearable: true };
  if (dataType === 'text') return { type: 'textarea', rows: 6 };
  if (dataType === 'json' || dataType === 'array') return { type: 'textarea', rows: 8 };
  if (dataType === 'boolean') return { type: 'checkbox' };
  if (dataType === 'integer') return { type: 'input', inputType: 'number', step: 1 };
  if (dataType === 'number' || dataType === 'float' || dataType === 'double') return { type: 'input', inputType: 'number', step: 'any' };
  if (dataType === 'date') return { type: 'input', inputType: 'date' };
  if (dataType === 'datetime') return { type: 'input', inputType: 'datetime-local' };
  if (dataType === 'time') return { type: 'input', inputType: 'time' };
  return { type: 'text' };
}

async function saveDynamicField(holon, field, value) {
  let normalized;
  try { normalized = normalizeDynamicValue(field, value); } catch (error) { setStatus(error.message || `Invalid ${field.name}`, 'warn'); renderHolonInspector(holon); return; }
  const decoded = decodeDynamicContent(holon.Content);
  const nextFields = { ...decoded.fields, [String(field.id)]: normalized };
  const nextContent = encodeDynamicContent(nextFields, decoded.legacyContent);
  if (nextContent === String(holon.Content ?? '')) return;
  setStatus(`Updating ${field.name}…`);
  try { await eBliss.holons.update(holon.id, { Content: nextContent }); await loadModel(); const updated = holons.find(item => String(item.id) === String(holon.id)) || { ...holon, Content: nextContent }; selectedHolon = updated; renderHolonInspector(updated); status.updated(field.name, normalized === '' || normalized === null ? '—' : formatPropertyValue(normalized)); }
  catch (error) { setStatus(error.message || `Unable to update ${field.name}`, 'error'); renderHolonInspector(holon); }
}

async function initializeDynamicFields(holon) {
  const fields = dynamicFieldDefinitions(holon.holon_type); if (!fields.length) return holon;
  const decoded = decodeDynamicContent(holon.Content); const nextFields = { ...decoded.fields }; let changed = false;
  fields.forEach(field => { const key = String(field.id); if (!(key in nextFields)) { nextFields[key] = field.defaultValue; changed = true; } });
  if (!changed) return holon;
  const nextContent = encodeDynamicContent(nextFields, decoded.legacyContent); return eBliss.holons.update(holon.id, { Content: nextContent });
}

async function saveInspectorProperty(holon, key, value) {
  if (key.startsWith('field:')) { const fieldId = key.slice('field:'.length); const field = dynamicFieldDefinitions(holon.holon_type).find(item => String(item.id) === fieldId); if (!field) { setStatus('Dynamic field definition is no longer available', 'error'); return; } await saveDynamicField(holon, field, value); return; }
  if (!isEditableHolonProperty(key)) { setStatus(`${labelForKey(key)} is read-only`, 'warn'); renderHolonInspector(holon); return; }
  const nextValue = key === 'Content' ? String(value ?? '') : String(value ?? '').trim();
  if (key === 'name' && !nextValue) { setStatus('Name cannot be empty', 'warn'); renderHolonInspector(holon); return; }
  if (nextValue === String(holon[key] ?? '')) return;
  setStatus(`Updating ${labelForKey(key)}…`);
  try { await eBliss.holons.update(holon.id, { [key]: nextValue }); await loadModel(); const updated = holons.find(item => String(item.id) === String(holon.id)) || { ...holon, [key]: nextValue }; selectedHolon = updated; renderHolonInspector(updated); const node = graph?.nodes?.(`[id = "${String(updated.id).replaceAll('"', '\\"')}"]`); node?.select(); if (node?.nonempty?.()) graph.center(node); status.updated(key, propertyValueForDisplay(key, nextValue)); }
  catch (error) { setStatus(error.message || `Unable to update ${labelForKey(key)}`, 'error'); renderHolonInspector(holon); }
}

function injectInspectorStyles() { if (document.getElementById('eb-inspector-field-boundary-style')) return; const style = document.createElement('style'); style.id = 'eb-inspector-field-boundary-style'; style.textContent = '.holon-property-grid tr.eb-dynamic-field-start td { border-top: 1px solid currentColor; }'; document.head.appendChild(style); }
function markDynamicFieldBoundary(gridElement, schemaRowCount) { if (!schemaRowCount) return; requestAnimationFrame(() => { const rows = gridElement.querySelectorAll('tbody tr'); rows[schemaRowCount]?.classList.add('eb-dynamic-field-start'); }); }

function renderHolonInspector(holon) {
  if (!elements.inspectorContent) return;
  propertyGrid?.destroy?.(); propertyGrid = null; elements.inspectorContent.replaceChildren();
  if (!holon) { const empty = document.createElement('div'); empty.className = 'muted'; empty.textContent = 'Select a Holon to inspect its properties.'; elements.inspectorContent.appendChild(empty); return; }
  selectedHolon = holon; selectedRelationship = null;
  const title = document.createElement('div'); title.className = 'holon-inspector-title'; title.textContent = holon.name || '(unnamed Holon)'; elements.inspectorContent.appendChild(title);
  const actions = document.createElement('div'); actions.className = 'holon-inspector-actions'; const editButton = document.createElement('button'); editButton.type = 'button'; editButton.textContent = 'Edit Holon'; editButton.addEventListener('click', () => editHolon(holon)); actions.appendChild(editButton); elements.inspectorContent.appendChild(actions);
  const dynamicFields = dynamicFieldDefinitions(holon.holon_type); const decoded = decodeDynamicContent(holon.Content);
  const schemaRows = Object.entries(holon).filter(([key]) => key !== 'children' && key !== 'Content').map(([key, value]) => ({ key, property: labelForKey(key), value: propertyValueForDisplay(key, value) }));
  schemaRows.push({ key: 'Content', property: 'Content', value: decoded.legacyContent || '—' });
  const dynamicRows = dynamicFields.map(field => ({ key: `field:${field.id}`, property: field.name, value: formatPropertyValue(decoded.fields[String(field.id)] ?? field.defaultValue) }));
  const rows = [...schemaRows, ...dynamicRows];
  const gridElement = document.createElement('div'); gridElement.className = 'holon-property-grid'; gridElement.setAttribute('aria-label', `${holon.name || 'Holon'} properties`); elements.inspectorContent.appendChild(gridElement);
  propertyGrid = createEBGrid(gridElement, { data: rows, columns: [{ key: 'property', label: 'Property', sortable: true }, { key: 'value', label: 'Value', sortable: true, editor: row => { if (row.key === 'holon_type') return { type: 'combobox', options: holonTypeOptions(holon.holon_type), value: holon.holon_type, minChars: 0, allowCustom: false }; if (row.key.startsWith('field:')) { const field = dynamicFields.find(item => String(item.id) === row.key.slice('field:'.length)); if (field) return dynamicFieldEditor(field, decoded.fields[String(field.id)] ?? field.defaultValue); } if (row.key === 'Content') return { type: 'textarea', rows: 6 }; if (row.key === 'id' || row.key === 'created_at') return null; return { type: 'text' }; } }], pageSize: Math.max(rows.length, 10), pagination: false, filterable: false, sortable: true, resizableColumns: true, editableRows: true, keyboardNavigation: true, contextMenu: false, onRowEdit: (row, field, newValue) => { if (field !== 'value') return; const key = row.key; if (key.startsWith('field:')) { void saveInspectorProperty(holon, key, newValue); return; } const rawValue = String(newValue ?? ''); const originalValue = propertyValueForDisplay(key, key === 'Content' ? decoded.legacyContent : holon[key]); if (rawValue === originalValue) return; void saveInspectorProperty(holon, key, rawValue); } });
  markDynamicFieldBoundary(gridElement, schemaRows.length);
}

function relationshipEndpointName(id, fallback = '—') { if (!id) return fallback; return holons.find(item => String(item.id) === String(id))?.name || '(unnamed Holon)'; }
function relationshipTypeName(id, fallback = '—') { if (!id) return fallback; return relationshipTypes.find(item => String(item.id) === String(id))?.name || '(unnamed relationship)'; }
function relationshipPropertyValue(key, value) { if (key === 'source_holon_id' || key === 'target_holon_id') return relationshipEndpointName(value); if (key === 'relationship_type_id') return relationshipTypeName(value); return formatPropertyValue(value); }
function relationshipComboOptions(kind, selected = '') { const options = kind === 'relationship' ? relationshipTypes.map(type => ({ value: type.id, label: type.name || '(unnamed relationship)' })) : holons.map(holon => ({ value: holon.id, label: holon.name || '(unnamed Holon)' })); if (selected && !options.some(option => String(option.value) === String(selected))) options.unshift({ value: selected, label: relationshipPropertyValue(kind === 'relationship' ? 'relationship_type_id' : `${kind}_holon_id`, selected) }); return options; }
async function saveRelationshipProperty(relationship, key, value) { let nextValue = value; if (key === 'source_holon_id' || key === 'target_holon_id' || key === 'relationship_type_id') { nextValue = String(value ?? '').trim(); if (!nextValue) { setStatus(`${labelForKey(key)} is required`, 'warn'); renderRelationshipInspector(relationship); return; } const exists = key === 'relationship_type_id' ? relationshipTypes.some(type => String(type.id) === nextValue) : holons.some(holon => String(holon.id) === nextValue); if (!exists) { setStatus(`Unknown ${labelForKey(key)}`, 'warn'); renderRelationshipInspector(relationship); return; } } else if (key === 'position') { nextValue = Number(value); if (!Number.isInteger(nextValue)) { setStatus('Position must be a whole number', 'warn'); renderRelationshipInspector(relationship); return; } } if (String(nextValue) === String(relationship[key] ?? '')) return; setStatus(`Updating relationship ${labelForKey(key)}…`); try { await eBliss.relationships.update(relationship.id, { [key]: nextValue }); await loadModel(); const updated = relationships.find(item => String(item.id) === String(relationship.id)) || { ...relationship, [key]: nextValue }; selectedRelationship = updated; renderRelationshipInspector(updated); status.updated(labelForKey(key), relationshipPropertyValue(key, nextValue)); } catch (error) { setStatus(error.message || `Unable to update relationship ${labelForKey(key)}`, 'error'); renderRelationshipInspector(relationship); } }
function renderRelationshipInspector(relationship) { if (!elements.inspectorContent) return; propertyGrid?.destroy?.(); propertyGrid = null; elements.inspectorContent.replaceChildren(); if (!relationship) { const empty = document.createElement('div'); empty.className = 'muted'; empty.textContent = 'Select a Holon or relationship to inspect its properties.'; elements.inspectorContent.appendChild(empty); return; } selectedRelationship = relationship; selectedHolon = null; const sourceName = relationshipEndpointName(relationship.source_holon_id, '(source)'); const targetName = relationshipEndpointName(relationship.target_holon_id, '(target)'); const title = document.createElement('div'); title.className = 'holon-inspector-title'; title.textContent = `${sourceName} → ${targetName}`; elements.inspectorContent.appendChild(title); const rows = [{ key: 'source_holon_id', property: 'Source Holon', value: sourceName }, { key: 'relationship_type_id', property: 'Relationship Type', value: relationshipTypeName(relationship.relationship_type_id) }, { key: 'target_holon_id', property: 'Target Holon', value: targetName }, { key: 'position', property: 'Position', value: formatPropertyValue(relationship.position) }]; const gridElement = document.createElement('div'); gridElement.className = 'holon-property-grid'; gridElement.setAttribute('aria-label', `${sourceName} to ${targetName} relationship properties`); elements.inspectorContent.appendChild(gridElement); propertyGrid = createEBGrid(gridElement, { data: rows, columns: [{ key: 'property', label: 'Property', sortable: true }, { key: 'value', label: 'Value', sortable: true, editor: row => { if (row.key === 'source_holon_id') return { type: 'combobox', options: relationshipComboOptions('source', relationship.source_holon_id), value: relationship.source_holon_id, displayValue: sourceName, minChars: 0, allowCustom: false, clearable: false }; if (row.key === 'relationship_type_id') return { type: 'combobox', options: relationshipComboOptions('relationship', relationship.relationship_type_id), value: relationship.relationship_type_id, displayValue: relationshipTypeName(relationship.relationship_type_id), minChars: 0, allowCustom: false, clearable: false }; if (row.key === 'target_holon_id') return { type: 'combobox', options: relationshipComboOptions('target', relationship.target_holon_id), value: relationship.target_holon_id, displayValue: targetName, minChars: 0, allowCustom: false, clearable: false }; if (row.key === 'position') return { type: 'input', inputType: 'number', step: 1 }; return null; } }], pageSize: rows.length, pagination: false, filterable: false, sortable: true, resizableColumns: true, editableRows: true, keyboardNavigation: true, contextMenu: false, onRowEdit: (row, field, newValue) => { if (field !== 'value') return; void saveRelationshipProperty(relationship, row.key, newValue); } }); }

function selectHolonInInspector(holon) { if (!holon) return; renderHolonInspector(holon); const node = graph?.nodes?.(`[id = "${String(holon.id).replaceAll('"', '\\"')}"]`); node?.select(); if (node?.nonempty?.()) graph.center(node); }
function openHolon(holon) { if (!holon) return; selectHolonInInspector(holon); window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon })); }
function resolveGraphRoot(value) { if (!value) return null; const candidate = typeof value === 'object' ? (value.value ?? value.id ?? '') : value; const text = String(candidate).trim(); if (!text) return null; const byId = holons.find(holon => String(holon.id) === text); if (byId) return byId.id; const normalized = text.toLowerCase(); return holons.find(holon => String(holon.name ?? '').trim().toLowerCase() === normalized)?.id ?? null; }
function applyGraphRoot(value) { const rootId = resolveGraphRoot(value); if (!rootId) { storeGraphRoot(null); setGraphRoot(null); return; } const root = holons.find(holon => String(holon.id) === String(rootId)); elements.graphRoot.value = root?.name || ''; storeGraphRoot(rootId); setGraphRoot(rootId); }
function refreshGraphRootCombo() { if (!elements.graphRoot) return; const currentText = elements.graphRoot.value; graphRootCombo?.destroy?.(); graphRootCombo = createEBComboBox(elements.graphRoot, { source: holonComboOptions(holons), minChars: 0, clearable: true, placeholder: 'Choose a root Holon…', onChange: (_input, value) => applyGraphRoot(Array.isArray(value) ? value[0] : value), onSelect: (_input, item) => applyGraphRoot(item?.value ?? item) }); const restored = resolveGraphRoot(currentText); if (restored) { const selected = holons.find(holon => String(holon.id) === String(restored)); elements.graphRoot.value = selected?.name || ''; } }
function restoreStoredGraphRoot() { const saved = getStoredGraphRoot(); if (!saved) return; const rootId = resolveGraphRoot(saved); if (!rootId) { storeGraphRoot(null); return; } const root = holons.find(holon => String(holon.id) === String(rootId)); if (!root) { storeGraphRoot(null); return; } elements.graphRoot.value = root.name || ''; setGraphRoot(root.id); }
function holonTypeOptions(selected = '') { const options = holonTypes.map(type => ({ value: type.name, label: type.name })); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selected }); return options; }
function defaultHolonType() { return holonTypes.find(type => type.name === 'Holon')?.name || holonTypes.find(type => type.name === 'Tree Branch')?.name || holonTypes[0]?.name || ''; }
function holonOptions(includeNone = false, selected = '') { const options = holons.map(h => ({ value: h.id, label: h.name || '(unnamed)' })); if (includeNone) options.unshift({ value: '', label: '— None —' }); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' }); return options; }
function relationshipTypeOptions(includeNone = false, selected = '') { const options = relationshipTypes.map(t => ({ value: t.id, label: t.name || '(unnamed)' })); if (includeNone) options.unshift({ value: '', label: '— None —' }); if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: '(current)' }); return options; }
async function deleteRelationship(relationship, point = {}) { if (!relationship?.id) return; const source = holons.find(item => String(item.id) === String(relationship.source_holon_id))?.name || '(source)'; const target = holons.find(item => String(item.id) === String(relationship.target_holon_id))?.name || '(target)'; if (!await eBConfirm({ message: `Delete relationship between “${source}” and “${target}”?`, confirmLabel: 'Delete', x: point.x, y: point.y, returnFocus: point.returnFocus })) return; setStatus('Deleting relationship…'); try { await eBliss.relationships.delete(relationship.id); await loadModel(); setStatus('Relationship deleted', 'success'); } catch (error) { setStatus(error.message || 'Unable to delete relationship', 'error'); } }
async function deleteHolon(holon) { const name = holon.name || '(unnamed)'; if (!confirm(`Delete “${name}”?`)) return; setStatus(`Deleting ${name}…`); try { await eBliss.holons.delete(holon.id); await loadModel(); setStatus(`Deleted ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to delete Holon', 'error'); } }
async function createHolonType() { const values = await showModal({ title: 'New Holon Type', submitLabel: 'Create Type', fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Service' }, { name: 'description', label: 'Description', placeholder: 'What kind of Holon is this?' }] }); if (!values?.name?.trim()) return; const name = values.name.trim(), description = values.description?.trim() || ''; setStatus(`Creating Holon type ${name}…`); try { await eBliss.holonTypes.create({ name, description }); await loadModel(); setStatus(`Created Holon type ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to create Holon type', 'error'); } }
async function createRelationshipType() { const values = await showModal({ title: 'New Relationship Type', submitLabel: 'Create Relationship Type', fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Field Of' }, { name: 'description', label: 'Description', placeholder: 'What does this relationship mean?' }] }); if (!values?.name?.trim()) return; const name = values.name.trim(), description = values.description?.trim() || ''; setStatus(`Creating relationship type ${name}…`); try { await eBliss.relationshipTypes.create({ name, description }); await loadModel(); setStatus(`Created relationship type ${name}`, 'success'); } catch (error) { setStatus(error.message || 'Unable to create relationship type', 'error'); } }
async function createHolon(prefillName = '', prefillType = '', parentHolon = null) { const type = prefillType || defaultHolonType(); if (!type) { setStatus('No Holon types are available', 'error'); return null; } const values = await showModal({ title: 'New Holon', submitLabel: 'Create Holon', fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'Holon name', value: prefillName }, { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(type), value: type, required: true, minChars: 0, allowCustom: false, placeholder: 'Find a Holon type…' }, { name: 'relationship_type_id', label: 'Initial Relationship', type: 'select', options: relationshipTypeOptions(true), value: '' }, { name: 'parent_holon_id', label: 'Parent Holon', type: 'select', options: holonOptions(true, parentHolon?.id || ''), value: parentHolon?.id || '' }, { name: 'position', label: 'Position', type: 'number', value: '0' }] }); if (!values?.name?.trim()) return null; if ((values.relationship_type_id && !values.parent_holon_id) || (!values.relationship_type_id && values.parent_holon_id)) { setStatus('Choose both an initial relationship and a parent Holon, or leave both empty', 'warn'); return null; } const name = values.name.trim(); setStatus(`Creating ${name}…`); try { let holon = await eBliss.holons.create({ name, holon_type: values.holon_type }); holon = await initializeDynamicFields(holon) || holon; if (values.relationship_type_id && values.parent_holon_id) await eBliss.relationships.create({ source_holon_id: holon.id, target_holon_id: values.parent_holon_id, relationship_type_id: values.relationship_type_id, position: Number(values.position) || 0 }); await loadModel(); holon = holons.find(item => String(item.id) === String(holon.id)) || holon; openHolon(holon); setStatus(`Created ${name}`, 'success'); return holon; } catch (error) { setStatus(error.message || 'Unable to create Holon', 'error'); return null; } }
async function editHolon(holon) { const currentType = holon.holon_type || defaultHolonType(); const values = await showModal({ title: 'Edit Holon', submitLabel: 'Save Changes', fields: [{ name: 'name', label: 'Name', required: true, value: holon.name || '' }, { name: 'holon_type', label: 'Type', type: 'combobox', options: holonTypeOptions(currentType), value: currentType, required: true, minChars: 0, allowCustom: false }] }); if (!values) return; const name = values.name.trim(), holonType = values.holon_type.trim(); if (!name || !holonType) return setStatus('Name and type are required', 'warn'); setStatus('Updating Holon…'); try { await eBliss.holons.update(holon.id, { name, holon_type: holonType }); await loadModel(); openHolon(holons.find(h => h.id === holon.id) || { ...holon, name, holon_type: holonType }); setStatus('Holon updated', 'success'); } catch (error) { setStatus(error.message || 'Unable to update Holon', 'error'); } }
async function createRelationship() { if (holons.length < 2 || !relationshipTypes.length) return setStatus('Need at least two Holons and one relationship type', 'warn'); const values = await showModal({ title: 'New Relationship', submitLabel: 'Create Relationship', fields: [{ name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions(), required: true }, { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: relationshipTypeOptions(), required: true }, { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions(), required: true }, { name: 'position', label: 'Position', type: 'number', value: '0' }] }); if (!values) return; setStatus('Creating relationship…'); try { await eBliss.relationships.create({ source_holon_id: values.source_holon_id, relationship_type_id: values.relationship_type_id, target_holon_id: values.target_holon_id, position: Number(values.position) || 0 }); await loadModel(); setStatus('Relationship created', 'success'); } catch (error) { setStatus(error.message || 'Unable to create relationship', 'error'); } }
async function loadModel() { const model = await loadHolons(eBliss); holons = model.holons || []; relationships = model.relationships || []; relationshipTypes = model.relationshipTypes || []; holonTypes = model.holonTypes || []; refreshGraphRootCombo(); updateHolonGraph({ holons, relationships, relationshipTypes }); restoreStoredGraphRoot(); if (selectedRelationship) { const refreshed = relationships.find(r => String(r.id) === String(selectedRelationship.id)); renderRelationshipInspector(refreshed || null); } else if (selectedHolon) { const refreshed = holons.find(h => String(h.id) === String(selectedHolon.id)); renderHolonInspector(refreshed || null); } }
function wireUI() {
  elements.newHolon?.addEventListener('click', () => void createHolon()); elements.newRelationship?.addEventListener('click', () => void createRelationship()); elements.newHolonType?.addEventListener('click', () => void createHolonType()); elements.newRelationshipType?.addEventListener('click', () => void createRelationshipType()); elements.refresh?.addEventListener('click', () => void loadModel()); elements.refreshApp?.addEventListener('click', () => window.location.reload()); elements.debugApp?.addEventListener('click', () => console.log({ holons, relationships, relationshipTypes, holonTypes }));
  window.addEventListener('holon:contextcreate', event => void createHolon('', '', event.detail?.parent || null)); window.addEventListener('holon:contextedit', event => { if (event.detail?.holon) void editHolon(event.detail.holon); }); window.addEventListener('holon:contextdelete', event => { if (event.detail?.holon) void deleteHolon(event.detail.holon); }); window.addEventListener('relationship:selected', event => { if (event.detail?.id) renderRelationshipInspector(event.detail); }); window.addEventListener('relationship:contextdelete', event => { if (event.detail?.relationship) void deleteRelationship(event.detail.relationship, event.detail); });
  window.addEventListener('eB:modelChanged', () => void loadModel());
}
async function start() { wireUI(); try { await initAuth({ api: eBliss, container: elements.auth, onSession: async session => { elements.app.hidden = !session; if (session) { if (!graph) graph = createHolonGraph({ element: elements.graph, holons, relationships, relationshipTypes, onSelect: openHolon }); await loadModel(); } }, setStatus }); } catch (error) { setStatus(error.message || 'Unable to start application', 'error'); } }

injectInspectorStyles();
start();