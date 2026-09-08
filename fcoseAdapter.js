import { toggledOn } from './eBToggles.js';

// Experimental fCoSE adapter.
// Register the browser build, then keep the existing Holon graph code unchanged
// while allowing the graph.fCoSE feature toggle to substitute fCoSE for CoSE.
let patched = false;

function registerFcose() {
  if (typeof window.cytoscapeFcose !== 'function' || typeof window.cytoscape !== 'function') return false;
  try {
    window.cytoscapeFcose(window.cytoscape);
    return true;
  } catch (error) {
    console.warn('eB-Holarchy: fCoSE registration failed', error);
    return false;
  }
}

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
  registerFcose();
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

installFcoseAdapter();
