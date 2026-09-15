let activeConfirm = null;
let nextId = 0;

// Client (viewport) coordinates are optional; keyboard callers anchor to focus.
// Opening another confirmation safely cancels the previous pending request.
export function eBConfirm({ message, title, confirmLabel = 'Confirm', cancelLabel = 'Cancel', choices = null, x, y, returnFocus } = {})
{
  activeConfirm?.();
  const previousFocus = returnFocus || document.activeElement;
  const anchor = previousFocus?.getBoundingClientRect?.();
  const anchorX = Number.isFinite(x) ? x : (anchor?.left || window.innerWidth / 2);
  const anchorY = Number.isFinite(y) ? y : (anchor?.bottom || window.innerHeight / 2);

  return new Promise(resolve =>
  {
    const id = `eb-confirm-${++nextId}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'eb-confirm';
    dialog.setAttribute('aria-describedby', `${id}-message`);
    if (title)
    {
      const heading = document.createElement('h2');
      heading.id = `${id}-title`;
      heading.textContent = title;
      dialog.setAttribute('aria-labelledby', heading.id);
      dialog.appendChild(heading);
    }
    else dialog.setAttribute('aria-label', 'Confirmation');
    const description = document.createElement('p');
    description.id = `${id}-message`;
    description.textContent = message ?? '';
    const actions = document.createElement('div');
    actions.className = 'eb-confirm-actions';
    const choiceDefinitions = Array.isArray(choices) && choices.length ? choices : [
      { label: cancelLabel, value: false, autofocus: true },
      { label: confirmLabel, value: true },
    ];
    const actionButtons = choiceDefinitions.map(choice =>
    {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.autofocus = Boolean(choice.autofocus);
      if (choice.className) button.className = choice.className;
      actions.appendChild(button);
      return { button, value: choice.value };
    });
    const defaultChoice = actionButtons.find((_item, index) => choiceDefinitions[index].autofocus) || actionButtons[0];
    dialog.append(description, actions);
    let settled = false;
    function finish(result)
    {
      if (settled) return;
      settled = true;
      activeConfirm = null;
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(result);
    }
    function position()
    {
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 8;
      const top = (viewport?.offsetTop || 0) + 8;
      const width = Math.max(0, (viewport?.width || window.innerWidth) - 16);
      const height = Math.max(0, (viewport?.height || window.innerHeight) - 16);
      dialog.style.maxWidth = `${width}px`;
      dialog.style.maxHeight = `${height}px`;
      const rect = dialog.getBoundingClientRect();
      dialog.style.left = `${Math.max(left, Math.min(anchorX + 8, left + width - rect.width))}px`;
      dialog.style.top = `${Math.max(top, Math.min(anchorY + 8, top + height - rect.height))}px`;
    }
    actionButtons.forEach(item => item.button.addEventListener('click', () => finish(item.value)));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(defaultChoice.value); });
    dialog.addEventListener('close', () => finish(defaultChoice.value));
    let outsidePointer = false;
    const isOutside = event =>
    {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    dialog.addEventListener('pointerdown', event => { outsidePointer = isOutside(event); });
    dialog.addEventListener('click', event => { if (outsidePointer && isOutside(event)) finish(defaultChoice.value); outsidePointer = false; });
    dialog.addEventListener('keydown', event =>
    {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const currentIndex = actionButtons.findIndex(item => item.button === document.activeElement);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + direction + actionButtons.length) % actionButtons.length;
      actionButtons[nextIndex].button.focus();
    });
    document.body.appendChild(dialog);
    activeConfirm = () => finish(defaultChoice.value);
    dialog.showModal();
    position();
    defaultChoice.button.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
  });
}
