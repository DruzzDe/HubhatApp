/**
 * toast.js — lightweight toast notification system.
 */
import { el, refreshIcons } from '../utils/dom.js';

const ICONS = {
  success: 'check-circle-2',
  error: 'alert-circle',
  info: 'info',
};

let stack;
function ensureStack(){
  if (!stack) {
    stack = el('div', { class:'toast-stack', id:'toastStack' });
    document.body.append(stack);
  }
  return stack;
}

export function showToast(message, type = 'info', duration = 3200){
  const container = ensureStack();
  const toast = el('div', { class:`toast toast--${type}` },
    el('i', { 'data-lucide': ICONS[type] || ICONS.info }),
    el('p', {}, message),
  );
  container.append(toast);
  refreshIcons();
  setTimeout(() => {
    toast.style.animation = 'toastIn var(--dur-base) var(--ease-out) reverse';
    setTimeout(() => toast.remove(), 180);
  }, duration);
}
