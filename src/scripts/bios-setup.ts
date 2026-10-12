// The "Press DEL to enter SETUP" screen. Nothing here changes the site: the
// settings are jokes that reset on every boot. Keyboard works like a real
// setup utility (arrows, Enter, +/-, F1, F9, F10, Esc); mouse and touch work too.

type Item =
  | { kind: 'info'; label: string; value: string | (() => string); help?: string }
  | { kind: 'option'; label: string; options: string[]; def: number; value?: number; help: string }
  | { kind: 'action'; label: string; help: string; run: () => void }
  | { kind: 'sub'; label: string; help: string; items: Item[] }
  | { kind: 'heading'; label: string }
  | { kind: 'gap' };

interface Tab {
  name: string;
  items: Item[];
}

interface Popup {
  title: string;
  text: string;
  buttons: { label: string; run?: () => void }[];
  focus: number;
}

export interface SetupInfo {
  author: string;
  posts: number;
  site: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pad = (n: number) => String(n).padStart(2, '0');

export function openSetup(host: HTMLElement, info: SetupInfo, onExit: () => void) {
  const now = () => new Date();
  const date = () => {
    const d = now();
    return `[${d.toLocaleDateString('en-US', { weekday: 'short' })} ${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}]`;
  };
  const time = () => {
    const d = now();
    return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
  };

  const opt = (label: string, options: string[], def: number, help: string): Item => ({ kind: 'option', label, options, def, help });

  const tabs: Tab[] = [
    {
      name: 'Main',
      items: [
        { kind: 'info', label: 'BIOS Version', value: 'KMBIOS 4.60PG' },
        { kind: 'info', label: 'System Date', value: date, help: "The date comes from your computer's clock. It is always today." },
        { kind: 'info', label: 'System Time', value: time, help: 'Read-only. Time keeps moving whether or not you are in setup.' },
        { kind: 'gap' },
        { kind: 'info', label: 'Processor', value: 'PENTIUM-MMX 233MHz' },
        { kind: 'info', label: 'Total Memory', value: '262144 KB' },
        { kind: 'info', label: 'Blog Posts', value: String(info.posts) },
        { kind: 'info', label: 'Input Devices', value: '1 Keyboard, 1 Mouse' },
        { kind: 'gap' },
        {
          kind: 'sub',
          label: 'System Information',
          help: 'Who owns this machine and where it lives.',
          items: [
            { kind: 'info', label: 'Owner', value: info.author },
            { kind: 'info', label: 'Address', value: info.site },
            { kind: 'info', label: 'Hosting', value: 'GitHub Pages' },
            { kind: 'info', label: 'Fits on a Floppy', value: 'Yes' },
            { kind: 'info', label: 'Servers Idling', value: '0' },
          ],
        },
      ],
    },
    {
      name: 'Advanced',
      items: [
        opt('Nostalgia Level', ['Low', 'Medium', 'High', 'Maximum'], 3, 'How much 2003 to apply. Values above High may cause an urge to burn a mix CD.'),
        opt('Turbo Button', ['Disabled', 'Enabled'], 0, 'Pressing it never did anything on the real thing either.'),
        opt('Cursor Trails', ['Off', 'Short', 'Long'], 0, 'Leaves a trail of mouse pointers. Strictly for screenshots.'),
        opt('Startup Sound', ['Muted', 'Polite', 'Full Volume'], 0, 'Muted, out of respect for anyone reading this at work.'),
        { kind: 'gap' },
        {
          kind: 'sub',
          label: 'Chipset Configuration',
          help: 'Settings that sound important.',
          items: [
            opt('AGP Aperture Size', ['64MB', '128MB', '256MB'], 1, 'Nobody knew what this did. Leave it at 128MB.'),
            opt('Floppy Seek at Boot', ['Enabled', 'Disabled'], 0, 'Makes the drive go grrk-grrk on startup.'),
            opt('Spread Spectrum', ['Auto', 'Disabled'], 0, 'Auto is fine.'),
          ],
        },
      ],
    },
    {
      name: 'Boot',
      items: [
        opt('1st Boot Device', ['BLOG-HDD', 'CD-ROM 52X', 'Floppy A:', 'Network'], 0, 'Device to try first. The blog lives on BLOG-HDD.'),
        opt('2nd Boot Device', ['CD-ROM 52X', 'Floppy A:', 'Network', 'BLOG-HDD'], 0, 'Tried if the first device has nothing to boot.'),
        opt('3rd Boot Device', ['Floppy A:', 'Network', 'BLOG-HDD', 'CD-ROM 52X'], 0, 'Last resort.'),
        { kind: 'gap' },
        opt('Quick Boot', ['Enabled', 'Disabled'], 0, 'Skips the memory test. The memory test is the best part, so this does nothing.'),
        opt('Boot Up NumLock State', ['On', 'Off'], 0, 'NumLock on at startup.'),
      ],
    },
    {
      name: 'Security',
      items: [
        { kind: 'info', label: 'Supervisor Password', value: 'Not Installed' },
        { kind: 'info', label: 'User Password', value: 'Not Installed' },
        { kind: 'gap' },
        {
          kind: 'action',
          label: 'Set Supervisor Password',
          help: 'Protect setup with a password.',
          run: () => message('Set Supervisor Password', 'Password setting is disabled. Everything on this computer is already public.'),
        },
      ],
    },
    {
      name: 'Save & Exit',
      items: [
        { kind: 'action', label: 'Save Changes and Exit', help: 'Save your settings and continue booting.', run: () => confirmExit(true) },
        { kind: 'action', label: 'Discard Changes and Exit', help: 'Forget your settings and continue booting.', run: () => confirmExit(false) },
        { kind: 'action', label: 'Load Optimized Defaults', help: 'Put every setting back the way it shipped.', run: () => confirmDefaults() },
        { kind: 'gap' },
        { kind: 'heading', label: 'Boot Override' },
        { kind: 'action', label: 'BLOG-HDD', help: 'Boot from this device right now.', run: () => exit() },
      ],
    },
  ];

  let tab = 0;
  let stack: { label: string; items: Item[]; sel: number }[] = [];
  let sel = 0;
  let popup: Popup | null = null;

  const selectable = (item: Item) => item.kind === 'option' || item.kind === 'action' || item.kind === 'sub' || (item.kind === 'info' && !!item.help);
  const items = () => (stack.length ? stack[stack.length - 1].items : tabs[tab].items);
  const firstSelectable = (list: Item[]) => Math.max(0, list.findIndex(selectable));
  const optionValue = (item: Extract<Item, { kind: 'option' }>) => item.value ?? item.def;
  const allOptions = (list: Item[]): Extract<Item, { kind: 'option' }>[] =>
    list.flatMap((i) => (i.kind === 'option' ? [i] : i.kind === 'sub' ? allOptions(i.items) : []));

  sel = firstSelectable(items());

  const root = document.createElement('div');
  root.className = 'setup';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'KMBIOS Setup Utility');
  root.tabIndex = -1;
  host.append(root);

