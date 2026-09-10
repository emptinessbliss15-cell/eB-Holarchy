import { initAppBar } from './eBAppBar.js';

export async function mountAppBar()
{
  let root = document.getElementById('appBar');
  if (!root)
  {
    root = document.createElement('nav');
    root.id = 'appBar';
    root.setAttribute('aria-label', 'Application');
    const status = document.getElementById('status');
    if (status) status.insertAdjacentElement('afterend', root);
    else document.querySelector('.eb-main')?.insertAdjacentElement('beforebegin', root);
  }
  return initAppBar();
}
