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
    this.userCards = new Map(); // socketId -> { cards: [{card, marked}], phone, isTrial }
    this.gameActive = true;
    this.winner = null;
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
   * Registra un nuevo jugador o añade una cartilla a uno existente.
   * @param {string} socketId - Identificador único de la conexión.
   * @param {string|null} phone - Número de teléfono del jugador (opcional).
   * @param {boolean} isTrial - Indica si es un usuario de prueba.
   * @returns {Object} La lista completa de cartillas del usuario.
   */
  addUser(socketId, phone = null, isTrial = false) {
    const newCard = this.generateBingoCard();
    const initialMarked = Array.from({ length: 5 }, () => Array(5).fill(false));
    initialMarked[2][2] = true;
    
    const cardData = { card: newCard, marked: initialMarked };
    
    let userData = this.userCards.get(socketId);
    if (!userData) {
      userData = { 
        cards: [cardData], 
        phone: phone || `Anon-${socketId.substring(0, 4)}`,
        isTrial
      };
      this.userCards.set(socketId, userData);
    } else {
      userData.cards.push(cardData);
    }
    
    console.log(`[BINGO] Usuario ${socketId} (${userData.phone}) [Trial: ${isTrial}] ahora tiene ${userData.cards.length} cartillas.`);
    return userData;
  }

  removeUser(socketId) {
    this.userCards.delete(socketId);
    console.log(`[BINGO] Usuario desconectado: ${socketId}. Total jugadores: ${this.userCards.size}`);
  }

  /**
   * Extrae un nuevo número aleatorio y actualiza el estado de todas las cartillas activas.
   * @returns {Object|null} El número sacado y el ID del ganador (si existe), o null si el juego no permite más números.
   */
  callNewNumber() {
    if (!this.gameActive || this.availableNumbers.length === 0 || this.winner) return null;
    const randomIndex = Math.floor(Math.random() * this.availableNumbers.length);
    const newNumber = this.availableNumbers.splice(randomIndex, 1)[0];
    this.calledNumbers.push(newNumber);

    let trialWinner = null;

    // Actualizar marcas
    this.userCards.forEach((userData, userId) => {
      userData.cards.forEach((cardSet) => {
        const { card, marked } = cardSet;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card[r][c] === newNumber) marked[r][c] = true;
          }
        }
        if (this.checkBingo(cardSet, userId)) {
          if (!userData.isTrial) {
            this.gameActive = false;
            this.winner = { id: userId, phone: userData.phone };
          } else {
            trialWinner = { id: userId, phone: userData.phone, isTrial: true };
          }
        }
      });
    });

    return { number: newNumber, winner: this.winner, trialWinner };
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

    if (clearPlayers) {
      this.userCards.clear();
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

  getState() {
    return {
      calledNumbers: this.calledNumbers,
      gameActive: this.gameActive,
      winner: this.winner
    };
  }

  /**
   * Retorna la lista de jugadores actuales.
   * @returns {Array<Object>} Lista de { id, phone, isTrial }
   */
  getPlayers() {
    const players = [];
    this.userCards.forEach((data, userId) => {
      players.push({ id: userId, phone: data.phone, isTrial: data.isTrial });
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