  function message(title: string, text: string) {
    popup = { title, text, buttons: [{ label: 'Ok' }], focus: 0 };
    render();
  }

  function confirmExit(save: boolean) {
    popup = {
      title: save ? 'Save & Exit Setup' : 'Exit Without Saving',
      text: save ? 'Save configuration and exit?' : 'Quit without saving?',
      buttons: [
        { label: 'Yes', run: () => (save ? exit() : (resetDefaults(), exit())) },
        { label: 'No' },
      ],
      focus: 0,
    };
    render();
  }

  function confirmDefaults() {
    popup = { title: 'Load Optimized Defaults', text: 'Load optimized defaults?', buttons: [{ label: 'Yes', run: resetDefaults }, { label: 'No' }], focus: 0 };
    render();
  }

  function resetDefaults() {
    tabs.forEach((t) => allOptions(t.items).forEach((o) => (o.value = o.def)));
  }

  function generalHelp() {
    message(
      'General Help',
      '←→ Select Screen   ↑↓ Select Item   Enter Select   +/- Change Option   F9 Optimized Defaults   F10 Save & Exit   Esc Exit',
    );
  }

  function exit() {
    clearInterval(clock);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    onExit();
  }

  function move(delta: number) {
    const list = items();
    let i = sel;
    for (let n = 0; n < list.length; n++) {
      i = (i + delta + list.length) % list.length;
      if (selectable(list[i])) {
        sel = i;
        return;
      }
    }
  }

  function switchTab(delta: number) {
    tab = (tab + delta + tabs.length) % tabs.length;
    stack = [];
    sel = firstSelectable(items());
  }

  function activate() {
    const item = items()[sel];
    if (!item) return;
    if (item.kind === 'option') change(item, 1);
    else if (item.kind === 'action') item.run();
    else if (item.kind === 'sub') {
      stack.push({ label: item.label, items: item.items, sel });
      sel = firstSelectable(item.items);
    }
  }

  function change(item: Item | undefined, delta: number) {
    if (item?.kind !== 'option') return;
    item.value = (optionValue(item) + delta + item.options.length) % item.options.length;
  }

  function back() {
    if (stack.length) {
      sel = stack.pop()!.sel;
    } else {
      confirmExit(false);
    }
  }

