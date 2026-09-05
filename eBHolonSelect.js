/* Reusable Holon selector. Keeps Holon-aware selection separate from filter layout. */

export function createEBHolonSelect(input, {
  holons = [],
  value = '',
  placeholder = 'Choose a Holon…',
  onChange = null,
} = {}) {
  if (!input) throw new Error('eBHolonSelect requires an input element');

  const items = () => holons
    .filter(holon => holon && holon.id && holon.name)
    .map(holon => ({ id: String(holon.id), name: String(holon.name), type: holon.holon_type ? String(holon.holon_type) : '' }));

  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');

  let selectedId = value ? String(value) : '';

  const syncValue = () => {
    const match = items().find(item => item.id === selectedId);
    input.value = match ? match.name : '';
    input.dataset.holonId = match?.id || '';
    input.setAttribute('aria-expanded', 'false');
  };

  input.addEventListener('change', () => {
    const text = input.value.trim().toLowerCase();
    const match = items().find(item => item.name.toLowerCase() === text || item.id.toLowerCase() === text);
    selectedId = match?.id || '';
    input.dataset.holonId = selectedId;
    onChange?.(match || null);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      syncValue();
      input.blur();
    }
  });

  syncValue();

  return {
    get value() { return selectedId; },
    get selected() { return items().find(item => item.id === selectedId) || null; },
    setValue(nextValue) { selectedId = nextValue ? String(nextValue) : ''; syncValue(); },
    refresh(nextHolons = holons) { holons = nextHolons; syncValue(); },
    clear() { selectedId = ''; syncValue(); onChange?.(null); },
  };
}
