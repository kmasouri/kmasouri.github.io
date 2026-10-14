// Desktop behaviour: clock, Start menu extras, and window controls
// (minimize / maximize / close / drag / resize), selection boxes and movable
// desktop icons. Everything here is an enhancement;
// links and the Start menu (a native popover) work without JavaScript.

import { navigate } from 'astro:transitions/client';

const desktopQuery = matchMedia('(min-width: 768px)');

// --- Page swaps ----------------------------------------------------------------

// Links swap the page in place (Astro's ClientRouter), so this module runs once
// and `initPage` below runs after every page arrives, including the first.
// The router copies <html> attributes from the incoming page, which would drop
// the `js` flag the inline head script sets; keep it.
document.addEventListener('astro:before-swap', (event) => {
  const html = event.newDocument.documentElement;
  html.classList.add('js');
  html.classList.toggle('welcome-closed', document.documentElement.classList.contains('welcome-closed'));
  html.classList.remove('icons-pending');
});
document.addEventListener('astro:page-load', initPage);

// Windows that stay open across page swaps keep their listeners, so anything
// wired up in initPage goes through this to bind each element only once.
const bound = new WeakMap<Element, Set<string>>();
function bindOnce(el: Element, key: string) {
  const keys = bound.get(el) ?? new Set<string>();
  if (keys.has(key)) return false;
  keys.add(key);
  bound.set(el, keys);
  return true;
}

// --- Several windows at once -----------------------------------------------------

// Opening a page adds its window to the desktop instead of replacing the ones
// already open. Every window remembers its own URL and the address bar always
// shows the front one's, so a copied link opens exactly that window.
// Windows are keyed by id, one per program: opening a post while another post
// is open loads it into the same Internet Explorer window, like a browser.
let arrival: { front: string | null } | undefined;

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

document.addEventListener('astro:before-swap', (event) => {
  const newLayer = event.newDocument.querySelector('.window-layer');
  if (!newLayer || !event.newDocument.querySelector('.task-list')) return; // not a desktop page

  // A page's own styles (keygen.css, a page's <style>) only come with that
  // page, and the router drops whatever the next page doesn't use. Its window
  // can stay open, so carry every current style over to the incoming page.
  const newHead = event.newDocument.head;
  const newStyles = new Set([...newHead.querySelectorAll('style')].map((s) => s.textContent));
  document.head.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((el, i) => {
    if (el instanceof HTMLLinkElement && newHead.querySelector(`link[rel="stylesheet"][href="${el.getAttribute('href')}"]`)) return;
    if (el instanceof HTMLStyleElement && newStyles.has(el.textContent)) return;
    const key = el.getAttribute('data-astro-transition-persist') ?? `xp-style-${Date.now()}-${i}`;
    el.setAttribute('data-astro-transition-persist', key);
    if (!newHead.querySelector(`[data-astro-transition-persist="${key}"]`)) newHead.append(el.cloneNode(true));
  });

  const url = event.to.pathname;
  const incoming =[...newLayer.querySelectorAll<HTMLElement>('[data-window]')];
  incoming.forEach((win) => (win.dataset.url = url));
  arrival = { front: incoming[0]?.id ?? null };

  // In taskbar order, which stays put however the windows are stacked.
  const plan = [...document.querySelectorAll<HTMLElement>('.task-list .task-button')]
    .map((button) => document.getElementById(button.dataset.task ?? ''))
    .filter((win): win is HTMLElement => !!win?.matches('[data-window]:not(.is-closing)'))
    .map((win) => {
      const li = taskButtonFor(win)?.closest('li') ?? null;
      const replacement = incoming.find((w) => w.id === win.id);
      // Already showing this page (or a different program): keep it as it is.
      if (!replacement || samePath(win.dataset.url ?? '', url)) return { win, li, keep: true };
      // Same program, new page: the new content takes over its place and size.
      for (const prop of ['width', 'height', 'maxHeight', 'zIndex'] as const) {
        replacement.style[prop] = win.style[prop];
      }
      if (desktopQuery.matches) {
        replacement.style.left = `${win.offsetLeft}px`;
        replacement.style.top = `${win.offsetTop}px`;
      }
      if (win.classList.contains('is-maximized')) {
        replacement.classList.add('is-maximized');
        replacement.querySelector('[data-action="maximize"]')?.setAttribute('aria-label', 'Restore');
      }
      return { win, li, keep: false };
    });
  if (!plan.length) return;

  const swap = event.swap;
  event.swap = () => {
    swap();
    const layer = document.querySelector('.window-layer')!;
    const tasks = document.querySelector('.task-list')!;
    const newItem = (id: string) => tasks.querySelector(`.task-button[data-task="${id}"]`)?.closest('li') ?? null;
    const items: Element[] = [];
    for (const { win, li, keep } of plan) {
      if (keep) {
        const fresh = document.getElementById(win.id);
        if (fresh) fresh.replaceWith(win);
        else layer.append(win);
        if (li) items.push(li);
      } else {
        win.dispatchEvent(new Event('xp:close'));
        const item = newItem(win.id);
        if (item) items.push(item);
      }
    }
    // Taskbar order: windows that were already open, then the new one.
    const planned = new Set(plan.map(({ win }) => win.id));
    const added = [...tasks.children].filter(
      (li) => !planned.has(li.querySelector<HTMLElement>('.task-button')?.dataset.task ?? ''),
    );
    tasks.replaceChildren(...items, ...added);
  };
});

