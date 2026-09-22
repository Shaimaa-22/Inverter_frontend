const FIELD_LABELS = { name:'الاسم', username:'اسم المستخدم', password:'كلمة المرور', role:'الصلاحية', isActive:'حالة التفعيل' };

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const error = new Error(body?.error?.message || 'حدث خطأ غير متوقع');
    error.code = body?.error?.code;
    error.status = res.status;
    error.details = body?.error?.details;
    throw error;
  }
  return body?.data;
}

export function formatError(error) {
  if (error?.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
    return error.details.map(issue => `${FIELD_LABELS[issue.path?.[0]] || issue.path?.[0] || 'الحقل'}: ${issue.message}`).join(' — ');
  }
  const messages = {
    DEVICE_OFFLINE:'الجهاز غير متصل، لم يتم إرسال الأمر.',
    MQTT_OFFLINE:'الاتصال بخدمة الجهاز متوقف حاليًا.',
    COMMAND_IN_PROGRESS:'يوجد أمر آخر قيد التنفيذ.',
    MQTT_PUBLISH_FAILED:'تعذر إرسال الأمر إلى الجهاز.',
    INVALID_SESSION:'انتهت الجلسة، يرجى تسجيل الدخول مجددًا.',
    FORBIDDEN:'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  };
  return messages[error?.code] || error?.message || 'حدث خطأ غير متوقع';
}
