/**
 * Copies text to the clipboard. Uses the async Clipboard API where available
 * (secure contexts) and a hidden textarea + execCommand elsewhere.
 * Rejects when neither works so callers can tell the user.
 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand('copy')) throw new Error('copy command was refused');
  } finally {
    document.body.removeChild(area);
  }
}