function initPage() {
  initHistoryButtons();
  tick();
  initStartMenu();
  initVolumeControl();
  initTurnOff();
  initWindows();
  initSelectionBoxes();
  initDesktopIcons();
  initExtras();
}

// --- Volume -----------------------------------------------------------------

const VOLUME_KEY = 'xp:volume';
const MUTED_KEY = 'xp:muted';

function initVolumeControl() {
  const slider = document.querySelector<HTMLInputElement>('[data-volume-slider]');
  const mute = document.querySelector<HTMLInputElement>('[data-volume-mute]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-volume-toggle]');
  if (!slider || !mute || !toggle) return;

  let volume = 0.72;
  let muted = false;
  try {
    const storedVolume = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) volume = storedVolume;
    muted = localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    /* storage blocked: use defaults */
  }

  const apply = () => {
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
      media.volume = volume;
      media.muted = muted;
    });
    slider.value = String(volume);
    mute.checked = muted;
    toggle.classList.toggle('is-muted', muted || volume === 0);
    toggle.setAttribute('aria-label', muted || volume === 0 ? 'Open volume control (muted)' : 'Open volume control');
  };

  const save = () => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      /* storage blocked: state lasts for this page only */
    }
  };

  slider.addEventListener('input', () => {
    volume = Number(slider.value);
    if (volume > 0 && muted) muted = false;
    save();
    apply();
  });
  mute.addEventListener('change', () => {
    muted = mute.checked;
    save();
    apply();
  });
  toggle.addEventListener('dblclick', () => {
    muted = !muted;
    save();
    apply();
  });

  apply();
}

// --- Back / Forward ------------------------------------------------------------

// Window toolbars' Back and Forward work like a real browser's: greyed out
// until you've moved around the site. Astro's router numbers history entries
// (history.state.index: 0 where you arrived, +1 per in-site move); we also
// remember the furthest entry reached, so Forward knows if there's one ahead.
const HISTORY_KEY = 'xp:history-max';
let lastNavigation = '';
document.addEventListener('astro:before-preparation', (event) => {
  lastNavigation = event.navigationType;
});

function historyPosition() {
  const index: number = history.state?.index ?? 0;
  let max = index;
  try {
    const stored = Number(sessionStorage.getItem(HISTORY_KEY) ?? index);
    // A fresh navigation (a link, or a new page load) drops anything ahead of
    // us, like a browser does; going back/forward or reloading keeps it.
    const loadType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
    const fresh = lastNavigation ? lastNavigation === 'push' : loadType === 'navigate';
    max = fresh ? index : Math.max(stored, index);
    sessionStorage.setItem(HISTORY_KEY, String(max));
  } catch {
    /* ignore */
  }
  return { canBack: index > 0, canForward: index < max };
}

