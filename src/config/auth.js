/**
 * Middleware de Autenticación Básica.
 * Las credenciales se configuran a través de variables de entorno.
 */

// Lee las credenciales desde las variables de entorno.
// Es crucial tener un archivo .env en desarrollo.
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'supersecretpassword';

if (process.env.AUTH_PASS === 'supersecretpassword' || !process.env.AUTH_PASS) {
  console.warn(`
  ****************************************************************
  * ADVERTENCIA DE SEGURIDAD:                                    *
  * No se ha establecido una contraseña de administrador segura. *
  * Por favor, cree un archivo .env y defina AUTH_PASS.          *
  ****************************************************************
  `);
}


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
