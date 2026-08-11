(function(){
  const API = '';
  const $ = (id) => document.getElementById(id);

  // ---------------- تعقيم النصوص قبل حقنها بالـ HTML (حماية من XSS) ----------------
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  const loginScreen = $('login-screen');
  const dashboard = $('dashboard');
  const loginForm = $('login-form');
  const loginError = $('login-error');
  const loginBtn = $('login-btn');
  const powerBtn = $('power-btn');
  const heartbeatRing = $('heartbeat-ring');
  const stateLabel = $('state-label');
  const stateSub = $('state-sub');
  const relayCaption = $('relay-caption');
  const connDot = $('conn-dot');
  const connText = $('conn-text');
  const userChip = $('user-chip');
  const faultBanner = $('fault-banner');
  const faultText = $('fault-text');
  const cmdList = $('cmd-list');
  const tabUsers = $('tab-users');
  const usersList = $('users-list');
  const addUserForm = $('add-user-form');
  const addUserError = $('add-user-error');
  const addUserBtn = $('add-user-btn');

  let currentUser = null;
  let ws = null;
  let wsReconnectTimer = null;
  let pollingCommandId = null;
  let busy = false;

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'حدث خطأ غير متوقع');
      err.code = body?.error?.code;
      err.status = res.status;
      throw err;
    }
    return body?.data;
  }

  function fmtUptime(sec) {
    if (sec == null) return '—';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}س ${m}د` : `${m}د`;
  }
  function fmtAgo(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 5) return 'الآن';
    if (diff < 60) return `${diff}ث`;
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    return `${Math.floor(diff / 3600)}س`;
  }
  const CMD_LABEL = { pending: 'قيد الإرسال', sent: 'أُرسل', confirmed: 'مؤكد', failed: 'فشل', timeout: 'انتهت المهلة' };

  function renderPowerState(device) {
    powerBtn.classList.remove('state-on', 'state-off', 'state-offline', 'state-pending');
    if (!device || !device.esp_online) {
      powerBtn.classList.add('state-offline');
      stateLabel.textContent = 'غير متصل';
      stateSub.textContent = 'ESP32 offline';
      heartbeatRing.classList.add('offline');
      connDot.className = 'dot off pulse';
      connText.textContent = 'غير متصل';
      powerBtn.disabled = true;
      return;
    }
    heartbeatRing.classList.remove('offline');
    connDot.className = 'dot on pulse';
    connText.textContent = 'متصل';
    powerBtn.disabled = busy;

    if (device.relay_state === 'ON') {
      powerBtn.classList.add('state-on');
      stateLabel.textContent = 'شغّال';
      stateSub.textContent = device.inverter_state || 'RUNNING';
    } else {
      powerBtn.classList.add('state-off');
      stateLabel.textContent = 'مطفي';
      stateSub.textContent = device.inverter_state || 'STOPPED';
    }

    if (device.fault_code) {
      faultBanner.classList.remove('hidden');
      faultText.textContent = `خطأ بالجهاز: ${device.fault_code}`;
    } else {
      faultBanner.classList.add('hidden');
    }

    $('stat-rssi').textContent = device.wifi_rssi != null ? `${device.wifi_rssi} dBm` : '—';
    $('stat-uptime').textContent = fmtUptime(device.uptime_seconds);
    $('stat-fw').textContent = device.firmware_version || '—';
    $('stat-lastseen').textContent = fmtAgo(device.last_seen);
  }

  function renderPending() {
    powerBtn.classList.remove('state-on', 'state-off', 'state-offline');
    powerBtn.classList.add('state-pending');
    stateSub.textContent = 'جاري التنفيذ…';
    powerBtn.disabled = true;
  }

  async function refreshStatus() {
    try {
      const { device } = await api('/api/device/status');
      if (!pollingCommandId) renderPowerState(device);
    } catch (e) {
      connDot.className = 'dot off';
      connText.textContent = 'خطأ اتصال';
    }
  }

  async function refreshCommands() {
    try {
      const data = await api('/api/logs/commands');
      const rows = (data?.commands || data || []).slice(0, 8);
      if (!rows.length) {
        cmdList.innerHTML = '<div class="empty-row">لا توجد أوامر مسجّلة بعد</div>';
        return;
      }
      cmdList.innerHTML = rows.map(c => `
        <div class="cmd-row">
          <div class="cmd-left">
            <span class="cmd-cmd ${esc(c.command)}">${esc(c.command)}</span>
            <span class="cmd-time">${esc(fmtAgo(c.created_at))}</span>
          </div>
          <span class="badge ${esc(c.status)}">${esc(CMD_LABEL[c.status] || c.status)}</span>
        </div>
      `).join('');
    } catch (e) { /* silent */ }
  }

  // ---------------- إدارة المستخدمين (للمدير فقط) ----------------
  const ROLE_LABEL = { admin: 'مدير', operator: 'مشغّل' };

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  const ICON_DISABLE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M6.5 6.5l11 11"/></svg>';
  const ICON_REACTIVATE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>';
  const ICON_DELETE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  async function refreshUsers() {
    if (!usersList) return;
    try {
      const data = await api('/api/users');
      const rows = data?.users || data || [];
      if (!rows.length) {
        usersList.innerHTML = '<div class="empty-row">لا يوجد مستخدمون بعد</div>';
        return;
      }
      usersList.innerHTML = rows.map(u => {
        // الباك اند ممكن يرجّع الحقل isActive أو is_active — نتعامل مع الاثنين
        const active = (u.isActive ?? u.is_active) !== false;
        // مقارنة كنصوص لتجنّب فشل المقارنة بسبب اختلاف النوع (string/number) بين المصدرين
        const isSelf = currentUser && String(u.id) === String(currentUser.id);
        const safeId = esc(u.id);

        let actions;
        if (isSelf) {
          actions = `<button class="user-delete-btn" disabled title="لا يمكنك تعديل حسابك الحالي">${ICON_DISABLE}</button>`;
        } else if (active) {
          actions = `<button class="user-delete-btn" data-action="disable" data-id="${safeId}" title="تعطيل المستخدم">${ICON_DISABLE}</button>`;
        } else {
          actions = `
            <button class="user-delete-btn is-reactivate" data-action="reactivate" data-id="${safeId}" title="إعادة تفعيل المستخدم">${ICON_REACTIVATE}</button>
            <button class="user-delete-btn is-danger" data-action="delete" data-id="${safeId}" title="حذف نهائي">${ICON_DELETE}</button>
          `;
        }

        return `
        <div class="user-row ${active ? '' : 'is-disabled'}" data-id="${safeId}">
          <div class="user-row-left">
            <div class="user-avatar">${esc(initials(u.name))}</div>
            <div class="user-meta">
              <span class="user-meta-name">${esc(u.name || u.username)}</span>
              <span class="user-meta-sub mono">${esc(u.username)}</span>
            </div>
          </div>
          <span class="user-role-badge ${esc(u.role)}">${esc(ROLE_LABEL[u.role] || u.role)}</span>
          ${active ? '' : '<span class="user-role-badge disabled">معطّل</span>'}
          <div class="user-actions">${actions}</div>
        </div>
      `;
      }).join('');

      usersList.querySelectorAll('.user-delete-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleUserAction(btn.dataset.action, btn.dataset.id, btn));
      });
    } catch (e) {
      usersList.innerHTML = `<div class="empty-row">تعذّر تحميل المستخدمين${e.message ? ' — ' + esc(e.message) : ''}</div>`;
    }
  }

  async function handleUserAction(action, id, btn) {
    if (action === 'disable') {
      if (!confirm('هل أنت متأكدة من تعطيل هذا المستخدم؟ لن يستطيع تسجيل الدخول بعدها.')) return;
      btn.disabled = true;
      try {
        await api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
        await refreshUsers();
      } catch (e) {
        alert(e.message || 'تعذّر تعطيل المستخدم');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'reactivate') {
      if (!confirm('هل أنت متأكدة من إعادة تفعيل هذا المستخدم؟')) return;
      btn.disabled = true;
      try {
        await api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
        await refreshUsers();
      } catch (e) {
        alert(e.message || 'تعذّر إعادة التفعيل');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'delete') {
      if (!confirm('تحذير: هذا سيحذف المستخدم نهائياً ولا يمكن التراجع عن هذا الإجراء. متأكدة؟')) return;
      btn.disabled = true;
      try {
        await api(`/api/users/${id}`, { method: 'DELETE' });
        await refreshUsers();
      } catch (e) {
        alert(e.message || 'تعذّر حذف المستخدم نهائياً');
        btn.disabled = false;
      }
    }
  }

  if (addUserForm) {
    addUserForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      addUserError.classList.add('hidden');
      addUserBtn.disabled = true;
      addUserBtn.textContent = 'جارٍ الإضافة…';
      try {
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: $('nu-name').value,
            username: $('nu-username').value,
            password: $('nu-password').value,
            role: $('nu-role').value,
          }),
        });
        addUserForm.reset();
        await refreshUsers();
      } catch (e) {
        addUserError.textContent = e.message || 'تعذّر إضافة المستخدم';
        addUserError.classList.remove('hidden');
      } finally {
        addUserBtn.disabled = false;
        addUserBtn.textContent = 'إضافة المستخدم';
      }
    });
  }

  // ---------------- WebSocket (تحديث فوري بدل الاستعلام الدوري) ----------------
  async function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const data = await api('/api/auth/ws-token');
      if (!data?.token) {
        throw new Error('لم يتم الحصول على WebSocket token');
      }
      const token = data.token;
      const wsUrl = `wss://inverter-backend.duckdns.org/ws?token=${encodeURIComponent(token)}`;

      console.log('[WS] Connecting...');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (msg.type === 'device_status') {
          if (!pollingCommandId) renderPowerState(msg.data);
        } else if (msg.type === 'command_ack') {
          refreshCommands();
        }
      };

      ws.onclose = () => {
        console.log('[WS] Connection closed');
        ws = null;
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(() => { connectWS(); }, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        if (ws) ws.close();
      };
    } catch (error) {
      console.error('[WS] Failed to obtain token/connect:', error);
      ws = null;
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(() => { connectWS(); }, 3000);
    }
  }

  function disconnectWS() {
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
  }

  async function pollCommand(requestId) {
    pollingCommandId = requestId;
    renderPending();
    const start = Date.now();
    const tick = async () => {
      if (Date.now() - start > 15000) { pollingCommandId = null; busy = false; refreshStatus(); refreshCommands(); return; }
      try {
        const { command } = await api(`/api/device/command/${requestId}`);
        if (command.status === 'confirmed' || command.status === 'failed' || command.status === 'timeout') {
          pollingCommandId = null; busy = false;
          await refreshStatus(); await refreshCommands();
          return;
        }
      } catch (e) { /* keep polling */ }
      setTimeout(tick, 1200);
    };
    tick();
  }

  // ---------------- تبديل العروض (التحكم / سجل الأوامر / المستخدمون) ----------------
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const glider = document.querySelector('.tab-glider');
  function moveGlider(tab) {
    if (!glider || !tab) return;
    glider.style.width = tab.offsetWidth + 'px';
    glider.style.transform = `translateX(${tab.offsetLeft}px)`;
  }
  function activateTab(tab) {
    const view = tab.dataset.view;
    tabs.forEach(t => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('is-active', v.id === 'view-' + view);
    });
    moveGlider(tab);
    if (view === 'users') refreshUsers();
  }
  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab)));
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab.is-active');
    if (active) moveGlider(active);
  });

  powerBtn.addEventListener('click', async () => {
    if (busy || powerBtn.disabled) return;
    const wantsOn = powerBtn.classList.contains('state-off');
    const command = wantsOn ? 'ON' : 'OFF';
    busy = true;
    try {
      const result = await api('/api/device/command', { method: 'POST', body: JSON.stringify({ command }) });
      pollCommand(result.requestId);
    } catch (e) {
      busy = false;
      relayCaption.textContent = e.message || 'تعذّر إرسال الأمر';
      refreshStatus();
    }
  });

  loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'جارٍ الدخول…';
    try {
      const { user } = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('username').value, password: $('password').value }),
      });
      currentUser = user;
      enterDashboard();
    } catch (e) {
      loginError.textContent = e.code === 'INVALID_CREDENTIALS' ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : (e.message || 'تعذّر تسجيل الدخول');
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    disconnectWS();
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    $('password').value = '';
  });

  function enterDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    userChip.textContent = `${currentUser.name} · ${currentUser.role === 'admin' ? 'مدير' : 'مشغّل'}`;
    if (tabUsers) tabUsers.classList.toggle('hidden', currentUser.role !== 'admin');
    requestAnimationFrame(() => {
      const active = document.querySelector('.tab.is-active');
      if (active) moveGlider(active);
    });
    refreshStatus();
    refreshCommands();
    connectWS();
  }

  (async function init() {
    try {
      const { user } = await api('/api/auth/me');
      currentUser = user;
      enterDashboard();
    } catch (e) {
      loginScreen.classList.remove('hidden');
    }
  })();
})();