let historyNav = { canBack: false, canForward: false };

function initHistoryButtons() {
  historyNav = historyPosition();
  document.querySelectorAll<HTMLElement>('[data-history]').forEach((el) => {
    const back = el.dataset.history === 'back';
    const enabled = back ? historyNav.canBack : historyNav.canForward;
    el.classList.toggle('is-off', !enabled);
    if (el instanceof HTMLButtonElement) el.disabled = !enabled;
    else el.setAttribute('aria-disabled', String(!enabled));
    if (!enabled) el.setAttribute('tabindex', '-1');
    else el.removeAttribute('tabindex');
    if (!bindOnce(el, 'history')) return;
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (back && historyNav.canBack) history.back();
      else if (!back && historyNav.canForward) history.forward();
    });
  });
}

// --- Clock -----------------------------------------------------------------

function tick() {
  const clock = document.getElementById('clock') as HTMLTimeElement | null;
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  clock.dateTime = now.toISOString();
  clock.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
setInterval(tick, 10_000);

// --- Start menu --------------------------------------------------------------

function initStartMenu() {
  const startMenu = document.getElementById('start-menu');
  const startButton = document.querySelector<HTMLButtonElement>('.start-button');

  startMenu?.addEventListener('toggle', (event) => {
    const open = (event as ToggleEvent).newState === 'open';
    startButton?.classList.toggle('is-pressed', open);
    if (open) startMenu.querySelector<HTMLElement>('a')?.focus();
  });
}

// --- Turn off computer ----------------------------------------------------------

// Start > Turn Off Computer opens XP's dialog. Stand By and Turn Off black the
// screen; a key or click wakes it (Stand By) or powers on through the BIOS
// boot (Turn Off). Restart goes straight to the boot.
function powerOn() {
  try {
    sessionStorage.removeItem('xp:booted');
  } catch {
    /* ignore */
  }
  window.location.href = '/';
}

function showPowerScreen(mode: 'standby' | 'off') {
  const screen = document.querySelector<HTMLElement>('[data-power-screen]');
  if (!screen) return;
  screen.querySelector('[data-power-title]')!.textContent = mode === 'off' ? 'Your computer is off.' : 'Stand By';
  screen.querySelector('[data-power-hint]')!.textContent =
    mode === 'off' ? 'Press any key or click to turn it on.' : 'Press any key or click to wake up.';
  screen.hidden = false;
  screen.classList.toggle('is-off', mode === 'off');

  // Ignore the click that chose the option; listen from the next tick.
  setTimeout(() => {
    const wake = (event: Event) => {
      event.preventDefault();
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('pointerdown', wake, true);
      if (mode === 'off') {
        powerOn();
      } else {
        screen.hidden = true;
      }
    };
    window.addEventListener('keydown', wake, true);
    window.addEventListener('pointerdown', wake, true);
  });
}

function initTurnOff() {
  const dialog = document.getElementById('turn-off') as HTMLDialogElement | null;
  const link = document.querySelector<HTMLAnchorElement>('[data-turn-off]');
  if (!dialog || !link) return;

  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('start-menu')?.hidePopover();
    dialog.showModal();
  });

  dialog.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLElement>('[data-power]')?.dataset.power;
    if (!choice) return;
    dialog.close();
    if (choice === 'restart') powerOn();
    else if (choice === 'standby' || choice === 'off') showPowerScreen(choice);
  });
}

// --- Windows -----------------------------------------------------------------

let windows: HTMLElement[] = [];
let zTop = 10;

function taskButtonFor(win: HTMLElement) {
  return document.querySelector<HTMLButtonElement>(`.task-button[data-task="${win.id}"]`);
}

