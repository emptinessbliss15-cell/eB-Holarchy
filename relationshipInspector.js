// Relationship object inspector.
// Relationships are first-class Holarchy objects and share the existing inspector surface.

import { eBliss } from './eBSDK.js';
import { createEBGrid } from './eBGrid.js';

let relationshipGrid = null;

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }
  return String(value);
}

function labelForKey(key) {
  return key.replace(/_id$/i, ' ID').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function renderRelationship(relationship) {
  const content = document.getElementById('holonInspectorContent');
  if (!content || !relationship) return;

  relationshipGrid?.destroy?.();
  relationshipGrid = null;
  content.replaceChildren();

  const title = document.createElement('div');
  title.className = 'holon-inspector-title';
  title.textContent = relationship.relationship_type || relationship.relationship_type_name || 'Relationship';
  content.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'holon-inspector-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit Relationship';
  editButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('relationship:edit', { detail: { relationship } })));
  actions.appendChild(editButton);
  content.appendChild(actions);

  const gridElement = document.createElement('div');
  gridElement.className = 'holon-property-grid';
  gridElement.setAttribute('aria-label', 'Relationship properties');
  content.appendChild(gridElement);

  const rows = Object.entries(relationship)
    .filter(([key]) => key !== 'source_holon' && key !== 'target_holon' && key !== 'relationship_type')
    .map(([key, value]) => ({ key, property: labelForKey(key), value: formatValue(value) }));

  relationshipGrid = createEBGrid(gridElement, {
    data: rows,
    columns: [
      { key: 'property', label: 'Property', sortable: true },
      { key: 'value', label: 'Value', sortable: true },
    ],
    pageSize: Math.max(rows.length, 10),
    pagination: false,
    filterable: false,
    sortable: true,
    resizableColumns: true,
    editableRows: false,
    keyboardNavigation: true,
    contextMenu: false,
  });
}

window.addEventListener('relationship:selected', async event => {
  const relationship = event.detail;
  if (!relationship?.id) return;
  try {
    const current = await eBliss.relationships.get(relationship.id);
    renderRelationship(current || relationship);
  } catch (error) {
    renderRelationship(relationship);
    console.warn('Unable to refresh relationship details:', error);
  }
});

window.addEventListener('holon:selected', () => {
  relationshipGrid?.destroy?.();
  relationshipGrid = null;
});
