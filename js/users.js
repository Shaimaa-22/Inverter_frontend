import { $, esc, showToast } from './ui.js';
import { formatError } from './api.js';

const ROLE_LABEL = { admin:'مدير', operator:'مشغّل' };
const icon = label => `<span aria-hidden="true">${label}</span>`;

export function createUsersController(api, getCurrentUser) {
  const list = $('users-list');
  async function update(id, body, success) {
    await api(`/api/users/${id}`, { method:'PATCH', body:JSON.stringify(body) });
    showToast('success', success);
    await refresh();
  }
  async function act(action, id, button) {
    button.disabled = true;
    try {
      if (action === 'disable' && confirm('تعطيل هذا المستخدم ومنع تسجيل دخوله؟')) await update(id,{isActive:false},'تم تعطيل المستخدم');
      if (action === 'reactivate') await update(id,{isActive:true},'تم تفعيل المستخدم');
      if (action === 'role') {
        const role = button.dataset.role === 'admin' ? 'operator' : 'admin';
        if (confirm(`تغيير الصلاحية إلى ${ROLE_LABEL[role]}؟`)) await update(id,{role},'تم تغيير الصلاحية');
      }
      if (action === 'password') {
        const password = prompt('أدخل كلمة المرور الجديدة (8 أحرف على الأقل):');
        if (password !== null) {
          if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
          await update(id,{password},'تم تغيير كلمة المرور');
        }
      }
      if (action === 'delete' && confirm('حذف المستخدم نهائيًا؟ لا يمكن التراجع عن ذلك.')) {
        await api(`/api/users/${id}`, {method:'DELETE'});
        showToast('success','تم حذف المستخدم');
        await refresh();
      }
    } catch (error) {
      showToast('error','تعذر تنفيذ العملية',formatError(error));
    } finally { if (button.isConnected) button.disabled = false; }
  }
  async function refresh() {
    if (!list) return;
    try {
      const data = await api('/api/users');
      const users = data?.users || data || [];
      list.innerHTML = users.length ? users.map(user => {
        const active = (user.isActive ?? user.is_active) !== false;
        const self = String(user.id) === String(getCurrentUser()?.id);
        const id = esc(user.id);
        const actions = self ? `<button class="user-delete-btn is-edit" data-action="password" data-id="${id}" title="تغيير كلمة المرور">${icon('••')}</button>` : `
          <button class="user-delete-btn is-edit" data-action="role" data-role="${esc(user.role)}" data-id="${id}" title="تغيير الصلاحية">${icon('↔')}</button>
          <button class="user-delete-btn is-edit" data-action="password" data-id="${id}" title="تغيير كلمة المرور">${icon('••')}</button>
          ${active ? `<button class="user-delete-btn" data-action="disable" data-id="${id}" title="تعطيل">${icon('⊘')}</button>` : `<button class="user-delete-btn is-reactivate" data-action="reactivate" data-id="${id}" title="تفعيل">${icon('↻')}</button><button class="user-delete-btn is-danger" data-action="delete" data-id="${id}" title="حذف نهائي">${icon('×')}</button>`}`;
        return `<div class="user-row ${active?'':'is-disabled'}"><div class="user-row-left"><div class="user-avatar">${esc((user.name||'?').trim().slice(0,2))}</div><div class="user-meta"><span class="user-meta-name">${esc(user.name||user.username)}</span><span class="user-meta-sub">${esc(user.username)}</span></div></div><span class="user-role-badge ${esc(user.role)}">${esc(ROLE_LABEL[user.role]||user.role)}</span>${active?'':'<span class="user-role-badge disabled">معطّل</span>'}<div class="user-actions">${actions}</div></div>`;
      }).join('') : '<div class="empty-row">لا يوجد مستخدمون بعد</div>';
      list.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click',()=>act(button.dataset.action,button.dataset.id,button)));
    } catch (error) { list.innerHTML = `<div class="empty-row">${esc(formatError(error))}</div>`; }
  }
  const form = $('add-user-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault(); const button=$('add-user-btn'), errorBox=$('add-user-error');
    button.disabled=true; errorBox.classList.add('hidden');
    try {
      await api('/api/users',{method:'POST',body:JSON.stringify({name:$('nu-name').value,username:$('nu-username').value,password:$('nu-password').value,role:$('nu-role').value})});
      form.reset(); showToast('success','تم إنشاء المستخدم'); await refresh();
    } catch(error) { errorBox.textContent=formatError(error); errorBox.classList.remove('hidden'); }
    finally { button.disabled=false; }
  });
  return { refresh };
}
