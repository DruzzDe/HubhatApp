/**
 * dom.js — tiny DOM helpers used across the app.
 */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children){
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value);
    }
  }
  children.flat().forEach((child) => {
    if (child === null || child === undefined) return;
    node.append(child.nodeType ? child : document.createTextNode(child));
  });
  return node;
}

/** Re-render Lucide icons after DOM updates. Safe to call repeatedly. */
export function refreshIcons(){
  if (window.lucide) window.lucide.createIcons();
}

/** Escapes user text before inserting as HTML. */
export function escapeHTML(str = ''){
  return str.replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

export function closeOnClickAway(target, onClose){
  const catcher = el('div', { class:'click-catcher', onclick: () => { catcher.remove(); onClose(); } });
  document.body.append(catcher);
  return catcher;
}
