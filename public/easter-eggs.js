/* Secrets live only on the entry screen; no socket or game-state access. */
(() => {
  const trigger = document.getElementById('secret-brand');
  const room = document.getElementById('secret-room');
  const video = document.getElementById('secret-video');
  const join = document.getElementById('join');
  let taps = 0;
  let lastTap = 0;
  trigger.addEventListener('click', () => {
    const now = Date.now();
    taps = now - lastTap > 2500 ? 1 : taps + 1;
    lastTap = now;
    if (taps < 7 || join.hidden) return;
    taps = 0;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    room.showModal();
  });
  document.getElementById('secret-close').addEventListener('click', () => room.close());
  room.addEventListener('close', () => {
    video.pause();
    if (video.readyState > 0) video.currentTime = 0;
  });
  // Reconnection can move the player into a match while the secret is open.
  new MutationObserver(() => {
    if (join.hidden && room.open) room.close();
  }).observe(join, { attributes: true, attributeFilter: ['hidden'] });
})();
