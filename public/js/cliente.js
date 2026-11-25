const $ = (id) => document.getElementById(id);
const ventanillaId = location.pathname.split('/').pop();
const socket = io();

let modoActual = null;

const pantallas = [
  'menu-accesibilidad',
  'cliente-auditiva',
  'cliente-visual',
  'cliente-fisica',
  'cliente-confirmacion',
  'cliente-espera',
  'cliente-fin'
];

function estado(mensaje, conectado) {
  const badge = $('estado');
  badge.innerText = mensaje;
  badge.classList.toggle('badge-ok', conectado);
  badge.classList.toggle('badge-error', !conectado);
}

function leerTexto(texto) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const voz = new SpeechSynthesisUtterance(texto);
  voz.lang = 'es-ES';
  window.speechSynthesis.speak(voz);
}

function agregarBurbuja(emisor, texto) {
  const chat = $('chat');
  const burbuja = document.createElement('div');
  burbuja.className = 'msg ' + (emisor === 'personal' ? 'msg-negocio' : 'msg-cliente');
  burbuja.innerText =
    (emisor === 'personal' ? '🏢 Cajero: ' : '👤 Cliente: ') + texto;

  chat.appendChild(burbuja);
  chat.scrollTop = chat.scrollHeight;
}

function hayConexion() {
  if (socket.connected) return true;

  estado('⚠️ Sin conexión. No se envió el mensaje; vuelve a escanear el QR.', false);
  return false;
}

function mostrar(idPantalla) {
  pantallas.forEach((id) => $(id).classList.add('hidden'));
  $(idPantalla).classList.remove('hidden');
}

socket.on('connect', () => {
  socket.emit('unirse', { id: ventanillaId, rol: 'cliente' });
});

socket.on('disconnect', () => estado('⚠️ Se perdió la conexión', false));
socket.on('connect_error', () => {
  estado('⚠️ No se pudo conectar con el servidor. Revisa tu internet.', false);
});

socket.on('unido', (datos) => {
  estado('● Conectado con ' + datos.nombre, true);
});

socket.on('chat', (datos) => agregarBurbuja(datos.emisor, datos.texto));

socket.on('informacion', (texto) => {
  $('informacion-voz').innerText = texto;
  leerTexto(texto);
});

socket.on('atendido', () => {
  estado('✅ Un asesor va en camino', true);
  if (modoActual === 'visual') leerTexto('Un asesor va en camino.');
});

socket.on('en-cola', (datos) => {
  mostrar('cliente-espera');

  const personasAntes = datos.posicion - 1;
  $('texto-espera').innerText =
    personasAntes === 0
      ? 'Eres el siguiente. Un momento, por favor.'
      : personasAntes === 1
        ? 'Hay 1 persona antes que tú.'
        : 'Hay ' + personasAntes + ' personas antes que tú.';

  estado('⏳ En espera', true);
});

socket.on('tu-turno', () => {
  modoActual = null;
  $('chat').innerHTML = '';
  mostrar('menu-accesibilidad');
  estado('✅ Es tu turno', true);
});

socket.on('finalizado', () => {
  modoActual = null;
  mostrar('cliente-fin');
  estado('Atención finalizada', true);
});

window.seleccionarModo = function seleccionarModo(modo) {
  if (!hayConexion()) return;

  modoActual = modo;
  socket.emit('modo', modo);
  $('menu-accesibilidad').classList.add('hidden');

  if (modo === 'auditiva') {
    $('cliente-auditiva').classList.remove('hidden');
    socket.emit('alerta', { texto: '🦻 Cliente solicita atención por texto.' });
  } else if (modo === 'visual') {
    $('cliente-visual').classList.remove('hidden');
    socket.emit('alerta', { texto: '👁️ Cliente solicita asistencia visual.' });
    socket.emit('solicitar-informacion');
  } else if (modo === 'fisica') {
    $('cliente-fisica').classList.remove('hidden');
    $('ubicacion-cliente').focus();
  }
};

window.enviarChat = function enviarChat(texto) {
  if (!hayConexion()) return;
  socket.emit('chat', { texto });
};

window.enviarEscrito = function enviarEscrito() {
  const input = $('input-mensaje');
  const texto = input.value.trim();

  if (!texto) return;

  enviarChat(texto);
  input.value = '';
};

window.pedirAyuda = function pedirAyuda(texto) {
  if (!hayConexion()) return;

  socket.emit('alerta', { texto });
  $('cliente-visual').classList.add('hidden');
  $('cliente-fisica').classList.add('hidden');
  $('cliente-confirmacion').classList.remove('hidden');

  if (modoActual === 'visual') leerTexto('Solicitud enviada al personal.');
};

window.enviarSolicitudAsistencia = function enviarSolicitudAsistencia() {
  const ubicacion = $('ubicacion-cliente').value.trim();

  if (!ubicacion) {
    $('ubicacion-cliente').focus();
    estado('Indica dónde estás para que el personal pueda encontrarte.', false);
    return;
  }

  pedirAyuda(
    '♿ Cliente solicita rampa o asistencia física. Ubicación indicada: ' + ubicacion
  );
};

window.leerTexto = leerTexto;

$('input-mensaje').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') enviarEscrito();
});
