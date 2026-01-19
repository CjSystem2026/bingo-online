const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const upload = require('../config/multer');
const basicAuth = require('../config/auth');
const { emitBingoStats } = require('../sockets/bingoSocket');

const fs = require('fs');
const { calculateFileHash, isHashProcessed, addProcessedHash } = require('../utils/hashStore');

module.exports = (io) => {
  // API: Recibir nuevo pedido (Público)
  router.post('/validate-payment', (req, res) => {
    upload.single('screenshot')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message || 'Error al subir la imagen.' 
        });
      }

      // 1. Validar que el archivo exista
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'Es obligatorio adjuntar la captura de pantalla de tu pago.' 
        });
      }

      try {
        // 2. Calcular el hash del archivo subido
        const hash = await calculateFileHash(req.file.path);

        // 3. Verificar si el hash ya ha sido procesado
        const isDuplicate = await isHashProcessed(hash);
        if (isDuplicate) {
          // Si es un duplicado, borrar el archivo y devolver un error
          await fs.promises.unlink(req.file.path);
          return res.status(409).json({
            success: false,
            message: 'Esta captura de pantalla ya ha sido utilizada para un pago anterior. Por favor, usa una captura del pago correcto.'
          });
        }

        // 4. Si no es duplicado, proceder con la lógica de negocio
        const { phone, operationCode } = req.body;
        const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
        
        if (phoneDigits.length !== 9) {
          await fs.promises.unlink(req.file.path); // Borrar archivo si el teléfono es inválido
          return res.status(400).json({ 
            success: false, 
            message: 'El celular debe tener 9 dígitos.' 
          });
        }

        const existingOrder = orderService.findOrderByPhone(phoneDigits);
        if (existingOrder) {
          await fs.promises.unlink(req.file.path); // Borrar archivo si el teléfono ya tiene orden
          return res.status(200).json({ 
            success: true, 
            requestToken: existingOrder.requestToken,
            message: 'Ya tienes un pedido en curso con este número. Sincronizando...' 
          });
        }

        // 5. Guardar el hash en la base de datos para futuros chequeos
        await addProcessedHash(hash);

        const screenshotPath = `/uploads/${req.file.filename}`;
        const codeStr = operationCode ? operationCode.substring(0, 10) : 'N/A';

        const newOrder = orderService.addPendingOrder(phoneDigits, codeStr, screenshotPath);
        io.emit('admin:new_order', { ...newOrder, timeStr: newOrder.timestamp.toLocaleTimeString() });
        res.json({ success: true, requestToken: newOrder.requestToken });

      } catch (error) {
        console.error('Error processing payment validation:', error);
        // Borrar el archivo subido si ocurre un error inesperado
        if (req.file) {
          await fs.promises.unlink(req.file.path);
        }
        res.status(500).json({
          success: false,
          message: 'Ocurrió un error interno al validar el pago.'
        });
      }
    });
  });

  // API: Aprobar pedido (Protegida)
  router.post('/approve-order', basicAuth, (req, res) => {
    const { id, quantity } = req.body;
    const qty = parseInt(quantity) || 1;
    const approvalResults = orderService.approveOrder(id, qty);
    
    if (approvalResults && approvalResults.length > 0) {
      approvalResults.forEach(data => {
        io.emit('admin:order_approved', data);
      });
      emitBingoStats(io); // Actualizar estadísticas para todos
      
      // Devolvemos el primer token y el teléfono para la automatización del panel admin
      res.json({ 
        success: true, 
        token: approvalResults[0].token,
        phone: approvalResults[0].phone 
      });
    } else {
      res.status(404).json({ success: false });
    }
  });

  // API: Consultar estado (Público para el polling)
  router.get('/check-status/:requestToken', (req, res) => {
    const status = orderService.checkStatus(req.params.requestToken);
    res.json(status);
  });

  return router;
};
