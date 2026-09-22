import { esc, fmtAgo } from './ui.js';
const LABELS = {pending:'قيد الإرسال',sent:'أُرسل',confirmed:'مؤكد',failed:'فشل',timeout:'انتهت المهلة'};
export async function refreshCommands(api, target) {
  try {
    const data = await api('/api/logs/commands');
    const rows = (data?.commands || data || []).slice(0, 8);
    target.innerHTML = rows.length ? rows.map(c => `<div class="cmd-row"><div class="cmd-left"><span class="cmd-cmd ${esc(c.command)}">${esc(c.command)}</span><span class="cmd-time">${esc(fmtAgo(c.created_at))}</span></div><span class="badge ${esc(c.status)}">${esc(LABELS[c.status] || c.status)}</span></div>`).join('') : '<div class="empty-row">لا توجد أوامر مسجّلة بعد</div>';
  } catch (_) {}
}
