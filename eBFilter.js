// eBFilter — reusable filter state and UI wiring.
// Consumers define fields and decide what the resulting values mean.

function normalizeFields(fields = [])
{
  return fields
    .filter(field => field?.name)
    .map(field => ({
      type: field.type || 'text',
      label: field.label || field.name,
      ...field,
    }));
}

function readStored(storageKey)
{
  if (!storageKey) return {};
  try
  {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  }
  catch
  {
    return {};
  }
}

function writeStored(storageKey, values)
{
  if (!storageKey) return;
  try
  {
    localStorage.setItem(storageKey, JSON.stringify(values));
  }
  catch
  {
    // Storage can be unavailable; filtering still works for this session.
  }
}

function valueFromElement(element, field)
{
  if (!element) return field.defaultValue ?? '';
  if (field.type === 'checkbox') return element.checked === true;
  return element.value ?? '';
}

function applyValue(element, field, value)
{
  if (!element || value === undefined) return;
  if (field.type === 'checkbox')
  {
    element.checked = value === true;
    return;
  }
  element.value = String(value ?? '');
}

function createInput(field)
{
  if (field.type === 'select')
  {
    const select = document.createElement('select');
    for (const option of field.options || [])
    {
      const item = document.createElement('option');
      item.value = String(option.value ?? '');
      item.textContent = option.label ?? option.value ?? '';
      select.appendChild(item);
    }
    return select;
  }

  const input = document.createElement('input');
  input.type = field.type === 'checkbox' ? 'checkbox' : (field.inputType || 'text');
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.autocomplete !== undefined) input.autocomplete = field.autocomplete;
  return input;
}

function ensureElement(root, field)
{
  let element = field.elementId ? document.getElementById(field.elementId) : null;
  if (element) return element;
  if (!root) return null;

  const wrapper = document.createElement('div');
  wrapper.className = field.wrapperClass || 'eb-filter-field';
  const label = document.createElement('label');
  label.textContent = field.label;
  element = createInput(field);
  element.id = field.elementId || `${root.id || 'ebFilter'}-${field.name}`;
  element.setAttribute('aria-label', field.ariaLabel || field.label);
  label.htmlFor = element.id;

  if (field.type === 'checkbox')
  {
    wrapper.append(element, label);
  }
  else
  {
    wrapper.append(label, element);
  }
  root.appendChild(wrapper);
  return element;
}

export function createEBFilter(root, options = {})
{
  const fields = normalizeFields(options.fields);
  const storageKey = options.storageKey || null;
  const stored = readStored(storageKey);
  const elements = new Map();
  const listeners = [];

  function values()
  {
    return Object.fromEntries(fields.map(field => [field.name, valueFromElement(elements.get(field.name), field)]));
  }

  function emit(fieldName = null)
  {
    const next = values();
    writeStored(storageKey, next);
    options.onChange?.(next, fieldName);
    root?.dispatchEvent(new CustomEvent('eb:filterchange', { detail: { values: next, field: fieldName } }));
    return next;
  }

  function setValues(nextValues = {}, shouldEmit = true)
  {
    for (const field of fields)
    {
      if (!(field.name in nextValues)) continue;
      applyValue(elements.get(field.name), field, nextValues[field.name]);
    }
    return shouldEmit ? emit() : values();
  }

  function reset()
  {
    const defaults = Object.fromEntries(fields.map(field => [field.name, field.defaultValue ?? (field.type === 'checkbox' ? false : '')]));
    return setValues(defaults, true);
  }

  for (const field of fields)
  {
    const element = ensureElement(root, field);
    if (!element) continue;
    elements.set(field.name, element);
    const initial = stored[field.name] !== undefined ? stored[field.name] : field.defaultValue;
    applyValue(element, field, initial);
    const eventName = field.event || (field.type === 'text' || field.type === 'search' ? 'input' : 'change');
    const listener = () => emit(field.name);
    element.addEventListener(eventName, listener);
    listeners.push({ element, eventName, listener });
  }

  const api = Object.freeze({
    values,
    setValues,
    reset,
    emit,
    destroy()
    {
      listeners.forEach(({ element, eventName, listener }) => element.removeEventListener(eventName, listener));
      listeners.length = 0;
    },
  });

  if (options.emitInitial !== false) queueMicrotask(() => emit());
  return api;
}
