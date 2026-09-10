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
        this._startEditorForCell(cell);
      };
      this._onClickCapture = (event) => {
        if (this._customEditor) return;
        if (event.target.closest?.('button, input, textarea, select, a')) return;
        const cell = event.target.closest?.('td[data-column-key]');
        if (!cell || !this.element.contains(cell)) return;
        this._startEditorForCell(cell);
      };
      this.element.addEventListener('keydown', this._onKeyDownCapture, true);
      this.element.addEventListener('click', this._onClickCapture, true);
    }
  }

  _startEditorForCell(cell) {
    const rowElement = cell.closest('tr[data-rowid]');
    if (!rowElement) return;
    const rowId = rowElement.dataset.rowid;
    const row = this.grid.rowById?.get(rowId) ?? this.grid.rowById?.get(Number(rowId));
    const column = this.options.columns?.find(item => item.key === cell.dataset.columnKey);
    if (!row || !column || typeof column.editor !== 'function') return;

    const editor = column.editor(row, column);
    if (!editor) return;

    const fromKeyboard = false;
    if (fromKeyboard) return;
    this._startCustomEditor(cell, row, column, editor);
  }

  _startCustomEditor(cell, row, column, editor) {
    this._cancelCustomEditor();

    const originalValue = row[column.key] ?? '';
    const isCheckbox = editor.type === 'checkbox';
    const isLongText = editor.type === 'textarea'
      || (editor.type === 'text' && String(originalValue).length > 100);
    const input = document.createElement(isLongText ? 'textarea' : 'input');
    if (!isLongText) input.type = isCheckbox ? 'checkbox' : (editor.inputType || 'text');
    input.className = isLongText ? 'vg-edit-textarea' : 'vg-edit-input';
    if (isCheckbox) {
      input.checked = originalValue === true || String(originalValue).toLowerCase() === 'true';
    } else {
      input.value = String(originalValue);
    }
    if (editor.min != null) input.min = String(editor.min);
    if (editor.max != null) input.max = String(editor.max);
    if (editor.step != null) input.step = String(editor.step);
    if (editor.placeholder != null) input.placeholder = String(editor.placeholder);
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

    const editorShell = document.createElement('div');
    editorShell.className = 'eb-grid-editor';
    editorShell.style.display = 'flex';
    editorShell.style.alignItems = isLongText ? 'stretch' : 'center';
    editorShell.style.gap = '6px';
    editorShell.style.width = '100%';
    editorShell.style.boxSizing = 'border-box';
    editorShell.appendChild(input);

    const actions = document.createElement('span');
    actions.className = 'eb-grid-editor-actions';
    actions.style.display = 'inline-flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '3px';
    actions.style.flex = '0 0 auto';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'eb-grid-editor-save';
    saveButton.textContent = '✓';
    saveButton.title = 'Save';
    saveButton.setAttribute('aria-label', 'Save edit');

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'eb-grid-editor-cancel';
    cancelButton.textContent = '×';
    cancelButton.title = 'Cancel';
    cancelButton.setAttribute('aria-label', 'Cancel edit');

    [saveButton, cancelButton].forEach(button => {
      button.style.minWidth = '28px';
      button.style.minHeight = '28px';
      button.style.padding = '2px 6px';
      button.style.cursor = 'pointer';
    });
    actions.append(saveButton, cancelButton);
    editorShell.appendChild(actions);
    cell.replaceChildren(editorShell);

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
      const nextValue = isCheckbox
        ? Boolean(input.checked)
        : isLongText
          ? String(value ?? '')
          : String(value ?? '').trim();
      cleanup();
      if (nextValue === originalValue || String(nextValue) === String(originalValue)) {
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
    saveButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      commit(isCheckbox ? input.checked : input.value);
    });
    cancelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    });

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
      input.value = String(editor.displayValue ?? editor.value ?? originalValue);
      input.focus();
      input.select();
    } else if (editor.type === 'text' || editor.type === 'textarea' || editor.type === 'input') {
      input.focus();
      if (!isCheckbox) input.select();
    } else if (editor.type === 'checkbox') {
      input.focus();
    }

    input.addEventListener('change', () => {
      if (isCheckbox) {
        // Keep the checkbox change visible until the user explicitly saves.
      }
    });

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
        commit(isCheckbox ? input.checked : input.value);
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
    if (this._onClickCapture) {
      this.element.removeEventListener('click', this._onClickCapture, true);
      this._onClickCapture = null;
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