const bingoService = require('../services/bingoService');
const orderService = require('../services/orderService');

function emitBingoStats(io) {
  const totalCards = orderService.getApprovedOrders().size;
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
      // Buscar el teléfono asociado al token en orderService
      let totalCardsToAssign = 1;
      if (token) {
        const approvedOrders = orderService.getApprovedOrders();
        const order = approvedOrders.get(token);
        if (order) {
          userPhone = order.phone;
          // Buscar cuántas cartillas aprobadas tiene este número
          const status = orderService.checkStatus(userPhone);
          if (status.status === 'approved') {
            totalCardsToAssign = status.items.length;
          }
        }
      }

      // Asignar todas las cartillas que le corresponden
      let userData;
      for (let i = 0; i < totalCardsToAssign; i++) {
        userData = bingoService.addUser(socket.id, userPhone);
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

    // Escuchar tanto de admin como de jugador
    socket.on('bingo:call_number', () => handleCallNumber(io));
    socket.on('admin:call_number', () => handleCallNumber(io));

    socket.on('admin:reset_game', () => {
      // Limpieza TOTAL de jugadores y pedidos
      bingoService.resetGame(true); 
      orderService.clearAllOrders();
      
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
    if (result.winner) {
      io.emit('bingo:winner', result.winner);
    }
  } else {
    const state = bingoService.getState();
    if (!state.gameActive && !state.winner) {
        io.emit('bingo:game_over', '¡Juego terminado!');
    }
  }
}

module.exports.emitBingoStats = emitBingoStats;
