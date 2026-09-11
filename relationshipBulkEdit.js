import { eBliss } from './eBSDK.js';
import { eBStatus } from './eBStatus.js';
import { getHolonGraph } from './holonGraph.js';

const selectedIds = new Set();
let model = { holons: [], relationships: [], relationshipTypes: [] };
let installed = false;
let rendering = false;

const MIXED = '__eb_mixed__';

function byName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
}

function commonValue(items, key) {
  if (!items.length) return '';
  const first = String(items[0]?.[key] ?? '');
  return items.every(item => String(item?.[key] ?? '') === first) ? first : MIXED;
}

function relationshipById(id) {
  return model.relationships.find(item => String(item.id) === String(id));
}

function selectedRelationships() {
  return [...selectedIds].map(relationshipById).filter(Boolean);
}

function restoreGraphSelection() {
  const graph = getHolonGraph();
  if (!graph) return;
  graph.edges().unselect();
  selectedIds.forEach(id => graph.getElementById(String(id))?.select?.());
}

function field(labelText) {
  const wrapper = document.createElement('label');
  wrapper.className = 'eb-bulk-relationship-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  wrapper.appendChild(label);
  return wrapper;
}

function addMixedOption(select) {
  const option = document.createElement('option');
  option.value = MIXED;
  option.textContent = '— Mixed —';
  select.appendChild(option);
}

function holonSelect(value) {
  const select = document.createElement('select');
  if (value === MIXED) addMixedOption(select);
  model.holons
    .filter(holon => String(holon.holon_type || '').toLowerCase() !== 'provenance')
    .slice()
    .sort(byName)
    .forEach(holon => {
      const option = document.createElement('option');
      option.value = String(holon.id);
      option.textContent = holon.name || '(unnamed Holon)';
      select.appendChild(option);
    });
  select.value = value;
  return select;
}

function relationshipTypeSelect(value) {
  const select = document.createElement('select');
  if (value === MIXED) addMixedOption(select);
  model.relationshipTypes.slice().sort(byName).forEach(type => {
    const option = document.createElement('option');
    option.value = String(type.id);
    option.textContent = type.name || '(unnamed relationship)';
    select.appendChild(option);
  });
  select.value = value;
  return select;
}

