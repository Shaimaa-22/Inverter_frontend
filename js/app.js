(function(){
  const API = '';
  const WS_URL = 'wss://inverter-backend.duckdns.org/ws';
  const $ = (id) => document.getElementById(id);

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
            <span class="cmd-cmd ${c.command}">${c.command}</span>
            <span class="cmd-time">${fmtAgo(c.created_at)}</span>
          </div>
          <span class="badge ${c.status}">${CMD_LABEL[c.status] || c.status}</span>
        </div>
      `).join('');
    } catch (e) { /* silent */ }
  }

  // ---------------- WebSocket (تحديث فوري بدل الاستعلام الدوري) ----------------
  function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
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
      wsReconnectTimer = setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
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
