export const $ = id => document.getElementById(id);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fmtAgo(iso) {
  if (!iso) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 5) return 'الآن';
  if (diff < 60) return `${diff}ث`;
  if (diff < 3600) return `${Math.floor(diff / 60)}د`;
  return `${Math.floor(diff / 3600)}س`;
}
export function fmtUptime(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}س ${m}د` : `${m}د`;
}
export function showToast(type, title, message = '', duration = 5000) {
  const region = $('toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div><span class="toast-title">${esc(title)}</span>${message ? `<span class="toast-message">${esc(message)}</span>` : ''}</div>`;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
