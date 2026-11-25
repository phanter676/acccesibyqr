const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
app.set('trust proxy', true); // para que el QR use https cuando lo despliegues
const server = http.createServer(app);
const io = new Server(server);

const ARCHIVO_VENTANILLAS = path.join(__dirname, 'data', 'ventanillas.json');
const ARCHIVO_DATOS = path.join(__dirname, 'data', 'estadisticas-historial.json');
const VENTANILLAS_INICIALES = {
  ventanilla1: 'Ventanilla 1',
  ventanilla2: 'Ventanilla 2',
  ventanilla3: 'Ventanilla 3',
};

function cargarVentanillas() {
  fs.mkdirSync(path.dirname(ARCHIVO_VENTANILLAS), { recursive: true });

  if (!fs.existsSync(ARCHIVO_VENTANILLAS)) {
    fs.writeFileSync(
      ARCHIVO_VENTANILLAS,
      JSON.stringify(VENTANILLAS_INICIALES, null, 2)
    );
  }

  const ventanillas = JSON.parse(fs.readFileSync(ARCHIVO_VENTANILLAS, 'utf8'));
  if (!ventanillas || typeof ventanillas !== 'object' || Array.isArray(ventanillas)) {
    throw new Error('El archivo de ventanillas debe contener un objeto JSON.');
  }

  Object.entries(ventanillas).forEach(([id, nombre]) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || typeof nombre !== 'string' || !nombre.trim()) {
      throw new Error('El archivo de ventanillas contiene una entrada inválida.');
    }
  });

  return ventanillas;
}

function guardarVentanillas() {
  fs.writeFileSync(ARCHIVO_VENTANILLAS, JSON.stringify(VENTANILLAS, null, 2));
}

const VENTANILLAS = cargarVentanillas();
const datosIniciales = {
  estadisticas: {
    total: 0,
    auditiva: 0,
    visual: 0,
    fisica: 0,
    atendidas: 0,
    finalizadas: 0,
  },
  historial: [],
};

function cargarDatos() {
  fs.mkdirSync(path.dirname(ARCHIVO_DATOS), { recursive: true });

  if (!fs.existsSync(ARCHIVO_DATOS)) {
    fs.writeFileSync(ARCHIVO_DATOS, JSON.stringify(datosIniciales, null, 2));
  }

  const datos = JSON.parse(fs.readFileSync(ARCHIVO_DATOS, 'utf8'));
  const claves = ['total', 'auditiva', 'visual', 'fisica', 'atendidas', 'finalizadas'];

  if (!datos.estadisticas || !Array.isArray(datos.historial)) {
    throw new Error('El archivo de estadísticas tiene un formato inválido.');
  }
  claves.forEach((clave) => {
    if (!Number.isInteger(datos.estadisticas[clave]) || datos.estadisticas[clave] < 0) {
      datos.estadisticas[clave] = 0;
    }
  });

  return datos;
}

function guardarDatos() {
  fs.writeFileSync(ARCHIVO_DATOS, JSON.stringify(datosPersistentes, null, 2));
}

const datosPersistentes = cargarDatos();
const estadisticas = datosPersistentes.estadisticas;
const historial = datosPersistentes.historial;

function registrarEvento(tipo, id, detalles = {}) {
  historial.unshift({
    id: crypto.randomBytes(8).toString('hex'),
    tipo,
    ventanilla: VENTANILLAS[id] || id,
    ventanillaId: id,
    fecha: new Date().toISOString(),
    ...detalles,
  });

  if (historial.length > 1000) historial.length = 1000;
  guardarDatos();
}

const informacion = {}; // texto que el local ofrece por voz, por ventanilla
const clienteEn = {};   // socket del cliente conectado, por ventanilla
const cola = {}; // sockets en espera, por ventanilla
Object.keys(VENTANILLAS).forEach((id) => {
  cola[id] = [];
  clienteEn[id] = null;
});
const ventanillasAtendidas = new Set();

