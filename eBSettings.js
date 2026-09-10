import { eBliss } from './eBSDK.js';
import { eBProfiles } from './eBProfiles.js';
import { eBToggles } from './eBToggles.js';

let initialized = false;
let currentUser = null;

function ensureStyles()
{
  if (document.getElementById('eb-settings-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-settings-style';
  style.textContent = `
    .eb-settings { display:grid; gap:12px; }
    .eb-settings-section { border:1px solid var(--eb-border); border-radius:7px; padding:14px; background:var(--eb-bg); }
    .eb-settings-heading { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .eb-settings-heading h3 { margin:0; }
    .eb-settings-avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; border:1px solid var(--eb-border); }
    .eb-settings-avatar-fallback { width:64px; height:64px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--eb-border); font-size:28px; }
    .eb-settings-profile { display:grid; grid-template-columns:max-content minmax(0, 1fr); gap:8px 12px; margin:0 0 14px; }
    .eb-settings-profile dt { font-weight:700; opacity:.7; }
    .eb-settings-profile dd { margin:0; overflow-wrap:anywhere; }
    .eb-settings-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .eb-settings-actions button { padding:7px 10px; border:1px solid var(--eb-border-strong); border-radius:5px; background:var(--eb-input-bg); color:var(--eb-text); cursor:pointer; }
    .eb-settings-features { display:grid; gap:8px; }
    .eb-settings-feature { display:grid; grid-template-columns:minmax(0, 1fr) max-content; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid var(--eb-border); }
    .eb-settings-feature:last-child { border-bottom:0; }
    .eb-settings-feature strong { display:block; }
    .eb-settings-feature .muted { font-size:12px; margin-top:2px; }
    .eb-settings-feature input { margin:0; }
  `;
  document.head.appendChild(style);
}

function settingsRoot()
{
  return document.getElementById('appView-settings');
}

function profileAvatar(profile)
{
  const url = eBProfiles.avatarUrl(profile);
  if (url)
  {
    const image = document.createElement('img');
    image.className = 'eb-settings-avatar';
    image.alt = 'Profile avatar';
    image.src = url;
    return image;
  }
  const fallback = document.createElement('div');
  fallback.className = 'eb-settings-avatar-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = '👤';
  return fallback;
}

function addProfileValue(list, label, value)
{
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value || '—';
  list.append(term, description);
}

function createProfileSection(profile)
{
  const section = document.createElement('section');
  section.className = 'eb-settings-section';

  const heading = document.createElement('div');
  heading.className = 'eb-settings-heading';
  heading.appendChild(profileAvatar(profile));
  const title = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = 'Profile';
  const subtitle = document.createElement('div');
  subtitle.className = 'muted';
  subtitle.textContent = 'Your identity and personal information in eBliss.';
  title.append(h3, subtitle);
  heading.appendChild(title);
  section.appendChild(heading);

  if (!currentUser)
  {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = 'Sign in to view and edit your profile.';
    section.appendChild(message);
    return section;
  }

  const values = document.createElement('dl');
  values.className = 'eb-settings-profile';
  addProfileValue(values, 'Name', profile?.display_name || currentUser.email?.split('@')[0] || '—');
  addProfileValue(values, 'Email', currentUser.email || '—');
  section.appendChild(values);

  const actions = document.createElement('div');
  actions.className = 'eb-settings-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit Profile';
  edit.addEventListener('click', async () =>
  {
    await eBProfiles.edit();
    render();
  });
  actions.appendChild(edit);
  section.appendChild(actions);
  return section;
}

function createFeaturesSection()
{
  const section = document.createElement('section');
  section.className = 'eb-settings-section';

  const heading = document.createElement('div');
  heading.className = 'eb-settings-heading';
  const title = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = 'Features';
  const subtitle = document.createElement('div');
  subtitle.className = 'muted';
  subtitle.textContent = currentUser
    ? 'Choose which optional interface features are enabled for your account.'
    : 'Sign in to save feature preferences to your account.';
  title.append(h3, subtitle);
  heading.appendChild(title);
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'eb-settings-features';

  for (const [name, definition] of Object.entries(eBToggles.definitions))
  {
    const row = document.createElement('label');
    row.className = 'eb-settings-feature';

    const text = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = definition.label;
    text.appendChild(label);
    if (definition.description)
    {
      const description = document.createElement('div');
      description.className = 'muted';
      description.textContent = definition.description;
      text.appendChild(description);
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = eBToggles.is(name);
    checkbox.disabled = !currentUser;
    checkbox.addEventListener('change', async () =>
    {
      try
      {
        checkbox.disabled = true;
        const value = await eBToggles.set(name, checkbox.checked);
        checkbox.checked = value;
      }
      catch (error)
      {
        checkbox.checked = eBToggles.is(name);
        console.error(error);
      }
      finally
      {
        checkbox.disabled = !currentUser;
      }
    });

    row.append(text, checkbox);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}

function render()
{
  const root = settingsRoot();
  if (!root) return;
  ensureStyles();
  root.replaceChildren();
  root.className = 'card eb-app-view-placeholder eb-settings';

  const profile = eBProfiles.current();
  root.append(
    createProfileSection(profile),
    createFeaturesSection(),
  );
}

async function refreshSession()
{
  const sessionResult = await eBliss.auth.getSession();
  currentUser = sessionResult?.data?.session?.user || null;
  render();
}

export async function initSettings()
{
  if (initialized) return;
  initialized = true;
  await refreshSession();
  window.addEventListener('profile:updated', render);
  window.addEventListener('features:loaded', render);
  window.addEventListener('feature:toggle', render);
  window.addEventListener('eB:appViewChanged', event =>
  {
    if (event.detail?.viewId === 'settings') render();
  });
  eBliss.auth.onAuthStateChange((_event, session) =>
  {
    currentUser = session?.user || null;
    render();
  });
}
