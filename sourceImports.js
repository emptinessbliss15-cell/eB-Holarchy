import { eBliss } from './eBSDK.js';
import { eBStatus } from './eBStatus.js';

const IMPORTS = [
  { buttonId: 'importHolacracy', url: './data/holacracy-constitution-5.0.json', key: 'holacracy-constitution', name: 'Holacracy Constitution', label: 'Holacracy', preparing: 'Holacracy Constitution 5.0' },
  { buttonId: 'importUSConstitution', url: './data/us-constitution.json', key: 'us-constitution', name: 'United States Constitution', label: 'U.S. Constitution', preparing: 'U.S. Constitution' },
];

function parseChange(item) {
  try { return typeof item?.provenance?.changes === 'string' ? JSON.parse(item.provenance.changes) : item?.provenance?.changes; }
  catch { return null; }
}

async function importStates() {
  const [model, pending] = await Promise.all([eBliss.model.load(), eBliss.changes.list('pending')]);
  return new Map(IMPORTS.map(spec => [spec.key, {
    imported: model.holons.some(holon => holon.name === spec.name && holon.holon_type === 'Constitution'),
    staged: pending.some(item => parseChange(item)?.bundle?.root?.key === spec.key),
  }]));
}

export function initSourceImports() {
  const entries = IMPORTS.map(spec => ({ spec, button: document.getElementById(spec.buttonId) })).filter(entry => entry.button);
  if (!entries.length || entries.every(entry => entry.button.dataset.ready)) return;
  entries.forEach(entry => { entry.button.dataset.ready = 'true'; });

  const refresh = async () => {
    try {
      const states = await importStates();
      entries.forEach(({ spec, button }) => {
        const state = states.get(spec.key);
        button.disabled = state.imported || state.staged;
        button.textContent = state.imported ? `${spec.label} Imported` : state.staged ? `${spec.label} Pending` : `Import ${spec.label}`;
      });
    } catch { /* Authentication/model startup owns error reporting. */ }
  };

  entries.forEach(({ spec, button }) => button.addEventListener('click', async () => {
    button.disabled = true;
    eBStatus.info(`Preparing ${spec.preparing} import…`);
    try {
      const response = await fetch(spec.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Unable to load ${spec.label} bundle: ${response.status}`);
      await eBliss.imports.stage(await response.json());
      button.textContent = `${spec.label} Pending`;
      eBStatus.success(`${spec.label} import is ready for provenance review`);
      window.dispatchEvent(new CustomEvent('eB:provenanceCreated'));
    } catch (error) {
      button.disabled = false;
      eBStatus.error(error?.message || `Unable to stage ${spec.label}`);
    }
  }));

  window.addEventListener('eB:modelChanged', refresh);
  window.addEventListener('eB:provenanceCreated', refresh);
  void refresh();
}
