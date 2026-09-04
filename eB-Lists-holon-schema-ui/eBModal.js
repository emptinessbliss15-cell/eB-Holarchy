import { createEBComboBox } from './eBComboBox.js';

let activeModal = null;

function closeModal(result = null)
{
  if (!activeModal) return;
  const { overlay, resolve, comboBoxes } = activeModal;
  activeModal = null;
  comboBoxes.forEach(combo => combo.destroy());
  overlay.remove();
  resolve(result);
}

export function showModal({ title, fields = [], submitLabel = 'Save', cancelLabel = 'Cancel' })
{
  if (activeModal) closeModal(null);

  return new Promise(resolve =>
  {
    const overlay = document.createElement('div');
    overlay.className = 'eb-modal-overlay';

    const dialog = document.createElement('form');
    dialog.className = 'eb-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'eb-modal-header';
    header.innerHTML = `<h2></h2><button type="button" class="eb-modal-close" aria-label="Close">×</button>`;
    header.querySelector('h2').textContent = title;

    const body = document.createElement('div');
    body.className = 'eb-modal-body';

    const controls = new Map();
    const comboBoxes = [];

    fields.forEach(field =>
    {
      const label = document.createElement('label');
      label.className = 'eb-modal-field';

      const caption = document.createElement('span');
      caption.textContent = field.label;
      label.appendChild(caption);

      let control;

      if (field.type === 'select')
      {
        control = document.createElement('select');
        (field.options || []).forEach(option =>
        {
          const item = document.createElement('option');
          item.value = option.value;
          item.textContent = option.label;
          if (option.value === field.value) item.selected = true;
          control.appendChild(item);
        });
      }
      else
      {
        control = document.createElement('input');
        control.type = field.type === 'combobox' ? 'text' : (field.type || 'text');
        control.value = field.type === 'combobox' ? '' : (field.value ?? '');
      }

      control.name = field.name;
      control.required = field.type === 'combobox' && field.multiple ? false : !!field.required;
      if (field.placeholder) control.placeholder = field.placeholder;

      label.appendChild(control);
      body.appendChild(label);

      let combo = null;
      if (field.type === 'combobox')
      {
        combo = createEBComboBox(control, {
          source: field.options || [],
          multiple: !!field.multiple,
          allowCustom: !!field.allowCustom,
          minChars: field.minChars ?? 1,
          maxItems: field.maxItems ?? null,
        });
        comboBoxes.push(combo);
        if (field.value != null && field.value !== '') combo.setValue(field.value, true);
      }

      controls.set(field.name, { control, combo, field });
    });

    const footer = document.createElement('div');
    footer.className = 'eb-modal-footer';
    footer.innerHTML = `<button type="button" class="eb-modal-cancel"></button><button type="submit" class="eb-modal-submit"></button>`;
    footer.querySelector('.eb-modal-cancel').textContent = cancelLabel;
    footer.querySelector('.eb-modal-submit').textContent = submitLabel;

    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    activeModal = { overlay, resolve, comboBoxes };

    const cancel = () => closeModal(null);
    header.querySelector('.eb-modal-close').addEventListener('click', cancel);
    footer.querySelector('.eb-modal-cancel').addEventListener('click', cancel);
    overlay.addEventListener('mousedown', event =>
    {
      if (event.target === overlay) cancel();
    });
    dialog.addEventListener('keydown', event =>
    {
      if (event.key === 'Escape')
      {
        event.preventDefault();
        cancel();
      }
    });

    dialog.addEventListener('submit', event =>
    {
      event.preventDefault();
      const values = Object.fromEntries([...controls].map(([name, entry]) =>
      {
        if (entry.combo) return [name, entry.combo.getValue()];
        return [name, entry.control.value];
      }));
      closeModal(values);
    });

    const first = dialog.querySelector('input, select');
    first?.focus();
  });
}
