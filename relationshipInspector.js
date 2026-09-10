// Relationship object inspector.
// Relationships are first-class Holarchy objects and share the eBProps inspector surface.

import { eBliss } from './eBSDK.js';
import { createEBProps } from './eBProps.js';

let relationshipProps = null;

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }
  return String(value);
}

function labelForKey(key) {
  return key.replace(/_id$/i, '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function referenceMaps(model = {}) {
  return {
    holons: new Map((model.holons || []).map(holon => [String(holon.id), holon.name || holon.id])),
    relationshipTypes: new Map((model.relationshipTypes || []).map(type => [String(type.id), type.name || type.id])),
  };
}

function displayRelationshipRows(relationship, model) {
  const refs = referenceMaps(model);
  const special = new Map([
    ['source_holon_id', { property: 'Source Holon', value: refs.holons.get(String(relationship.source_holon_id)) || relationship.source_holon || relationship.source_holon_id }],
    ['relationship_type_id', { property: 'Relationship Type', value: refs.relationshipTypes.get(String(relationship.relationship_type_id)) || relationship.relationship_type || relationship.relationship_type_name || relationship.relationship_type_id }],
    ['target_holon_id', { property: 'Target Holon', value: refs.holons.get(String(relationship.target_holon_id)) || relationship.target_holon || relationship.target_holon_id }],
  ]);

  return Object.entries(relationship)
    .filter(([key]) => key !== 'source_holon' && key !== 'target_holon' && key !== 'relationship_type' && key !== 'relationship_type_name')
    .map(([key, value]) => {
      const resolved = special.get(key);
      return {
        key,
        property: resolved?.property || labelForKey(key),
        value: formatValue(resolved?.value ?? value),
        rawValue: value,
      };
    });
}

async function renderRelationship(relationship) {
  const content = document.getElementById('holonInspectorContent');
  if (!content || !relationship) return;

  relationshipProps?.destroy?.();
  relationshipProps = null;

  let model = null;
  try {
    model = await eBliss.model.load();
  } catch (error) {
    console.warn('Unable to resolve relationship references:', error);
  }

  const rows = displayRelationshipRows(relationship, model || {});
  const title = relationship.relationship_type || relationship.relationship_type_name ||
    model?.relationshipTypes?.find(type => String(type.id) === String(relationship.relationship_type_id))?.name ||
    'Relationship';

  relationshipProps = createEBProps(content, {
    title,
    rows,
    ariaLabel: 'Relationship properties',
    actions: [{
      label: 'Edit Relationship',
      onClick: () => window.dispatchEvent(new CustomEvent('relationship:edit', { detail: { relationship } })),
    }],
    pageSize: Math.max(rows.length, 10),
  });
}

window.addEventListener('relationship:selected', async event => {
  const relationship = event.detail;
  if (!relationship?.id) return;
  try {
    const current = await eBliss.relationships.get(relationship.id);
    await renderRelationship(current || relationship);
  } catch (error) {
    await renderRelationship(relationship);
    console.warn('Unable to refresh relationship details:', error);
  }
});

window.addEventListener('holon:selected', () => {
  relationshipProps?.destroy?.();
  relationshipProps = null;
});
