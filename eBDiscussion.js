const PREVIEW_NOTICE = 'UI preview — messages in this build are not saved yet.';
let selectedObject = null;
let observer = null;

function ensureStyles() {
  if (document.getElementById('eb-discussion-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-discussion-style';
  style.textContent = `
    .eb-discuss-shell { display:grid; grid-template-columns:190px minmax(0,1fr) 240px; min-height:clamp(520px,72vh,820px); overflow:hidden; }
    .eb-discuss-sidebar, .eb-discuss-context { padding:12px; background:var(--eb-surface-alt); }
    .eb-discuss-sidebar { border-right:1px solid var(--eb-border); }
    .eb-discuss-context { border-left:1px solid var(--eb-border); }
    .eb-discuss-title { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; opacity:.7; }
    .eb-channel { display:block; width:100%; padding:7px 8px; border:0; border-radius:5px; background:transparent; color:var(--eb-text); text-align:left; }
    .eb-channel.is-active { background:var(--eb-input-bg); font-weight:700; }
    .eb-discuss-main { min-width:0; display:flex; flex-direction:column; }
    .eb-discuss-header { padding:11px 14px; border-bottom:1px solid var(--eb-border); }
    .eb-discuss-header strong { display:block; }
    .eb-discuss-notice { font-size:11px; opacity:.62; }
    .eb-message-list { flex:1; min-height:240px; overflow:auto; padding:8px 14px; }
    .eb-message { display:grid; grid-template-columns:32px minmax(0,1fr); gap:9px; padding:9px 0; }
    .eb-message-avatar { width:32px; height:32px; display:grid; place-items:center; border-radius:50%; background:var(--eb-accent,#5b8def); color:#fff; font-weight:700; }
    .eb-message-meta { display:flex; gap:7px; align-items:baseline; }
    .eb-message-time { font-size:11px; opacity:.55; }
    .eb-message-body { margin-top:2px; white-space:pre-wrap; overflow-wrap:anywhere; }
    .eb-message-composer { display:flex; gap:7px; padding:10px 12px; border-top:1px solid var(--eb-border); }
    .eb-message-composer textarea { flex:1; min-height:42px; max-height:120px; resize:vertical; padding:8px; border:1px solid var(--eb-border-strong); border-radius:6px; background:var(--eb-input-bg); color:var(--eb-text); }
    .eb-message-composer button { align-self:flex-end; padding:8px 11px; border:1px solid var(--eb-border-strong); border-radius:6px; background:var(--eb-input-bg); color:var(--eb-text); }
    .eb-object-discussion { min-height:180px; }
    .eb-object-discussion .eb-message-list { padding:4px 0; }
    .eb-object-discussion .eb-message-composer { padding:10px 0 0; }
    @media (max-width:850px) { .eb-discuss-shell { grid-template-columns:150px minmax(0,1fr); } .eb-discuss-context { display:none; } }
    @media (max-width:600px) { .eb-discuss-shell { grid-template-columns:1fr; } .eb-discuss-sidebar { border-right:0; border-bottom:1px solid var(--eb-border); } }
  `;
  document.head.appendChild(style);
}

function message(author, body, time = 'now') {
  const article = document.createElement('article');
  article.className = 'eb-message';
  const avatar = document.createElement('div');
  avatar.className = 'eb-message-avatar';
  avatar.textContent = String(author || '?').trim().charAt(0).toUpperCase();
  const content = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'eb-message-meta';
  const name = document.createElement('strong');
  name.textContent = author;
  const stamp = document.createElement('span');
  stamp.className = 'eb-message-time';
  stamp.textContent = time;
  const text = document.createElement('div');
  text.className = 'eb-message-body';
  text.textContent = body;
  meta.append(name, stamp);
  content.append(meta, text);
  article.append(avatar, content);
  return article;
}

function thread({ compact = false, subject = 'general' } = {}) {
  const root = document.createElement('div');
  root.className = compact ? 'eb-object-discussion' : 'eb-discuss-main';
  const list = document.createElement('div');
  list.className = 'eb-message-list';
  list.appendChild(message('Nikki', compact
    ? `Discussion about ${subject} will appear here.`
    : 'This is the shared discussion workspace. Channels and Holon discussions will use the same messages.'));
  const form = document.createElement('form');
  form.className = 'eb-message-composer';
  const input = document.createElement('textarea');
  input.placeholder = compact ? `Discuss ${subject}…` : 'Message #general…';
  input.setAttribute('aria-label', input.placeholder);
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'Send';
  form.append(input, send);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    list.appendChild(message('You', body));
    input.value = '';
    list.scrollTop = list.scrollHeight;
    window.ebStatus?.info?.(PREVIEW_NOTICE);
  });
  root.append(list, form);
  return root;
}

