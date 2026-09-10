import { createEBGrid } from './eBGrid.js';

export function createEBProps(container, {
  title = '',
  rows = [],
  ariaLabel = 'Object properties',
  actions = [],
  editor = null,
  onChange = null,
  pageSize = null,
  className = 'holon-property-grid',
} = {})
{
  if (!container) throw new Error('eBProps requires a container element');

  container.replaceChildren();

  if (title)
  {
    const heading = document.createElement('div');
    heading.className = 'holon-inspector-title';
    heading.textContent = title;
    container.appendChild(heading);
  }

  if (actions.length)
  {
    const actionBar = document.createElement('div');
    actionBar.className = 'holon-inspector-actions';

    actions.forEach(action =>
    {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label || 'Action';
      if (action.title) button.title = action.title;
      if (action.className) button.className = action.className;
      button.disabled = action.disabled === true;
      button.addEventListener('click', event => action.onClick?.(event));
      actionBar.appendChild(button);
    });

    container.appendChild(actionBar);
  }

  const gridElement = document.createElement('div');
  gridElement.className = className;
  gridElement.setAttribute('aria-label', ariaLabel);
  container.appendChild(gridElement);

  const grid = createEBGrid(gridElement, {
    data: rows,
    columns: [
      { key: 'property', label: 'Property', sortable: true },
      {
        key: 'value',
        label: 'Value',
        sortable: true,
        editor: row => editor?.(row) ?? null,
      },
    ],
    pageSize: pageSize ?? Math.max(rows.length, 10),
    pagination: false,
    filterable: false,
    sortable: true,
    resizableColumns: true,
    editableRows: true,
    keyboardNavigation: true,
    contextMenu: false,
    onRowEdit: (row, field, value) =>
    {
      if (field !== 'value') return;
      onChange?.(row, value);
    },
  });

  return {
    grid,
    element: gridElement,
    destroy()
    {
      grid?.destroy?.();
    },
  };
}
