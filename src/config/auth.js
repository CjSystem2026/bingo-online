/**
 * Middleware de Autenticación Básica.
 * Configura las credenciales del administrador aquí.
 */
const AUTH_USER = 'admin';
const AUTH_PASS = 'bingo2026';

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Bingo"');
    return res.status(401).send('Se requiere autenticación para acceder al panel.');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (user === AUTH_USER && pass === AUTH_PASS) {
    return next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Bingo"');
    return res.status(401).send('Credenciales incorrectas.');
  }
}

module.exports = basicAuth;
