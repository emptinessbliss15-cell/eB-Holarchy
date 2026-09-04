function rowFromEvent(event, grid)
{
  const row = event.target.closest('tr[data-rowid]');
  if (!row) return null;
  return grid.rowById?.get(Number(row.dataset.rowid)) || null;
}

function showContextMenu(x, y, items)
{
  document.querySelector('.eb-context-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'eb-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  items.forEach(item =>
  {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button.addEventListener('click', async () =>
    {
      menu.remove();
      await item.action?.();
    });
    menu.appendChild(button);
  });

  document.body.appendChild(menu);

  const close = event =>
  {
    if (!menu.contains(event.target))
    {
      menu.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function bindDoubleClick(element, grid, onContextMenu, onRowDoubleClick)
{
  element.addEventListener('dblclick', async event =>
  {
    const row = rowFromEvent(event, grid);
    if (!row) return;

    if (onRowDoubleClick)
    {
      // VanillaGrid also uses double-click for inline editing. Capture the
      // event before the grid sees it when the caller has supplied a custom
      // double-click action such as focusing the Holarchy graph.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return onRowDoubleClick(row, event);
    }

    if (!onContextMenu) return;

    // Backward-compatible default: double-click opens Edit.
    await onContextMenu(event, row, items =>
    {
      const edit = items.find(item => item.label === 'Edit');
      return edit?.action?.();
    });
  }, !!onRowDoubleClick);
}

export function createHolonGrid({ element, holons, onSelect, onContextMenu, onRowEdit, onRowDoubleClick })
{
  const grid = new VanillaGrid(element, {
    data: holons,
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'holon_type', label: 'Type', sortable: true },
      { key: 'id', label: 'ID', sortable: true },
    ],
    filterable: true,
    sortable: true,
    pagination: true,
    pageSize: 25,
    selectable: true,
    editableRows: true,
    contextMenu: true,
    columnsMenu: {
      location: 'toolbar',
      label: 'Columns',
      showSearch: true,
      showSelectAll: true,
      initialHidden: ['id'],
    },
    onSelectionChange: rows => rows.length && onSelect?.(rows[rows.length - 1]),
    onRowEdit,
  });

  bindDoubleClick(element, grid, onContextMenu, onRowDoubleClick);

  element.addEventListener('contextmenu', event =>
  {
    const row = rowFromEvent(event, grid);
    if (!row) return;
    event.preventDefault();
    onContextMenu?.(event, row, (items) => showContextMenu(event.clientX, event.clientY, items));
  });

  return grid;
}

export function createRelationshipGrid({ element, relationships, onContextMenu, onRowEdit, onRowDoubleClick })
{
  const grid = new VanillaGrid(element, {
    data: relationships,
    columns: [
      { key: 'source_holon', label: 'Source', sortable: true },
      { key: 'relationship_type', label: 'Relationship', sortable: true },
      { key: 'target_holon', label: 'Target', sortable: true },
      { key: 'position', label: 'Position', type: 'number', sortable: true },
    ],
    filterable: true,
    sortable: true,
    pagination: true,
    pageSize: 25,
    editableRows: true,
    contextMenu: true,
    onRowEdit,
  });

  bindDoubleClick(element, grid, onContextMenu);

  element.addEventListener('contextmenu', event =>
  {
    const row = rowFromEvent(event, grid);
    if (!row) return;
    event.preventDefault();
    onContextMenu?.(event, row, (items) => showContextMenu(event.clientX, event.clientY, items));
  });

  return grid;
}

export function setRelationships(grid, relationships)
{
  grid?.setData(relationships);
}
