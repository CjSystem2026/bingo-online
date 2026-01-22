const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const basicAuth = require('../config/auth');
const { escapeHTML } = require('../utils/sanitize');

// Aplicar autenticación a todas las rutas de este archivo
router.use(basicAuth);

router.get('/', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = protocol + '://' + host;

  const pendingOrders = orderService.getPendingOrders();
  const approvedOrders = orderService.getApprovedOrders();

  let html = '<html><head><title>Panel Admin Bingo</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<style>' +
    'body{font-family:sans-serif;padding:10px;background:#f4f7f6;color:#333;margin:0}' +
    '.container{max-width:1000px;margin:0 auto;width:100%;box-sizing:border-box}' +
    'h1{color:#2c3e50;font-size:1.5rem;text-align:center;margin-top:10px}' +
    'h2{color:#2c3e50;font-size:1.2rem}' +
    '.table-container{width:100%;overflow-x:auto;background:white;margin-bottom:30px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-radius:8px}' +
    'table{width:100%;border-collapse:collapse;min-width:600px}' +
    'th,td{border:1px solid #eee;padding:12px;text-align:left}' +
    'th{background-color:#4a3aff;color:white;font-size:0.9rem}' +
    'tr:nth-child(even){background-color:#f9f9f9}' +
    '.btn{padding:10px 16px;cursor:pointer;background:#4a3aff;color:white;border:none;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block;text-align:center;font-size:0.9rem;transition:opacity 0.2s}' +
    '.btn:active{opacity:0.8}' +
    '.btn-ws{background:#25D366}' +
    '.btn-approved{background:#27ae60}' +
    '.btn-reset{background:#e74c3c;width:100%;max-width:300px}' +
    '.btn-call{background:#f39c12;font-size:1.1rem;padding:15px 25px;width:100%;max-width:400px;margin:10px 0}' +
    '.btn-group{display:flex;gap:5px;flex-wrap:wrap}' +
    '.empty-row{text-align:center;color:#666;font-style:italic}' +
    '.game-controls{background:white;padding:15px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1);margin-bottom:30px;text-align:center}' +
    '.audio-controls { margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; }' +
    '.audio-btn { background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }' +
    '.audio-btn.enabled { background-color: #17a2b8; }' +
    '.audio-notice { font-size: 0.8rem; color: #d9534f; margin-top: 5px; }' +
    '@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }' +
    '@media (max-width: 600px) {' +
    '  body{padding:5px}h1{font-size:1.3rem}.game-controls{padding:10px}' +
    '  .btn-group{flex-direction:column}.btn-group .btn{width:100%}th,td{padding:8px;font-size:0.85rem}' +
    '}' +
    '</style>' +
    '<script src="/socket.io/socket.io.js"></script>' +
    '</head><body><div class="container"><h1>🎟️ Panel de Control - Bingo</h1>' +
    '<div class="game-controls">' +
    '<div id="winnerDisplay" style="display: none; background: #fff3cd; border: 2px solid #f39c12; padding: 15px; border-radius: 10px; margin-bottom: 20px; animation: pulse 2s infinite;">' +
    '<h2 style="color: #d35400; margin: 0;">🏆 ¡BINGO DETECTADO!</h2>' +
    '<p style="font-size: 1.2rem; font-weight: bold; margin: 10px 0 0 0;">Ganador: <span id="winnerPhone" style="color: #4a3aff">--</span></p>' +
    '</div>' +
    '<h2>👥 Jugadores en Partida: <span id="playerCount" style="color: #4a3aff">0</span></h2>' +
    '<div id="playerList" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">' +
    '<em style="color: #999">Esperando jugadores...</em></div>' +
    '<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">' +
    '<h2>🕹️ Control del Juego</h2>' +
    '<div style="margin-bottom: 15px;"><span style="font-size: 1.1rem;">Último número: </span>' +
    '<strong id="lastNumber" style="font-size: 2rem; color: #f39c12">--</strong></div>' +
    '<button class="btn btn-call" onclick="callNextNumber()">🔔 CANTAR SIGUIENTE NÚMERO</button>' +
    '<div class="audio-controls">' +
    '<button id="enableAudioBtn" class="audio-btn" onclick="toggleAudio()">🔇 Activar Voz Admin</button>' +
    '<p id="audioNotice" class="audio-notice">Haz clic para escuchar el número que cantas</p></div>' +
    '<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">' +
    '<h2>🔥 Jugadores cerca de Ganar</h2>' +
    '<div id="approachingMonitor" style="background: #fff9db; padding: 15px; border-radius: 10px; border: 1px solid #fab005; margin-bottom: 20px;">' +
    '<div id="approachingListAdmin" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;">' +
    '<em style="color: #999">Nadie en zona todavía...</em></div></div>' +
    '<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">' +
    '<button class="btn btn-reset" onclick="resetGame()">♻️ REINICIAR TODO EL BINGO</button>' +
    '<p style="font-size: 0.8rem; color: #666; margin-top: 10px;">(El reinicio limpia los números, las marcas y todos los pedidos)</p></div>' +
    '<h2>⏳ Pedidos Pendientes</h2><div class="table-container"><table id="pendingTable"><thead>' +
    '<tr><th>Fecha</th><th>Celular</th><th>Nombre (OCR)</th><th>Código</th><th>Acción</th></tr></thead><tbody>';

  if (pendingOrders.length === 0) {
    html += '<tr class="empty-row"><td colspan="5">No hay pedidos pendientes</td></tr>';
  } else {
    const sortedOrders = [...pendingOrders].sort((a, b) => (a.isTrial === b.isTrial) ? 0 : a.isTrial ? 1 : -1);
    sortedOrders.forEach(order => {
      let screenshotBtn = '';
      let rowStyle = '';
      let actionButtons = '';
      if (order.isTrial) {
        screenshotBtn = '<span style="color:#6c5ce7;font-weight:bold;font-size:1.1rem">🎁 PRUEBA GRATIS</span>';
        rowStyle = 'background-color: #f0f0ff; border-left: 5px solid #6c5ce7;';
        actionButtons = '<button class="btn" style="background:#6c5ce7" onclick="approve(' + order.id + ', 1, true)">✅ APROBAR PRUEBA</button>';
      } else {
        screenshotBtn = order.screenshot 
          ? '<a href="' + order.screenshot + '" target="_blank" class="btn" style="background:#6c5ce7;margin-right:5px">👁️ Ver Captura</a>' 
          : '<span style="color:#999;font-size:0.8rem;margin-right:5px">(Sin captura)</span>';
        rowStyle = 'border-left: 5px solid #27ae60;';
        actionButtons = '<button class="btn" onclick="approve(' + order.id + ', 1)">✅ 1 Cart.</button> ' +
          '<button class="btn" style="background:#27ae60" onclick="approve(' + order.id + ', 2)">✅ 2 Cart.</button> ' +
          '<button class="btn" style="background:#e67e22" onclick="approve(' + order.id + ', 3)">✅ 3 Cart.</button>';
      }
      html += '<tr id="row-pending-' + order.id + '" style="' + rowStyle + '">' +
        '<td>' + order.timestamp.toLocaleTimeString() + '</td>' +
        '<td>' + escapeHTML(order.phone) + '</td>' +
        '<td><input type="text" id="name-' + order.id + '" value="' + escapeHTML(order.playerName || '') + '" style="width:120px;padding:5px;border-radius:4px;border:1px solid #ccc"></td>' +
        '<td><input type="text" id="code-' + order.id + '" value="' + escapeHTML(order.operationCode || '') + '" style="width:100px;padding:5px;border-radius:4px;border:1px solid #ccc"></td>' +
        '<td><div style="margin-bottom:8px">' + screenshotBtn + '</div><div class="btn-group">' + actionButtons + '</div></td></tr>';
    });
  }

  html += '</tbody></table></div><h2>✅ Pedidos Aprobados (Historial)</h2>' +
    '<div class="table-container"><table id="approvedTable"><thead>' +
    '<tr><th>Celular</th><th>Nombre</th><th>Código</th><th>Link de Cartilla</th><th>Acción</th></tr></thead><tbody>';

  if (approvedOrders.size === 0) {
    html += '<tr class="empty-row"><td colspan="5">No hay pedidos aprobados aún</td></tr>';
  } else {
    approvedOrders.forEach((data, token) => {
      const playUrl = baseUrl + '/jugar?t=' + token;
      const wsText = '¡Hola! Tu pago ha sido verificado. Aquí tienes tu link para jugar al Bingo:\n\n' + playUrl;
      const wsUrl = 'https://api.whatsapp.com/send?phone=51' + data.phone + '&text=' + encodeURIComponent(wsText);
      const isTrialLabel = data.isTrial ? ' <span style="color:#6c5ce7;font-size:0.7rem">(Prueba)</span>' : '';
      html += '<tr id="row-approved-' + data.id + '">' +
        '<td>' + escapeHTML(data.phone) + isTrialLabel + '</td>' +
        '<td>' + escapeHTML(data.playerName || 'Jugador') + '</td>' +
        '<td>' + escapeHTML(data.operationCode || 'N/A') + '</td>' +
        '<td><code style="background:#eee;padding:4px;word-break:break-all">' + playUrl + '</code></td>' +
        '<td><div class="btn-group"><a href="' + wsUrl + '" target="whatsapp_web" class="btn btn-ws">💬 WhatsApp</a> ' +
        '<button onclick="copyToClipboard(\'' + playUrl + '\')" class="btn" style="background:#636e72">📋 Copiar</button> ' +
        '<a href="' + playUrl + '" target="_blank" class="btn">👁️ Ver</a></div></td></tr>';
    });
  }

  html += '</tbody></table></div></div>' +
    '<script>' +
    'const socket = io({ query: { role: "admin" } });' +
    'const baseUrl = "' + baseUrl + '";' +
    'let audioEnabled = false;' +
    'function toggleAudio() {' +
    '  audioEnabled = !audioEnabled;' +
    '  const btn = document.getElementById("enableAudioBtn");' +
    '  const notice = document.getElementById("audioNotice");' +
    '  if (audioEnabled) {' +
    '    btn.textContent = "🔊 Voz Admin Activada"; btn.classList.add("enabled"); notice.style.display = "none";' +
    '    const u = new SpeechSynthesisUtterance("Voz activada"); u.lang = "es-ES"; window.speechSynthesis.speak(u);' +
    '  } else { btn.textContent = "🔇 Activar Voz Admin"; btn.classList.remove("enabled"); notice.style.display = "block"; }' +
    '}' +
    'function getBingoLetter(n) { if(n<=15)return "B";if(n<=30)return "I";if(n<=45)return "N";if(n<=60)return "G";return "O"; }' +
    'function speak(n) { if (audioEnabled && "speechSynthesis" in window) {' +
    '  const u = new SpeechSynthesisUtterance(getBingoLetter(n) + ", " + n); u.lang = "es-ES"; u.rate = 0.9; window.speechSynthesis.speak(u);' +
    '}}' +
    'function approve(id, qty, isTrial) {' +
    '  const msg = isTrial ? "¿Deseas habilitar la PRUEBA GRATIS?" : "¿Has verificado este pago por " + (qty*5) + " soles?";' +
    '  if(!confirm(msg)) return;' +
    '  const playerName = document.getElementById("name-" + id).value;' +
    '  const operationCode = document.getElementById("code-" + id).value;' +
    '  fetch("/api/approve-order", { method: "POST", headers: {"Content-Type": "application/json"}, ' +
    '    body: JSON.stringify({id, quantity: qty, isTrial, playerName, operationCode})' +
    '  });' +
    '}' +
    'function copyToClipboard(t) { navigator.clipboard.writeText(t).then(() => alert("¡Link copiado!")); }' +
    'function callNextNumber() { socket.emit("admin:call_number"); }' +
    'function resetGame() { if(confirm("¿Reiniciar todo?")) socket.emit("admin:reset_game"); }' +
    'socket.on("bingo:new_number", (n) => { document.getElementById("lastNumber").innerText = n; speak(n); });' +
    'socket.on("bingo:winner", (d) => { const ph = typeof d === "object" ? d.phone : d;' +
    '  document.getElementById("winnerPhone").innerText = ph; document.getElementById("winnerDisplay").style.display = "block";' +
    '  alert("🏆 ¡BINGO! " + ph);' +
    '});' +
    'socket.on("bingo:reset", () => { location.reload(); });' +
    'socket.on("admin:player_list", (players) => {' +
    '  document.getElementById("playerCount").innerText = players.length;' +
    '  const list = document.getElementById("playerList"); list.innerHTML = "";' +
    '  players.forEach(p => { const s = document.createElement("span"); s.style = "background: #e9f5ff; padding: 5px 10px; border-radius: 20px; font-size: 0.9rem; border: 1px solid #4a3aff; color: #4a3aff; font-weight: bold;";' +
    '    s.innerText = "📱 " + p.phone; list.appendChild(s);' +
    '  });' +
    '});' +
    'socket.on("bingo:approaching", (l) => {' +
    '  const list = document.getElementById("approachingListAdmin"); if(!list) return;' +
    '  if(l.length===0){ list.innerHTML = "<em style=\'color:#999\'>Nadie en zona...</em>"; return; }' +
    '  list.innerHTML = ""; l.forEach(p => { const s = document.createElement("span");' +
    '    s.style = "background: white; padding: 5px 10px; border-radius: 20px; font-size: 0.9rem; border: 1px solid #fab005; font-weight: bold; color: #e67e22;";' +
    '    if(p.missing===1){ s.style.background="#ffec99"; s.innerText="🔥 "+p.phone+" (FALTA 1)"; } else { s.innerText="⭐ "+p.phone+" (Falta 2)"; }' +
    '    list.appendChild(s);' +
    '  });' +
    '});' +
    'socket.on("admin:new_order", (o) => {' +
    '  const tbody = document.querySelector("#pendingTable tbody"); if(!tbody) return;' +
    '  const empty = tbody.querySelector(".empty-row"); if(empty) empty.remove();' +
    '  let btnImg = ""; let style = ""; let btns = "";' +
    '  if(o.isTrial){ btnImg = "🎁 PRUEBA"; style = "background:#f0f0ff;border-left:5px solid #6c5ce7"; btns = "<button class=\'btn\' style=\'background:#6c5ce7\' onclick=\'approve("+o.id+",1,true)\'>✅ APROBAR</button>"; }' +
    '  else { btnImg = o.screenshot ? "<a href=\'"+o.screenshot+"\' target=\'_blank\' class=\'btn\' style=\'background:#6c5ce7\'>👁️ Ver</a>" : "(Sin foto)";' +
    '    style = "border-left:5px solid #27ae60"; btns = "<button class=\'btn\' onclick=\'approve("+o.id+",1)\'>1</button> <button class=\'btn\' style=\'background:#27ae60\' onclick=\'approve("+o.id+",2)\'>2</button>"; }' +
    '  const r = document.createElement("tr"); r.id = "row-pending-"+o.id; r.style = style;' +
    '  r.innerHTML = "<td>"+o.timeStr+"</td><td>"+o.phone+"</td>" + ' +
    '    "<td><input type=\'text\' id=\'name-"+o.id+"\' value=\'"+(o.playerName||"")+"\' style=\'width:120px;padding:5px\'></td>" + ' +
    '    "<td><input type=\'text\' id=\'code-"+o.id+"\' value=\'"+(o.operationCode||"")+"\' style=\'width:100px;padding:5px\'></td>" + ' +
    '    "<td><div style=\'margin-bottom:8px\'>"+btnImg+"</div><div class=\'btn-group\'>"+btns+"</div></td>";' +
    '  if(!o.isTrial) tbody.prepend(r); else tbody.appendChild(r);' +
    '});' +
    'socket.on("admin:order_approved", (d) => { const r = document.getElementById("row-pending-"+d.id); if(r) r.remove(); });' +
    '</script></body></html>';
  res.send(html);
});

module.exports = router;
