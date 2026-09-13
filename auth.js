function buildAuth(container, { api, onSession, setStatus })
{
  container.replaceChildren();
  container.className = 'eb-auth';
  const details = document.createElement('details');
  details.className = 'eb-auth-menu';
  const summary = document.createElement('summary');
  summary.className = 'eb-auth-icon';
  summary.setAttribute('aria-label', 'Account');
  summary.title = 'Account';
  const icon = document.createElement('span');
  icon.textContent = '👤';
  icon.setAttribute('aria-hidden', 'true');
  summary.appendChild(icon);
  const panel = document.createElement('div');
  panel.className = 'eb-auth-panel';
  const user = document.createElement('strong');
  user.className = 'eb-auth-user';
  const userId = document.createElement('code');
  userId.className = 'eb-auth-user-id';
  userId.title = 'Login UUID';
  const email = document.createElement('input');
  email.type = 'email'; email.placeholder = 'Email'; email.autocomplete = 'email';
  const password = document.createElement('input');
  password.type = 'password'; password.placeholder = 'Password'; password.autocomplete = 'current-password';
  const signIn = document.createElement('button'); signIn.type = 'button'; signIn.textContent = 'Sign in';
  const signUp = document.createElement('button'); signUp.type = 'button'; signUp.textContent = 'Create account';
  const profile = document.createElement('button'); profile.type = 'button'; profile.textContent = 'Edit profile'; profile.dataset.ebProfileEdit = 'true';
  const actingLabel = document.createElement('label'); actingLabel.className = 'eb-auth-acting-label'; actingLabel.textContent = 'Act as';
  const actingAs = document.createElement('select'); actingAs.className = 'eb-auth-acting'; actingAs.setAttribute('aria-label', 'Act as participant');
  actingLabel.appendChild(actingAs);
  const actorBadge = document.createElement('span'); actorBadge.className = 'eb-auth-actor-badge'; actorBadge.hidden = true;
  const signOut = document.createElement('button'); signOut.type = 'button'; signOut.textContent = 'Sign out';
  panel.append(user, userId, email, password, signIn, signUp, profile, actingLabel, signOut);
  details.append(summary, actorBadge, panel);
  container.appendChild(details);

  const showError = error => { if (error) setStatus(error.message || String(error), 'error'); };
  signIn.addEventListener('click', async () => { const result = await api.auth.signIn(email.value.trim(), password.value); if (result.error) return showError(result.error); details.removeAttribute('open'); await onSession(result.data.session); });
  signUp.addEventListener('click', async () => { const result = await api.auth.signUp(email.value.trim(), password.value); if (result.error) return showError(result.error); if (result.data.session) { details.removeAttribute('open'); await onSession(result.data.session); } else setStatus('Account created. Check your email as confirmation is required.'); });
  signOut.addEventListener('click', async () => { const result = await api.auth.signOut(); if (result.error) return showError(result.error); details.removeAttribute('open'); await onSession(null); });

  const renderActor = (actor, authenticatedUser = null) => {
    const impersonating = Boolean(actor?.impersonating);
    actorBadge.hidden = !impersonating;
    actorBadge.textContent = impersonating ? `Acting as ${actor.display_name || actor.id}` : '';
    container.dataset.impersonating = impersonating ? 'true' : 'false';
    summary.title = impersonating ? `Signed in as ${authenticatedUser?.email || 'founder'} · acting as ${actor.display_name || actor.id}` : (authenticatedUser ? `Signed in as ${authenticatedUser.email}` : 'Sign in');
  };

  const loadActors = async currentUser => {
    actingAs.replaceChildren();
    if (!currentUser) { actingLabel.hidden = true; return; }
    const participants = await api.profile.list();
    const own = document.createElement('option'); own.value = currentUser.id; own.textContent = `${currentUser.email || 'Myself'} (myself)`; actingAs.appendChild(own);
    for (const participant of participants) {
      if (String(participant.id) === String(currentUser.id)) continue;
      const option = document.createElement('option'); option.value = participant.id; option.textContent = participant.display_name || participant.id; actingAs.appendChild(option);
    }
    actingLabel.hidden = actingAs.options.length < 2;
  };

  actingAs.addEventListener('change', async () => {
    try {
      const actor = await api.identity.impersonate(actingAs.value);
      const session = await api.auth.getSession();
      renderActor(actor, session?.data?.session?.user || null);
      details.removeAttribute('open');
      setStatus(actor ? `Now acting as ${actor.display_name || actor.id}` : 'Returned to your own identity', 'success');
    } catch (error) { showError(error); }
  });

  document.addEventListener('click', event =>
  {
    if (details.open && !details.contains(event.target)) details.removeAttribute('open');
  });

  const renderProfileAvatar = profileData =>
  {
    icon.replaceChildren();
    const avatarData = profileData?.avatar_data;
    if (!avatarData) { icon.textContent = '👤'; return; }
    const value = String(avatarData);
    if (!value.startsWith('\\x')) { icon.textContent = '👤'; return; }
    const bytes = value.slice(2).match(/.{1,2}/g)?.map(pair => parseInt(pair, 16)) || [];
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const image = document.createElement('img');
    image.className = 'eb-auth-avatar';
    image.alt = 'Profile avatar';
    image.src = `data:${profileData.avatar_mime_type || 'image/webp'};base64,${btoa(binary)}`;
    icon.appendChild(image);
  };

  window.addEventListener('profile:updated', event => renderProfileAvatar(event.detail));
  const render = session =>
  {
    const currentUser = session?.user || null;
    container.dataset.loggedIn = currentUser ? 'true' : 'false';
    user.textContent = currentUser?.email || 'Not signed in';
    userId.textContent = currentUser ? `UUID: ${currentUser.id}` : '';
    userId.hidden = !currentUser; email.hidden = !!currentUser; password.hidden = !!currentUser;
    signIn.hidden = !!currentUser; signUp.hidden = !!currentUser; profile.hidden = !currentUser; signOut.hidden = !currentUser;
    if (!currentUser) { api.identity?.clear?.(); renderProfileAvatar(null); renderActor(null); }
    void loadActors(currentUser).catch(showError);
    void api.identity?.actor?.().then(actor => renderActor(actor, currentUser)).catch(showError);
  };
  api.auth.onAuthStateChange((_event, session) => { render(session); onSession(session); });
  render(null);
  return api.auth.getSession();
}

export function initAuth({ api, container, onSession, setStatus })
{
  if (!container) throw new Error('Auth container not found');
  buildAuth(container, { api, onSession, setStatus });
  return api.auth.getSession();
}