function activate(win: HTMLElement) {
  win.style.zIndex = String(++zTop);
  windows.forEach((w) => {
    w.classList.toggle('is-inactive', w !== win);
    taskButtonFor(w)?.setAttribute('aria-pressed', String(w === win && !w.hidden));
  });
  syncAddress();
}

/** The visible window in front, if any. */
function frontWindow() {
  return windows
    .filter((w) => !w.hidden && w.isConnected)
    .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
}

/** Point the address bar and tab title at the front window (or the desktop). */
function syncAddress() {
  const front = frontWindow();
  const url = front?.dataset.url ?? '/';
  if (!samePath(location.pathname, url)) history.replaceState(history.state, '', url);
  document.title = front?.dataset.title ?? document.getElementById('desktop')?.dataset.homeTitle ?? document.title;
}

/** Bring the next window forward, as XP does when one is minimized or closed. */
function activateNext() {
  const next = frontWindow();
  if (next) activate(next);
  else syncAddress();
}

function minimize(win: HTMLElement) {
  win.hidden = true;
  const button = taskButtonFor(win);
  button?.setAttribute('aria-pressed', 'false');
  button?.focus();
  activateNext();
}

function closeWindow(win: HTMLElement) {
  win.dispatchEvent(new Event('xp:close'));
  taskButtonFor(win)?.closest('li')?.remove();
  win.remove();
  windows = windows.filter((w) => w !== win);
  activateNext();
}

function restore(win: HTMLElement) {
  win.hidden = false;
  activate(win);
  win.querySelector<HTMLElement>('.xp-window-body')?.focus({ preventScroll: true });
}

function toggleMaximize(win: HTMLElement) {
  const maximized = win.classList.toggle('is-maximized');
  const button = win.querySelector<HTMLButtonElement>('[data-action="maximize"]');
  button?.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
}

function initWindows() {
  windows = [...document.querySelectorAll<HTMLElement>('[data-window]')];
  for (const win of windows) {
    win.dataset.url ??= location.pathname;
    win.dataset.title ??= document.title;
    if (!bindOnce(win, 'window')) continue;
    win.querySelector('[data-action="minimize"]')?.addEventListener('click', () => minimize(win));
    win.querySelector('[data-action="maximize"]')?.addEventListener('click', () => toggleMaximize(win));
    win.addEventListener('pointerdown', () => activate(win));
    win.addEventListener('focusin', () => activate(win));

    // Close: with other windows open, just remove this one. Closing the last
    // goes to wherever closeHref points (the desktop by default) without the
    // trailing "?" a GET form would add.
    const closeForm = win.querySelector<HTMLFormElement>('[data-close-form]');
    closeForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (windows.some((w) => w !== win)) {
        closeWindow(win);
        return;
      }
      win.dispatchEvent(new Event('xp:close'));
      win.classList.add('is-closing');
      navigate(closeForm.getAttribute('action') || '/');
    });

    const handle = win.querySelector<HTMLElement>('[data-drag-handle]');
    if (handle) {
      handle.addEventListener('dblclick', (event) => {
        if (!(event.target as HTMLElement).closest('button') && desktopQuery.matches) toggleMaximize(win);
      });
      makeDraggable(win, handle);
    }
    makeResizable(win);

    const button = taskButtonFor(win);
    button?.addEventListener('click', () => {
      if (win.hidden) restore(win);
      else if (win.classList.contains('is-inactive')) activate(win);
      else minimize(win);
    });
  }

  // After a page swap, bring the page's own window forward; a page without
  // one (the desktop) minimizes everything, like Show Desktop.
  const arrived = arrival;
  arrival = undefined;
  if (!arrived) {
    if (windows.length) activate(windows[windows.length - 1]);
  } else if (arrived.front && document.getElementById(arrived.front)) {
    const front = document.getElementById(arrived.front)!;
    front.hidden = false;
    cascade(front);
    activate(front);
  } else {
    for (const win of windows) {
      win.hidden = true;
      taskButtonFor(win)?.setAttribute('aria-pressed', 'false');
    }
    syncAddress();
  }
}

