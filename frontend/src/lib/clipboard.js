/**
 * 统一的复制到剪贴板工具
 * - 优先使用 navigator.clipboard.writeText (需要 https/localhost + 文档聚焦)
 * - 在非安全上下文 (http) 下 navigator.clipboard 为 undefined，降级到 document.execCommand
 * - 调用前尝试 focus 主窗口，避免 iframe 取焦点导致 Clipboard API 拒绝
 *
 * @param {string} text
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  if (text == null) return false;
  const value = String(text);

  try { if (typeof window !== 'undefined' && window.focus) window.focus(); } catch {}

  // 优先 Clipboard API
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 主文档失焦 / 权限被拒，继续走兜底
  }

  // 降级：execCommand
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
