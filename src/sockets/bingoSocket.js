const bingoService = require('../services/bingoService');
const orderService = require('../services/orderService');
const { clearAllHashes } = require('../utils/hashStore');

// Almacén de intervalos para el modo demo automático de usuarios trial
const trialIntervals = new Map();

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

      // Enviamos información del jugador (Nombre)
      socket.emit('bingo:player_info', { name: order.playerName || 'Jugador' });

      // Enviamos el arreglo de cartillas (solo las matrices de números)
      const cardsOnly = userData.cards.map(c => c.card);
      socket.emit('bingo:your_cards', cardsOnly);
      socket.emit('bingo:initial_numbers', gameState.calledNumbers);
      emitBingoStats(io); // Sincronizar estadísticas con todos

      // Iniciar Autoplay si es usuario de prueba y no hay juego activo
      // VALIDACIÓN: Solo si el modo trial está habilitado globalmente
      if (isTrialUser && bingoService.trialEnabled && gameState.gameActive && !gameState.winner && gameState.calledNumbers.length === 0) {
        startTrialAutoPlay(socket, io, userData);
      }
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

    // Eventos de control de Trial y Bots
    socket.on('admin:toggle_trial', (enabled) => {
      if (isAdmin) {
        bingoService.setTrialEnabled(enabled);
        if (!enabled) {
          stopAllTrialAutoplays();
        }
        io.emit('admin:trial_status', enabled);
      }
    });

    socket.on('admin:spawn_bots', (count) => {
      if (isAdmin) {
        bingoService.addBots(count || 20);
        io.emit('admin:player_list', bingoService.getPlayers());
      }
    });

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
      io.emit('admin:all_cleared'); // Notificar específicamente a los admins
      emitBingoStats(io); // Resetear estadísticas a cero
    });

    socket.on('disconnect', () => {
      if (!isAdmin) {
        // Limpiar intervalo de demo si existía
        if (trialIntervals.has(socket.id)) {
          clearInterval(trialIntervals.get(socket.id));
          trialIntervals.delete(socket.id);
        }

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
  const state = bingoService.getState();
  
  // Si es el PRIMER número del juego real, limpiar las marcas de los trials
  if (state.calledNumbers.length === 0) {
    bingoService.resetTrialCards();
    // También detenemos los autoplays si aún hay alguno
    stopAllTrialAutoplays();
  }

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

    if (result.winners && result.winners.length > 0) {
      // Soporte multi-ganador: enviamos el array completo
      io.emit('bingo:winner', { 
        id: result.winners[0].id, 
        phone: result.winners[0].phone,
        allWinners: result.winners 
      });
    } else if (result.trialWinners && result.trialWinners.length > 0) {
      // Notificar a los ganadores de prueba de forma privada (opcionalmente)
      // O al menos asegurarnos de que el payload sea correcto
      result.trialWinners.forEach(tw => {
        io.to(tw.id).emit('bingo:trial_winner', tw);
      });
    }
  } else {
    const state = bingoService.getState();
    if (!state.gameActive && !state.winner) {
        io.emit('bingo:game_over', '¡Juego terminado!');
    }
  }
}

/**
 * Inicia un bucle automático de números cantados solo para un usuario de prueba.
 * Esto le permite experimentar el juego de inmediato aunque no haya partida real.
 */
function startTrialAutoPlay(socket, io, userData) {
  console.log(`[BINGO-DEMO] Iniciando autoplay para trial: ${socket.id}`);
  
  // Lista de números que están en sus cartillas para asegurar que gane en la demo
  const numbersInCards = new Set();
  userData.cards.forEach(c => {
    c.card.forEach(row => {
      row.forEach(num => {
        if (typeof num === 'number') numbersInCards.add(num);
      });
    });
  });

  const availableTrialNumbers = Array.from(numbersInCards);
  // Desordenar para que no sea predecible
  availableTrialNumbers.sort(() => Math.random() - 0.5);

  const interval = setInterval(() => {
    if (availableTrialNumbers.length === 0) {
      clearInterval(interval);
      trialIntervals.delete(socket.id);
      return;
    }

    const nextNum = availableTrialNumbers.pop();
    
    // Simular que el servidor canta el número solo para este socket
    socket.emit('bingo:new_number', nextNum);

    // Actualizar marcas en la memoria del trial (para que el servidor sepa si ganó)
    userData.cards.forEach(cardSet => {
      const { card, marked } = cardSet;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (card[r][c] === nextNum) marked[r][c] = true;
        }
      }
      
      // Verificar si ganó en su demo
      if (bingoService.checkBingo(cardSet, socket.id)) {
        socket.emit('bingo:trial_winner', { id: socket.id, phone: userData.phone });
        clearInterval(interval);
        trialIntervals.delete(socket.id);
      }
    });

  }, 4000); // Cada 4 segundos un número nuevo en la demo

  trialIntervals.set(socket.id, interval);
}

function stopAllTrialAutoplays() {
  if (trialIntervals.size > 0) {
    console.log(`[BINGO-DEMO] Deteniendo ${trialIntervals.size} autoplays por inicio de juego real.`);
    trialIntervals.forEach((interval) => clearInterval(interval));
    trialIntervals.clear();
  }
}

module.exports.emitBingoStats = emitBingoStats;