// A newly opened window steps down and right of the others, as XP cascades
// them, so it doesn't land exactly on top of one that's already open.
function cascade(win: HTMLElement) {
  if (!desktopQuery.matches || win.style.left || win.classList.contains('is-maximized')) return;
  const others = windows.filter((w) => w !== win && !w.hidden).length;
  if (!others) return;
  const area = win.offsetParent as HTMLElement;
  const step = 28 * (others % 6);
  win.style.left = `${Math.min(win.offsetLeft + step, Math.max(0, area.clientWidth - win.offsetWidth))}px`;
  win.style.top = `${Math.min(win.offsetTop + step, Math.max(0, area.clientHeight - win.offsetHeight))}px`;
}

function makeDraggable(win: HTMLElement, handle: HTMLElement) {
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !desktopQuery.matches || win.classList.contains('is-maximized')) return;
    if ((event.target as HTMLElement).closest('button, a, form')) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    // Switch from CSS-centred to explicit pixel coordinates.
    originLeft = win.offsetLeft;
    originTop = win.offsetTop;
    win.style.left = `${originLeft}px`;
    win.style.top = `${originTop}px`;
    win.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const area = win.offsetParent as HTMLElement;
    // Keep at least part of the title bar on screen so it can be grabbed again.
    const maxLeft = area.clientWidth - 80;
    const minLeft = 80 - win.offsetWidth;
    const maxTop = area.clientHeight - handle.offsetHeight;
    const left = Math.min(maxLeft, Math.max(minLeft, originLeft + event.clientX - startX));
    const top = Math.min(maxTop, Math.max(0, originTop + event.clientY - startY));
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  });

  const stop = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    win.classList.remove('is-dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

function makeResizable(win: HTMLElement) {
  const minWidth = 260;
  const minHeight = 160;

  for (const dir of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
    const grip = document.createElement('div');
    grip.className = `resize-handle resize-${dir}`;
    grip.setAttribute('aria-hidden', 'true');
    win.append(grip);

    let startX = 0;
    let startY = 0;
    let origin = { left: 0, top: 0, width: 0, height: 0 };
    let resizing = false;

    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !desktopQuery.matches || win.classList.contains('is-maximized')) return;
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      origin = { left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight };
      // Switch from CSS sizing to explicit pixels.
      win.style.left = `${origin.left}px`;
      win.style.top = `${origin.top}px`;
      win.style.width = `${origin.width}px`;
      win.style.height = `${origin.height}px`;
      win.style.maxHeight = 'none';
      win.classList.add('is-resizing');
      grip.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    grip.addEventListener('pointermove', (event) => {
      if (!resizing) return;
      const area = win.offsetParent as HTMLElement;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
      const { left, top, width, height } = origin;

      // Grow up to the desktop edge (or the current size, if already past it).
      if (dir.includes('e')) {
        win.style.width = `${clamp(width + dx, minWidth, Math.max(width, area.clientWidth - left))}px`;
      }
      if (dir.includes('s')) {
        win.style.height = `${clamp(height + dy, minHeight, Math.max(height, area.clientHeight - top))}px`;
      }
      if (dir.includes('w')) {
        const newLeft = clamp(left + dx, Math.min(0, left), left + width - minWidth);
        win.style.left = `${newLeft}px`;
        win.style.width = `${width + left - newLeft}px`;
      }
      if (dir.includes('n')) {
        const newTop = clamp(top + dy, 0, top + height - minHeight);
        win.style.top = `${newTop}px`;
        win.style.height = `${height + top - newTop}px`;
      }
    });

    const stop = (event: PointerEvent) => {
      if (!resizing) return;
      resizing = false;
      win.classList.remove('is-resizing');
      if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
  }
}

// Phones always show windows full-screen; forget any dragged position or size
// when the viewport shrinks so the window doesn't end up off-screen later.
desktopQuery.addEventListener('change', () => {
  document.querySelectorAll<HTMLElement>('[data-window]').forEach((win) => {
    win.style.left = '';
    win.style.top = '';
    win.style.width = '';
    win.style.height = '';
    win.style.maxHeight = '';
  });
});

// --- Selection box -------------------------------------------------------------

// Dragging across empty space draws XP's translucent selection box; every item
// it touches is selected. Used on the desktop and in folder windows.
function enableSelectionBox(area: HTMLElement, itemSelector: string, isEmptySpot: (target: HTMLElement) => boolean) {
  let start: { x: number; y: number } | null = null;
  let box: HTMLDivElement | null = null;
  const items = () => [...area.querySelectorAll<HTMLElement>(itemSelector)];
  const local = (event: PointerEvent) => {
    const rect = area.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left + area.scrollLeft, 0), area.scrollWidth),
      y: Math.min(Math.max(event.clientY - rect.top + area.scrollTop, 0), area.scrollHeight),
    };
  };

  area.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !desktopQuery.matches || !isEmptySpot(event.target as HTMLElement)) return;
    items().forEach((item) => item.classList.remove('is-selected'));
    start = local(event);
    area.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  area.addEventListener('pointermove', (event) => {
    if (!start) return;
    const point = local(event);
    if (!box) {
      if (Math.hypot(point.x - start.x, point.y - start.y) < 3) return;
      box = document.createElement('div');
      box.className = 'selection-box';
      // Under any windows, above the icons.
      area.insertBefore(box, area.querySelector(':scope > .window-layer'));
    }
    box.style.left = `${Math.min(start.x, point.x)}px`;
    box.style.top = `${Math.min(start.y, point.y)}px`;
    box.style.width = `${Math.abs(point.x - start.x)}px`;
    box.style.height = `${Math.abs(point.y - start.y)}px`;
    const b = box.getBoundingClientRect();
    for (const item of items()) {
      const r = item.getBoundingClientRect();
      const hit = r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      item.classList.toggle('is-selected', hit);
    }
  });

  const stop = (event: PointerEvent) => {
    if (!start) return;
    start = null;
    box?.remove();
    box = null;
    if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
  };
  area.addEventListener('pointerup', stop);
  area.addEventListener('pointercancel', stop);
}

