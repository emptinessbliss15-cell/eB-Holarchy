import test from 'node:test';
import assert from 'node:assert/strict';
import { relationshipGroups } from '../relationshipProperties.js';

const model = {
  holons: [{ id: 1, name: 'Design' }, { id: 2, name: 'Company' }],
  relationshipTypes: [{ id: 3, name: 'Member of' }],
  relationships: [
    { id: 'out', source_holon_id: '1', target_holon_id: 2, relationship_type_id: 3 },
    { id: 'in', source_holon_id: 2, target_holon_id: 1, relationship_type_id: '3' },
    { id: 'self', source_holon_id: 1, target_holon_id: 1, relationship_type_id: 3 },
    { id: 'parallel', source_holon_id: 1, target_holon_id: 2, relationship_type_id: 3 },
    { id: 'other', source_holon_id: 2, target_holon_id: 2, relationship_type_id: 3 },
  ],
};

test('includes every incoming/outgoing edge, self links and parallel edges', () => {
  const groups = relationshipGroups('1', model);
  assert.deepEqual(groups.outgoing.map(r => r.relationship.id), ['out', 'self', 'parallel']);
  assert.deepEqual(groups.incoming.map(r => r.relationship.id), ['in', 'self']);
  assert.equal(groups.outgoing[0].label, 'Design → Member of → Company');
  assert.equal(groups.incoming[0].label, 'Company → Member of → Design');
});

test('empty selection and unrelated nodes have no relationships', () => {
  assert.deepEqual(relationshipGroups(null, model), { incoming: [], outgoing: [] });
  assert.deepEqual(relationshipGroups('absent', model), { incoming: [], outgoing: [] });
});

test('missing references use readable fallback labels', () => {
  const groups = relationshipGroups(1, { relationships: [model.relationships[0]] });
  assert.equal(groups.outgoing[0].label, '(unavailable Holon) → (unavailable relationship type) → (unavailable Holon)');
});

// Exercise component rendering and saves without a live database.
import { appendHolonRelationships, createRelationshipProperties } from '../relationshipProperties.js';
class Element {
  children = []; listeners = {}; textContent = '';
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, handler) { this.listeners[name] = handler; }
  removeEventListener(name) { delete this.listeners[name]; }
}

test('relationship list opens the selected object and uses text for names', () => {
  globalThis.document = { createElement: () => new Element() };
  const container = new Element();
  let selected;
  const section = appendHolonRelationships(container, model.holons[0], model, r => { selected = r; });
  assert.equal(section.children[0].textContent, 'Outgoing relationships (3)');
  const button = section.children[1].children[0].children[0];
  assert.equal(button.textContent, 'Design → Member of → Company');
  button.listeners.click();
  assert.equal(selected, model.relationships[0]);
  delete globalThis.document;
});

test('editor validates changes, saves IDs and numbers, refreshes and reports failures', async () => {
  globalThis.document = { createElement: () => new Element() };
  globalThis.VanillaGrid = class {
    constructor(element, options) { this.options = options; }
    destroy() {}
  };
  const relationship = { ...model.relationships[0], position: 0 };
  const saved = [], rendered = [], statuses = [];
  let fail = false;
  const props = createRelationshipProperties(new Element(), relationship, {
    ...model,
    eBliss: { relationships: { update: async (id, patch) => {
      if (fail) throw new Error('Save failed');
      saved.push({ id, patch });
    } } },
    loadModel: async () => ({ relationships: [{ ...relationship, position: 2 }] }),
    renderRelationshipInspector: r => rendered.push(r),
    setStatus: (message, level) => statuses.push({ message, level }),
    status: { updated() {} }, labelForKey: key => key, formatPropertyValue: value => String(value ?? '—'),
  });
  const options = props.grid.options;
  const change = (key, value) => options.onRowEdit(options.data.find(row => row.key === key), 'value', value);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  change('position', '1.5');
  change('target_holon_id', 'missing');
  change('source_holon_id', '');
  assert.equal(saved.length, 0);
  assert.equal(statuses.filter(s => s.level === 'warn').length, 3);
  change('position', '2');
  await flush();
  assert.deepEqual(saved[0], { id: 'out', patch: { position: 2 } });
  assert.equal(rendered.at(-1).position, 2);
  change('target_holon_id', '1');
  await flush();
  assert.deepEqual(saved[1].patch, { target_holon_id: '1' });
  fail = true;
  change('position', '3');
  await flush();
  assert.equal(statuses.at(-1).level, 'error');
  assert.equal(rendered.at(-1), relationship);
  props.destroy();
  delete globalThis.document;
  delete globalThis.VanillaGrid;
});
