import { createEBProps } from './eBProps.js';

// Dependencies come from the app so this component shares its model and selection.
export function createRelationshipProperties(container, relationship, {
  holons, relationships, relationshipTypes, eBliss, loadModel,
  renderRelationshipInspector, setStatus, status, labelForKey, formatPropertyValue,
}) {
function relationshipEndpointName(id, fallback = '—') { if (!id) return fallback; return holons.find(item => String(item.id) === String(id))?.name || '(unnamed Holon)'; }
function relationshipTypeName(id, fallback = '—') { if (!id) return fallback; return relationshipTypes.find(item => String(item.id) === String(id))?.name || '(unnamed relationship)'; }
function relationshipPropertyValue(key, value) { if (key === 'source_holon_id' || key === 'target_holon_id') return relationshipEndpointName(value); if (key === 'relationship_type_id') return relationshipTypeName(value); return formatPropertyValue(value); }
function relationshipComboOptions(kind, selected = '') { const options = kind === 'relationship' ? relationshipTypes.map(type => ({ value: type.id, label: type.name || '(unnamed relationship)' })) : holons.filter(holon => String(holon.holon_type || '').toLowerCase() !== 'provenance').map(holon => ({ value: holon.id, label: holon.name || '(unnamed Holon)' })); if (selected && !options.some(option => String(option.value) === String(selected))) options.unshift({ value: selected, label: relationshipPropertyValue(kind === 'relationship' ? 'relationship_type_id' : `${kind}_holon_id`, selected) }); return options; }
async function saveRelationshipProperty(relationship, key, value) { let nextValue = value; if (key === 'source_holon_id' || key === 'target_holon_id' || key === 'relationship_type_id') { nextValue = String(value ?? '').trim(); if (!nextValue) { setStatus(`${labelForKey(key)} is required`, 'warn'); renderRelationshipInspector(relationship); return; } const exists = key === 'relationship_type_id' ? relationshipTypes.some(type => String(type.id) === nextValue) : holons.some(holon => String(holon.id) === nextValue); if (!exists) { setStatus(`Unknown ${labelForKey(key)}`, 'warn'); renderRelationshipInspector(relationship); return; } } else if (key === 'position') { nextValue = Number(value); if (!Number.isInteger(nextValue)) { setStatus('Position must be a whole number', 'warn'); renderRelationshipInspector(relationship); return; } } if (String(nextValue) === String(relationship[key] ?? '')) return; setStatus(`Updating relationship ${labelForKey(key)}…`); try { await eBliss.relationships.update(relationship.id, { [key]: nextValue }); const refreshed = await loadModel(); const updated = refreshed.relationships.find(item => String(item.id) === String(relationship.id)) || { ...relationship, [key]: nextValue }; renderRelationshipInspector(updated); status.updated(labelForKey(key), relationshipPropertyValue(key, nextValue)); } catch (error) { setStatus(error.message || `Unable to update relationship ${labelForKey(key)}`, 'error'); renderRelationshipInspector(relationship); } }


  const sourceName = relationshipEndpointName(relationship.source_holon_id, '(source)');
  const targetName = relationshipEndpointName(relationship.target_holon_id, '(target)');
  const relationshipName = relationshipTypeName(relationship.relationship_type_id, '(relationship)');
  const rows = [
    { key: 'id', property: 'Relationship ID', value: formatPropertyValue(relationship.id) },
    { key: 'source_holon_id', property: 'Source Holon', value: sourceName },
    { key: 'relationship_type_id', property: 'Relationship Type', value: relationshipName },
    { key: 'target_holon_id', property: 'Target Holon', value: targetName },
    { key: 'position', property: 'Position', value: formatPropertyValue(relationship.position) },
  ];

  return createEBProps(container, {
    title: `${sourceName} — ${relationshipName} → ${targetName}`,
    rows,
    ariaLabel: `${sourceName} to ${targetName} relationship properties`,
    pageSize: rows.length,
    editor: row =>
    {
      if (row.key === 'id') return null;
      if (row.key === 'source_holon_id') return { type: 'combobox', options: relationshipComboOptions('source', relationship.source_holon_id), value: relationship.source_holon_id, displayValue: sourceName, minChars: 0, allowCustom: false, clearable: false };
      if (row.key === 'relationship_type_id') return { type: 'combobox', options: relationshipComboOptions('relationship', relationship.relationship_type_id), value: relationship.relationship_type_id, displayValue: relationshipName, minChars: 0, allowCustom: false, clearable: false };
      if (row.key === 'target_holon_id') return { type: 'combobox', options: relationshipComboOptions('target', relationship.target_holon_id), value: relationship.target_holon_id, displayValue: targetName, minChars: 0, allowCustom: false, clearable: false };
      if (row.key === 'position') return { type: 'input', inputType: 'number', step: 1 };
      return null;
    },
    onChange: (row, newValue) =>
    {
      if (row.key === 'id') return;
      void saveRelationshipProperty(relationship, row.key, newValue);
    },
  });
}

// Use the complete loaded model, independently of graph visibility or depth.
export function relationshipGroups(holonId, { holons = [], relationships = [], relationshipTypes = [] } = {}) {
  const names = new Map(holons.map(h => [String(h.id), h.name || '(unnamed Holon)']));
  const types = new Map(relationshipTypes.map(t => [String(t.id), t.name || '(unnamed relationship)']));
  const describe = r => ({
    relationship: r,
    label: [names.get(String(r.source_holon_id)) || r.source_holon || '(unavailable Holon)',
      types.get(String(r.relationship_type_id)) || r.relationship_type_name || r.relationship_type || '(unavailable relationship type)',
      names.get(String(r.target_holon_id)) || r.target_holon || '(unavailable Holon)'].join(' → '),
  });
  if (holonId == null) return { outgoing: [], incoming: [] };
  return {
    outgoing: relationships.filter(r => String(r.source_holon_id) === String(holonId)).map(describe),
    incoming: relationships.filter(r => String(r.target_holon_id) === String(holonId)).map(describe),
  };
}

export function appendHolonRelationships(container, holon, model, onSelect) {
  const section = document.createElement('section');
  section.className = 'holon-relationships';
  section.setAttribute('aria-label', 'Node relationships');
  const groups = relationshipGroups(holon.id, model);
  for (const [direction, rows] of Object.entries(groups)) {
    const heading = document.createElement('h3');
    heading.textContent = (direction === 'outgoing' ? 'Outgoing' : 'Incoming') + ' relationships (' + rows.length + ')';
    section.appendChild(heading);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No ' + direction + ' relationships.';
      section.appendChild(empty);
      continue;
    }
    const list = document.createElement('ul');
    for (const row of rows) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.label;
      button.addEventListener('click', () => onSelect(row.relationship));
      item.appendChild(button);
      list.appendChild(item);
    }
    section.appendChild(list);
  }
  container.appendChild(section);
  return section;
}
