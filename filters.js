// Reusable Holarchy filter HUD/component.
// The component owns filter definitions and saved-filter UI, while the host
// decides how the active definition is applied to a projection.

const STORAGE_KEY = 'ebHolarchy.savedFilters';

export function createFilters({
  element,
  holons = [],
  holonTypes = [],
  relationshipTypes = [],
  onChange,
  storage,
} = {}) {
  if (!element) throw new Error('createFilters requires an element');

  const store = storage || localStorage;
  let definition = emptyDefinition();
  let savedFilters = readSavedFilters();

  render();

  return {
    getFilter,
    setFilter,
    getSavedFilters,
    setOptions,
    clear,
    destroy,
  };

  function emptyDefinition() {
    return { include: [], exclude: [] };
  }

  function getFilter() {
    return clone(definition);
  }

  function setFilter(next = {}) {
    definition = normalizeDefinition(next);
    render();
    emitChange();
  }

  function getSavedFilters() {
    return savedFilters.map(clone);
  }

  function setOptions(next = {}) {
    holons = next.holons || holons;
    holonTypes = next.holonTypes || holonTypes;
    relationshipTypes = next.relationshipTypes || relationshipTypes;
    render();
  }

  function clear() {
    definition = emptyDefinition();
    render();
    emitChange();
  }

  function destroy() {
    element.replaceChildren();
  }

  function emitChange() {
    onChange?.(getFilter());
  }

  function readSavedFilters() {
    try {
      const value = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.map(normalizeSavedFilter).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function persistSavedFilters() {
    store.setItem(STORAGE_KEY, JSON.stringify(savedFilters));
  }

  function normalizeDefinition(value = {}) {
    return {
      include: normalizeConditions(value.include),
      exclude: normalizeConditions(value.exclude),
    };
  }

  function normalizeConditions(conditions) {
    return Array.isArray(conditions)
      ? conditions
          .filter(condition => condition && condition.field && condition.value !== undefined)
          .map(condition => ({
            field: String(condition.field),
            operator: String(condition.operator || 'equals'),
            value: condition.value,
          }))
      : [];
  }

  function normalizeSavedFilter(value) {
    if (!value || !value.name) return null;
    return {
      id: String(value.id || crypto.randomUUID()),
      name: String(value.name),
      ...normalizeDefinition(value),
    };
  }

  function render() {
    element.replaceChildren();
    element.className = 'eb-filters';

    const toolbar = document.createElement('div');
    toolbar.className = 'eb-filters-toolbar';

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'eb-filter-trigger';
    summary.textContent = `Filters${conditionCount() ? ` (${conditionCount()})` : ''} ▾`;
    summary.addEventListener('click', () => {
      element.classList.toggle('is-open');
      if (element.classList.contains('is-open')) editor.focus();
    });

    toolbar.append(summary);
    element.append(toolbar);

    const editor = document.createElement('div');
    editor.className = 'eb-filters-editor';
    editor.hidden = !element.classList.contains('is-open');

    const includeSection = conditionSection('These AND', 'include');
    const excludeSection = conditionSection('Not These', 'exclude');

    editor.append(includeSection, excludeSection);

    const actions = document.createElement('div');
    actions.className = 'eb-filters-actions';

    const saveButton = button('Save Filter');
    saveButton.addEventListener('click', saveCurrentFilter);
    const clearButton = button('Clear');
    clearButton.addEventListener('click', clear);
    actions.append(saveButton, clearButton);

    const saved = document.createElement('div');
    saved.className = 'eb-saved-filters';
    const savedHeading = document.createElement('div');
    savedHeading.className = 'eb-filters-label';
    savedHeading.textContent = 'Saved Filters';
    saved.append(savedHeading);

    if (!savedFilters.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No saved filters';
      saved.append(empty);
    } else {
      for (const filter of savedFilters) saved.append(savedFilterRow(filter));
    }

    editor.append(actions, saved);
    element.append(editor);

    function focus() {
      summary.focus();
    }
  }

  function conditionSection(label, bucket) {
    const section = document.createElement('section');
    section.className = 'eb-filter-section';

    const heading = document.createElement('div');
    heading.className = 'eb-filters-label';
    heading.textContent = label;
    section.append(heading);

    const conditions = definition[bucket];
    if (!conditions.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'None';
      section.append(empty);
    }

    conditions.forEach((condition, index) => section.append(conditionRow(bucket, condition, index)));

    const add = button('+ condition');
    add.className = 'eb-filter-add';
    add.addEventListener('click', () => {
      definition[bucket].push({ field: 'type', operator: 'equals', value: '' });
      render();
      emitChange();
    });
    section.append(add);
    return section;
  }

  function conditionRow(bucket, condition, index) {
    const row = document.createElement('div');
    row.className = 'eb-filter-condition';

    const field = select([
      ['type', 'Type'],
      ['name', 'Name'],
      ['relationship', 'Relationship'],
      ['holon', 'Holon'],
    ], condition.field);

    const operator = select([
      ['equals', '='],
      ['contains', 'contains'],
      ['startsWith', 'starts with'],
      ['notEquals', '≠'],
    ], condition.operator);

    const value = document.createElement('select');
    value.className = 'eb-filter-value';
    populateValueOptions(value, condition);

    const remove = button('×');
    remove.className = 'eb-filter-remove';
    remove.setAttribute('aria-label', 'Remove condition');

    field.addEventListener('change', () => {
      definition[bucket][index] = { ...condition, field: field.value, value: '' };
      render();
      emitChange();
    });
    operator.addEventListener('change', () => {
      definition[bucket][index] = { ...definition[bucket][index], operator: operator.value };
      emitChange();
    });
    value.addEventListener('change', () => {
      definition[bucket][index] = { ...definition[bucket][index], value: value.value };
      emitChange();
    });
    remove.addEventListener('click', () => {
      definition[bucket].splice(index, 1);
      render();
      emitChange();
    });

    row.append(field, operator, value, remove);
    return row;
  }

  function populateValueOptions(selectElement, condition) {
    selectElement.replaceChildren();
    const options = condition.field === 'type'
      ? holonTypes.map(type => [type.id ?? type.name, type.name])
      : condition.field === 'relationship'
        ? relationshipTypes.map(type => [type.id ?? type.name, type.name])
        : condition.field === 'holon'
          ? holons.map(holon => [holon.id, holon.name || '(unnamed)'])
          : [];

    if (!options.length) {
      const input = document.createElement('input');
      input.className = 'eb-filter-value';
      input.value = condition.value || '';
      input.placeholder = 'Value';
      selectElement.replaceWith(input);
      return;
    }

    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = String(value) === String(condition.value);
      selectElement.append(option);
    }
  }

  function savedFilterRow(filter) {
    const row = document.createElement('div');
    row.className = 'eb-saved-filter';

    const load = button(filter.name);
    load.className = 'eb-saved-filter-load';
    load.addEventListener('click', () => {
      definition = normalizeDefinition(filter);
      render();
      emitChange();
    });

    const remove = button('×');
    remove.className = 'eb-filter-remove';
    remove.setAttribute('aria-label', `Delete saved filter ${filter.name}`);
    remove.addEventListener('click', () => {
      savedFilters = savedFilters.filter(item => item.id !== filter.id);
      persistSavedFilters();
      render();
    });

    row.append(load, remove);
    return row;
  }

  function saveCurrentFilter() {
    if (!conditionCount()) return;
    const name = window.prompt('Save filter as:', 'New Filter')?.trim();
    if (!name) return;

    const existing = savedFilters.find(item => item.name.toLowerCase() === name.toLowerCase());
    const saved = {
      id: existing?.id || crypto.randomUUID(),
      name,
      ...getFilter(),
    };
    savedFilters = existing
      ? savedFilters.map(item => item.id === existing.id ? saved : item)
      : [...savedFilters, saved];
    persistSavedFilters();
    render();
  }

  function conditionCount() {
    return definition.include.length + definition.exclude.length;
  }

  function select(options, selected) {
    const element = document.createElement('select');
    element.className = 'eb-filter-select';
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selected;
      element.append(option);
    }
    return element;
  }

  function button(label) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    return element;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}

