/**
 * hcg-autocomplete - vanilla JS autocomplete combobox for input fields
 * HTML Code Generator (https://www.html-code-generator.com/javascript/autocomplete-library)
 * Version: 1.0.0
 * License: MIT
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.hcgAutocomplete = factory();
  }
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const VERSION = '1.0.0';
  const INSTANCE_KEY = '_hcgAutocomplete';

  const INSTANCES = [];
  let idSeq = 0;

  const DEFAULTS = {
    source: [],
    minChars: 1,
    debounce: 300,
    multiple: false,
    allowCustom: false,
    clearable: true,
    highlight: true,
    noResultsText: 'No results',
    loadingText: 'Loading...',
    maxItems: null,
    valueKey: 'value',
    labelKey: 'label',
    commitOnBlur: false,
    onInput: null,
    onOpen: null,
    onClose: null,
    onSelect: null,
    onRemove: null,
    onChange: null,
  };

  const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const assign = (target, ...sources) => {
    for (const source of sources) {
      if (!source) continue;
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };

  const escapeHtml = (stringValue) => (
    String(stringValue).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character])
  );

  const highlight = (label, query) => {
    if (!query) return escapeHtml(label);
    const lowerLabel = label.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerLabel.indexOf(lowerQuery);
    if (index === -1) return escapeHtml(label);
    const before = label.slice(0, index);
    const match = label.slice(index, index + query.length);
    const after = label.slice(index + query.length);
    return escapeHtml(before) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(after);
  };

  const normalizeItem = (item, valueKey, labelKey) => {
    if (typeof item === 'string' || typeof item === 'number') {
      const text = String(item);
      return { value: text, label: text, disabled: false, raw: item };
    }
    const value = item[valueKey] != null ? String(item[valueKey]) : String(item[labelKey] ?? '');
    const label = item[labelKey] != null ? String(item[labelKey]) : value;
    return {
      value,
      label,
      disabled: !!item.disabled,
      raw: item,
    };
  };

  const warnSource = (message) => {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`hcg-autocomplete: ${message}`);
    }
  };

  const validateSource = (source) => {
    if (typeof source === 'function') return true;
    if (Array.isArray(source)) return true;
    warnSource('source must be an array or function.');
    return false;
  };

  const isLocalSourceItem = (item) => {
    const type = typeof item;
    return type === 'string' || type === 'number' || (type === 'object' && item !== null && !Array.isArray(item));
  };

  const resolveElement = (target) => (
    typeof target === 'string' ? document.querySelector(target) : target
  );

  const hcgAutocomplete = (target, userOptions) => {
    let input = resolveElement(target);
    if (!input && typeof target === 'string' && typeof console !== 'undefined' && console.warn) {
      console.warn(`hcg-autocomplete: no element matches selector "${target}".`);
    }
    if (!input || input.tagName !== 'INPUT') return null;
    if (input.type && input.type !== 'text' && input.type !== 'search') return null;
    if (input[INSTANCE_KEY]) return input[INSTANCE_KEY];

    const options = assign({}, DEFAULTS, userOptions || {});
    if (userOptions && Object.prototype.hasOwnProperty.call(userOptions, 'source') && !validateSource(options.source)) {
      options.source = DEFAULTS.source;
    }
    const uid = `hcga-${++idSeq}`;
    const listId = `${uid}-list`;

    const wrap = document.createElement('div');
    wrap.className = 'hcg-autocomplete';
    if (options.multiple) wrap.classList.add('is-multiple');

    const control = document.createElement('div');
    control.className = 'hcg-autocomplete-control';

    const chips = document.createElement('div');
    chips.className = 'hcg-autocomplete-chips';
    chips.setAttribute('role', 'list');

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'hcg-autocomplete-clear';
    clearButton.setAttribute('aria-label', 'Clear');
    clearButton.hidden = true;
    clearButton.textContent = '\u00D7';

    const panel = document.createElement('div');
    panel.className = 'hcg-autocomplete-panel';
    panel.hidden = true;

    const loading = document.createElement('div');
    loading.className = 'hcg-autocomplete-loading';
    loading.hidden = true;
    loading.textContent = options.loadingText;

    const list = document.createElement('ul');
    list.className = 'hcg-autocomplete-list';
    list.id = listId;
    list.setAttribute('role', 'listbox');

    const empty = document.createElement('div');
    empty.className = 'hcg-autocomplete-empty';
    empty.hidden = true;
    empty.textContent = options.noResultsText;

    panel.appendChild(loading);
    panel.appendChild(list);
    panel.appendChild(empty);

    const originalName = input.getAttribute('name');
    const originalPlaceholder = input.getAttribute('placeholder');
    const originalAutocomplete = input.getAttribute('autocomplete');
    let hiddenInput = null;

    input.classList.add('hcg-autocomplete-input');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('autocomplete', 'off');

    if (options.multiple) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      if (originalName) {
        hiddenInput.setAttribute('name', originalName);
        input.removeAttribute('name');
      }
    }

    input.parentNode.insertBefore(wrap, input);
    if (options.multiple) {
      wrap.appendChild(control);
      control.appendChild(chips);
      control.appendChild(input);
      control.appendChild(clearButton);
      if (hiddenInput) wrap.appendChild(hiddenInput);
    } else {
      wrap.appendChild(input);
      wrap.appendChild(clearButton);
    }
    wrap.appendChild(panel);

    let items = [];
    let activeIndex = -1;
    let isOpen = false;
    let lastQuery = null;
    let debounceTimer = null;
    let requestId = 0;
    let selectedItems = [];
    let selectedValue = '';
    let destroyed = false;

    const isAsyncSource = () => typeof options.source === 'function';
    const isLocalSource = () => Array.isArray(options.source);

    const fireChange = (silent) => {
      if (silent) return;
      if (typeof options.onChange === 'function') {
        const value = options.multiple
          ? selectedItems.map((item) => item.value)
          : selectedValue;
        options.onChange(input, value, api);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (hiddenInput) {
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const syncClearButton = () => {
      if (!options.clearable) {
        clearButton.hidden = true;
        return;
      }
      const hasValue = options.multiple ? selectedItems.length > 0 : !!selectedValue;
      clearButton.hidden = !hasValue;
    };

    const syncHiddenValue = () => {
      if (!hiddenInput) return;
      hiddenInput.value = selectedItems.map((item) => item.value).join(',');
    };

    const syncSingleInput = () => {
      if (options.multiple) return;
      const match = selectedItems[0];
      input.value = match ? match.label : '';
      selectedValue = match ? match.value : '';
      syncClearButton();
    };

    const renderChips = () => {
      chips.innerHTML = '';
      selectedItems.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = 'hcg-autocomplete-chip';
        chip.setAttribute('role', 'listitem');

        const chipLabel = document.createElement('span');
        chipLabel.className = 'hcg-autocomplete-chip-label';
        chipLabel.textContent = item.label;

        const chipRemove = document.createElement('button');
        chipRemove.type = 'button';
        chipRemove.className = 'hcg-autocomplete-chip-remove';
        chipRemove.setAttribute('aria-label', `Remove ${item.label}`);
        chipRemove.textContent = '\u00D7';
        chipRemove.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeItem(item.value);
          input.focus();
        });

        chip.appendChild(chipLabel);
        chip.appendChild(chipRemove);
        chips.appendChild(chip);
      });
      syncHiddenValue();
      syncClearButton();
    };

    const setSelectedItems = (nextItems) => {
      selectedItems = nextItems;
      if (options.multiple) {
        renderChips();
      } else {
        syncSingleInput();
      }
      fireChange();
    };

    const hasSelectedValue = (value) => (
      selectedItems.some((item) => item.value === value)
    );

    const addItem = (item) => {
      const normalized = normalizeItem(item, options.valueKey, options.labelKey);
      if (normalized.disabled) return false;
      if (options.multiple) {
        if (hasSelectedValue(normalized.value)) return false;
        if (options.maxItems != null && selectedItems.length >= options.maxItems) return false;
        selectedItems = [...selectedItems, normalized];
        input.value = '';
        renderChips();
        if (typeof options.onSelect === 'function') options.onSelect(input, normalized, api);
        fireChange();
        return true;
      }
      selectedItems = [normalized];
      syncSingleInput();
      if (typeof options.onSelect === 'function') options.onSelect(input, normalized, api);
      fireChange();
      return true;
    };

    const removeItem = (value) => {
      const removed = selectedItems.find((item) => item.value === value);
      if (!removed) return;
      selectedItems = selectedItems.filter((item) => item.value !== value);
      if (options.multiple) {
        renderChips();
      } else {
        syncSingleInput();
      }
      if (typeof options.onRemove === 'function') options.onRemove(input, removed, api);
      fireChange();
    };

    const clear = (silent) => {
      selectedItems = [];
      selectedValue = '';
      input.value = '';
      if (options.multiple) renderChips();
      syncClearButton();
      if (hiddenInput) hiddenInput.value = '';
      close();
      fireChange(silent);
    };

    const selectableItems = () => (
      items.filter((listItem) => !listItem.hidden
        && !listItem.classList.contains('is-disabled')
        && !listItem.classList.contains('is-selected'))
    );

    const scrollItemIntoList = (listItem) => {
      const top = listItem.offsetTop;
      const bottom = top + listItem.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    };

    const setActive = (index) => {
      const selectable = selectableItems();
      items.forEach((listItem) => listItem.classList.remove('is-active'));
      activeIndex = index;
      if (index >= 0 && index < selectable.length) {
        const listItem = selectable[index];
        listItem.classList.add('is-active');
        scrollItemIntoList(listItem);
        input.setAttribute('aria-activedescendant', listItem.id);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };

    const renderItems = (sourceItems, query) => {
      list.innerHTML = '';
      items = [];
      const normalized = sourceItems.map((item) => normalizeItem(item, options.valueKey, options.labelKey));

      normalized.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'hcg-autocomplete-option';
        listItem.id = `${uid}-opt-${index}`;
        listItem.setAttribute('role', 'option');
        listItem.dataset.value = item.value;
        listItem.dataset.label = item.label;
        if (item.disabled) {
          listItem.classList.add('is-disabled');
          listItem.setAttribute('aria-disabled', 'true');
        } else if (options.multiple && hasSelectedValue(item.value)) {
          listItem.classList.add('is-selected');
          listItem.setAttribute('aria-selected', 'true');
        }
        if (options.highlight && query) {
          listItem.innerHTML = highlight(item.label, query);
        } else {
          listItem.textContent = item.label;
        }
        list.appendChild(listItem);
        items.push(listItem);
      });

      const visibleCount = selectableItems().length;
      empty.hidden = visibleCount > 0;
      empty.textContent = options.noResultsText;
      setActive(visibleCount ? 0 : -1);
    };

    const filterLocal = (query) => {
      const lowerQuery = query.toLowerCase();
      const sourceItems = isLocalSource()
        ? options.source.filter(isLocalSourceItem)
        : [];
      const filtered = !query
        ? sourceItems
        : sourceItems.filter((item) => {
          const normalized = normalizeItem(item, options.valueKey, options.labelKey);
          return normalized.label.toLowerCase().includes(lowerQuery)
            || normalized.value.toLowerCase().includes(lowerQuery);
        });
      renderItems(filtered, query);
    };

    const setLoading = (state) => {
      loading.hidden = !state;
      loading.textContent = options.loadingText;
      wrap.classList.toggle('is-loading', state);
    };

    const runSource = (query) => {
      if (query.length < options.minChars) {
        setLoading(false);
        list.innerHTML = '';
        items = [];
        empty.hidden = true;
        loading.hidden = true;
        wrap.classList.remove('is-loading');
        return;
      }

      if (isLocalSource()) {
        filterLocal(query);
        return;
      }

      if (!isAsyncSource()) return;

      const currentRequest = ++requestId;
      setLoading(true);
      empty.hidden = true;

      const done = (error, resultItems) => {
        if (destroyed || currentRequest !== requestId) return;
        setLoading(false);
        if (error) {
          empty.hidden = false;
          empty.textContent = options.noResultsText;
          list.innerHTML = '';
          items = [];
          return;
        }
        renderItems(Array.isArray(resultItems) ? resultItems : [], query);
      };

      try {
        const returnValue = options.source(query, done);
        if (returnValue && typeof returnValue.then === 'function') {
          returnValue
            .then((resultItems) => done(null, resultItems))
            .catch((error) => done(error));
        }
      } catch (error) {
        done(error);
      }
    };

    const scheduleSource = (query) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (query.length < options.minChars) {
        requestId += 1;
      }
      if (isAsyncSource()) {
        debounceTimer = setTimeout(() => runSource(query), options.debounce);
      } else {
        runSource(query);
      }
    };

    const positionPanel = () => {
      wrap.classList.remove('is-flipped');
      if (typeof window === 'undefined' || !input.getBoundingClientRect) return;
      const rect = input.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const panelHeight = panel.offsetHeight || 240;
      if (below < panelHeight && above > below) wrap.classList.add('is-flipped');
    };

    const schedulePositionPanel = () => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(positionPanel);
      } else {
        positionPanel();
      }
    };

    const onViewportChange = () => {
      if (isOpen) schedulePositionPanel();
    };

    const eventPathIncludesWrap = (event) => {
      if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        for (let index = 0; index < path.length; index += 1) {
          if (path[index] === wrap) return true;
        }
      }
      return wrap.contains(event.target);
    };

    const onDocumentPointerDown = (event) => {
      if (!eventPathIncludesWrap(event)) close();
    };

    const open = () => {
      if (input.disabled || isOpen) return;
      isOpen = true;
      panel.hidden = false;
      wrap.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      schedulePositionPanel();
      document.addEventListener('pointerdown', onDocumentPointerDown);
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('scroll', onViewportChange, true);
      const query = input.value.trim();
      lastQuery = null;
      scheduleSource(query);
      if (typeof options.onOpen === 'function') options.onOpen(input, api);
    };

    const close = () => {
      if (!isOpen) return;
      isOpen = false;
      panel.hidden = true;
      wrap.classList.remove('is-open', 'is-flipped', 'is-loading');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      requestId += 1;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      if (typeof options.onClose === 'function') options.onClose(input, api);
    };

    const choose = (listItem) => {
      if (!listItem || listItem.classList.contains('is-disabled') || listItem.classList.contains('is-selected')) return;
      const item = {
        value: listItem.dataset.value,
        label: listItem.dataset.label,
      };
      if (options.multiple) {
        addItem(item);
        lastQuery = null;
        scheduleSource(input.value.trim());
        input.focus();
      } else {
        addItem(item);
        close();
      }
    };

    const commitCustom = () => {
      const query = input.value.trim();
      if (!query || !options.allowCustom) return false;
      if (options.multiple) {
        return addItem(query);
      }
      selectedItems = [normalizeItem(query, options.valueKey, options.labelKey)];
      syncSingleInput();
      if (typeof options.onSelect === 'function') {
        options.onSelect(input, selectedItems[0], api);
      }
      fireChange();
      close();
      return true;
    };

    const onInputEvent = (event) => {
      if (event && !event.isTrusted) return;
      const query = input.value.trim();
      if (typeof options.onInput === 'function') options.onInput(input, query, api);
      if (!isOpen) open();
      if (query === lastQuery) return;
      lastQuery = query;
      scheduleSource(query);
    };

    const onKeydown = (event) => {
      if (input.disabled) return;

      const selectable = selectableItems();

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!isOpen) open();
        else if (selectable.length) setActive((activeIndex + 1) % selectable.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen) open();
        else if (selectable.length) {
          setActive(activeIndex <= 0 ? selectable.length - 1 : activeIndex - 1);
        }
      } else if (event.key === 'Home' && isOpen) {
        event.preventDefault();
        if (selectable.length) setActive(0);
      } else if (event.key === 'End' && isOpen) {
        event.preventDefault();
        if (selectable.length) setActive(selectable.length - 1);
      } else if (event.key === 'Enter') {
        if (isOpen && activeIndex >= 0 && selectable[activeIndex]) {
          event.preventDefault();
          choose(selectable[activeIndex]);
        } else if (options.allowCustom && input.value.trim()) {
          event.preventDefault();
          commitCustom();
        }
      } else if (event.key === 'Escape') {
        if (isOpen) {
          event.preventDefault();
          close();
        }
      } else if (event.key === 'Tab') {
        if (isOpen) close();
      } else if (event.key === 'Backspace' && options.multiple && !input.value && selectedItems.length) {
        const lastItem = selectedItems[selectedItems.length - 1];
        removeItem(lastItem.value);
      }
    };

    const onFocus = () => {
      if (!input.disabled && input.value.trim().length >= options.minChars) open();
    };

    const onBlur = () => {
      if (options.commitOnBlur && options.allowCustom && input.value.trim()) {
        commitCustom();
      }
    };

    wrap.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    list.addEventListener('mousedown', (event) => {
      if (event.target.closest('.hcg-autocomplete-option')) {
        event.preventDefault();
      }
    });

    list.addEventListener('click', (event) => {
      const listItem = event.target.closest('.hcg-autocomplete-option');
      if (listItem) choose(listItem);
    });

    input.addEventListener('input', onInputEvent);
    input.addEventListener('keydown', onKeydown);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);

    clearButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clear();
      input.focus();
    });

    wrap.addEventListener('focusout', (event) => {
      const relatedTarget = event.relatedTarget;
      if (!relatedTarget) return;
      if (wrap.contains(relatedTarget)) return;
      if (relatedTarget.contains && relatedTarget.contains(wrap)) return;
      close();
    });

    const syncDisabled = () => {
      wrap.classList.toggle('is-disabled', input.disabled);
      input.setAttribute('aria-disabled', input.disabled ? 'true' : 'false');
      if (input.disabled) close();
    };

    const syncMultipleMode = () => {
      const isMultiple = !!options.multiple;
      wrap.classList.toggle('is-multiple', isMultiple);

      if (isMultiple) {
        if (input.parentNode !== control) {
          if (input.parentNode) input.parentNode.removeChild(input);
          if (clearButton.parentNode) clearButton.parentNode.removeChild(clearButton);
          control.appendChild(chips);
          control.appendChild(input);
          control.appendChild(clearButton);
          wrap.insertBefore(control, panel);
        }
        if (originalName && !hiddenInput) {
          hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.setAttribute('name', originalName);
          input.removeAttribute('name');
          wrap.insertBefore(hiddenInput, panel);
        }
        input.value = '';
        renderChips();
      } else {
        if (selectedItems.length > 1) {
          selectedItems = selectedItems.slice(0, 1);
        }
        if (input.parentNode === control) {
          control.removeChild(input);
          if (clearButton.parentNode === control) control.removeChild(clearButton);
          wrap.insertBefore(input, panel);
          wrap.insertBefore(clearButton, panel);
          if (control.parentNode === wrap) wrap.removeChild(control);
        }
        chips.innerHTML = '';
        if (hiddenInput) {
          if (hiddenInput.parentNode) hiddenInput.parentNode.removeChild(hiddenInput);
          hiddenInput = null;
          if (originalName) input.setAttribute('name', originalName);
        }
        syncSingleInput();
      }
      syncClearButton();
    };

    const setOption = (name, value) => {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, name)) return api;
      if (name === 'source' && !validateSource(value)) return api;
      options[name] = value;
      if (name === 'noResultsText') empty.textContent = value;
      if (name === 'loadingText') loading.textContent = value;
      if (name === 'multiple') syncMultipleMode();
      if (name === 'clearable') syncClearButton();
      if (name === 'source') {
        lastQuery = null;
        if (isOpen) scheduleSource(input.value.trim());
      }
      return api;
    };

    const setSource = (source) => {
      if (!validateSource(source)) return api;
      options.source = source;
      lastQuery = null;
      if (isOpen) scheduleSource(input.value.trim());
      return api;
    };

    const getSource = () => options.source;

    const getValue = () => {
      if (options.multiple) return selectedItems.map((item) => item.value);
      return selectedValue;
    };

    const setValue = (value, silent) => {
      if (options.multiple) {
        const values = Array.isArray(value) ? value : String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
        selectedItems = values.map((entry) => normalizeItem(entry, options.valueKey, options.labelKey));
        renderChips();
        input.value = '';
        close();
        fireChange(silent);
        return api;
      }
      if (value == null || value === '') {
        clear(silent);
        return api;
      }
      const normalized = normalizeItem(value, options.valueKey, options.labelKey);
      selectedItems = [normalized];
      syncSingleInput();
      close();
      fireChange(silent);
      return api;
    };

    const refresh = () => {
      lastQuery = null;
      scheduleSource(input.value.trim());
      return api;
    };

    const enable = () => {
      input.disabled = false;
      syncDisabled();
      return api;
    };

    const disable = () => {
      input.disabled = true;
      syncDisabled();
      return api;
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      close();
      requestId += 1;
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener('input', onInputEvent);
      input.removeEventListener('keydown', onKeydown);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.classList.remove('hcg-autocomplete-input');
      input.removeAttribute('role');
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-activedescendant');
      input.removeAttribute('aria-disabled');
      if (originalAutocomplete != null) {
        input.setAttribute('autocomplete', originalAutocomplete);
      } else {
        input.removeAttribute('autocomplete');
      }
      if (originalName) input.setAttribute('name', originalName);
      if (originalPlaceholder != null) input.setAttribute('placeholder', originalPlaceholder);
      if (wrap.parentNode) wrap.parentNode.insertBefore(input, wrap);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      delete input[INSTANCE_KEY];
      const index = INSTANCES.indexOf(api);
      if (index > -1) INSTANCES.splice(index, 1);
    };

    const api = {
      open,
      close,
      clear,
      refresh,
      destroy,
      enable,
      disable,
      setOption,
      setSource,
      getSource,
      getValue,
      setValue,
      element: wrap,
      input,
    };

    input[INSTANCE_KEY] = api;
    INSTANCES.push(api);
    syncDisabled();
    syncClearButton();

    if (input.value.trim()) {
      if (options.multiple) {
        setValue(input.value.split(',').map((part) => part.trim()).filter(Boolean), true);
        input.value = '';
      } else {
        setValue(input.value, true);
      }
    }

    return api;
  };

  hcgAutocomplete.get = (target) => {
    const element = resolveElement(target);
    return element && element[INSTANCE_KEY] ? element[INSTANCE_KEY] : null;
  };

  hcgAutocomplete.destroy = (target) => {
    const instance = hcgAutocomplete.get(target);
    if (!instance) return false;
    instance.destroy();
    return true;
  };

  hcgAutocomplete.destroyAll = () => {
    INSTANCES.slice().forEach((instance) => instance.destroy());
  };

  hcgAutocomplete.version = VERSION;

  return hcgAutocomplete;
});