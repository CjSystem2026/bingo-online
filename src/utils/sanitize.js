/**
 * Utilidad para sanitizar strings y prevenir XSS.
 * Escapa caracteres HTML especiales usando códigos de caracteres para evitar problemas de auto-formateo.
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '\x26amp;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26#039;');
}

module.exports = { escapeHTML };
