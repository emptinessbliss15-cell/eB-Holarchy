import { createEBComboBox } from './eBComboBox.js';
import { eBliss } from './eBSDK.js';
import { eBStatus } from './eBStatus.js';

const modalStack = [];

function closeModal(modal, result = null)
{
  if (!modal) return;
  const index = modalStack.indexOf(modal);
  if (index < 0) return;
  modalStack.splice(index, 1);
  modal.comboBoxes.forEach(combo => combo.destroy());
  modal.overlay.remove();
  modal.resolve(result);
}

async function addHolonType(field, combo)
{
  const values = await showModal({
    title: 'New Holon Type',
    submitLabel: 'Create Type',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Service' },
      { name: 'description', label: 'Description', placeholder: 'What kind of Holon is this?' },
    ],
  });
  const name = values?.name?.trim();
  if (!name) return;

  eBStatus.info(`Creating Holon type ${name}…`);
  try
  {
    await eBliss.holonTypes.create({ name, description: values.description?.trim() || '' });
    const options = field.options || (field.options = []);
    if (!options.some(option => String(option.value) === name))
      options.push({ value: name, label: name });
    options.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
    combo?.setValue?.(name, true);
    eBStatus.success(`Created Holon type ${name}`);
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  }
  catch (error)
  {
    eBStatus.error(error?.message || 'Unable to create Holon type');
  }
}

export function showModal({ title, fields = [], submitLabel = 'Save', cancelLabel = 'Cancel' })
{
  return new Promise(resolve =>
  {
    const overlay = document.createElement('div');
    overlay.className = 'eb-modal-overlay';
    overlay.style.zIndex = String(20000 + modalStack.length * 10);
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
      if (field.preview)
      {
        const preview = document.createElement('img');
        preview.className = 'eb-modal-image-preview';
        preview.alt = field.previewAlt || `${field.label} preview`;
        preview.src = field.preview;
        label.appendChild(preview);
      }
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
        if (field.type !== 'file') control.value = field.type === 'combobox' ? '' : (field.value ?? '');
        if (field.accept) control.accept = field.accept;
        if (field.multiple) control.multiple = true;
      }
      control.name = field.name;
      control.required = field.type === 'combobox' && field.multiple ? false : !!field.required;
      if (field.placeholder) control.placeholder = field.placeholder;

      const hasAddAction = title === 'New Holon' && field.type === 'combobox' && field.name === 'holon_type';
      let actionButton = null;
      if (hasAddAction)
      {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
        row.style.alignItems = 'center';
        row.style.gap = '6px';
        row.appendChild(control);
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.textContent = '…';
        actionButton.title = 'Add Holon type';
        actionButton.setAttribute('aria-label', 'Add Holon type');
        actionButton.style.alignSelf = 'stretch';
        actionButton.style.minWidth = '36px';
        row.appendChild(actionButton);
        label.appendChild(row);
      }
      else label.appendChild(control);
      body.appendChild(label);

      let combo = null;
      if (field.type === 'combobox')
      {
        combo = createEBComboBox(control, { source: field.options || [], multiple: !!field.multiple, allowCustom: !!field.allowCustom, minChars: field.minChars ?? 1, maxItems: field.maxItems ?? null });
        comboBoxes.push(combo);
        if (field.value != null && field.value !== '') combo.setValue(field.value, true);
      }
      if (actionButton) actionButton.addEventListener('click', () => void addHolonType(field, combo));
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
    const modal = { overlay, resolve, comboBoxes };
    modalStack.push(modal);
    const cancel = () => closeModal(modal, null);
    header.querySelector('.eb-modal-close').addEventListener('click', cancel);
    footer.querySelector('.eb-modal-cancel').addEventListener('click', cancel);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) cancel(); });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } });
    dialog.addEventListener('submit', event =>
    {
      event.preventDefault();
      const values = Object.fromEntries([...controls].map(([name, entry]) =>
      {
        if (entry.combo) return [name, entry.combo.getValue()];
        if (entry.field.type === 'file') return [name, entry.field.multiple ? [...entry.control.files] : (entry.control.files?.[0] || null)];
        return [name, entry.control.value];
      }));
      closeModal(modal, values);
    });
    const first = dialog.querySelector('input, select');
    first?.focus();
  });
}
