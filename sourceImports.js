import { eBliss } from './eBSDK.js';
import { eBStatus } from './eBStatus.js';

const HOLACRACY_BUNDLE_URL = './data/holacracy-constitution-5.0.json';

function parseChange(item) {
  try { return typeof item?.provenance?.changes === 'string' ? JSON.parse(item.provenance.changes) : item?.provenance?.changes; }
  catch { return null; }
}

async function holacracyState() {
  const [model, pending] = await Promise.all([eBliss.model.load(), eBliss.changes.list('pending')]);
  const imported = model.holons.some(holon => holon.name === 'Holacracy Constitution' && holon.holon_type === 'Constitution');
  const staged = pending.some(item => parseChange(item)?.bundle?.root?.key === 'holacracy-constitution');
  return { imported, staged };
}

export function initSourceImports() {
  const button = document.getElementById('importHolacracy');
  if (!button || button.dataset.ready) return;
  button.dataset.ready = 'true';

  const refresh = async () => {
    try {
      const state = await holacracyState();
      button.disabled = state.imported || state.staged;
      button.textContent = state.imported ? 'Holacracy Imported' : state.staged ? 'Holacracy Pending' : 'Import Holacracy';
    } catch { /* Authentication/model startup owns error reporting. */ }
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    eBStatus.info('Preparing Holacracy Constitution 5.0 import…');
    try {
      const response = await fetch(HOLACRACY_BUNDLE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Unable to load Holacracy bundle: ${response.status}`);
      const bundle = await response.json();
      await eBliss.imports.stage(bundle);
      button.textContent = 'Holacracy Pending';
      eBStatus.success('Holacracy Constitution import is ready for provenance review');
      window.dispatchEvent(new CustomEvent('eB:provenanceCreated'));
    } catch (error) {
      button.disabled = false;
      eBStatus.error(error?.message || 'Unable to stage Holacracy Constitution');
    }
  });

  window.addEventListener('eB:modelChanged', refresh);
  window.addEventListener('eB:provenanceCreated', refresh);
  void refresh();
}
