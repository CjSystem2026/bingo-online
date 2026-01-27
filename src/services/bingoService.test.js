const BingoService = require('./bingoService');

describe('BingoService', () => {
  let service;

  beforeEach(() => {
    // Clear the singleton instance before each test to ensure isolation
    // and create a fresh instance for testing ensureUser persistence.
    jest.resetModules(); // This clears the require cache
    service = require('./bingoService'); // Re-require to get a fresh singleton
    service.resetGame(true); // Ensure a clean state for userCards
  });

  test('should ensure the same bingo card for a user on subsequent calls to ensureUser', () => {
    const phone = '123456789';
    const socketId1 = 'socket1';
    const socketId2 = 'socket2';

    // First call: user connects for the first time
    const userData1 = service.ensureUser(socketId1, phone);
    const initialCards = userData1.cards.map(c => c.card);

    // Simulate a page refresh or reconnection: call ensureUser again for the same phone
    // but with a new socketId
    const userData2 = service.ensureUser(socketId2, phone);
    const subsequentCards = userData2.cards.map(c => c.card);

    // Assert that the cards are identical
    expect(subsequentCards).toEqual(initialCards);

    // Verify the number of sockets for the user
    expect(userData2.sockets.size).toBe(2);
    expect(userData2.sockets.has(socketId1)).toBe(true);
    expect(userData2.sockets.has(socketId2)).toBe(true);
  });

  test('should remove a socket correctly when a user disconnects', () => {
    const phone = '123456789';
    const socketId1 = 'socket1';
    const socketId2 = 'socket2';

    service.ensureUser(socketId1, phone);
    service.ensureUser(socketId2, phone);

    let userData = service.userCards.get(phone);
    expect(userData.sockets.size).toBe(2);

    service.removeUser(socketId1);
    userData = service.userCards.get(phone); // Get updated userData
    expect(userData.sockets.size).toBe(1);
    expect(userData.sockets.has(socketId2)).toBe(true);
    expect(userData.sockets.has(socketId1)).toBe(false);

    service.removeUser(socketId2);
    userData = service.userCards.get(phone); // Get updated userData
    expect(userData.sockets.size).toBe(0);
  });
});
