const entries = [];
const maxEntries = 100;

let current = null;
let currentElement = null;
let logElement = null;
let dialogElement = null;

function timestamp()
{
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function addEntry(message, level = 'info')
{
  if (!message) return;

  current = {
    message,
    level,
    time: timestamp(),
  };

  entries.unshift(current);
  if (entries.length > maxEntries) entries.pop();

  renderCurrent();
  renderLog();
}

function renderCurrent()
{
  if (!currentElement) return;

  currentElement.textContent = current
    ? current.message
    : 'Ready';

  const statusButton = currentElement.parentElement;
  if (statusButton)
    statusButton.dataset.level = current?.level || 'info';
}

function renderLog()
{
  if (!logElement) return;

  logElement.replaceChildren();

  entries.forEach(entry =>
  {
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
    logElement.appendChild(row);
  });
}

function closeLog()
{
  dialogElement?.close();
}

function openLog()
{
  renderLog();
  dialogElement?.showModal();
}

function build(container)
{
  container.replaceChildren();
  container.className = 'eb-status';
  container.setAttribute('role', 'status');

  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = 'eb-status-current';
  statusButton.title = 'Open activity log';
  statusButton.addEventListener('click', openLog);

  currentElement = document.createElement('span');
  currentElement.className = 'eb-status-message';
  statusButton.appendChild(currentElement);

  container.appendChild(statusButton);

  dialogElement = document.createElement('dialog');
  dialogElement.className = 'status-log-dialog';

  const header = document.createElement('div');
  header.className = 'status-log-header';

  const title = document.createElement('strong');
  title.textContent = 'Activity Log';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close activity log';
  closeButton.addEventListener('click', closeLog);

  header.append(title, closeButton);

  logElement = document.createElement('div');
  logElement.className = 'status-log';

  dialogElement.append(header, logElement);
  document.body.appendChild(dialogElement);

  dialogElement.addEventListener('click', event =>
  {
    if (event.target === dialogElement) closeLog();
  });

  renderCurrent();
  renderLog();
}

export const eBStatus = {
  init(container = document.getElementById('status'))
  {
    if (!container) return;
    build(container);
  },

  info(message)
  {
    addEntry(message, 'info');
  },

  success(message)
  {
    addEntry(message, 'success');
  },

  warn(message)
  {
    addEntry(message, 'warn');
  },

  error(message)
  {
    addEntry(message, 'error');
  },

  clear()
  {
    entries.length = 0;
    current = null;
    renderCurrent();
    renderLog();
  },
};
