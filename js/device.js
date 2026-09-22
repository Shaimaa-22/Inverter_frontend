import { $, fmtUptime, fmtAgo, showToast } from './ui.js';
import { formatError } from './api.js';

export function createDeviceController(api, refreshCommands) {
  const button=$('power-btn'), caption=$('relay-caption'); let busy=false, requestId=null;
  function render(device){
    button.classList.remove('state-on','state-off','state-offline','state-pending');
    const online=Boolean(device?.esp_online); $('heartbeat-ring').classList.toggle('offline',!online);
    $('conn-dot').className=`dot ${online?'on':'off'} ${online?'pulse':''}`; $('conn-text').textContent=online?'متصل':'غير متصل';
    button.disabled=!online||busy;
    if(!online){button.classList.add('state-offline');$('state-label').textContent='غير متصل';$('state-sub').textContent='ESP32 offline';return;}
    const on=device.relay_state==='ON';
    const inverterState=!device.inverter_state||device.inverter_state==='UNKNOWN'?'حالة الإنفرتر غير معروفة':device.inverter_state;
    button.classList.add(on?'state-on':'state-off');$('state-label').textContent=on?'شغّال':'مطفي';$('state-sub').textContent=inverterState;
    if(!busy)caption.textContent='اضغط للتشغيل أو الإطفاء — يتم تأكيد الأمر فعليًا من الجهاز قبل تغيير الحالة';
    $('stat-rssi').textContent=device.wifi_rssi!=null?`${device.wifi_rssi} dBm`:'—';$('stat-uptime').textContent=fmtUptime(device.uptime_seconds);$('stat-fw').textContent=device.firmware_version||'—';$('stat-lastseen').textContent=fmtAgo(device.last_seen);
    $('fault-banner').classList.toggle('hidden',!device.fault_code);$('fault-text').textContent=device.fault_code?`خطأ بالجهاز: ${device.fault_code}`:'';
  }
  async function refresh(){try{const {device}=await api('/api/device/status');if(!requestId)render(device);}catch(_){$('conn-text').textContent='خطأ اتصال';}}
  async function poll(id){
    requestId=id; const started=Date.now();
    while(requestId===id && Date.now()-started<16000){
      try{const {command}=await api(`/api/device/command/${id}`);if(['confirmed','failed','timeout'].includes(command.status)){
        requestId=null;busy=false;
        if(command.status==='confirmed')showToast('success','تم تنفيذ الأمر بنجاح',command.command==='ON'?'تم تشغيل الإنفرتر.':'تم إطفاء الإنفرتر.');
        else showToast('error',command.status==='timeout'?'انتهت مهلة الأمر':'فشل تنفيذ الأمر',command.error_message||'لم يؤكد الجهاز تنفيذ الأمر.');
        await refresh();await refreshCommands();return;
      }}catch(_){} await new Promise(resolve=>setTimeout(resolve,1200));
    }
    if(requestId===id){requestId=null;busy=false;showToast('error','انتهت مهلة الانتظار','لم تصل نتيجة نهائية من الجهاز.');await refresh();await refreshCommands();}
  }
  button.addEventListener('click',async()=>{
    if(busy||button.disabled)return;const command=button.classList.contains('state-off')?'ON':'OFF';busy=true;button.disabled=true;button.classList.add('state-pending');$('state-sub').textContent='جاري التنفيذ…';caption.textContent='تم إرسال الطلب، بانتظار تأكيد الجهاز…';
    try{const result=await api('/api/device/command',{method:'POST',body:JSON.stringify({command})});poll(result.requestId);}
    catch(error){busy=false;showToast('error','تعذر إرسال الأمر',formatError(error));caption.textContent=formatError(error);await refresh();}
  });
  return {refresh,render,isPolling:()=>Boolean(requestId)};
}
