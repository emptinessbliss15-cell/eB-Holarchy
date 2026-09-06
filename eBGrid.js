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

    if (options.editableRows) {
      this._onKeyDownCapture = (event) => {
        if (this._customEditor?.input === event.target) return;
        if (event.key !== 'Enter' && event.key !== 'F2') return;
        const cell = event.target.closest?.('td[data-column-key]');
        if (!cell || !this.element.contains(cell)) return;
        const rowElement = cell.closest('tr[data-rowid]');
        if (!rowElement) return;
        const rowId = rowElement.dataset.rowid;
        const row = this.grid.rowById?.get(rowId) ?? this.grid.rowById?.get(Number(rowId));
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
    const isLongText = editor.type === 'textarea'
      || (editor.type === 'text' && String(originalValue).length > 100);
    const input = document.createElement(isLongText ? 'textarea' : 'input');
    if (!isLongText) input.type = 'text';
    input.value = String(originalValue);
    input.className = isLongText ? 'vg-edit-textarea' : 'vg-edit-input';
    if (isLongText) {
      const lineCount = String(originalValue).split(/\r?\n/).length;
      input.rows = editor.rows ?? Math.min(12, Math.max(6, lineCount));
      input.wrap = 'soft';
      input.style.width = '100%';
      input.style.minHeight = '7rem';
      input.style.boxSizing = 'border-box';
      input.style.resize = 'vertical';
      input.style.whiteSpace = 'pre-wrap';
      input.style.overflow = 'auto';
    }
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
      const nextValue = isLongText
        ? String(value ?? '')
        : String(value ?? '').trim();
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

    this._customEditor = { cancel, input };

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
    } else if (editor.type === 'text' || editor.type === 'textarea') {
      input.focus();
      input.select();
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        cancel();
      } else if (event.key === 'Enter' && !isLongText) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        commit(input.value);
      } else if (event.key === 'Enter' && isLongText && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        commit(input.value);
      }
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
