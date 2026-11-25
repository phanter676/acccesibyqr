const $ = (id) => document.getElementById(id);
const ventanillaId = location.pathname.split('/').pop();
const socket = io();

$('qr').src = '/qr/' + ventanillaId;
$('link-demo').href = '/c/' + ventanillaId;
$('link-vista-cliente').href = '/c/' + ventanillaId;
$('qr').addEventListener('error', () => {
  estado('⚠️ No se pudo generar el código QR', false);
});

async function cargarNavegacionVentanillas() {
  const selector = $('selector-ventanilla');
  const mensaje = $('selector-estado');

  try {
    const respuesta = await fetch('/api/ventanillas');
    if (!respuesta.ok) throw new Error('No se pudieron cargar las ventanillas.');

    const ventanillas = await respuesta.json();
    selector.replaceChildren();

    ventanillas.forEach((ventanilla) => {
      const opcion = document.createElement('option');
      opcion.value = ventanilla.id;
      opcion.innerText = ventanilla.nombre;
      opcion.selected = ventanilla.id === ventanillaId;
      selector.append(opcion);
    });

    if (!ventanillas.length) {
      selector.disabled = true;
      mensaje.innerText = 'No hay ventanillas disponibles.';
      return;
    }

    selector.addEventListener('change', () => {
      if (selector.value) {
        window.location.href = '/personal/' + encodeURIComponent(selector.value);
      }
    });
  } catch (error) {
    console.error(error);
    selector.disabled = true;
    selector.replaceChildren(new Option('No se pudieron cargar', ''));
    mensaje.innerText = 'No fue posible cargar la lista. Usa el panel principal.';
  }
}

cargarNavegacionVentanillas();

function estado(mensaje, conectado) {
  const badge = $('estado');
  badge.innerText = mensaje;
  badge.classList.toggle('badge-ok', conectado);
  badge.classList.toggle('badge-error', !conectado);
}

function leerTexto(texto) {
  if (!$('leer-voz').checked) return;
  if (!('speechSynthesis' in window)) return;

  const voz = new SpeechSynthesisUtterance(texto);
  voz.lang = 'es-ES';
  window.speechSynthesis.speak(voz);
}

function agregarBurbuja(emisor, texto) {
  const chat = $('chat');
  const burbuja = document.createElement('div');
  burbuja.className =
    'msg ' + (emisor === 'personal' ? 'msg-negocio' : 'msg-cliente');
  burbuja.innerText =
    (emisor === 'personal' ? '🏢 Cajero: ' : '👤 Cliente: ') + texto;

  chat.appendChild(burbuja);
  chat.scrollTop = chat.scrollHeight;
}

function enviarMensaje() {
  const input = $('input-mensaje');
  const texto = input.value.trim();

  if (!texto) return;

  socket.emit('chat', { texto });
  input.value = '';
}

socket.on('connect', () => {
  socket.emit('unirse', { id: ventanillaId, rol: 'personal' });
});

socket.on('disconnect', () => {
  estado('⚠️ Sin conexión con el servidor', false);
});

socket.on('connect_error', () => {
  estado('⚠️ No se pudo conectar con el servidor. Revisa tu internet.', false);
});

socket.on('ventanilla-eliminada', () => {
  window.location.replace('/panel');
});

socket.on('unido', (datos) => {
  $('titulo-ventanilla').innerText = datos.nombre + ' - Lista para atender';

  if (!$('informacion-negocio').value) {
    $('informacion-negocio').value = datos.informacion;
  }

  estado('● En línea - Esperando cliente', true);
});

socket.on('cliente-conectado', () => {
  $('chat').innerHTML = '';
  $('alerta-negocio').style.display = 'none';
  $('qr-container').classList.add('hidden');
  $('panel-chat').classList.remove('hidden');
  estado('● Cliente conectado', true);
});

socket.on('cliente-desconectado', () => {
  $('panel-chat').classList.add('hidden');
  $('qr-container').classList.remove('hidden');
  $('alerta-negocio').style.display = 'none';
  estado('● En línea - Esperando cliente', true);
});

socket.on('chat', (datos) => {
  agregarBurbuja(datos.emisor, datos.texto);
  if (datos.emisor === 'cliente') {
    leerTexto('El cliente dice: ' + datos.texto);
  }
});

socket.on('alerta', (datos) => {
  $('alerta-negocio').style.display = 'block';
  $('alerta-texto').innerText = datos.texto;
  leerTexto(datos.texto);
});

socket.on('cola', (datos) => {
  $('cola-info').innerText =
    datos.cantidad ? ' · En espera: ' + datos.cantidad : '';
});

$('btn-atender').addEventListener('click', () => {
  socket.emit('atender');
  $('alerta-negocio').style.display = 'none';
});

$('btn-finalizar').addEventListener('click', () => {
  if (confirm('¿Finalizar la atención actual?')) socket.emit('finalizar');
});

$('informacion-negocio').addEventListener('input', (event) => {
  socket.emit('guardar-informacion', event.target.value);
});

$('btn-enviar').addEventListener('click', enviarMensaje);
$('input-mensaje').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') enviarMensaje();
});

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const btnHablar = $('btn-hablar');
const textoInicio = '🎤 Activar transcripción en vivo';
const textoActivo = '🔴 Transcribiendo... (pulsa para detener)';

btnHablar.innerText = textoInicio;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-PE';
  recognition.continuous = true;
  recognition.interimResults = false;

  let activo = false;

  btnHablar.onclick = () => {
    activo = !activo;

    if (activo) {
      btnHablar.innerText = textoActivo;
      try {
        recognition.start();
      } catch (error) {
        activo = false;
        btnHablar.innerText = textoInicio;
      }
    } else {
      btnHablar.innerText = textoInicio;
      recognition.stop();
    }
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const texto = event.results[i][0].transcript.trim();
      if (texto) socket.emit('chat', { texto });
    }
  };

  recognition.onend = () => {
    if (activo) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (error) {
          // El reconocimiento ya se encuentra activo.
        }
      }, 300);
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      activo = false;
      btnHablar.innerText = 'Permite el micrófono para usar la voz';
    }
  };
} else {
  btnHablar.disabled = true;
  btnHablar.innerText =
    'Tu navegador no admite voz a texto (usa Chrome)';
}
