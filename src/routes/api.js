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

// Cliente de Google Cloud Vision
const visionClient = new vision.ImageAnnotatorClient();

module.exports = (io) => {
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
            // Busca frases comunes y captura el texto siguiente (letras y espacios)
            const nameMatch = cleanText.match(/(?:yapeaste a|pago a|enviado a|envió a|a favor de|Destino|Para|Nombre|Beneficiario)\s*:?\s*([a-zA-ZÑñ\s]{3,50})/i);
            if (nameMatch) {
              extractedName = nameMatch[1].trim();
            } else {
              // Si no encuentra por frases clave, intentar buscar después de palabras comunes de final de frase
              const fallbackNameMatch = cleanText.match(/(?:a|hacia)\s+([A-Z][a-zñ]+\s[A-Z][a-zñ]+)/);
              if (fallbackNameMatch) extractedName = fallbackNameMatch[1].trim();
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

  return router;
};