export function mountDiscussionWorkspace(section) {
  ensureStyles();
  section.classList.remove('eb-app-view-placeholder');
  section.replaceChildren();
  const shell = document.createElement('div');
  shell.className = 'eb-discuss-shell';
  const sidebar = document.createElement('aside');
  sidebar.className = 'eb-discuss-sidebar';
  sidebar.innerHTML = '<h3 class="eb-discuss-title">Channels</h3>';
  ['general', 'governance', 'proposals', 'help'].forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `eb-channel${index === 0 ? ' is-active' : ''}`;
    button.textContent = `# ${name}`;
    sidebar.appendChild(button);
  });
  const main = thread();
  const header = document.createElement('header');
  header.className = 'eb-discuss-header';
  header.innerHTML = `<strong># general</strong><span class="eb-discuss-notice">${PREVIEW_NOTICE}</span>`;
  main.prepend(header);
  const context = document.createElement('aside');
  context.className = 'eb-discuss-context';
  context.innerHTML = '<h3 class="eb-discuss-title">Context</h3><strong>General</strong><p class="muted">Community-wide conversation not attached to one Holon.</p><h3 class="eb-discuss-title">Participants</h3><div>Joshua</div><div>emptiness bliss</div>';
  shell.append(sidebar, main, context);
  section.appendChild(shell);
}

function decorateInspector() {
  const tabs = document.querySelector('#holonInspectorContent .eb-provenance-tabs');
  const propsGrid = document.querySelector('#holonInspectorContent .holon-property-grid');
  if (!tabs || !propsGrid || tabs.querySelector('[data-tab="discuss"]')) return;
  const provenanceButton = [...tabs.querySelectorAll('button')].find(button => button.textContent.trim() === 'Prov');
  const provenancePanel = document.querySelector('#holonInspectorContent .eb-provenance-inspector');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eb-provenance-tab';
  button.dataset.tab = 'discuss';
  button.textContent = 'Discuss';
  const panel = document.createElement('div');
  panel.className = 'eb-discussion-inspector';
  panel.hidden = true;
  panel.appendChild(thread({ compact: true, subject: selectedObject?.name || selectedObject?.relationship_type || 'this object' }));
  provenancePanel?.insertAdjacentElement('afterend', panel);
  button.addEventListener('click', () => {
    tabs.querySelectorAll('button').forEach(tab => tab.classList.toggle('is-active', tab === button));
    propsGrid.hidden = true;
    if (provenancePanel) provenancePanel.hidden = true;
    panel.hidden = false;
  });
  for (const other of tabs.querySelectorAll('button')) other.addEventListener('click', () => { if (other !== button) panel.hidden = true; });
  provenanceButton?.insertAdjacentElement('afterend', button);
}

export function initDiscussion() {
  ensureStyles();
  window.addEventListener('holon:selected', event => { selectedObject = event.detail || null; requestAnimationFrame(decorateInspector); });
  window.addEventListener('relationship:selected', event => { selectedObject = event.detail || null; requestAnimationFrame(decorateInspector); });
  const content = document.getElementById('holonInspectorContent');
  if (!content || observer) return;
  observer = new MutationObserver(() => requestAnimationFrame(decorateInspector));
  observer.observe(content, { childList: true, subtree: true });
  requestAnimationFrame(decorateInspector);
}
