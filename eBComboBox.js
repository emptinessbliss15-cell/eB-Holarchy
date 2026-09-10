// eBComboBox - eBliss wrapper around hcg-autocomplete.
// Keeps the third-party component generic while giving eB a stable Holon-friendly interface.

export function createEBComboBox(target, options = {})
{
  if (!window.hcgAutocomplete) throw new Error('hcg-autocomplete is not loaded');

  const source = options.source || [];
  let repositionFrame = null;
  let lastNotifiedValue = null;

  const normalizedChangeValue = value => JSON.stringify(value ?? '');

  const notifyChange = (input, value, api) =>
  {
    lastNotifiedValue = normalizedChangeValue(value);
    if (typeof options.onChange === 'function') options.onChange(input, value, api);
  };

  const positionPanel = () =>
  {
    const wrap = target.closest('.hcg-autocomplete');
    const panel = wrap?.querySelector('.hcg-autocomplete-panel');
    if (!wrap || !panel || panel.hidden) return;

    const rect = target.getBoundingClientRect();
    const panelHeight = Math.min(panel.scrollHeight || 260, 260);
    const gap = 4;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const showAbove = below < panelHeight + gap && above > below;

    panel.style.position = 'fixed';
    panel.style.left = `${rect.left}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.top = showAbove
      ? `${Math.max(4, rect.top - panelHeight - gap)}px`
      : `${rect.bottom + gap}px`;
    panel.style.bottom = 'auto';
  };

  const schedulePositionPanel = () =>
  {
    if (repositionFrame != null) return;
    const run = () =>
    {
      repositionFrame = null;
      positionPanel();
    };
    if (typeof requestAnimationFrame === 'function') repositionFrame = requestAnimationFrame(run);
    else run();
  };

  const onOpen = (input, api) =>
  {
    schedulePositionPanel();
    if (typeof options.onOpen === 'function') options.onOpen(input, api);
  };

  const onClose = (input, api) =>
  {
    if (repositionFrame != null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(repositionFrame);
    repositionFrame = null;

    const panel = target.closest('.hcg-autocomplete')?.querySelector('.hcg-autocomplete-panel');
    if (panel)
    {
      panel.style.position = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.top = '';
      panel.style.bottom = '';
    }

    if (typeof options.onClose === 'function') options.onClose(input, api);
  };

  const api = window.hcgAutocomplete(target, {
    source,
    minChars: options.minChars ?? 1,
    debounce: options.debounce ?? 300,
    multiple: !!options.multiple,
    allowCustom: !!options.allowCustom,
    clearable: options.clearable ?? true,
    highlight: options.highlight ?? true,
    maxItems: options.maxItems ?? null,
    noResultsText: options.noResultsText || 'No results',
    onInput: options.onInput,
    onOpen,
    onClose,
    onSelect: options.onSelect,
    onRemove: options.onRemove,
    onChange: notifyChange,
  });

  if (!api) throw new Error('Unable to initialize eBComboBox');

  const wrap = target.closest('.hcg-autocomplete');
  const clearButton = wrap?.querySelector('.hcg-autocomplete-clear');

  const syncClearButton = () =>
  {
    if (!clearButton || options.clearable === false) return;
    const hasValue = options.multiple
      ? Boolean(api.getValue()?.length)
      : Boolean(String(target.value || '').trim());
    clearButton.hidden = !hasValue;
  };

  const reposition = () =>
  {
    if (wrap?.classList.contains('is-open')) schedulePositionPanel();
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  // Keep the clear action synchronized with the visible input value as well
  // as hcg-autocomplete's internal committed-selection state. This matters
  // when eB restores or assigns a display value programmatically.
  const onValueActivity = () => syncClearButton();
  target.addEventListener('input', onValueActivity);
  target.addEventListener('change', onValueActivity);
  requestAnimationFrame(syncClearButton);

  // Backstop hcg-autocomplete change delivery. In particular, a clear-button
  // click must reach eB even if the underlying component only updates the
  // input. When hcg already fired onChange, the value is deduplicated here.
  const onNativeChange = () =>
  {
    const value = options.multiple ? api.getValue() : (target.value ? api.getValue() : '');
    const normalized = normalizedChangeValue(value);
    if (normalized === lastNotifiedValue) return;
    notifyChange(target, value, api);
  };
  target.addEventListener('change', onNativeChange);

  const baseDestroy = api.destroy.bind(api);
  api.destroy = () =>
  {
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    target.removeEventListener('input', onValueActivity);
    target.removeEventListener('change', onValueActivity);
    target.removeEventListener('change', onNativeChange);
    if (repositionFrame != null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(repositionFrame);
    repositionFrame = null;
    baseDestroy();
  };

  // hcg-autocomplete only considers committed selections part of getValue().
  // eB also needs to preserve a freeform value that is still in the input
  // when the surrounding form is submitted.
  const baseGetValue = api.getValue.bind(api);
  const getPendingValue = () => (api.input?.value || '').trim();

  const findSourceValue = (text) =>
  {
    const normalized = text.toLowerCase();
    const match = Array.isArray(source)
      ? source.find(item =>
      {
        const value = typeof item === 'object' && item !== null ? item.value : item;
        const label = typeof item === 'object' && item !== null ? item.label : item;
        return String(label ?? '').toLowerCase() === normalized
          || String(value ?? '').toLowerCase() === normalized;
      })
      : null;
    if (!match) return text;
    return typeof match === 'object' && match !== null
      ? String(match.value ?? match.label ?? text)
      : String(match);
  };

  api.getValue = () =>
  {
    const selected = baseGetValue();
    const pending = getPendingValue();
    if (!pending) return selected;

    const pendingValue = findSourceValue(pending);
    if (Array.isArray(selected))
    {
      return selected.includes(pendingValue) ? selected : [...selected, pendingValue];
    }
    return selected || pendingValue;
  };

  return api;
}

export function holonComboOptions(holons = [])
{
  return holons.map(holon => ({
    value: holon.id,
    label: holon.name || '(unnamed)',
  }));
}