function initSelectionBoxes() {
  const desktopArea = document.getElementById('desktop');
  if (desktopArea) {
    enableSelectionBox(desktopArea, '.desktop-icon', (t) => !t.closest('.desktop-icon, .xp-window, .balloon'));
  }
  document.querySelectorAll<HTMLElement>('.file-pane').forEach((pane) => {
    if (bindOnce(pane, 'selection')) enableSelectionBox(pane, '.file-list > li', (t) => !t.closest('a, button, input'));
  });
}

// --- Movable desktop icons ------------------------------------------------------

// Icons can be dragged anywhere on the desktop and snap to the same grid the
// CSS lays them out on (ul padding 12px 8px; 84x92 cells with a 6px gap).
// Positions are a per-browser convenience kept in localStorage.
const ICON_GRID = { left: 8, top: 12, w: 90, h: 98 };
const ICON_KEY = 'xp:icon-positions';
type Cell = [col: number, row: number];

function loadIconCells(): Record<string, Cell> {
  try {
    return JSON.parse(localStorage.getItem(ICON_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveIconCells(cells: Record<string, Cell>) {
  try {
    localStorage.setItem(ICON_KEY, JSON.stringify(cells));
  } catch {
    /* storage blocked: positions just won't persist */
  }
}

// The icons are kept across page swaps (transition:persist), so this wires
// them up the first time they appear and does nothing after that.
function initDesktopIcons() {
  const iconList = document.querySelector<HTMLElement>('.desktop-icons ul');
  if (!iconList || iconList.dataset.ready) {
    // Already placed on an earlier page: make sure nothing is holding them back.
    document.documentElement.classList.remove('icons-pending');
    return;
  }
  iconList.dataset.ready = '1';

  const slots = [...iconList.querySelectorAll<HTMLElement>(':scope > li')];
  const keyOf = (li: HTMLElement) => li.querySelector('a')?.getAttribute('href') ?? '';
  const iconOf = (li: HTMLElement) => li.querySelector<HTMLElement>('.desktop-icon')!;
  let cells: Record<string, Cell> = loadIconCells();
  let suppressClick = false;

  const gridSize = () => ({
    cols: Math.max(1, Math.floor((iconList.clientWidth - ICON_GRID.left + 6) / ICON_GRID.w)),
    rows: Math.max(1, Math.floor((iconList.clientHeight - ICON_GRID.top * 2 + 6) / ICON_GRID.h)),
  });

  const moveTo = (li: HTMLElement, [col, row]: Cell) => {
    li.style.left = `${ICON_GRID.left + col * ICON_GRID.w}px`;
    li.style.top = `${ICON_GRID.top + row * ICON_GRID.h}px`;
  };

  // Nearest free cell to `want`, searching outward ring by ring.
  const nearestFree = (want: Cell, taken: Set<string>): Cell => {
    const { cols, rows } = gridSize();
    const c0 = Math.min(Math.max(want[0], 0), cols - 1);
    const r0 = Math.min(Math.max(want[1], 0), rows - 1);
    for (let d = 0; d < cols + rows; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c >= 0 && c < cols && r >= 0 && r < rows && !taken.has(`${c},${r}`)) return [c, r];
        }
      }
    }
    return [c0, r0];
  };

  // Put every icon on a free cell: its saved spot, or the default column order.
  const layout = () => {
    if (!desktopQuery.matches) {
      iconList.classList.remove('is-free');
      slots.forEach((li) => li.removeAttribute('style'));
      document.documentElement.classList.remove('icons-pending');
      return;
    }
    iconList.classList.add('is-free');
    const { rows } = gridSize();
    const taken = new Set<string>();
    slots.forEach((li, i) => {
      const want = cells[keyOf(li)] ?? [Math.floor(i / rows), i % rows];
      const cell = nearestFree(want, taken);
      taken.add(`${cell[0]},${cell[1]}`);
      moveTo(li, cell);
    });
    document.documentElement.classList.remove('icons-pending');
  };

  for (const li of slots) {
    const icon = iconOf(li);
    icon.addEventListener('dragstart', (event) => event.preventDefault());

    let start: { x: number; y: number } | null = null;
    let moving: { li: HTMLElement; left: number; top: number }[] = [];
    let dragging = false;

    icon.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !desktopQuery.matches) return;
      suppressClick = false;
      if (!icon.classList.contains('is-selected')) {
        slots.forEach((s) => iconOf(s).classList.remove('is-selected'));
        icon.classList.add('is-selected');
      }
      start = { x: event.clientX, y: event.clientY };
      moving = slots
        .filter((s) => iconOf(s).classList.contains('is-selected'))
        .map((s) => ({ li: s, left: s.offsetLeft, top: s.offsetTop }));
      dragging = false;
      icon.setPointerCapture(event.pointerId);
    });

    icon.addEventListener('pointermove', (event) => {
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true;
      for (const m of moving) {
        m.li.classList.add('is-dragging');
        m.li.style.left = `${m.left + dx}px`;
        m.li.style.top = `${m.top + dy}px`;
      }
    });

    const stop = (event: PointerEvent) => {
      if (!start) return;
      start = null;
      if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
      if (!dragging) return;
      suppressClick = true;
      // Snap the dragged icons; everything else keeps its cell.
      const movingSet = new Set(moving.map((m) => m.li));
      const taken = new Set<string>();
      for (const s of slots) {
        if (movingSet.has(s)) continue;
        const c = Math.round((s.offsetLeft - ICON_GRID.left) / ICON_GRID.w);
        const r = Math.round((s.offsetTop - ICON_GRID.top) / ICON_GRID.h);
        taken.add(`${c},${r}`);
        cells[keyOf(s)] = [c, r];
      }
      for (const m of moving) {
        m.li.classList.remove('is-dragging');
        const want: Cell = [
          Math.round((m.li.offsetLeft - ICON_GRID.left) / ICON_GRID.w),
          Math.round((m.li.offsetTop - ICON_GRID.top) / ICON_GRID.h),
        ];
        const cell = nearestFree(want, taken);
        taken.add(`${cell[0]},${cell[1]}`);
        cells[keyOf(m.li)] = cell;
        moveTo(m.li, cell);
      }
      saveIconCells(cells);
    };
    icon.addEventListener('pointerup', stop);
    icon.addEventListener('pointercancel', stop);

    // A drag that ends on the icon fires a click; don't let it open the link.
    icon.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
    });
  }

  layout();
  let pending = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(layout);
  });
  desktopQuery.addEventListener('change', layout);
}

