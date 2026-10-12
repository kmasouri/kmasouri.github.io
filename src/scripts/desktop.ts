// Desktop behaviour: clock, Start menu extras, and window controls
// (minimize / maximize / close / drag / resize), selection boxes and movable
// desktop icons. Everything here is an enhancement;
// links and the Start menu (a native popover) work without JavaScript.

const desktopQuery = matchMedia('(min-width: 768px)');

// --- Clock -----------------------------------------------------------------

const clock = document.getElementById('clock') as HTMLTimeElement | null;
function tick() {
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  clock.dateTime = now.toISOString();
  clock.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
tick();
setInterval(tick, 10_000);

// --- Start menu --------------------------------------------------------------

const startMenu = document.getElementById('start-menu');
const startButton = document.querySelector<HTMLButtonElement>('.start-button');

startMenu?.addEventListener('toggle', (event) => {
  const open = (event as ToggleEvent).newState === 'open';
  startButton?.classList.toggle('is-pressed', open);
  if (open) startMenu.querySelector<HTMLElement>('a')?.focus();
});

// "Restart" replays the boot sequence.
document.querySelector('[data-restart]')?.addEventListener('click', () => {
  try {
    sessionStorage.removeItem('xp:booted');
  } catch {
    /* ignore */
  }
});

// --- Windows -----------------------------------------------------------------

const windows = [...document.querySelectorAll<HTMLElement>('[data-window]')];
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
}

function minimize(win: HTMLElement) {
  win.hidden = true;
  const button = taskButtonFor(win);
  button?.setAttribute('aria-pressed', 'false');
  button?.focus();
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

for (const win of windows) {
  win.querySelector('[data-action="minimize"]')?.addEventListener('click', () => minimize(win));
  win.querySelector('[data-action="maximize"]')?.addEventListener('click', () => toggleMaximize(win));
  win.addEventListener('pointerdown', () => activate(win));
  win.addEventListener('focusin', () => activate(win));

  // Close: go back to the desktop (or wherever closeHref points) without the
  // trailing "?" a GET form would add.
  const closeForm = win.querySelector<HTMLFormElement>('[data-close-form]');
  closeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    win.classList.add('is-closing');
    window.location.href = closeForm.getAttribute('action') || '/';
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

if (windows.length) activate(windows[windows.length - 1]);

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
  windows.forEach((win) => {
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

const desktopArea = document.getElementById('desktop');
if (desktopArea) {
  enableSelectionBox(desktopArea, '.desktop-icon', (t) => !t.closest('.desktop-icon, .xp-window, .balloon'));
}
document.querySelectorAll<HTMLElement>('.file-pane').forEach((pane) => {
  enableSelectionBox(pane, '.file-list > li', (t) => !t.closest('a, button, input'));
});

// --- Movable desktop icons ------------------------------------------------------

// Icons can be dragged anywhere on the desktop and snap to the same grid the
// CSS lays them out on (ul padding 12px 8px; 84x92 cells with a 6px gap).
// Positions are a per-browser convenience kept in localStorage.
const ICON_GRID = { left: 8, top: 12, w: 90, h: 98 };
const ICON_KEY = 'xp:icon-positions';
const iconList = document.querySelector<HTMLElement>('.desktop-icons ul');

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

if (iconList) {
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

// Clicking an address bar selects the whole URL for easy copying.
document.querySelectorAll<HTMLInputElement>('input[data-address]').forEach((input) => {
  input.addEventListener('focus', () => input.select());
});

// Dismissable balloon tips.
document.querySelectorAll<HTMLElement>('[data-balloon]').forEach((balloon) => {
  balloon.querySelector('[data-balloon-close]')?.addEventListener('click', () => balloon.remove());
});
