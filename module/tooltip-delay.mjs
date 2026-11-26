const SYSTEM_TOOLTIP_DELAY_MS = 1000;
const TOOLTIP_SELECTOR = "[data-tooltip], [data-tooltip-text], [data-tooltip-html]";
const SYSTEM_WINDOW_SELECTOR = ".application:is(.ouw25, .ouw25-journal)";
const installed = new WeakSet();

export function installTooltipDelay(manager, document, {
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout
} = {}) {
  if (!manager || installed.has(manager)) return;
  installed.add(manager);

  const entered = new WeakMap();
  const documents = new WeakSet();
  let pending;
  const clear = () => {
    if (pending) cancel(pending.timer);
    pending = null;
  };
  const attach = doc => {
    if (!doc || documents.has(doc)) return;
    documents.add(doc);
    doc.addEventListener("pointerenter", event => {
      const element = event.target;
      if (element.matches?.(TOOLTIP_SELECTOR) && element.closest(SYSTEM_WINDOW_SELECTOR)) {
        entered.set(element, now());
      }
    }, true);
    doc.addEventListener("pointerleave", event => {
      entered.delete(event.target);
      if (pending?.element === event.target) clear();
    }, true);
  };

  attach(document);
  const activateListeners = manager.activateListeners;
  if (activateListeners) {
    manager.activateListeners = function(doc, ...args) {
      const result = activateListeners.call(this, doc, ...args);
      attach(doc ?? document);
      return result;
    };
  }
  const activate = manager.activate;
  manager.activate = function(element, ...args) {
    clear();
    const start = entered.get(element);
    if (start === undefined || !element.closest?.(SYSTEM_WINDOW_SELECTOR)) {
      return activate.call(this, element, ...args);
    }
    const remaining = SYSTEM_TOOLTIP_DELAY_MS - (now() - start);
    if (remaining <= 0) return activate.call(this, element, ...args);
    if (this.element) this.deactivate();
    const timer = schedule(() => {
      pending = null;
      if (element.isConnected && entered.get(element) === start) activate.call(this, element, ...args);
    }, remaining);
    pending = { element, timer };
  };
}
