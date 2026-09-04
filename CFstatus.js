import { eBStatus } from './eBStatus.js';

const DEFAULTS = {
  endpoint: '/api/cf-status',
  pollInterval: 15000,
};

const STATES = {
  checking: { label: 'checking', symbol: '●' },
  queued: { label: 'queued', symbol: '●' },
  building: { label: 'building', symbol: '●' },
  deployed: { label: 'deployed', symbol: '●' },
  failed: { label: 'failed', symbol: '●' },
  unknown: { label: 'unknown', symbol: '●' },
};

function normalizeState(value)
{
  if (!value) return 'unknown';

  const state = String(value).toLowerCase().trim();

  if (state === 'success' || state === 'ready' || state === 'live')
    return 'deployed';

  if (state === 'pending' || state === 'waiting')
    return 'queued';

  if (state === 'in_progress' || state === 'in-progress' || state === 'processing')
    return 'building';

  if (state === 'error' || state === 'failure' || state === 'failed')
    return 'failed';

  return STATES[state] ? state : 'unknown';
}

function build(container)
{
  container.replaceChildren();
  container.classList.add('cf-build-status');
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.title = 'Cloudflare deployment status';

  const dot = document.createElement('span');
  dot.className = 'cf-build-dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'cf-build-label';

  container.append(dot, text);

  return { container, dot, text };
}

export function createCFStatus(container, options = {})
{
  if (!container) throw new Error('CFstatus requires a container element');

  const config = { ...DEFAULTS, ...options };
  const view = build(container);
  let state = 'checking';
  let previousState = null;
  let timer = null;
  let destroyed = false;
  let endpointUnavailable = false;

  function render()
  {
    const meta = STATES[state] || STATES.unknown;

    view.dot.textContent = meta.symbol;
    view.text.textContent = `CF: ${meta.label}`;
    view.container.dataset.status = state;
    view.container.title = `Cloudflare deployment status: ${meta.label}`;
  }

  function logStateChange(nextState)
  {
    if (previousState === nextState) return;

    // Unknown is useful in the CFstatus display, but it is not
    // meaningful enough to add noise to the application status log.
    if (nextState === 'unknown')
    {
      previousState = nextState;
      return;
    }

    const message = `Cloudflare: ${STATES[nextState]?.label || nextState}`;

    if (nextState === 'deployed')
      eBStatus.success(message);
    else if (nextState === 'failed')
      eBStatus.warn(message);
    else
      eBStatus.info(message);

    previousState = nextState;
  }

  function setState(nextState)
  {
    const normalized = normalizeState(nextState);
    state = normalized;
    render();
    logStateChange(normalized);
    return state;
  }

  async function refresh()
  {
    if (destroyed || endpointUnavailable) return;

    setState('checking');

    try
    {
      const response = await fetch(config.endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 404)
      {
        endpointUnavailable = true;
        setState('unknown');
        return;
      }

      if (!response.ok)
        throw new Error(`CF status endpoint returned ${response.status}`);

      const data = await response.json();
      setState(data.status ?? data.state ?? data.phase);
    }
    catch (error)
    {
      console.warn('Unable to read Cloudflare deployment status:', error);
      setState('unknown');
    }
  }

  function start()
  {
    refresh();

    if (config.pollInterval > 0)
      timer = window.setInterval(refresh, config.pollInterval);
  }

  function destroy()
  {
    destroyed = true;

    if (timer !== null)
      window.clearInterval(timer);

    timer = null;
  }

  render();
  start();

  return {
    get state() { return state; },
    refresh,
    setState,
    start,
    destroy,
  };
}

export const CFstatus = {
  init(container = document.getElementById('cf-status'), options = {})
  {
    if (!container) return null;
    return createCFStatus(container, options);
  },
};
