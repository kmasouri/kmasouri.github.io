function initKeygen() {
  const shell = document.querySelector<HTMLElement>('[data-keygen]');
  if (!shell || shell.dataset.bound === 'true') return;
  shell.dataset.bound = 'true';

  const form = shell.querySelector<HTMLFormElement>('[data-keygen-form]');
  const serial = shell.querySelector<HTMLInputElement>('[data-keygen-serial]');
  const copy = shell.querySelector<HTMLButtonElement>('[data-keygen-copy]');
  const music = shell.querySelector<HTMLInputElement>('[data-keygen-music]');
  const audio = shell.querySelector<HTMLAudioElement>('[data-keygen-audio]');
  const status = shell.querySelector<HTMLOutputElement>('[data-keygen-status]');
  const about = shell.querySelector<HTMLDialogElement>('[data-keygen-about]');
  const aboutOpen = shell.querySelector<HTMLButtonElement>('[data-keygen-about-open]');
  const aboutClose = shell.querySelector<HTMLButtonElement>('[data-keygen-about-close]');

  if (!form || !serial || !copy || !music || !audio || !status || !about || !aboutOpen || !aboutClose) return;

  const message = (value: string) => {
    status.textContent = value;
  };

  const randomBlock = () => {
    const alphabet = '2346789ABCDEFGHJKLMNPQRTUVWXYZ';
    const values = new Uint8Array(4);
    crypto.getRandomValues(values);
    return [...values].map((value) => alphabet[value % alphabet.length]).join('');
  };

  const play = async () => {
    if (!music.checked) return;
    try {
      await audio.play();
    } catch {
      message('Press Music once to allow soundtrack playback.');
    }
  };

  // Browsers may block autoplay even though keygens traditionally start their
  // music immediately. Try on load, then retry on the first real interaction.
  const unlockPlayback = () => {
    if (music.checked && audio.paused) void play();
  };
  void play();
  window.addEventListener('pointerdown', unlockPlayback, { once: true, capture: true });
  window.addEventListener('keydown', unlockPlayback, { once: true, capture: true });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    serial.value = `AC43-${randomBlock()}-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
    message('Serial generated. This key intentionally activates nothing.');
    void play();
  });

  copy.addEventListener('click', async () => {
    if (!serial.value) {
      message('Generate a serial first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(serial.value);
    } catch {
      serial.select();
      document.execCommand('copy');
    }
    message('Serial copied to clipboard.');
  });

  music.addEventListener('change', () => {
    if (music.checked) void play();
    else audio.pause();
  });

  aboutOpen.addEventListener('click', () => about.showModal());
  aboutClose.addEventListener('click', () => about.close());

  document.addEventListener('astro:before-swap', () => {
    audio.pause();
  }, { once: true });
}

document.addEventListener('astro:page-load', initKeygen);
initKeygen();
