const { escapeHTML, sanitizeInput } = require('./sanitize'); // Importamos la función existente
// La nueva función sanitizeInput aún no existe, por eso esta prueba fallará inicialmente

describe('Sanitize Utilities', () => {
  test('escapeHTML should correctly escape HTML characters', () => {
    expect(escapeHTML('<p>Hello & World</p>')).toBe('\x26lt;p\x26gt;Hello \x26amp; World\x26lt;/p\x26gt;');
    expect(escapeHTML('"quoted"')).toBe('\x26quot;quoted\x26quot;');
    expect(escapeHTML("'single quoted'")).toBe('\x26#039;single quoted\x26#039;');
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
    expect(escapeHTML('')).toBe('');
  });

  // Esta prueba fallará porque sanitizeInput aún no existe
  test('sanitizeInput should trim whitespace and then escape HTML characters', () => {
    // Simulamos un escenario donde recibimos una entrada de usuario con espacios y HTML
    const input = '  <script>alert("xss")</script>  ';
    // Esperamos que la función recorte los espacios y escape el HTML
    // NOTA: Esta prueba *fallará* al principio porque sanitizeInput no está implementada
    // Y si estuviera implementada mal, también fallaría.
    expect(sanitizeInput(input)).toBe('\x26lt;script\x26gt;alert(\x26quot;xss\x26quot;)\x26lt;/script\x26gt;');
  });
});