// Pure evaluator so every projection can consume the same filter definition.
export function matchesFilter(holon, filter, { relationships = [], relationshipTypes = [] } = {}) {
  const definition = filter || emptyFilter();
  return definition.include.every(condition => matchesCondition(holon, condition, relationships, relationshipTypes))
    && definition.exclude.every(condition => !matchesCondition(holon, condition, relationships, relationshipTypes));
}

function emptyFilter() {
  return { include: [], exclude: [] };
}

function matchesCondition(holon, condition, relationships, relationshipTypes) {
  const values = conditionValues(holon, condition, relationships, relationshipTypes);
  return values.some(value => compare(value, condition.operator, condition.value));
}

function conditionValues(holon, condition, relationships, relationshipTypes) {
  switch (condition.field) {
    case 'type':
      return [holon?.holon_type, holon?.holon_type_id];
    case 'name':
      return [holon?.name];
    case 'holon':
      return [holon?.id];
    case 'relationship': {
      const ids = relationships
        .filter(r => r.source_holon_id === holon?.id || r.target_holon_id === holon?.id)
        .map(r => r.relationship_type_id);
      return ids.flatMap(id => [id, relationshipTypes.find(type => type.id === id)?.name]);
    }
    default:
      return [];
  }
}

function compare(actual, operator, expected) {
  const left = String(actual ?? '').toLowerCase();
  const right = String(expected ?? '').toLowerCase();
  if (operator === 'contains') return left.includes(right);
  if (operator === 'startsWith') return left.startsWith(right);
  if (operator === 'notEquals') return left !== right;
  return left === right;
}
