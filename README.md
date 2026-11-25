# AccesibiQR

Aplicacion web de atencion inclusiva en tiempo real.

## Ejecutar el proyecto despues de descargarlo

Necesitas tener instalado Node.js (version LTS).

1. Clona el repositorio y entra en la carpeta:

   ```bash
   git clone https://github.com/phanter676/accesibyqr.git
   cd accesibyqr
   ```

   Si descargaste el proyecto como ZIP, descomprimelo y abre una terminal en esa carpeta.

2. Instala las dependencias:

   ```bash
   npm install
   ```

   Esto descarga las dependencias y crea la carpeta `node_modules`.

3. Inicia el servidor:

   ```bash
   node server.js
   ```

4. Abre `http://localhost:3000` en el navegador. Tambien puedes entrar a:
   - Panel del personal: `http://localhost:3000/personal/ventanilla1`
   - Vista del cliente: `http://localhost:3000/c/ventanilla1`
   - Panel de estadisticas: `http://localhost:3000/panel`

Para detener el servidor, presiona `Ctrl+C` en la terminal.
