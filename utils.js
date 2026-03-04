// ======================================
// Shared Utilities
// ======================================

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(html, keywords) {
  if (!keywords || keywords.length === 0) return html;
  keywords.forEach(kw => {
    if (!kw) return;
    const regex = new RegExp(`(${escapeRegex(kw)})`, 'gi');
    html = html.replace(regex, '<mark>$1</mark>');
  });
  return html;
}

export function shortenSource(source) {
  if (!source) return '';
  const parts = source.split('.');
  if (parts.length <= 2) return source;
  return '\u2026' + parts.slice(-2).join('.');
}

export function cleanAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '').trim();
}
