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
  const baseUrl = `${protocol}://${host}`;

  const pendingOrders = orderService.getPendingOrders();
  const approvedOrders = orderService.getApprovedOrders();

  let html = `
    <html>
    <head>
      <title>Panel Admin Bingo</title>
      <style>
        body{font-family:sans-serif;padding:20px;background:#f4f7f6;color:#333}
        .container{max-width:1000px;margin:0 auto}
        h1, h2{color:#2c3e50}
        table{width:100%;border-collapse:collapse;background:white;margin-bottom:30px;box-shadow:0 2px 5px rgba(0,0,0,0.1)}
        th,td{border:1px solid #ddd;padding:12px;text-align:left}
        th{background-color:#4a3aff;color:white}
        tr:nth-child(even){background-color:#f9f9f9}
        .btn{padding:8px 16px;cursor:pointer;background:#4a3aff;color:white;border:none;border-radius:4px;font-weight:600;text-decoration:none;display:inline-block}
        .btn-ws{background:#25D366}
        .btn-approved{background:#27ae60}
        .btn-reset{background:#e74c3c}
        .btn-call{background:#f39c12;font-size:1.2rem;padding:15px 30px}
        .empty-row{text-align:center;color:#666;font-style:italic}
        .game-controls{background:white;padding:20px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1);margin-bottom:30px;text-align:center}
        .audio-controls { margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; }
        .audio-btn { background-color: #6c757d; color: white; padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; }
        .audio-btn.enabled { background-color: #17a2b8; }
        .audio-notice { font-size: 0.8rem; color: #d9534f; margin-top: 5px; }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
      </style>
      <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
      <div class="container">
        <h1>🎟️ Panel de Control - Bingo</h1>

        <div class="game-controls">
          <div id="winnerDisplay" style="display: none; background: #fff3cd; border: 2px solid #f39c12; padding: 15px; border-radius: 10px; margin-bottom: 20px; animation: pulse 2s infinite;">
            <h2 style="color: #d35400; margin: 0;">🏆 ¡BINGO DETECTADO!</h2>
            <p style="font-size: 1.2rem; font-weight: bold; margin: 10px 0 0 0;">Ganador: <span id="winnerPhone" style="color: #4a3aff">--</span></p>
          </div>

          <h2>👥 Jugadores en Partida: <span id="playerCount" style="color: #4a3aff">0</span></h2>
          <div id="playerList" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
            <em style="color: #999">Esperando jugadores...</em>
          </div>
          
          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
          
          <h2>🕹️ Control del Juego</h2>
          <div style="margin-bottom: 15px;">
            <span style="font-size: 1.1rem;">Último número: </span>
            <strong id="lastNumber" style="font-size: 2rem; color: #f39c12">--</strong>
          </div>
          <button class="btn btn-call" onclick="callNextNumber()">🔔 CANTAR SIGUIENTE NÚMERO</button>
          
          <div class="audio-controls">
            <button id="enableAudioBtn" class="audio-btn" onclick="toggleAudio()">🔇 Activar Voz Admin</button>
            <p id="audioNotice" class="audio-notice">Haz clic para escuchar el número que cantas</p>
          </div>

          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
          
          <h2>🔥 Jugadores cerca de Ganar</h2>
          <div id="approachingMonitor" style="background: #fff9db; padding: 15px; border-radius: 10px; border: 1px solid #fab005; margin-bottom: 20px;">
            <div id="approachingListAdmin" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;">
              <em style="color: #999">Nadie en zona todavía...</em>
            </div>
          </div>

          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
          <button class="btn btn-reset" onclick="resetGame()">♻️ REINICIAR TODO EL BINGO</button>
          <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">(El reinicio limpia los números, las marcas y todos los pedidos)</p>
        </div>
        
        <h2>⏳ Pedidos Pendientes</h2>
        <table id="pendingTable">
          <thead>
            <tr><th>Fecha</th><th>Celular</th><th>Acción</th></tr>
          </thead>
          <tbody>
  `;

  if (pendingOrders.length === 0) {
    html += `<tr class="empty-row"><td colspan="4">No hay pedidos pendientes</td></tr>`;
  } else {
    pendingOrders.forEach(order => {
      const screenshotBtn = order.screenshot 
        ? `<a href="${order.screenshot}" target="_blank" class="btn" style="background:#6c5ce7;margin-right:5px">👁️ Ver Captura</a>` 
        : '<span style="color:#999;font-size:0.8rem;margin-right:5px">(Sin captura)</span>';

      html += `
        <tr id="row-pending-${order.id}">
          <td>${order.timestamp.toLocaleTimeString()}</td>
          <td>${escapeHTML(order.phone)}</td>
          <td>
            ${screenshotBtn}
            <div style="display:flex;gap:5px">
              <button class="btn" onclick="approve(${order.id}, 1)">✅ 1 Cart.</button>
              <button class="btn" style="background:#27ae60" onclick="approve(${order.id}, 2)">✅✅ 2 Cart. (S/10)</button>
              <button class="btn" style="background:#e67e22" onclick="approve(${order.id}, 3)">✅✅✅ 3 Cart. (S/15)</button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  html += `
          </tbody>
        </table>

        <h2>✅ Pedidos Aprobados (Historial)</h2>
        <table id="approvedTable">
          <thead>
            <tr><th>Celular</th><th>Link de Cartilla</th><th>Acción</th></tr>
          </thead>
          <tbody>
  `;

  if (approvedOrders.size === 0) {
    html += `<tr class="empty-row"><td colspan="3">No hay pedidos aprobados aún</td></tr>`;
  } else {
    approvedOrders.forEach((data, token) => {
      const playUrl = `${baseUrl}/jugar?t=${token}`;
      const wsText = `¡Hola! Tu pago ha sido verificado. Aquí tienes tu link para jugar al Bingo:\n\n${playUrl}`;
      const wsUrl = `https://api.whatsapp.com/send?phone=51${data.phone}&text=${encodeURIComponent(wsText)}`;

      html += `
        <tr id="row-approved-${data.id}">
          <td>${escapeHTML(data.phone)}</td>
          <td><code style="background:#eee;padding:4px">${playUrl}</code></td>
          <td>
            <a href="${wsUrl}" target="whatsapp_web" class="btn btn-ws">💬 WhatsApp</a>
            <button onclick="copyToClipboard('${playUrl}')" class="btn" style="background:#636e72">📋 Copiar</button>
            <a href="${playUrl}" target="_blank" class="btn">👁️ Ver</a>
          </td>
        </tr>
      `;
    });
  }

  html += `
          </tbody>
        </table>
      </div>

      <script>
        const socket = io({
          query: { role: 'admin' }
        });
        const baseUrl = "${baseUrl}";
        let audioEnabled = false;

        function toggleAudio() {
          audioEnabled = !audioEnabled;
          const btn = document.getElementById('enableAudioBtn');
          const notice = document.getElementById('audioNotice');
          if (audioEnabled) {
            btn.textContent = '🔊 Voz Admin Activada';
            btn.classList.add('enabled');
            notice.style.display = 'none';
            speakTest();
          } else {
            btn.textContent = '🔇 Activar Voz Admin';
            btn.classList.remove('enabled');
            notice.style.display = 'block';
          }
        }

        function speakTest() {
          const utterance = new SpeechSynthesisUtterance('Voz activada');
          utterance.lang = 'es-ES';
          window.speechSynthesis.speak(utterance);
        }

        function getBingoLetter(num) {
          if (num <= 15) return 'B';
          if (num <= 30) return 'I';
          if (num <= 45) return 'N';
          if (num <= 60) return 'G';
          return 'O';
        }

        function speak(number) {
          if (audioEnabled && 'speechSynthesis' in window) {
            const letter = getBingoLetter(number);
            const text = letter + ", " + number;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
          }
        }

        function approve(id, quantity = 1) {
          if(!confirm('¿Has verificado este pago en tu Yape/Plin por ' + (quantity * 5) + ' soles?')) return;
          fetch('/api/approve-order', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, quantity})
          });
        }

        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            alert('¡Link copiado al portapapeles!');
          });
        }

        function callNextNumber() {
          socket.emit('admin:call_number');
        }

        function resetGame() {
          if(!confirm('¿Estás seguro de reiniciar el Bingo? Se borrarán todos los números, marcas y pedidos.')) return;
          socket.emit('admin:reset_game');
        }

        socket.on('bingo:new_number', (num) => {
          const lastNumEl = document.getElementById('lastNumber');
          if (lastNumEl) lastNumEl.innerText = num;
          speak(num);
        });

        socket.on('bingo:winner', (data) => {
          const winnerDisplay = document.getElementById('winnerDisplay');
          const winnerPhoneEl = document.getElementById('winnerPhone');
          const winnerPhone = typeof data === 'object' ? data.phone : data;
          
          if (winnerDisplay && winnerPhoneEl) {
            winnerPhoneEl.innerText = winnerPhone;
            winnerDisplay.style.display = 'block';
          }
          
          alert('🏆 ¡BINGO! El jugador con celular ' + winnerPhone + ' ha ganado.');
        });

        socket.on('bingo:reset', () => {
          const lastNumEl = document.getElementById('lastNumber');
          if (lastNumEl) lastNumEl.innerText = '--';
          
          // Limpiar aviso de ganador
          const winnerDisplay = document.getElementById('winnerDisplay');
          if (winnerDisplay) winnerDisplay.style.display = 'none';

          // Limpiar monitor de aproximación
          const approachingEl = document.getElementById('approachingListAdmin');
          if (approachingEl) approachingEl.innerHTML = '<em style="color: #999">Nadie en zona todavía...</em>';

          // Limpiar tablas de pedidos
          const pendingTbody = document.querySelector('#pendingTable tbody');
          if (pendingTbody) pendingTbody.innerHTML = '<tr class="empty-row"><td colspan="4">No hay pedidos pendientes</td></tr>';
          
          const approvedTbody = document.querySelector('#approvedTable tbody');
          if (approvedTbody) approvedTbody.innerHTML = '<tr class="empty-row"><td colspan="3">No hay pedidos aprobados aún</td></tr>';
          
          alert('¡El juego y los pedidos han sido reiniciados exitosamente!');
        });

        socket.on('admin:player_list', (players) => {
          const countEl = document.getElementById('playerCount');
          const listEl = document.getElementById('playerList');
          if (countEl) countEl.innerText = players.length;
          if (listEl) {
            listEl.innerHTML = '';
            players.forEach(p => {
              const span = document.createElement('span');
              span.style = 'background: #e9f5ff; padding: 5px 10px; border-radius: 20px; font-size: 0.9rem; border: 1px solid #4a3aff; color: #4a3aff; font-weight: bold;';
              span.innerText = '📱 ' + p.phone;
              listEl.appendChild(span);
            });
            if (players.length === 0) {
              listEl.innerHTML = '<em style="color: #999">Esperando jugadores...</em>';
            }
          }
        });

        socket.on('bingo:approaching', (list) => {
          const listEl = document.getElementById('approachingListAdmin');
          if (!listEl) return;

          if (list.length === 0) {
            listEl.innerHTML = '<em style="color: #999">Nadie en zona todavía...</em>';
            return;
          }

          listEl.innerHTML = '';
          list.forEach(p => {
            const span = document.createElement('span');
            span.style = 'background: white; padding: 5px 10px; border-radius: 20px; font-size: 0.9rem; border: 1px solid #fab005; font-weight: bold; color: #e67e22;';
            if (p.missing === 1) {
              span.style.background = '#ffec99';
              span.style.boxShadow = '0 0 10px rgba(230, 126, 34, 0.5)';
              span.innerText = '🔥 ' + p.phone + ' (FALTA 1)';
            } else {
              span.innerText = '⭐ ' + p.phone + ' (Falta 2)';
            }
            listEl.appendChild(span);
          });
        });

        socket.on('admin:new_order', (order) => {
          const tbody = document.querySelector('#pendingTable tbody');
          if (!tbody) return;
          const emptyRow = tbody.querySelector('.empty-row');
          if (emptyRow) emptyRow.remove();

          const screenshotBtn = order.screenshot 
            ? '<a href="' + order.screenshot + '" target="_blank" class="btn" style="background:#6c5ce7;margin-right:5px">👁️ Ver Captura</a>' 
            : '<span style="color:#999;font-size:0.8rem;margin-right:5px">(Sin captura)</span>';

          const row = document.createElement('tr');
          row.id = 'row-pending-' + order.id;
          row.innerHTML = \`
            <td>\${order.timeStr}</td>
            <td>\${order.phone}</td>
            <td>
              \${screenshotBtn}
              <div style="display:flex;gap:5px">
                <button class="btn" onclick="approve(\${order.id}, 1)">✅ 1 Cart.</button>
                <button class="btn" style="background:#27ae60" onclick="approve(\${order.id}, 2)">✅✅ 2 Cart. (S/10)</button>
                <button class="btn" style="background:#e67e22" onclick="approve(\${order.id}, 3)">✅✅✅ 3 Cart. (S/15)</button>
              </div>
            </td>
          \`;
          tbody.prepend(row);
        });

        socket.on('admin:order_approved', (data) => {
          const pendingRow = document.getElementById('row-pending-' + data.id);
          if (pendingRow) pendingRow.remove();
          
          const pendingTbody = document.querySelector('#pendingTable tbody');
          if (pendingTbody && pendingTbody.children.length === 0) {
            pendingTbody.innerHTML = '<tr class="empty-row"><td colspan="4">No hay pedidos pendientes</td></tr>';
          }

          const approvedTbody = document.querySelector('#approvedTable tbody');
          if (!approvedTbody) return;
          const emptyApproved = approvedTbody.querySelector('.empty-row');
          if (emptyApproved) emptyApproved.remove();

          const playUrl = baseUrl + '/jugar?t=' + data.token;
          const wsText = "¡Hola! Tu pago ha sido verificado. Aquí tienes tu link para jugar al Bingo:\\n\\n" + playUrl;
          const wsUrl = "https://api.whatsapp.com/send?phone=51" + data.phone + "&text=" + encodeURIComponent(wsText);

          const row = document.createElement('tr');
          row.id = 'row-approved-' + data.id;
          row.innerHTML = \`
            <td>\${data.phone}</td>
            <td><code style="background:#eee;padding:4px">\${playUrl}</code></td>
            <td>
              <a href="\${wsUrl}" target="whatsapp_web" class="btn btn-ws">💬 WhatsApp</a>
              <button onclick="copyToClipboard('\${playUrl}')" class="btn" style="background:#636e72">📋 Copiar</button>
              <a href="\${playUrl}" target="_blank" class="btn">👁️ Ver</a>
            </td>
          \`;
          approvedTbody.prepend(row);
        });
      </script>
    </body></html>
  `;
  res.send(html);
});

module.exports = router;
