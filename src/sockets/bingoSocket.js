const bingoService = require('../services/bingoService');
const orderService = require('../services/orderService');
const { clearAllHashes } = require('../utils/hashStore');

function emitBingoStats(io) {
  // Solo contar cartillas que NO son de prueba para el pozo
  const approvedOrders = Array.from(orderService.getApprovedOrders().values());
  const realCards = approvedOrders.filter(o => !o.isTrial);
  
  const totalCards = realCards.length;
  const totalPrize = totalCards * 5 * 0.8;
  io.emit('bingo:stats', {
    totalCards,
    totalPrize: totalPrize.toFixed(2)
  });
}

module.exports = (io) => {
  io.on('connection', (socket) => {
    // Identificar si es administrador
    const isAdmin = socket.handshake.query.role === 'admin';
    
    // Obtener el token de la conexión
    const token = socket.handshake.query.token;
    let userPhone = null;

    // Si es administrador, no lo registramos como jugador
    if (isAdmin) {
      console.log(`[ADMIN] Administrador conectado: ${socket.id}`);
      // Sincronizar lista de jugadores actual con el nuevo admin conectado
      socket.emit('admin:player_list', bingoService.getPlayers());
    } else {
      // VALIDACIÓN: Buscar el teléfono asociado al token en orderService
      const approvedOrders = orderService.getApprovedOrders();
      const order = token ? approvedOrders.get(token) : null;

      // Si no hay token válido y no es admin, no puede jugar
      if (!order) {
        console.log(`[BINGO] Conexión rechazada: Token inválido o ausente (${socket.id})`);
        socket.emit('bingo:unauthorized', 'Tu sesión ha expirado o el juego se ha reiniciado.');
        return;
      }

      userPhone = order.phone;
      const isTrialUser = order.isTrial === true;
      let totalCardsToAssign = 1;
      
      // Buscar cuántas cartillas aprobadas tiene este número en total
      const status = orderService.checkStatus(userPhone);
      if (status.status === 'approved') {
        totalCardsToAssign = status.items.length;
      }

      // Asignar todas las cartillas que le corresponden
      let userData;
      for (let i = 0; i < totalCardsToAssign; i++) {
        userData = bingoService.addUser(socket.id, userPhone, isTrialUser);
      }
      
      const gameState = bingoService.getState();

      // Notificar a todos los admins el cambio en la lista de jugadores
      io.emit('admin:player_list', bingoService.getPlayers());

      // Enviamos el arreglo de cartillas (solo las matrices de números)
      const cardsOnly = userData.cards.map(c => c.card);
      socket.emit('bingo:your_cards', cardsOnly);
      socket.emit('bingo:initial_numbers', gameState.calledNumbers);
      emitBingoStats(io); // Sincronizar estadísticas con todos
    }

    // Escuchar reacciones rápidas
    socket.on('bingo:reaction', (reactionText) => {
      if (!isAdmin && userPhone) {
        // Enviar a todos, incluyendo el número del remitente (protegido)
        const maskedPhone = userPhone.substring(0, 3) + '***' + userPhone.substring(6);
        io.emit('bingo:reaction', { 
          text: reactionText, 
          sender: maskedPhone 
        });
      }
    });

    // Escuchar tanto de admin como de jugador
    socket.on('bingo:call_number', () => handleCallNumber(io));
    socket.on('admin:call_number', () => handleCallNumber(io));

    socket.on('admin:reset_game', async () => {
      // Limpieza TOTAL de jugadores, pedidos e historial de imágenes
      bingoService.resetGame(true); 
      orderService.clearAllOrders();
      
      try {
        await clearAllHashes();
        console.log("[ADMIN] Base de datos de imágenes de pago limpiada.");
      } catch (err) {
        console.error("Error al limpiar hashes:", err);
      }
      
      // Notificar a los admins que la lista ahora está vacía
      io.emit('admin:player_list', []);
      
      console.log("[ADMIN] Juego reiniciado. Lista de jugadores y pedidos vaciada totalmente.");
      io.emit('bingo:reset');
      emitBingoStats(io); // Resetear estadísticas a cero
    });

    socket.on('disconnect', () => {
      if (!isAdmin) {
        bingoService.removeUser(socket.id);
        // Notificar a todos los admins el cambio en la lista de jugadores
        io.emit('admin:player_list', bingoService.getPlayers());
      } else {
        console.log(`[ADMIN] Administrador desconectado: ${socket.id}`);
      }
    });
  });
};

function handleCallNumber(io) {
  const result = bingoService.callNewNumber();
  if (result) {
    io.emit('bingo:new_number', result.number);
    
    // Calcular y enviar jugadores a punto de ganar
    const approaching = bingoService.getApproachingWinners();
    
    // Para jugadores: números enmascarados
    const maskedApproaching = approaching.map(p => ({
      phone: p.phone.substring(0, 3) + '***' + p.phone.substring(6),
      missing: p.missing,
      isTrial: p.isTrial
    }));
    io.emit('bingo:approaching', maskedApproaching);

    if (result.winner) {
      io.emit('bingo:winner', result.winner);
    } else if (result.trialWinner) {
      // Notificar al ganador de prueba (esto no detiene el juego real)
      io.emit('bingo:trial_winner', result.trialWinner);
    }
  } else {
    const state = bingoService.getState();
    if (!state.gameActive && !state.winner) {
        io.emit('bingo:game_over', '¡Juego terminado!');
    }
  }
}

module.exports.emitBingoStats = emitBingoStats;
