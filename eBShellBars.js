// eB shell bars — keep Status and Provenance outside the app card in a stable order.

export function initShellBars()
{
  const status = document.getElementById('status');
  const main = document.querySelector('.eb-main');
  const app = document.getElementById('app');
  const provenance = document.querySelector('.eb-provenance-panel');
  const provControl = document.querySelector('.holarchy-filter-prov');

  if (!main || !app) return;

  // Status belongs above the main workspace, directly under the header.
  if (status && status.parentElement !== main.parentElement)
  {
    main.parentElement?.insertBefore(status, main);
  }

  if (!provenance) return;

  provenance.classList.add('eb-shell-provenance');

  // Keep provenance outside #app.card, immediately below Status and above main/app.
  if (status?.parentElement)
  {
    status.insertAdjacentElement('afterend', provenance);
  }
  else
  {
    main.parentElement?.insertBefore(provenance, main);
  }

  // The graph-provenance toggle is provenance state, not a graph-layout filter.
  // Move the existing control so eBHolarchyFilter keeps its current element/event wiring.
  if (provControl && provControl.parentElement !== provenance)
  {
    provControl.classList.add('eb-shell-provenance-control');
    const label = provControl.querySelector('label');
    if (label) label.textContent = 'Show on graph';
    provenance.prepend(provControl);
  }
}
