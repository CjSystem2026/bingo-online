# Usa una imagen base de Node.js (Slim es mejor para producción que Alpine con librerías nativas)
FROM node:18-slim

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalar dependencias necesarias para algunas librerías de Node
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copia package.json y package-lock.json (si existe) para instalar dependencias
COPY package*.json ./

# Instala las dependencias del proyecto (solo producción)
RUN npm install --omit=dev

# Copia el resto del código de la aplicación
COPY . .

# Crear directorios necesarios y asegurar permisos
RUN mkdir -p public/uploads db && chmod -R 777 public/uploads db

# Expone el puerto en el que se ejecutará la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación en modo producción
CMD ["node", "index.js"]
