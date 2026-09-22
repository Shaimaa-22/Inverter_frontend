import { api } from './api.js';
import { $ } from './ui.js';
import { refreshCommands } from './logs.js';
import { createUsersController } from './users.js';
import { createDeviceController } from './device.js';
import { createWebSocket } from './websocket.js';
import { createAuth } from './auth.js';

let auth;
const refreshLogs = () => refreshCommands(api, $('cmd-list'));
const users = createUsersController(api, () => auth?.getUser());
const device = createDeviceController(api, refreshLogs);
const realtime = createWebSocket(api, {
  open: () => { $('conn-text').textContent = 'متصل لحظيًا'; },
  close: () => { $('conn-text').textContent = 'إعادة اتصال…'; },
  message: message => {
    if (message.type === 'device_status' && !device.isPolling()) device.render(message.data);
    if (message.type === 'command_ack') refreshLogs();
  },
});

const tabs = [...document.querySelectorAll('.tab')];
const glider = document.querySelector('.tab-glider');
function activateTab(tab) {
  if (!tab) return;
  tabs.forEach(item => {
    const active = item === tab;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('is-active', view.id === `view-${tab.dataset.view}`));
  if (glider) { glider.style.width = `${tab.offsetWidth}px`; glider.style.transform = `translateX(${tab.offsetLeft}px)`; }
  if (tab.dataset.view === 'users') users.refresh();
  if (tab.dataset.view === 'log') refreshLogs();
}
tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab)));
window.addEventListener('resize', () => activateTab(document.querySelector('.tab.is-active')));

auth = createAuth(api, {
  enter: () => {
    device.refresh(); refreshLogs(); realtime.start();
    requestAnimationFrame(() => activateTab(document.querySelector('.tab.is-active')));
  },
  leave: () => realtime.stop(),
});
auth.init();
