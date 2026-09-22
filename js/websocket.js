export function createWebSocket(api, handlers) {
  let socket = null, timer = null, stopped = false;
  async function connect() {
    if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    try {
      const {token} = await api('/api/auth/ws-token');
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = location.hostname.endsWith('.vercel.app')
        ? 'inverter-backend.duckdns.org'
        : location.host;
      socket = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`);
      socket.onopen = handlers.open;
      socket.onmessage = event => { try { handlers.message?.(JSON.parse(event.data)); } catch (_) {} };
      socket.onclose = () => { socket=null; if(!stopped) timer=setTimeout(connect,3000); handlers.close?.(); };
      socket.onerror = () => socket?.close();
    } catch (_) { if(!stopped) timer=setTimeout(connect,3000); }
  }
  function start(){stopped=false;connect();}
  function stop(){stopped=true;clearTimeout(timer);if(socket){socket.onclose=null;socket.close();socket=null;}}
  return {start,stop};
}