// --- Small extras -------------------------------------------------------------

function initExtras() {
  // Clicking an address bar selects the whole URL for easy copying.
  document.querySelectorAll<HTMLInputElement>('input[data-address]').forEach((input) => {
    if (bindOnce(input, 'address')) input.addEventListener('focus', () => input.select());
  });

  // Internet Explorer's Print button.
  document.querySelectorAll('[data-print]').forEach((button) => {
    if (bindOnce(button, 'print')) button.addEventListener('click', () => window.print());
  });

  // Explorer's Folders button: hide or show the task pane.
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-tasks]').forEach((button) => {
    if (!bindOnce(button, 'folders')) return;
    const explorer = button.closest('.xp-window')?.querySelector('.explorer');
    button.addEventListener('click', () => {
      const hidden = explorer?.classList.toggle('hide-tasks') ?? false;
      button.setAttribute('aria-pressed', String(hidden));
    });
  });

  initBalloon();
}

// --- Welcome balloon --------------------------------------------------------------

// The balloon belongs to the info icon in the tray: it pops up on the home page,
// its tail points at that icon, and clicking the icon shows or hides it.
// Once closed it stays closed for the rest of the visit.
const BALLOON_KEY = 'xp:welcome-closed';

function placeBalloon() {
  const balloon = document.querySelector<HTMLElement>('[data-balloon]');
  const icon = document.querySelector<HTMLElement>('[data-balloon-toggle]');
  if (!balloon || !icon || balloon.hidden) return;
  const r = icon.getBoundingClientRect();
  const center = r.left + r.width / 2;
  const tailToEdge = 43; // ::after sits 36px from the right and is 14px wide
  const right = Math.max(4, window.innerWidth - center - tailToEdge);
  balloon.style.right = `${right}px`;
  balloon.style.setProperty('--tail', `${window.innerWidth - right - center - 7}px`);
  balloon.classList.add('is-placed');
}
window.addEventListener('resize', placeBalloon);

function initBalloon() {
  const balloon = document.querySelector<HTMLElement>('[data-balloon]');
  const icon = document.querySelector<HTMLButtonElement>('[data-balloon-toggle]');
  if (!balloon || !icon) return;
  let closed = false;
  try {
    closed = sessionStorage.getItem(BALLOON_KEY) === '1';
  } catch {
    /* ignore */
  }
  const show = (open: boolean) => {
    balloon.hidden = !open;
    document.documentElement.classList.toggle('welcome-closed', !open);
    icon.setAttribute('aria-expanded', String(open));
    try {
      if (open) sessionStorage.removeItem(BALLOON_KEY);
      else sessionStorage.setItem(BALLOON_KEY, '1');
    } catch {
      /* ignore */
    }
    placeBalloon();
  };
  if (closed && !balloon.hidden) {
    balloon.hidden = true;
    icon.setAttribute('aria-expanded', 'false');
  }
  placeBalloon();
  icon.addEventListener('click', () => show(balloon.hidden));
  balloon.querySelector('[data-balloon-close]')?.addEventListener('click', () => show(false));
}
