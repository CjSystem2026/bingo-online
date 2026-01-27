/**
 * BingoService - Núcleo de lógica del juego.
 * Encapsula la generación de cartillas, el control de números sacados
 * y la validación de ganadores de forma independiente del transporte (sockets/http).
 */
class BingoService {
  constructor() {
    this.bingoNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
    this.calledNumbers = [];
    this.availableNumbers = [...this.bingoNumbers];
    this.userCards = new Map(); // phone -> { cards: [{card, marked}], phone, isTrial, sockets: Set }
    this.socketToPhone = new Map(); // socketId -> phone (para desconexiones)
    this.gameActive = true;
    this.winner = null;
    this.winners = []; // Para soportar múltiples ganadores simultáneos
    this.trialEnabled = true; // Control global del modo prueba
  }

  /**
   * Genera una cartilla de Bingo 5x5 balanceada por columnas.
   * @returns {Array<Array<number|string>>} Matriz de 5x5 con valores y espacio central 'FREE'.
   */
  generateBingoCard() {
    const card = [];
    const ranges = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
    function getRandomNumbers(min, max, count) {
      const numbers = new Set();
      while (numbers.size < count) {
        numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
      }
      return Array.from(numbers).sort((a, b) => a - b);
    }
    card.push(getRandomNumbers(ranges.B[0], ranges.B[1], 5));
    card.push(getRandomNumbers(ranges.I[0], ranges.I[1], 5));
    card.push(getRandomNumbers(ranges.N[0], ranges.N[1], 5));
    card.push(getRandomNumbers(ranges.G[0], ranges.G[1], 5));
    card.push(getRandomNumbers(ranges.O[0], ranges.O[1], 5));
    card[2][2] = 'FREE';
    const transposedCard = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (__, j) => card[j][i]));
    return transposedCard;
  }

  /**
   * Asegura que un jugador tenga sus cartillas asignadas de forma persistente.
   * Si el jugador ya existe (por teléfono), se le vincula el nuevo socketId.
   * @param {string} socketId - Identificador único de la conexión.
   * @param {string} phone - Número de teléfono del jugador.
   * @param {boolean} isTrial - Indica si es un usuario de prueba.
   * @param {number} requiredCards - Cantidad de cartillas que debe tener.
   * @returns {Object} Los datos del usuario (sesión persistente).
   */
  ensureUser(socketId, phone, isTrial = false, requiredCards = 1) {
    let userData = this.userCards.get(phone);

    if (!userData) {
      // Primera vez que entra este teléfono en esta partida
      userData = {
        cards: [],
        phone: phone,
        isTrial: isTrial,
        sockets: new Set()
      };
      this.userCards.set(phone, userData);
    }

    // Vincular socket actual
    userData.sockets.add(socketId);
    this.socketToPhone.set(socketId, phone);

    // Generar solo las cartillas faltantes (Idempotencia)
    while (userData.cards.length < requiredCards) {
      const newCard = this.generateBingoCard();
      const initialMarked = Array.from({ length: 5 }, () => Array(5).fill(false));
      initialMarked[2][2] = true;

      // Sincronizar con números ya cantados
      if (this.calledNumbers.length > 0) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (this.calledNumbers.includes(newCard[r][c])) {
              initialMarked[r][c] = true;
            }
          }
        }
      }
      userData.cards.push({ card: newCard, marked: initialMarked });
      console.log(`[BINGO] Generada nueva cartilla persistente para ${phone}. Total: ${userData.cards.length}`);
    }

    return userData;
  }

  removeUser(socketId) {
    const phone = this.socketToPhone.get(socketId);
    if (phone) {
      const userData = this.userCards.get(phone);
      if (userData) {
        userData.sockets.delete(socketId);
        console.log(`[BINGO] Socket ${socketId} desvinculado de ${phone}. Sockets activos: ${userData.sockets.size}`);
      }
      this.socketToPhone.delete(socketId);
    }
  }

  /**
   * Extrae un nuevo número aleatorio y actualiza el estado de todas las cartillas activas.
   * @returns {Object|null} El número sacado y el ID del ganador (si existe), o null si el juego no permite más números.
   */
  callNewNumber() {
    if (!this.gameActive || this.availableNumbers.length === 0 || this.winners.length > 0) return null;
    const randomIndex = Math.floor(Math.random() * this.availableNumbers.length);
    const newNumber = this.availableNumbers.splice(randomIndex, 1)[0];
    this.calledNumbers.push(newNumber);

    let trialWinners = [];

    // Actualizar marcas (iteramos sobre el mapa de teléfonos)
    this.userCards.forEach((userData, phone) => {
      userData.cards.forEach((cardSet) => {
        const { card, marked } = cardSet;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card[r][c] === newNumber) marked[r][c] = true;
          }
        }
        if (this.checkBingo(cardSet, phone)) {
          if (!userData.isTrial) {
            // Juego Real: Detener el juego si hay al menos un ganador real
            this.gameActive = false;
            // Evitar duplicar el mismo usuario si gana con varias cartillas
            // Guardamos el objeto ganador. Incluimos todos los sockets para notificar a todas las pestañas.
            if (!this.winners.find(w => w.phone === phone)) {
              this.winners.push({ 
                phone: userData.phone, 
                sockets: Array.from(userData.sockets) 
              });
            }
          } else {
            trialWinners.push({ 
              phone: userData.phone, 
              isTrial: true,
              sockets: Array.from(userData.sockets)
            });
          }
        }
      });
    });

    // Retrocompatibilidad con la propiedad 'winner' (para el primer ganador)
    this.winner = this.winners.length > 0 ? this.winners[0] : null;

    return { 
      number: newNumber, 
      winner: this.winner, 
      winners: this.winners, 
      trialWinner: trialWinners.length > 0 ? trialWinners[0] : null,
      trialWinners
    };
  }

  /**
   * Verifica si una cartilla ha completado una línea horizontal o vertical (Bingo).
   * @param {Object} userCardData - Datos de la cartilla y marcas del usuario.
   * @returns {boolean} True si hay Bingo.
   */
  checkBingo(userCardData, userId = 'unknown') {
    const { card, marked } = userCardData;
    for (let r = 0; r < 5; r++) {
      let rowComplete = true;
      for (let c = 0; c < 5; c++) {
        if (card[r][c] !== 'FREE' && !marked[r][c]) {
          rowComplete = false;
          break;
        }
      }
      if (rowComplete) {
        console.log(`[BINGO] Usuario ${userId} ganó con Fila ${r + 1}:`, card[r]);
        return true;
      }
    }
    for (let c = 0; c < 5; c++) {
      let colComplete = true;
      for (let r = 0; r < 5; r++) {
        if (card[r][c] !== 'FREE' && !marked[r][c]) {
          colComplete = false;
          break;
        }
      }
      if (colComplete) {
        const colData = card.map(row => row[c]);
        console.log(`[BINGO] Usuario ${userId} ganó con Columna ${c + 1}:`, colData);
        return true;
      }
    }
    return false;
  }

  /**
   * Reinicia el estado global del juego para una nueva partida.
   * @param {boolean} clearPlayers - Si es true, borra a todos los jugadores de la memoria.
   */
  resetGame(clearPlayers = false) {
    this.calledNumbers = [];
    this.availableNumbers = [...this.bingoNumbers];
    this.gameActive = true;
    this.winner = null;
    this.winners = [];

    if (clearPlayers) {
      this.userCards.clear();
      this.socketToPhone.clear();
      console.log('[BINGO] Todos los jugadores han sido eliminados de la memoria.');
    } else {
      this.userCards.forEach(userData => {
        userData.cards.forEach(cardSet => {
          cardSet.marked = Array.from({ length: 5 }, () => Array(5).fill(false));
          cardSet.marked[2][2] = true;
        });
      });
    }

    console.log(`[BINGO] Juego reiniciado. Jugadores activos: ${this.userCards.size}`);
  }

  /**
   * Limpia las marcas de demo de todos los usuarios de prueba.
   * Se llama al iniciar el juego real.
   */
  resetTrialCards() {
    this.userCards.forEach(userData => {
      if (userData.isTrial) {
        userData.cards.forEach(cardSet => {
          // Resetear a limpio (solo FREE)
          cardSet.marked = Array.from({ length: 5 }, () => Array(5).fill(false));
          cardSet.marked[2][2] = true;
          // Si ya hay números en el juego real actual, sincronizar
          this.calledNumbers.forEach(num => {
             for (let r = 0; r < 5; r++) {
               for (let c = 0; c < 5; c++) {
                 if (cardSet.card[r][c] === num) cardSet.marked[r][c] = true;
               }
             }
          });
        });
      }
    });
    console.log('[BINGO] Cartillas de prueba reiniciadas para sincronizar con juego real.');
  }

  setTrialEnabled(enabled) {
    this.trialEnabled = enabled;
    if (!enabled) {
      // Si se desactiva, opcionalmente podrías querer limpiar los usuarios trial existentes
      // Por ahora solo los marcamos para que no puedan usar autoplay
    }
    console.log(`[BINGO] Modo prueba ${enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
  }

  /**
   * Crea usuarios virtuales (bots) para pruebas de carga.
   */
  addBots(count) {
    for (let i = 0; i < count; i++) {
      const botPhone = `BOT-${i + 1}`;
      const botSocketId = `bot-socket-${Math.random().toString(36).substring(2, 7)}`;
      this.ensureUser(botSocketId, botPhone, true, 1);
    }
    console.log(`[BINGO] ${count} bots añadidos al juego.`);
  }

  getState() {
    return {
      calledNumbers: this.calledNumbers,
      gameActive: this.gameActive,
      winner: this.winner,
      winners: this.winners,
      trialEnabled: this.trialEnabled
    };
  }

  /**
   * Retorna la lista de jugadores actuales (que tienen al menos un socket conectado).
   * @returns {Array<Object>} Lista de { id, phone, isTrial, online }
   */
  getPlayers() {
    const players = [];
    this.userCards.forEach((data, phone) => {
      // Usamos el primer socket o el phone como ID
      const refId = data.sockets.size > 0 ? Array.from(data.sockets)[0] : phone;
      players.push({ 
        id: refId, 
        phone: data.phone, 
        isTrial: data.isTrial,
        online: data.sockets.size > 0
      });
    });
    return players;
  }

  /**
   * Identifica qué jugadores están a 1 o 2 números de ganar.
   * @returns {Array<Object>} Lista de { phone, missing, isTrial }
   */
  getApproachingWinners() {
    const approaching = [];
    this.userCards.forEach((userData) => {
      let minMissingForUser = 5;
      
      userData.cards.forEach((cardSet) => {
        const { card, marked } = cardSet;
        
        // Revisar filas
        for (let r = 0; r < 5; r++) {
          let missing = 0;
          for (let c = 0; c < 5; c++) {
            if (card[r][c] !== 'FREE' && !marked[r][c]) missing++;
          }
          if (missing < minMissingForUser) minMissingForUser = missing;
        }
        
        // Revisar columnas
        for (let c = 0; c < 5; c++) {
          let missing = 0;
          for (let r = 0; r < 5; r++) {
            if (card[r][c] !== 'FREE' && !marked[r][c]) missing++;
          }
          if (missing < minMissingForUser) minMissingForUser = missing;
        }
      });

      if (minMissingForUser === 1 || minMissingForUser === 2) {
        approaching.push({ phone: userData.phone, missing: minMissingForUser, isTrial: userData.isTrial });
      }
    });
    
    // Ordenar para mostrar primero a los que les falta solo 1
    return approaching.sort((a, b) => a.missing - b.missing);
  }
}

module.exports = new BingoService();
