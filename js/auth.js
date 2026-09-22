import { $, showToast } from './ui.js';
import { formatError } from './api.js';

export function createAuth(api, callbacks) {
  let user = null;
  function showDashboard(nextUser) {
    user = nextUser;
    $('login-screen').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('user-chip').textContent = `${user.name} · ${user.role === 'admin' ? 'مدير' : 'مشغّل'}`;
    $('tab-users')?.classList.toggle('hidden', user.role !== 'admin');
    callbacks.enter?.(user);
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('login-btn'), box = $('login-error');
    button.disabled = true; box.classList.add('hidden');
    try {
      const { user: next } = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ username:$('username').value, password:$('password').value }) });
      showDashboard(next);
    } catch (error) {
      box.textContent = error.code === 'INVALID_CREDENTIALS' ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : formatError(error);
      box.classList.remove('hidden');
    } finally { button.disabled = false; }
  });
  $('logout-btn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', {method:'POST'}); } catch (_) {}
    callbacks.leave?.(); user = null; $('dashboard').classList.add('hidden'); $('login-screen').classList.remove('hidden'); $('password').value = ''; showToast('success','تم تسجيل الخروج');
  });
  async function init() { try { const {user:current}=await api('/api/auth/me'); showDashboard(current); } catch (_) { $('login-screen').classList.remove('hidden'); } }
  return { init, getUser:() => user };
}
