/* Reusable Holon selector. Keeps Holon-aware selection separate from filter layout. */

import { createEBComboBox, holonComboOptions } from './eBComboBox.js';

export function createEBHolonSelect(input, {
  holons = [],
  value = '',
  placeholder = 'Choose a Holon…',
  onChange = null,
} = {}) {
  if (!input) throw new Error('eBHolonSelect requires an input element');

  let selectedId = value ? String(value) : '';
  let combo = null;

  const resolve = (candidate) => {
    const id = typeof candidate === 'object'
      ? (candidate?.value ?? candidate?.id ?? '')
      : candidate;
    const text = String(id ?? '').trim();
    if (!text) return null;

    return holons.find(holon => String(holon.id) === text)
      || holons.find(holon => String(holon.name ?? '').trim().toLowerCase() === text.toLowerCase())
      || null;
  };

  const syncValue = () => {
    const selected = resolve(selectedId);
    selectedId = selected ? String(selected.id) : '';
    input.value = selected?.name || '';
    input.dataset.holonId = selectedId;
  };

  const select = (candidate) => {
    const selected = resolve(candidate);
    selectedId = selected ? String(selected.id) : '';
    input.dataset.holonId = selectedId;
    onChange?.(selected);
  };

  const wire = () => {
    combo?.destroy?.();
    combo = createEBComboBox(input, {
      source: holonComboOptions(holons),
      minChars: 0,
      clearable: true,
      placeholder,
      onChange: (_input, nextValue) => select(Array.isArray(nextValue) ? nextValue[0] : nextValue),
      onSelect: (_input, item) => select(item?.value ?? item),
    });
    syncValue();
  };

  wire();

  return {
    get value() { return selectedId; },
    get selected() { return resolve(selectedId); },
    setValue(nextValue) {
      selectedId = nextValue ? String(nextValue) : '';
      syncValue();
    },
    refresh(nextHolons = holons) {
      holons = nextHolons;
      wire();
    },
    clear() {
      selectedId = '';
      syncValue();
      onChange?.(null);
    },
    destroy() {
      combo?.destroy?.();
      combo = null;
    },
  };
}
