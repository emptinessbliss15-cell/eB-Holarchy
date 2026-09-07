import { toggledOn } from './eBToggles.js';

// Experimental fCoSE adapter.
// Keeps the existing Holon graph code unchanged while allowing the graph.fCoSE
// feature toggle to substitute fCoSE anywhere the graph requests the built-in
// CoSE layout. This is intentionally isolated so the experiment can be removed
// cleanly once we decide how Holons, Circles, and Roles should be modeled.

let patched = false;

function layoutOptions(options) {
  if (!options || typeof options !== 'object') return options;
  if (options.name !== 'cose' || !toggledOn('graph.fCoSE')) return options;
  return {
    ...options,
    name: 'fcose',
    quality: options.quality || 'default',
    randomize: options.randomize ?? true,
    animate: options.animate ?? false,
    fit: options.fit ?? true,
    padding: options.padding ?? 40,
  };
}

export function installFcoseAdapter() {
  if (patched || !window.cytoscape) return;
  const original = window.cytoscape;

  const wrapped = function (...args) {
    if (args[0] && typeof args[0] === 'object') {
      const options = { ...args[0] };
      if (options.layout) options.layout = layoutOptions(options.layout);
      args[0] = options;
    }
    const instance = original(...args);
    if (instance?.layout && !instance.layout.__ebFcoseWrapped) {
      const originalLayout = instance.layout.bind(instance);
      const layout = function (options) {
        return originalLayout(layoutOptions(options));
      };
      layout.__ebFcoseWrapped = true;
      instance.layout = layout;
    }
    return instance;
  };

  Object.assign(wrapped, original);
  wrapped.__ebFcosePatched = true;
  window.cytoscape = wrapped;
  patched = true;
}

export function applyFcoseLayout() {
  if (!toggledOn('graph.fCoSE')) return;
  const graph = window.__ebHolonGraph || null;
  if (graph?.layout) graph.layout({ name: 'fcose', quality: 'default', animate: false, fit: true, padding: 40 }).run();
}

installFcoseAdapter();
window.addEventListener('feature:toggle', event => {
  if (event.detail?.name !== 'graph.fCoSE') return;
  const graph = window.__ebHolonGraph || null;
  if (!graph?.layout) return;
  const name = event.detail.enabled ? 'fcose' : 'cose';
  graph.layout({ name, quality: 'default', animate: false, fit: true, padding: 40 }).run();
});
