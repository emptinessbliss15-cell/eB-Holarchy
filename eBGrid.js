// eBGrid — eBliss semantic wrapper around VanillaGrid.
// Keeps the app-facing grid API named for the eBliss component layer while
// delegating generic table behavior to the existing VanillaGrid primitive.

import { createEBComboBox } from './eBComboBox.js';

export class eBGrid {
  constructor(element, options = {}) {
    if (typeof VanillaGrid === 'undefined') {
      throw new Error('eBGrid requires VanillaGrid to be loaded first');
    }

    this.element = element;
    this.options = options;
    this.grid = new VanillaGrid(element, options);

    // eBGrid-level editors run before VanillaGrid's keyboard editor. This lets
    // semantic components such as eBComboBox participate in inline editing
    // without making the generic VanillaGrid depend on eBliss components.
    if (options.editableRows) {
      this._onKeyDownCapture = (event) => {
        if (event.key !== 'Enter' && event.key !== 'F2') return;
        const cell = event.target.closest?.('td[data-column-key]');
        if (!cell || !this.element.contains(cell)) return;
        const rowElement = cell.closest('tr[data-rowid]');
        if (!rowElement) return;
        const row = this.grid.rowById?.get(Number(rowElement.dataset.rowid));
        const column = this.options.columns?.find(item => item.key === cell.dataset.columnKey);
        if (!row || !column || typeof column.editor !== 'function') return;

        const editor = column.editor(row, column);
        if (!editor) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this._startCustomEditor(cell, row, column, editor);
      };
      this.element.addEventListener('keydown', this._onKeyDownCapture, true);
    }
  }

  _startCustomEditor(cell, row, column, editor) {
    this._cancelCustomEditor();

    const originalValue = row[column.key] ?? '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = String(originalValue);
    input.className = 'vg-edit-input';
    cell.replaceChildren(input);

    let finished = false;
    let combo = null;

    const cleanup = () => {
      combo?.destroy?.();
      combo = null;
      this._customEditor = null;
    };

    const restore = () => {
      cleanup();
      this.grid.refresh();
    };

    const commit = (value) => {
      if (finished) return;
      finished = true;
      const nextValue = String(value ?? '').trim();
      cleanup();
      if (nextValue === String(originalValue)) {
        this.grid.refresh();
        return;
      }
      row[column.key] = nextValue;
      this.options.onRowEdit?.(row, column.key, nextValue, originalValue);
      this.grid.refresh();
    };

    const cancel = () => {
      if (finished) return;
      finished = true;
      restore();
    };

    this._customEditor = { cancel };

    if (editor.type === 'combobox') {
      combo = createEBComboBox(input, {
        source: editor.options || [],
        minChars: editor.minChars ?? 0,
        allowCustom: editor.allowCustom ?? false,
        clearable: editor.clearable ?? false,
        highlight: editor.highlight ?? true,
        onSelect: (_input, item) => {
          const value = item?.value ?? item?.label ?? item;
          commit(value);
        },
      });
      input.value = String(editor.value ?? originalValue);
      input.focus();
      input.select();
    } else if (editor.type === 'text') {
      input.focus();
      input.select();
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === 'Enter' && editor.type === 'text') {
        event.preventDefault();
        commit(input.value);
      }
    });

    input.addEventListener('blur', () => {
      // A combobox commits through onSelect; a plain custom text editor commits
      // its current value when focus leaves the cell.
      if (!finished && editor.type === 'text') commit(input.value);
    });
  }

  _cancelCustomEditor() {
    this._customEditor?.cancel?.();
    this._customEditor = null;
  }

  setData(data) {
    this.grid.setData(data);
    return this;
  }

  getData() {
    return this.grid.getData();
  }

  setColumns(columns) {
    this.options.columns = columns;
    this.grid.setColumns(columns);
    return this;
  }

  setFilter(text, options) {
    this.grid.setFilter(text, options);
    return this;
  }

  setSort(key, direction) {
    this.grid.setSort(key, direction);
    return this;
  }

  setGroupBy(key) {
    this.grid.setGroupBy(key);
    return this;
  }

  refresh() {
    this.grid.refresh();
    return this;
  }

  destroy() {
    this._cancelCustomEditor();
    if (this._onKeyDownCapture) {
      this.element.removeEventListener('keydown', this._onKeyDownCapture, true);
      this._onKeyDownCapture = null;
    }
    this.grid.destroy();
  }

  dispose() {
    this.destroy();
  }
}

export function createEBGrid(element, options = {}) {
  return new eBGrid(element, options);
}
