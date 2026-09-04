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
  email.type = 'email';
  email.placeholder = 'Email';
  email.autocomplete = 'email';

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Password';
  password.autocomplete = 'current-password';

  const signIn = document.createElement('button');
  signIn.type = 'button';
  signIn.textContent = 'Sign in';

  const signUp = document.createElement('button');
  signUp.type = 'button';
  signUp.textContent = 'Create account';

  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.textContent = 'Sign out';

  panel.append(user, userId, email, password, signIn, signUp, signOut);
  details.append(summary, panel);
  container.appendChild(details);

  const showError = error =>
  {
    if (error) setStatus(error.message || String(error), 'error');
  };

  signIn.addEventListener('click', async () =>
  {
    const result = await api.auth.signIn(email.value.trim(), password.value);

    if (result.error)
    {
      showError(result.error);
      return;
    }

    details.removeAttribute('open');
    await onSession(result.data.session);
  });

  signUp.addEventListener('click', async () =>
  {
    const result = await api.auth.signUp(email.value.trim(), password.value);

    if (result.error)
    {
      showError(result.error);
      return;
    }

    if (result.data.session)
    {
      details.removeAttribute('open');
      await onSession(result.data.session);
    }
    else
    {
      setStatus('Account created. Check your email as confirmation is required.');
    }
  });

  signOut.addEventListener('click', async () =>
  {
    const result = await api.auth.signOut();

    if (result.error)
    {
      showError(result.error);
      return;
    }

    details.removeAttribute('open');
    await onSession(null);
  });

  const render = session =>
  {
    const currentUser = session?.user || null;
    container.dataset.loggedIn = currentUser ? 'true' : 'false';
    user.textContent = currentUser?.email || 'Not signed in';
    userId.textContent = currentUser ? `UUID: ${currentUser.id}` : '';
    userId.hidden = !currentUser;
    email.hidden = !!currentUser;
    password.hidden = !!currentUser;
    signIn.hidden = !!currentUser;
    signUp.hidden = !!currentUser;
    signOut.hidden = !currentUser;
    summary.title = currentUser ? `Signed in as ${currentUser.email}` : 'Sign in';
  };

  api.auth.onAuthStateChange((_event, session) =>
  {
    render(session);
    onSession(session);
  });

  render(null);

  return api.auth.getSession();
}

export function initAuth({ api, container, onSession, setStatus })
{
  if (!container) throw new Error('Auth container not found');
  buildAuth(container, { api, onSession, setStatus });
  return api.auth.getSession();
}
