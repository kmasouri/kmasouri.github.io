// Desktop behaviour: clock, Start menu extras, and window controls
// (minimize / maximize / close / drag / resize). Everything here is an enhancement;
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

// --- Small extras -------------------------------------------------------------

// Clicking an address bar selects the whole URL for easy copying.
document.querySelectorAll<HTMLInputElement>('input[data-address]').forEach((input) => {
  input.addEventListener('focus', () => input.select());
});

// Dismissable balloon tips.
document.querySelectorAll<HTMLElement>('[data-balloon]').forEach((balloon) => {
  balloon.querySelector('[data-balloon-close]')?.addEventListener('click', () => balloon.remove());
});
