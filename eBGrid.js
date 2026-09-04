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
    this.grid.destroy();
  }

  dispose() {
    this.destroy();
  }
}

export function createEBGrid(element, options = {}) {
  return new eBGrid(element, options);
}
