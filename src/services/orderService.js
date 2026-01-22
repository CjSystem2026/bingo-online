/**
 * OrderService - Gestión del flujo de pagos y pedidos.
 * Centraliza el almacenamiento temporal de órdenes pendientes y aprobadas.
 */
class OrderService {
  constructor() {
    this.pendingOrders = [];
    this.approvedOrders = new Map(); // token -> order
  }

  /**
   * Registra un nuevo pedido en estado pendiente.
   * @param {string} phone - Celular del cliente.
   * @param {string|null} operationCode - Código de operación Yape/Plin (Opcional).
   * @param {string|null} screenshot - Ruta del archivo de imagen subido.
   * @returns {Object} El objeto de la orden creada.
   */
  /**
   * Busca una orden activa (pendiente o aprobada) por el número de teléfono.
   * @param {string} phone 
   * @returns {Object|null}
   */
  findOrderByPhone(phone) {
    // Buscar en pendientes
    const pending = this.pendingOrders.find(o => o.phone === phone);
    if (pending) return pending;

    // Buscar en aprobados
    for (let order of this.approvedOrders.values()) {
      if (order.phone === phone) return order;
    }
    return null;
  }

  addPendingOrder(phone, operationCode, screenshot, isTrial = false) {
    // Si ya existe una orden activa para este teléfono, no creamos una nueva
    const existing = this.findOrderByPhone(phone);
    if (existing) return existing;

    const requestToken = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const newOrder = {
      id: Date.now(),
      requestToken,
      phone,
      operationCode: operationCode || 'N/A',
      screenshot,
      isTrial,
      status: 'pending',
      timestamp: new Date()
    };
    this.pendingOrders.push(newOrder);
    return newOrder;
  }

  /**
   * Mueve una orden de pendiente a aprobada y genera uno o varios tokens de acceso.
   * @param {number} id - ID de la orden.
   * @param {number} quantity - Cantidad de cartillas a generar.
   * @param {boolean} isTrialOverride - Forzar estado de prueba al aprobar.
   * @returns {Array<Object>|null} Lista de aprobaciones o null si no se encuentra.
   */
  approveOrder(id, quantity = 1, isTrialOverride = null) {
    const index = this.pendingOrders.findIndex(o => o.id === id);
    if (index !== -1) {
      const order = this.pendingOrders.splice(index, 1)[0];
      const results = [];
      
      // Si se pasa isTrialOverride, usamos ese valor. Si no, usamos el que traía la orden.
      const isTrial = isTrialOverride !== null ? isTrialOverride : order.isTrial;

      for (let i = 0; i < quantity; i++) {
        const token = Math.random().toString(36).substring(2, 15);
        const approvalData = { ...order, token, status: 'approved', isTrial };
        this.approvedOrders.set(token, approvalData);
        results.push(approvalData);
      }
      
      return results;
    }
    return null;
  }

  /**
   * Consulta el estado de una orden por su token secreto de solicitud o por teléfono.
   * @param {string} identifier - requestToken o número de teléfono.
   * @returns {Object} Estado de la orden y URLs de acceso si está aprobada.
   */
  checkStatus(identifier) {
    if (!identifier) return { status: 'not_found' };

    const approved = [];
    for (let [token, data] of this.approvedOrders.entries()) {
      if (data.requestToken === identifier || data.phone === identifier) {
        approved.push({ token, url: `/jugar?t=${token}` });
      }
    }

    if (approved.length > 0) {
      return { status: 'approved', items: approved, url: approved[0].url };
    }

    const isPending = this.pendingOrders.some(o => o.requestToken === identifier || o.phone === identifier);
    if (isPending) {
      // Intentar encontrar el requestToken real si se buscó por teléfono
      const order = this.pendingOrders.find(o => o.phone === identifier || o.requestToken === identifier);
      return { status: 'pending', requestToken: order.requestToken };
    }

    return { status: 'not_found' };
  }

  getPendingOrders() {
    return this.pendingOrders;
  }

  getApprovedOrders() {
    return this.approvedOrders;
  }

  /**
   * Limpia todos los pedidos almacenados.
   */
  clearAllOrders() {
    this.pendingOrders = [];
    this.approvedOrders.clear();
    console.log('[ORDERS] Todos los pedidos han sido eliminados.');
  }
}

module.exports = new OrderService();
