// eBGrid — eBliss semantic wrapper around VanillaGrid.
// Keeps the app-facing grid API named for the eBliss component layer while
// delegating generic table behavior to the existing VanillaGrid primitive.

export class eBGrid {
  constructor(element, options = {}) {
    if (typeof VanillaGrid === 'undefined') {
      throw new Error('eBGrid requires VanillaGrid to be loaded first');
    }

    this.element = element;
    this.options = options;
    this.grid = new VanillaGrid(element, options);

    // Inline editing is intentionally activated by double-click as well as
    // the underlying grid's Enter/F2 keyboard affordances. This keeps eBGrid
    // intuitive without making a normal selection click destructive.
    if (options.editableRows) {
      this._onDoubleClick = (event) => {
        const cell = event.target.closest?.('td[data-column-key]');
        if (!cell || !this.element.contains(cell)) return;
        const row = cell.closest('tr[data-rowid]');
        if (!row) return;
        this.grid.startEdit(Number(row.dataset.rowid), cell.dataset.columnKey);
      };
      this.element.addEventListener('dblclick', this._onDoubleClick);
    }
  }

  setData(data) {
    this.grid.setData(data);
    return this;
  }

  getData() {
    return this.grid.getData();
  }

  setColumns(columns) {
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
    if (this._onDoubleClick) {
      this.element.removeEventListener('dblclick', this._onDoubleClick);
      this._onDoubleClick = null;
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
