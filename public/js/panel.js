async function solicitar(url, opciones) {
  const respuesta = await fetch(url, opciones);

  if (!respuesta.ok) {
    const datos = await respuesta.json();
    throw new Error(datos.error || 'La solicitud no se pudo completar.');
  }

  return respuesta.status === 204 ? null : respuesta.json();
}

function mostrarError(elemento, error) {
  console.error(error);
  elemento.hidden = false;
  elemento.innerText = error.message;
}

async function cargarEstadisticas() {
  const errorElement = document.getElementById('panel-error');

  try {
    const datos = await solicitar('/api/estadisticas');
    const campos = [
      'total',
      'auditiva',
      'visual',
      'fisica',
      'atendidas',
      'finalizadas'
    ];

    campos.forEach((campo) => {
      document.getElementById(campo).innerText = datos[campo];
    });

    errorElement.hidden = true;
  } catch (error) {
    mostrarError(errorElement, error);
  }
}

function textoTipoEvento(tipo, datos) {
  if (tipo === 'solicitud') {
    const tipos = {
      auditiva: 'Atención por texto',
      visual: 'Asistencia visual',
      fisica: 'Asistencia física',
    };
    return 'Nueva solicitud: ' + (tipos[datos.modo] || datos.modo);
  }
  if (tipo === 'atendida') return 'Atención iniciada';
  if (tipo === 'finalizada') return 'Atención finalizada';
  return tipo;
}

async function cargarHistorial() {
  const lista = document.getElementById('lista-historial');
  const errorElement = document.getElementById('historial-error');
  const limite = document.getElementById('limite-historial').value;

  try {
    const historial = await solicitar('/api/historial?limite=' + limite);
    lista.replaceChildren();

    if (!historial.length) {
      const vacio = document.createElement('p');
      vacio.innerText = 'Todavía no hay movimientos registrados.';
      lista.append(vacio);
      errorElement.hidden = true;
      return;
    }

    historial.forEach((evento) => {
      const item = document.createElement('article');
      item.className = 'history-item';

      const fecha = new Date(evento.fecha);
      const fechaTexto = Number.isNaN(fecha.getTime())
        ? 'Fecha no disponible'
        : fecha.toLocaleString('es-ES');

      const tipo = document.createElement('strong');
      tipo.innerText = textoTipoEvento(evento.tipo, evento);
      const ventanilla = document.createElement('div');
      ventanilla.innerText = evento.ventanilla || 'Ventanilla';
      const fechaElemento = document.createElement('small');
      fechaElemento.innerText = fechaTexto;

      item.append(tipo, ventanilla, fechaElemento);
      lista.append(item);
    });

    errorElement.hidden = true;
  } catch (error) {
    mostrarError(errorElement, error);
  }
}

function crearVentanillaCard(ventanilla) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'card counter-item';

  const titulo = document.createElement('h3');
  titulo.innerText = ventanilla.nombre;

  const estado = document.createElement('p');
  estado.innerText = ventanilla.atendiendo
    ? 'Hay una atención en curso.'
    : ventanilla.enEspera
      ? 'Personas esperando: ' + ventanilla.enEspera
      : 'Sin atenciones en curso.';

  const codigo = document.createElement('img');
  codigo.className = 'counter-qr';
  codigo.src = '/qr/' + encodeURIComponent(ventanilla.id);
  codigo.alt = 'Código QR de ' + ventanilla.nombre;
  codigo.loading = 'lazy';

  const enlaces = document.createElement('div');
  enlaces.className = 'counter-links';

  const abrirPanel = document.createElement('a');
  abrirPanel.className = 'btn btn-outline';
  abrirPanel.href = '/personal/' + encodeURIComponent(ventanilla.id);
  abrirPanel.target = '_blank';
  abrirPanel.rel = 'noopener';
  abrirPanel.innerText = 'Abrir panel del personal';

  const descargarQR = document.createElement('a');
  descargarQR.className = 'btn btn-outline';
  descargarQR.href = codigo.src;
  descargarQR.download = ventanilla.id + '.png';
  descargarQR.innerText = 'Descargar QR';

  const eliminar = document.createElement('button');
  eliminar.type = 'button';
  eliminar.className = 'btn btn-danger';
  eliminar.innerText = 'Eliminar ventanilla';
  eliminar.disabled = ventanilla.atendiendo || ventanilla.enEspera > 0;
  eliminar.title = eliminar.disabled
    ? 'Primero finaliza la atención y vacía la fila.'
    : '';
  eliminar.addEventListener('click', () => eliminarVentanilla(ventanilla));

  enlaces.append(abrirPanel, descargarQR, eliminar);
  tarjeta.append(titulo, estado, codigo, enlaces);
  return tarjeta;
}

async function cargarVentanillas() {
  const lista = document.getElementById('lista-ventanillas');
  const errorElement = document.getElementById('ventanillas-error');

  try {
    const ventanillas = await solicitar('/api/ventanillas');
    lista.replaceChildren();

    if (!ventanillas.length) {
      const vacio = document.createElement('p');
      vacio.innerText = 'Todavía no hay ventanillas configuradas.';
      lista.append(vacio);
    } else {
      ventanillas.forEach((ventanilla) => {
        lista.append(crearVentanillaCard(ventanilla));
      });
    }

    errorElement.hidden = true;
  } catch (error) {
    mostrarError(errorElement, error);
  }
}

async function eliminarVentanilla(ventanilla) {
  const confirmar = window.confirm(
    '¿Eliminar ' + ventanilla.nombre + '? Su QR dejará de funcionar.'
  );
  if (!confirmar) return;

  const errorElement = document.getElementById('ventanillas-error');
  const mensaje = document.getElementById('ventanillas-mensaje');

  try {
    await solicitar('/api/ventanillas/' + encodeURIComponent(ventanilla.id), {
      method: 'DELETE'
    });
    errorElement.hidden = true;
    mensaje.innerText = ventanilla.nombre + ' fue eliminada.';
    await cargarVentanillas();
  } catch (error) {
    mostrarError(errorElement, error);
    await cargarVentanillas();
  }
}

document.getElementById('form-ventanilla').addEventListener('submit', async (event) => {
  event.preventDefault();

  const input = document.getElementById('nombre-ventanilla');
  const boton = event.currentTarget.querySelector('button[type="submit"]');
  const errorElement = document.getElementById('ventanillas-error');
  const mensaje = document.getElementById('ventanillas-mensaje');

  boton.disabled = true;
  mensaje.innerText = '';

  try {
    const ventanilla = await solicitar('/api/ventanillas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: input.value })
    });

    input.value = '';
    errorElement.hidden = true;
    mensaje.innerText = ventanilla.nombre + ' y su QR fueron creados.';
    await cargarVentanillas();
  } catch (error) {
    mostrarError(errorElement, error);
  } finally {
    boton.disabled = false;
  }
});

cargarEstadisticas();
cargarVentanillas();
cargarHistorial();

document.getElementById('limite-historial').addEventListener('change', cargarHistorial);

setInterval(cargarEstadisticas, 3000);
setInterval(cargarHistorial, 5000);