  function onKey(event: KeyboardEvent) {
    const handled = popup ? popupKey(event.key) : screenKey(event.key);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      render();
    }
  }

  function popupKey(key: string) {
    if (!popup) return false;
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab') {
      popup.focus = (popup.focus + 1) % popup.buttons.length;
    } else if (key === 'Enter' || key === ' ') {
      const button = popup.buttons[popup.focus];
      popup = null;
      button.run?.();
    } else if (key === 'Escape') {
      popup = null;
    } else {
      return false;
    }
    return true;
  }

  function screenKey(key: string) {
    switch (key) {
      case 'ArrowLeft':
        switchTab(-1);
        break;
      case 'ArrowRight':
        switchTab(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'ArrowDown':
        move(1);
        break;
      case 'Enter':
      case ' ':
        activate();
        break;
      case '+':
      case '=':
        change(items()[sel], 1);
        break;
      case '-':
        change(items()[sel], -1);
        break;
      case 'Escape':
        back();
        break;
      case 'F1':
        generalHelp();
        break;
      case 'F9':
        confirmDefaults();
        break;
      case 'F10':
        confirmExit(true);
        break;
      default:
        return false;
    }
    return true;
  }

  // The tap that opened setup ends with a click that lands on whatever is now
  // under the finger; only count clicks whose press started inside setup.
  let armed = false;
  root.addEventListener('pointerdown', () => (armed = true));

  root.addEventListener('click', (event) => {
    if (!armed) return;
    const target = event.target as HTMLElement;
    const tabEl = target.closest<HTMLElement>('[data-tab]');
    const itemEl = target.closest<HTMLElement>('[data-item]');
    const popupEl = target.closest<HTMLElement>('[data-popup-button]');
    const keyEl = target.closest<HTMLElement>('[data-key]');
    if (popupEl && popup) {
      const button = popup.buttons[Number(popupEl.dataset.popupButton)];
      popup = null;
      button.run?.();
    } else if (popup) {
      return;
    } else if (tabEl) {
      switchTab(Number(tabEl.dataset.tab) - tab);
    } else if (itemEl) {
      const i = Number(itemEl.dataset.item);
      if (i === sel) activate();
      else sel = i;
    } else if (keyEl) {
      screenKey(keyEl.dataset.key!);
    } else {
      return;
    }
    render();
  });

  function valueText(item: Item) {
    if (item.kind === 'info') return typeof item.value === 'function' ? item.value() : item.value;
    if (item.kind === 'option') return `[${item.options[optionValue(item)]}]`;
    return '';
  }

  function render() {
    const list = items();
    const current = list[sel];
    const help = current && 'help' in current && current.help ? current.help : '';
    const crumbs = stack.map((s) => s.label).join(' ▸ ');

    const rows = list
      .map((item, i) => {
        if (item.kind === 'gap') return '<li class="setup-gap" aria-hidden="true"></li>';
        if (item.kind === 'heading') return `<li class="setup-heading">${esc(item.label)}</li>`;
        const classes = ['setup-row', selectable(item) ? 'is-selectable' : '', i === sel ? 'is-selected' : '', item.kind === 'sub' ? 'is-sub' : '']
          .filter(Boolean)
          .join(' ');
        const attrs = selectable(item) ? ` data-item="${i}"` : '';
        const live = item.kind === 'info' && typeof item.value === 'function' ? ' data-live' : '';
        return `<li class="${classes}"${attrs}><span class="setup-label">${item.kind === 'sub' ? '▶ ' : ''}${esc(item.label)}</span><span class="setup-value"${live} data-index="${i}">${esc(valueText(item))}</span></li>`;
      })
      .join('');

    root.innerHTML = `
      <div class="setup-title">KMBIOS Setup Utility - Copyright (C) 1998 ${esc(info.author)} Software, Inc.</div>
      <div class="setup-tabs" role="tablist">${tabs
        .map((t, i) => `<button type="button" role="tab" class="setup-tab${i === tab ? ' is-active' : ''}" aria-selected="${i === tab}" data-tab="${i}">${esc(t.name)}</button>`)
        .join('')}</div>
      <div class="setup-main">
        <div class="setup-panel">
          ${crumbs ? `<div class="setup-crumbs">${esc(crumbs)}</div>` : ''}
          <ul class="setup-list">${rows}</ul>
        </div>
        <div class="setup-side">
          <p class="setup-help">${esc(help)}</p>
          <ul class="setup-keys">
            <li data-key="ArrowLeft">←→: Select Screen</li>
            <li data-key="ArrowDown">↑↓: Select Item</li>
            <li data-key="Enter">Enter: Select</li>
            <li data-key="+">+/-: Change Opt.</li>
            <li data-key="F1">F1: General Help</li>
            <li data-key="F9">F9: Optimized Defaults</li>
            <li data-key="F10">F10: Save &amp; Exit</li>
            <li data-key="Escape">ESC: Exit</li>
          </ul>
        </div>
      </div>
      <div class="setup-foot">Version 4.60PG. Copyright (C) 1998 ${esc(info.author)} Software, Inc.</div>
      ${
        popup
          ? `<div class="setup-popup" role="alertdialog" aria-label="${esc(popup.title)}">
              <div class="setup-popup-title">${esc(popup.title)}</div>
              <p>${esc(popup.text)}</p>
              <div class="setup-popup-buttons">${popup.buttons
                .map((b, i) => `<button type="button" data-popup-button="${i}" class="${i === popup!.focus ? 'is-focus' : ''}">${esc(b.label)}</button>`)
                .join('')}</div>
            </div>`
          : ''
      }`;
  }

  // Keep the date and time ticking without redrawing the whole screen.
  const clock = setInterval(() => {
    root.querySelectorAll<HTMLElement>('[data-live]').forEach((el) => {
      el.textContent = valueText(items()[Number(el.dataset.index)]);
    });
  }, 1000);

  window.addEventListener('keydown', onKey, true);
  render();
  root.focus({ preventScroll: true });
}