const limpiar = (t, max = 500) =>
  typeof t === 'string' ? t.trim().slice(0, max) : '';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => res.redirect('/personal/ventanilla1'));

app.get('/c/:id', (req, res) => {
  if (!VENTANILLAS[req.params.id]) return res.status(404).send('Punto de atención no encontrado');
  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

app.get('/personal/:id', (req, res) => {
  if (!VENTANILLAS[req.params.id]) return res.status(404).send('Punto de atención no encontrado');
  res.sendFile(path.join(__dirname, 'public', 'personal.html'));
});

// QR fijo de cada ventanilla (apunta a /c/<id>)
app.get('/qr/:id', async (req, res) => {
  if (!VENTANILLAS[req.params.id]) return res.status(404).end();
  try {
    const url = `${req.protocol}://${req.get('host')}/c/${req.params.id}`;
    const png = await QRCode.toBuffer(url, { width: 300, margin: 2 });
    res.type('png').send(png);
  } catch (e) {
    console.error('No se pudo generar el código QR:', e);
    res.status(500).end();
  }
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/api/estadisticas', (req, res) => res.json(estadisticas));
app.get('/api/historial', (req, res) => {
  const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 100, 1), 1000);
  res.json(historial.slice(0, limite));
});

app.get('/api/ventanillas', (req, res) => {
  const lista = Object.entries(VENTANILLAS).map(([id, nombre]) => ({
    id,
    nombre,
    atendiendo: Boolean(clienteEn[id]),
    enEspera: cola[id].length,
  }));
  res.json(lista);
});

app.post('/api/ventanillas', (req, res) => {
  const nombre = limpiar(req.body && req.body.nombre, 60);
  if (!nombre) {
    return res.status(400).json({ error: 'Escribe el nombre de la ventanilla.' });
  }

  let id;
  do {
    id = 'ventanilla-' + crypto.randomBytes(5).toString('hex');
  } while (Object.prototype.hasOwnProperty.call(VENTANILLAS, id));

  VENTANILLAS[id] = nombre;
  clienteEn[id] = null;
  cola[id] = [];

  try {
    guardarVentanillas();
  } catch (error) {
    delete VENTANILLAS[id];
    delete clienteEn[id];
    delete cola[id];
    console.error('No se pudieron guardar las ventanillas:', error);
    return res.status(500).json({ error: 'No se pudo guardar la nueva ventanilla.' });
  }

  return res.status(201).json({
    id,
    nombre,
    atendiendo: false,
    enEspera: 0,
  });
});

app.delete('/api/ventanillas/:id', (req, res) => {
  const { id } = req.params;
  if (!Object.prototype.hasOwnProperty.call(VENTANILLAS, id)) {
    return res.status(404).json({ error: 'No se encontró esa ventanilla.' });
  }
  if (clienteEn[id] || cola[id].length) {
    return res.status(409).json({
      error: 'No se puede eliminar: termina la atención y vacía la fila primero.',
    });
  }

  const nombre = VENTANILLAS[id];
  delete VENTANILLAS[id];

  try {
    guardarVentanillas();
  } catch (error) {
    VENTANILLAS[id] = nombre;
    console.error('No se pudieron guardar las ventanillas:', error);
    return res.status(500).json({ error: 'No se pudo eliminar la ventanilla.' });
  }

  delete clienteEn[id];
  delete cola[id];
  delete informacion[id];
  io.in('personal:' + id).emit('ventanilla-eliminada');
  io.in('personal:' + id).disconnectSockets(true);
  return res.status(204).end();
});

function avisarPosiciones(id) {
  cola[id].forEach((sid, i) => io.to(sid).emit('en-cola', { posicion: i + 1 }));
  io.to('personal:' + id).emit('cola', { cantidad: cola[id].length });
}

function siguienteTurno(id) {
  clienteEn[id] = null;
  while (cola[id].length) {
    const s = io.sockets.sockets.get(cola[id].shift());
    if (!s) continue;
    clienteEn[id] = s.id;
    s.join(id);
    s.emit('tu-turno');
    io.to('personal:' + id).emit('cliente-conectado');
    break;
  }
  avisarPosiciones(id);
}

io.on('connection', (socket) => {
  socket.on('unirse', (datos) => {
    const { id, rol } = datos || {};
    if (!VENTANILLAS[id] || (rol !== 'cliente' && rol !== 'personal')) return;
    if (socket.data && socket.data.id) return; // ya se unió
    socket.data = { id, rol };

    if (rol === 'personal') {
      socket.join(id);
      socket.join('personal:' + id);
      socket.emit('unido', { nombre: VENTANILLAS[id], informacion: informacion[id] || '' });
      if (clienteEn[id]) socket.emit('cliente-conectado');
      socket.emit('cola', { cantidad: cola[id].length });
      return;
    }

    socket.emit('unido', { nombre: VENTANILLAS[id], informacion: '' });
    if (!clienteEn[id]) {
      clienteEn[id] = socket.id;
      socket.join(id);
      socket.emit('tu-turno');
      io.to('personal:' + id).emit('cliente-conectado');
    } else {
      cola[id].push(socket.id);
      avisarPosiciones(id);
    }
  });

  socket.on('chat', (datos) => {
    const { id, rol } = socket.data || {};
    const texto = limpiar(datos && datos.texto);
    if (!id || !texto) return;
    if (rol === 'cliente' && clienteEn[id] !== socket.id) return;
    io.to(id).emit('chat', { emisor: rol, texto });
  });

  socket.on('alerta', (datos) => {
    const { id, rol } = socket.data || {};
    const texto = limpiar(datos && datos.texto);
    if (!id || rol !== 'cliente' || clienteEn[id] !== socket.id || !texto) return;
    socket.to(id).emit('alerta', { texto });
  });

  socket.on('guardar-informacion', (texto) => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'personal') return;
    informacion[id] = limpiar(texto, 2000);
  });

  socket.on('solicitar-informacion', () => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'cliente' || clienteEn[id] !== socket.id) return;
    socket.emit(
      'informacion',
      informacion[id] ||
        'El local todavía no ha publicado información. Solicita ayuda a un miembro del personal.'
    );
  });

  socket.on('modo', (modo) => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'cliente' || clienteEn[id] !== socket.id) return;
    if (!['auditiva', 'visual', 'fisica'].includes(modo)) return;
    estadisticas.total++;
    estadisticas[modo]++;
    registrarEvento('solicitud', id, { modo });
    guardarDatos();
  });

  socket.on('atender', () => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'personal') return;
    if (!clienteEn[id] || ventanillasAtendidas.has(id)) return;
    estadisticas.atendidas++;
    ventanillasAtendidas.add(id);
    registrarEvento('atendida', id);
    socket.to(id).emit('atendido');
  });

  socket.on('finalizar', () => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'personal' || !clienteEn[id]) return;
    const actual = io.sockets.sockets.get(clienteEn[id]);
    if (actual) {
      actual.leave(id);
      actual.emit('finalizado');
    }
    estadisticas.finalizadas++;
    ventanillasAtendidas.delete(id);
    registrarEvento('finalizada', id);
    guardarDatos();
    io.to('personal:' + id).emit('cliente-desconectado');
    siguienteTurno(id);
  });

  socket.on('disconnect', () => {
    const { id, rol } = socket.data || {};
    if (!id || rol !== 'cliente') return;
    if (clienteEn[id] === socket.id) {
      ventanillasAtendidas.delete(id);
      io.to('personal:' + id).emit('cliente-desconectado');
      siguienteTurno(id);
    } else {
      cola[id] = cola[id].filter((s) => s !== socket.id);
      avisarPosiciones(id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));