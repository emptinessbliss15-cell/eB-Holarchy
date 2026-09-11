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

function timestamp()
{
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function build(container)
{
  container.replaceChildren();
  container.classList.add('cf-build-status');
  container.setAttribute('role', 'button');
  container.setAttribute('tabindex', '0');
  container.setAttribute('aria-label', 'Open Cloudflare deployment activity');
  container.title = 'Cloudflare deployment status';

  const dot = document.createElement('span');
  dot.className = 'cf-build-dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'cf-build-label';

  container.append(dot, text);

  const dialog = document.createElement('dialog');
  dialog.className = 'status-log-dialog cf-status-dialog';

  const header = document.createElement('div');
  header.className = 'status-log-header';

  const title = document.createElement('strong');
  title.textContent = 'Cloudflare Activity';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '8px';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';
  copyButton.title = 'Copy Cloudflare activity';
  copyButton.style.fontSize = 'inherit';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close Cloudflare activity';

  actions.append(copyButton, closeButton);
  header.append(title, actions);

  const log = document.createElement('div');
  log.className = 'status-log';

  dialog.append(header, log);
  document.body.appendChild(dialog);

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  return { container, dot, text, dialog, log, copyButton };
}

export function createCFStatus(container, options = {})
{
  if (!container) throw new Error('CFstatus requires a container element');

  const config = { ...DEFAULTS, ...options };
  const view = build(container);
  const history = [];
  const maxHistory = 100;
  let state = 'checking';
  let previousState = null;
  let timer = null;
  let destroyed = false;
  let hasCompletedCheck = false;
  let lastErrorKey = null;
  let copyLabelTimer = null;

  function renderHistory()
  {
    view.log.replaceChildren();

    history.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'status-log-entry';
      row.dataset.level = entry.level;

      const time = document.createElement('span');
      time.className = 'status-log-time';
      time.textContent = entry.time;

      const message = document.createElement('span');
      message.className = 'status-log-message';
      message.textContent = entry.message;

      row.append(time, message);
      view.log.appendChild(row);
    });
  }

  function historyText()
  {
    return history
      .slice()
      .reverse()
      .map(entry => `${entry.time}  ${entry.message}`)
      .join('\n');
  }

  async function copyHistory()
  {
    const text = historyText();
    if (!text) return;

    try
    {
      if (navigator.clipboard?.writeText)
      {
        await navigator.clipboard.writeText(text);
      }
      else
      {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      view.copyButton.textContent = 'Copied';
      if (copyLabelTimer !== null) window.clearTimeout(copyLabelTimer);
      copyLabelTimer = window.setTimeout(() => {
        view.copyButton.textContent = 'Copy';
        copyLabelTimer = null;
      }, 1200);
    }
    catch (error)
    {
      console.warn('Unable to copy Cloudflare activity:', error);
      view.copyButton.textContent = 'Copy failed';
      if (copyLabelTimer !== null) window.clearTimeout(copyLabelTimer);
      copyLabelTimer = window.setTimeout(() => {
        view.copyButton.textContent = 'Copy';
        copyLabelTimer = null;
      }, 1600);
    }
  }

  view.copyButton.addEventListener('click', () => void copyHistory());

  function addHistory(message, level = 'info')
  {
    if (!message) return;
    history.unshift({ message, level, time: timestamp() });
    if (history.length > maxHistory) history.pop();
    renderHistory();
  }

  function openHistory()
  {
    renderHistory();
    view.dialog.showModal();
  }

  view.container.addEventListener('click', openHistory);
  view.container.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openHistory();
  });

  function render()
  {
    const meta = STATES[state] || STATES.unknown;

    view.dot.textContent = meta.symbol;
    view.text.textContent = `CF: ${meta.label}`;
    view.container.dataset.status = state;
    view.container.title = state === 'unknown'
      ? 'Cloudflare deployment status temporarily unavailable; click for activity'
      : `Cloudflare deployment status: ${meta.label}; click for activity`;
  }

  function logStateChange(nextState)
  {
    if (previousState === nextState) return;

    const label = STATES[nextState]?.label || nextState;
    const level = nextState === 'deployed'
      ? 'success'
      : nextState === 'failed' || nextState === 'unknown'
        ? 'warn'
        : 'info';

    addHistory(`Cloudflare: ${label}`, level);

    // Unknown/checking are useful in the compact CF display and its own
    // history, but polling and transient endpoint failures should not add
    // noise to the application's main status log.
    if (nextState === 'unknown' || nextState === 'checking')
    {
      previousState = nextState;
      return;
    }

    const message = `Cloudflare: ${label}`;

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

  function reportReadError(error)
  {
    const key = String(error?.message || error || 'unknown error');
    if (key === lastErrorKey) return;
    lastErrorKey = key;
    addHistory(`Monitor error: ${key}`, 'warn');
    console.warn('Unable to read Cloudflare deployment status; monitoring will retry:', error);
  }

  async function refresh()
  {
    if (destroyed) return;

    // Show checking only for the initial request. During normal polling retain
    // the last useful state so the badge does not flicker every 15 seconds.
    if (!hasCompletedCheck) setState('checking');

    try
    {
      const response = await fetch(config.endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok)
        throw new Error(`CF status endpoint returned ${response.status}`);

      const data = await response.json();
      hasCompletedCheck = true;
      lastErrorKey = null;
      setState(data.status ?? data.state ?? data.phase);
    }
    catch (error)
    {
      hasCompletedCheck = true;
      reportReadError(error);
      setState('unknown');
    }
  }

  function start()
  {
    refresh();

    if (config.pollInterval > 0 && timer === null)
      timer = window.setInterval(refresh, config.pollInterval);
  }

  function destroy()
  {
    destroyed = true;

    if (timer !== null)
      window.clearInterval(timer);
    if (copyLabelTimer !== null)
      window.clearTimeout(copyLabelTimer);

    timer = null;
    copyLabelTimer = null;
    view.dialog.remove();
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
