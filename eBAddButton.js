export function createEBAddButton(element, { label = 'Add…', items = [] } = {}) {
  if (!element) return null;

  element.classList.add('eb-add-button');
  element.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eb-add-button-trigger';
  button.textContent = '+';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'eb-add-button-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const close = ({ focus = false } = {}) => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  };

  const open = () => {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  };

  for (const item of items) {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'menuitem');
    option.textContent = item.label;
    option.addEventListener('click', () => {
      close();
      item.onSelect?.();
    });
    menu.append(option);
  }

  button.addEventListener('click', () => menu.hidden ? open() : close());
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      close({ focus: true });
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || menu.hidden) return;
    event.preventDefault();
    const options = [...menu.querySelectorAll('button')];
    const current = options.indexOf(document.activeElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    options[(current + offset + options.length) % options.length]?.focus();
  });

  const onDocumentClick = event => {
    if (!element.contains(event.target)) close();
  };
  document.addEventListener('click', onDocumentClick);

  element.append(button, menu);
  return {
    close,
    destroy() {
      document.removeEventListener('click', onDocumentClick);
      element.innerHTML = '';
      element.classList.remove('eb-add-button');
    },
  };
}
