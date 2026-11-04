/* Called synchronously by the sender's click/Enter, never on received messages. */
function openChatEasterEgg(text) {
  if (text.trim().toLocaleLowerCase('it') !== 'bologna') return;
  window.open('https://www.youtube.com/watch?v=7n2_WNJWCT8', '_blank', 'noopener,noreferrer');
}
