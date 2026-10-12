// Fake POST sequence. Only runs when the inline <head> script flagged this
// visit as a fresh session (html.booting). Any key, click, or tap skips it;
// DEL (or tapping "DEL") opens the setup screen instead.

import { openSetup } from './bios-setup';

interface Step {
  text?: string;
  result?: string;
  memory?: number;
  footer?: boolean;
  cls?: string;
}

const root = document.documentElement;
const boot = document.getElementById('boot');

if (boot && root.classList.contains('booting')) {
  runBoot(boot);
} else {
  boot?.remove();
}

function runBoot(boot: HTMLElement) {
  const output = boot.querySelector<HTMLElement>('[data-boot-output]')!;
  const footer = boot.querySelector<HTMLElement>('[data-boot-footer]')!;
  const skip = boot.querySelector<HTMLButtonElement>('[data-boot-skip]')!;
  const steps: Step[] = JSON.parse(document.getElementById('boot-steps')!.textContent || '[]');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Keep the desktop out of the tab order / accessibility tree until booted.
  const behind = [document.getElementById('desktop'), document.querySelector('.taskbar'), document.querySelector('.skip-link')];
  behind.forEach((el) => el && ((el as HTMLElement).inert = true));
  skip.focus({ preventScroll: true });

  let finished = false;
  // In setup: the POST animation stops where it is until setup exits.
  let halted = false;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));

  async function typeInto(el: HTMLElement, text: string) {
    if (reduceMotion) {
      el.textContent = text;
      return;
    }
    for (let i = 2; i < text.length + 2 && !finished && !halted; i += 2) {
      el.textContent = text.slice(0, i);
      await sleep(10);
    }
  }

  async function memoryTest(el: HTMLElement, total: number) {
    const label = 'Memory Test :  ';
    const frames = reduceMotion ? 1 : 40;
    for (let f = 1; f <= frames && !finished && !halted; f++) {
      el.textContent = `${label}${Math.round((total * f) / frames)}K`;
      await sleep(22);
    }
    el.textContent = `${label}${total}K OK`;
  }

  async function play() {
    for (const step of steps) {
      if (finished || halted) return;
      if (step.footer) {
        footer.hidden = false;
        continue;
      }
      const line = document.createElement('div');
      line.className = `boot-line ${step.cls ?? ''}`;
      output.append(line);
      if (step.memory) {
        await memoryTest(line, step.memory);
      } else {
        await typeInto(line, step.text ?? '');
        if (step.result) {
          await sleep(280);
          const result = document.createElement('span');
          result.className = 'white-255-text';
          result.textContent = step.result;
          line.append(result);
        }
      }
      await sleep(step.text === '' ? 40 : 90);
    }
    // Let the final screen sit for a beat (a little longer if nothing animated).
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 1200 : 700));
    if (!halted) finish();
  }

  function enterSetup() {
    if (finished || halted) return;
    halted = true;
    window.removeEventListener('keydown', onKey, true);
    boot.removeEventListener('pointerdown', onPointer);
    boot.classList.add('in-setup');
    openSetup(
      boot,
      { author: boot.dataset.author ?? '', posts: Number(boot.dataset.posts ?? 0), site: location.host },
      finish,
    );
  }

  function finish() {
    if (finished) return;
    finished = true;
    window.removeEventListener('keydown', onKey, true);
    try {
      sessionStorage.setItem('xp:booted', '1');
    } catch {
      /* ignore */
    }
    const teardown = () => {
      boot.remove();
      root.classList.remove('booting');
      behind.forEach((el) => el && ((el as HTMLElement).inert = false));
    };
    if (reduceMotion) {
      teardown();
    } else {
      boot.classList.add('boot-out');
      setTimeout(teardown, 350);
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Tab' || event.key === 'Shift') return; // let people reach the skip button
    event.preventDefault();
    if (event.key === 'Delete') {
      enterSetup();
      return;
    }
    finish();
  }

  // Tapping "DEL" in the footer opens setup (phones have no Delete key);
  // a click anywhere else skips the boot.
  function onPointer(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('[data-boot-setup]')) {
      event.preventDefault();
      enterSetup();
    } else {
      finish();
    }
  }

  window.addEventListener('keydown', onKey, true);
  boot.addEventListener('pointerdown', onPointer);
  skip.addEventListener('click', finish);
  boot.addEventListener('animationend', (event) => {
    if (event.animationName === 'boot-failsafe' && !halted) finish();
  });
  play();
}
