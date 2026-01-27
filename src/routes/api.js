const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const upload = require('../config/multer');
const basicAuth = require('../config/auth');
const { emitBingoStats } = require('../sockets/bingoSocket');
const vision = require('@google-cloud/vision');
const path = require('path');

const fs = require('fs');
const { calculateFileHash, isHashProcessed, addProcessedHash, hasUsedTrial, registerUsedTrial } = require('../utils/hashStore');
const { getBusinessMetrics } = require('../utils/orderPersistence');

// Cliente de Google Cloud Vision
const visionOptions = {};
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  visionOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
}
const visionClient = new vision.ImageAnnotatorClient(visionOptions);

module.exports = (io) => {
  // API: Consultar si el modo prueba está habilitado globalmente (Público)
  router.get('/trial-status', (req, res) => {
    const bingoService = require('../services/bingoService');
    res.json({ enabled: bingoService.trialEnabled });
  });

  // API: Verificar si un número puede usar la prueba gratis
  router.get('/check-trial/:phone', async (req, res) => {
    try {
      const phone = req.params.phone.replace(/\D/g, '');
      if (phone.length !== 9) return res.json({ canUseTrial: false });
      
      const used = await hasUsedTrial(phone);
      res.json({ canUseTrial: !used });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Recibir nuevo pedido (Público)
  router.post('/validate-payment', (req, res) => {
    upload.single('screenshot')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message || 'Error al subir la imagen.' 
        });
      }

      const isTrial = req.body.isTrial === 'true';
      const playerName = req.body.playerName; // Para pruebas

      // 1. Validar que el archivo exista (solo si no es prueba)
      if (!req.file && !isTrial) {
        return res.status(400).json({ 
          success: false, 
          message: 'Es obligatorio adjuntar la captura de pantalla de tu pago.' 
        });
      }

      try {
        // 2. Calcular el hash del archivo subido (solo si hay archivo)
        let hash = null;
        if (req.file) {
          hash = await calculateFileHash(req.file.path);
        }

        // 3. Verificar si el hash ya ha sido procesado
        if (hash) {
          const isDuplicate = await isHashProcessed(hash);
          if (isDuplicate) {
            // Si es un duplicado, borrar el archivo y devolver un error
            await fs.promises.unlink(req.file.path);
            return res.status(409).json({
              success: false,
              message: 'Esta captura de pantalla ya ha sido utilizada para un pago anterior. Por favor, usa una captura del pago correcto.'
            });
          }
          // 4. Guardar el hash en la base de datos para futuros chequeos
          await addProcessedHash(hash);
        }

        const { phone } = req.body;
        const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
        
        if (phoneDigits.length !== 9) {
          if (req.file) await fs.promises.unlink(req.file.path);
          return res.status(400).json({ 
            success: false, 
            message: 'El celular debe tener 9 dígitos.' 
          });
        }

        // Si es prueba, verificar nuevamente por seguridad
        if (isTrial) {
          const alreadyUsed = await hasUsedTrial(phoneDigits);
          if (alreadyUsed) {
            return res.status(400).json({
              success: false,
              message: 'Este número ya ha utilizado su prueba gratuita.'
            });
          }
        }

        const existingOrder = orderService.findOrderByPhone(phoneDigits);
        if (existingOrder) {
          if (req.file) await fs.promises.unlink(req.file.path);
          return res.status(200).json({ 
            success: true, 
            requestToken: existingOrder.requestToken,
            message: 'Ya tienes un pedido en curso con este número. Sincronizando...' 
          });
        }

        // --- EXTRACCIÓN AUTOMÁTICA (OCR) SI NO ES PRUEBA ---
        let extractedName = playerName || 'Jugador';
        let extractedCode = 'N/A';

        if (req.file && !isTrial) {
          try {
            console.log('[OCR-VISION] Iniciando detección para:', req.file.path);
            
            // Usar Google Cloud Vision API con un timeout de seguridad de 10 segundos
            const ocrTask = visionClient.documentTextDetection(req.file.path);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR_TIMEOUT')), 10000));
            
            const [result] = await Promise.race([ocrTask, timeoutPromise]);
            
            if (!result || (!result.fullTextAnnotation && !result.textAnnotations)) {
              console.warn('[OCR-VISION] La API no devolvió anotaciones de texto.');
            }

            // fullTextAnnotation es la mejor opción para obtener el texto estructurado completo
            const text = result.fullTextAnnotation ? result.fullTextAnnotation.text : 
                         (result.textAnnotations && result.textAnnotations.length > 0 ? result.textAnnotations[0].description : '');
            
            if (!text) {
              console.warn('[OCR-VISION] No se detectó ningún texto en la imagen.');
            }

            // Limpiar el texto para facilitar la búsqueda (unir líneas y quitar espacios extra)
            const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            console.log('[OCR-VISION] Texto limpio para procesar:', cleanText.substring(0, 500));

            // 1. Intentar extraer Código de Operación
            // Busca patrones comunes de Yape/Plin (operación, ref, nro, etc.) seguido de 6-20 dígitos
            const codeMatch = cleanText.match(/(?:operaci[oó]n|N[°º]|Nro\.?|Transacci[oó]n|C[oó]digo|Ref\.?|Constancia)\s*:?\s*(\d{6,20})/i);
            if (codeMatch) {
              extractedCode = codeMatch[1];
            } else {
              // Intento secundario: buscar cualquier cadena larga de números (posible código si no hay etiquetas)
              const backupCodeMatch = cleanText.match(/\b\d{8,15}\b/);
              if (backupCodeMatch) extractedCode = backupCodeMatch[0];
            }

            // 2. Intentar extraer Nombre
            // Intentar con varios patrones específicos (incluyendo soporte para tildes y variaciones)
            const namePatterns = [
              /(?:yapeaste a|pago a|enviado a|envió a|a favor de|Destino|Para|Nombre|Beneficiario|Receptor|Pagaste a|Pago realizado a)\s*:?\s*([a-zA-ZÑñáéíóúÁÉÍÓÚ\s]{3,50})/i,
              /¡?Yapeaste!\s+S\/\s*\d+(?:\.\d+)?\s+([a-zA-ZÑñáéíóúÁÉÍÓÚ\s]{3,50})/i,
              /¡?Yapeaste!\s+([a-zA-ZÑñáéíóúÁÉÍÓÚ\s]{3,50})/i,
              /(?:a|hacia)\s+([A-ZÁÉÍÓÚ][a-zñáéíóú]+\s[A-ZÁÉÍÓÚ][a-zñáéíóú]+)/
            ];

            let foundName = null;
            for (const pattern of namePatterns) {
              const match = cleanText.match(pattern);
              if (match && match[1]) {
                // Limpiar posibles residuos si el regex capturó de más (ej. el "S/" final)
                let tempName = match[1].split(/\sS\//)[0].trim();
                // Validar que no sea una etiqueta común y no tenga números
                if (!/\d/.test(tempName) && !/operaci[oó]n|fecha|banco|yape|plin|monto|total|destino|nro|n[uú]mero|referencia|constancia/i.test(tempName) && tempName.length > 3) {
                  foundName = tempName;
                  break;
                }
              }
            }

            if (foundName) {
              extractedName = foundName;
            } else {
              // Búsqueda avanzada por líneas si los patrones fallan
              const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
              console.log('[OCR-DEBUG] Líneas detectadas:', lines);
              
              // En Yape, el nombre suele estar en la línea siguiente al monto (S/) o antes
              const montoIdx = lines.findIndex(l => l.includes('S/') || /^\d+(?:\.\d+)?$/.test(l));
              if (montoIdx !== -1) {
                const exclusionRegex = /operaci[oó]n|fecha|banco|yape|plin|monto|total|destino|nro|n[uú]mero|referencia|constancia|pago|enviado/i;
                
                // Intentar línea siguiente
                if (lines[montoIdx + 1]) {
                  const potentialName = lines[montoIdx + 1];
                  if (/^[a-zA-ZÑñáéíóúÁÉÍÓÚ\s]{4,50}$/.test(potentialName) && !exclusionRegex.test(potentialName)) {
                    extractedName = potentialName;
                  }
                }
                // Si no funcionó, intentar línea anterior (a veces el monto está abajo)
                if (extractedName === 'Jugador' && montoIdx > 0) {
                  const potentialName = lines[montoIdx - 1];
                  if (/^[a-zA-ZÑñáéíóúÁÉÍÓÚ\s]{4,50}$/.test(potentialName) && !exclusionRegex.test(potentialName)) {
                    extractedName = potentialName;
                  }
                }
              }
            }

          } catch (ocrError) {
            if (ocrError.message === 'OCR_TIMEOUT') {
              console.warn('[OCR-VISION] Timeout alcanzado. Continuando sin OCR automático.');
            } else {
              console.error('[OCR-VISION] Error al procesar imagen:', ocrError);
            }
          }
        } else if (isTrial) {
          extractedCode = 'PRUEBA';
        }

        const screenshotPath = req.file ? `/uploads/${req.file.filename}` : null;
        const newOrder = orderService.addPendingOrder(phoneDigits, extractedCode, screenshotPath, isTrial, extractedName);

        if (isTrial) {
          // APROBACIÓN AUTOMÁTICA PARA PRUEBA GRATIS
          const approvalResults = orderService.approveOrder(newOrder.id, 1);
          if (approvalResults && approvalResults.length > 0) {
            await registerUsedTrial(phoneDigits);
            approvalResults.forEach(data => {
              io.emit('admin:order_approved', data);
            });
            emitBingoStats(io);
          }
        } else {
          // Flujo normal para pagos: requiere aprobación manual
          io.emit('admin:new_order', { ...newOrder, timeStr: newOrder.timestamp.toLocaleTimeString() });
        }

        res.json({ success: true, requestToken: newOrder.requestToken });

      } catch (error) {
        console.error('Error processing payment validation:', error);
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
  router.post('/approve-order', basicAuth, async (req, res) => {
    const { id, quantity, isTrial: isTrialOverride, playerName, operationCode } = req.body;
    const qty = parseInt(quantity) || 1;
    const approvalResults = orderService.approveOrder(id, qty, isTrialOverride === true, playerName, operationCode);
    
    if (approvalResults && approvalResults.length > 0) {
      // Si es una prueba, registrar el número como usado
      if (approvalResults[0].isTrial) {
        await registerUsedTrial(approvalResults[0].phone);
      }

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

  // API: Obtener todos los pedidos (Solo Admin)
  router.get('/admin/orders', basicAuth, (req, res) => {
    const pending = orderService.getPendingOrders();
    const approvedMap = orderService.getApprovedOrders();
    
    // Convertir el Map de aprobados a un array para JSON
    const approved = [];
    approvedMap.forEach((data, token) => {
      approved.push({ ...data, token });
    });

    res.json({ pending, approved });
  });

  // API: Obtener métricas de negocio (Solo Admin)
  router.get('/admin/analytics', basicAuth, async (req, res) => {
    try {
      const metrics = await getBusinessMetrics();
      res.json(metrics);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Obtener historial completo de la base de datos (Solo Admin)
  router.get('/admin/history', basicAuth, async (req, res) => {
    try {
      const { getOrdersHistory } = require('../utils/orderPersistence');
      const history = await getOrdersHistory();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Obtener estado actual del juego (Solo Admin)
  router.get('/admin/game-state', basicAuth, (req, res) => {
    const bingoService = require('../services/bingoService');
    res.json(bingoService.getState());
  });

  return router;
};
