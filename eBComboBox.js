// eBComboBox - eBliss wrapper around hcg-autocomplete.
// Keeps the third-party component generic while giving eB a stable Holon-friendly interface.

export function createEBComboBox(target, options = {})
{
  if (!window.hcgAutocomplete) throw new Error('hcg-autocomplete is not loaded');

  const source = options.source || [];
  let repositionFrame = null;
  let isPositioning = false;

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
    onChange: options.onChange,
  });

  if (!api) throw new Error('Unable to initialize eBComboBox');

  const wrap = target.closest('.hcg-autocomplete');
  const reposition = () =>
  {
    if (wrap?.classList.contains('is-open')) schedulePositionPanel();
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  const baseDestroy = api.destroy.bind(api);
  api.destroy = () =>
  {
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
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

  const findSourceValue = (text) => {
    const normalized = text.toLowerCase();
    const match = Array.isArray(source)
      ? source.find(item => {
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

  api.getValue = () => {
    const selected = baseGetValue();
    const pending = getPendingValue();
    if (!pending) return selected;

    const pendingValue = findSourceValue(pending);
    if (Array.isArray(selected)) {
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