function ensureStyles() {
  if (document.getElementById('eb-bulk-relationship-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-bulk-relationship-style';
  style.textContent = `
    .eb-bulk-relationship-editor { display:grid; gap:12px; }
    .eb-bulk-relationship-title { font-size:18px; font-weight:700; }
    .eb-bulk-relationship-hint { font-size:11px; opacity:.68; margin-top:-6px; }
    .eb-bulk-relationship-field { display:grid; gap:5px; }
    .eb-bulk-relationship-field > span { font-size:12px; font-weight:600; opacity:.72; }
    .eb-bulk-relationship-field select,
    .eb-bulk-relationship-field input { width:100%; box-sizing:border-box; padding:7px 8px; border:1px solid var(--eb-border-strong); border-radius:5px; background:var(--eb-input-bg); color:var(--eb-text); }
    .eb-bulk-relationship-actions { display:flex; gap:8px; align-items:center; }
    .eb-bulk-relationship-actions button { padding:7px 11px; border:1px solid var(--eb-border-strong); border-radius:5px; background:var(--eb-input-bg); color:var(--eb-text); cursor:pointer; }
    .eb-bulk-relationship-count { font-size:11px; opacity:.68; }
  `;
  document.head.appendChild(style);
}

async function loadModel() {
  model = await eBliss.model.load();
}

function render() {
  if (rendering || selectedIds.size < 2) return;
  const container = document.getElementById('holonInspectorContent');
  if (!container) return;

  const relationships = selectedRelationships();
  if (relationships.length < 2) return;

  rendering = true;
  ensureStyles();
  container.replaceChildren();

  const editor = document.createElement('div');
  editor.className = 'eb-bulk-relationship-editor';

  const title = document.createElement('div');
  title.className = 'eb-bulk-relationship-title';
  title.textContent = `${relationships.length} Relationships`;

  const hint = document.createElement('div');
  hint.className = 'eb-bulk-relationship-hint';
  hint.textContent = 'Ctrl-click relationships to add/remove them. Change only the fields you want to apply to all selected relationships.';

  const sourceInitial = commonValue(relationships, 'source_holon_id');
  const typeInitial = commonValue(relationships, 'relationship_type_id');
  const targetInitial = commonValue(relationships, 'target_holon_id');
  const positionInitial = commonValue(relationships, 'position');

  const sourceField = field('Source Holon');
  const source = holonSelect(sourceInitial);
  sourceField.appendChild(source);

  const typeField = field('Relationship Type');
  const type = relationshipTypeSelect(typeInitial);
  typeField.appendChild(type);

  const targetField = field('Target Holon');
  const target = holonSelect(targetInitial);
  targetField.appendChild(target);

  const positionField = field('Position');
  const position = document.createElement('input');
  position.type = 'number';
  position.step = '1';
  if (positionInitial === MIXED) position.placeholder = 'Mixed';
  else position.value = positionInitial;
  positionField.appendChild(position);

  const actions = document.createElement('div');
  actions.className = 'eb-bulk-relationship-actions';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply to selected';
  const count = document.createElement('span');
  count.className = 'eb-bulk-relationship-count';
  count.textContent = `${relationships.length} selected`;
  actions.append(apply, count);

  apply.addEventListener('click', async () => {
    const changes = {};
    if (source.value !== MIXED && source.value !== sourceInitial) changes.source_holon_id = source.value;
    if (type.value !== MIXED && type.value !== typeInitial) changes.relationship_type_id = type.value;
    if (target.value !== MIXED && target.value !== targetInitial) changes.target_holon_id = target.value;
    const positionText = position.value.trim();
    if (positionText !== '' && (positionInitial === MIXED || positionText !== positionInitial)) {
      const nextPosition = Number(positionText);
      if (!Number.isInteger(nextPosition)) {
        eBStatus.warn('Position must be a whole number');
        return;
      }
      changes.position = nextPosition;
    }

    if (!Object.keys(changes).length) {
      eBStatus.info('No bulk relationship changes to apply');
      return;
    }

    apply.disabled = true;
    eBStatus.info(`Updating ${relationships.length} relationships…`);
    try {
      for (const relationship of relationships) {
        const patch = Object.fromEntries(Object.entries(changes).filter(([key, value]) => String(relationship[key] ?? '') !== String(value)));
        if (Object.keys(patch).length) await eBliss.relationships.update(relationship.id, patch);
      }
      await loadModel();
      window.dispatchEvent(new CustomEvent('eB:modelChanged'));
      eBStatus.success(`Updated ${relationships.length} relationships`);
      window.setTimeout(() => {
        restoreGraphSelection();
        render();
      }, 250);
    } catch (error) {
      eBStatus.error(error?.message || 'Unable to bulk update relationships');
    } finally {
      apply.disabled = false;
    }
  });

  editor.append(title, hint, sourceField, typeField, targetField, positionField, actions);
  container.appendChild(editor);
  rendering = false;
}

async function handleEdgeTap(event) {
  const original = event.originalEvent;
  const ctrl = Boolean(original?.ctrlKey || original?.metaKey);
  const edge = event.target;
  const relationship = edge?.data?.('relationship');
  if (!relationship?.id) return;

  if (!ctrl) {
    selectedIds.clear();
    return;
  }

  const id = String(relationship.id);
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  // Cytoscape's normal single-selection handling runs on the same tap. Restore
  // the intended additive selection after that event cycle completes.
  requestAnimationFrame(() => {
    restoreGraphSelection();
    if (selectedIds.size >= 2) render();
  });
}

function clearOnNonEdgeTap(event) {
  if (event.target?.isEdge?.()) return;
  if (event.originalEvent?.ctrlKey || event.originalEvent?.metaKey) return;
  selectedIds.clear();
}

export async function initRelationshipBulkEdit() {
  if (installed) return;
  installed = true;
  ensureStyles();
  await loadModel();

  const graph = getHolonGraph();
  if (!graph) return;
  graph.on('tap', 'edge', handleEdgeTap);
  graph.on('tap', clearOnNonEdgeTap);

  window.addEventListener('eB:modelLoaded', async () => {
    if (!selectedIds.size) return;
    try {
      await loadModel();
      requestAnimationFrame(() => {
        restoreGraphSelection();
        if (selectedIds.size >= 2) render();
      });
    } catch (_) {}
  });
}
