/**
 * Prueba de meta-guard (src/meta-guard.ts) y de extraerMensajeSeguimiento
 * (services/claude.ts): la barrera que evita que el razonamiento interno del
 * modelo le llegue al doctor por WhatsApp.
 *
 * Igual que las demás pruebas del proyecto: sin framework, contra dist/, sin
 * llamar a Anthropic ni a GHL.
 *
 *   npm run build && npm run test:meta-guard
 *
 * Los casos "se tira" son textuales: los que recibieron pacientes reales del
 * bot del Dr. Romero (misma plantilla) entre el 13 y el 21/10/2026. Los casos
 * "sale" son respuestas normales de Ana sacadas de los ejemplos de su prompt:
 * un filtro que se come mensajes buenos deja al doctor con la línea neutral en
 * vez de su respuesta.
 */
process.env.GHL_API_KEY = 'x';
process.env.ANTHROPIC_API_KEY = 'x';
process.env.GHL_LOCATION_ID = 'loc';
process.env.DATABASE_URL = 'postgres://x/x';

const path = require('path');
const D = (p) => require(path.join(__dirname, '..', 'dist', p));
const { motivoMetaComentario } = D('meta-guard.js');
const { extraerMensajeSeguimiento } = D('services/claude.js');

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (!cond) fallos++;
  console.log(`${cond ? '✅' : '❌'} ${nombre}`);
  if (!cond && detalle !== undefined) console.log('   obtenido:', JSON.stringify(detalle));
}

// ── Se tira: fugas reales (Dr. Romero) y variantes de Ana ───────────────────
const fugas = [
  ['follow-up 21-oct (análisis)',
    'Para generar el mensaje de seguimiento, necesito evaluar el contexto:\n\n**Análisis de la conversación:**\n- El contacto llegó desde un anuncio de Facebook preguntando por la consulta.\n- Se le dio la información y no respondió.\n\n**Evaluación:** sigue interesada.\n\n**Mensaje de seguimiento:**\nHola! Pudo revisar la información?'],
  ['follow-up 17-oct (no genero)',
    'No genero mensaje de seguimiento porque la conversación aún está activa esperando la respuesta del contacto sobre el horario que se le ofreció.'],
  ['respuesta tras escalar 14-oct',
    "Perfecto. Todos los datos de [nombre] han sido capturados y la escalación a Karime se completó exitosamente. La paciente ya está clasificada como 'caliente' y Karime le dará seguimiento."],
  ['centinela suelto con explicación', 'Este contacto es un proveedor, así que: NO_FOLLOW_UP'],
  ['centinela NO_INSISTIR', 'El doctor ya se despidió. NO_INSISTIR'],
  ['eco de la instrucción interna', '[INSTRUCCIÓN INTERNA DE SEGUIMIENTO] Entendido.'],
  ['nombra una herramienta', 'Listo, ya llamé escalar_a_humano con el motivo "quiere inscribirse".'],
  ['nombra cerrar_seguimiento', 'Como dijo que no, uso cerrar_seguimiento y me despido.'],
  ['tercera persona (Ana tras escalar)',
    'El contacto ya quedó con Karla para los datos bancarios; el diplomado por confirmar es Implantología.'],
  ['encabezado Evaluación:', 'Evaluación: el doctor sigue interesado en Rehabilitación.\nLe escribo para retomar.'],
];
for (const [nombre, texto] of fugas) {
  const m = motivoMetaComentario(texto);
  ok(`se tira: ${nombre} (${m})`, m !== null, texto.slice(0, 80));
}

// ── Sale: respuestas normales de Ana (ejemplos de su prompt.md y del yaml) ──
const buenas = [
  'La inversión total del diplomado corresponde al programa completo de 15 módulos y se distribuye de la siguiente manera:\n\n🔹 Inscripción: $3,500\n🔹 15 mensualidades: $8,900 c/u\n\n👉 Para reservar su lugar:\nSe solicita cubrir el costo de inscripción de $3,500, ya que de esta forma podemos confirmar y contabilizar los espacios disponibles del grupo.\n\nTambién contamos con la opción de realizar el pago completo del diplomado en una sola exhibición, en cuyo caso se bonifica el módulo 15.\n\nEn caso de requerir factura, se puede generar sin problema.\n\nLe interesa reservar su lugar?',
  'Meses queriendo meterse a implantes? Y qué es lo que más lo ha frenado?',
  'Me da la impresión de que le preocupa llegar a la clínica sin experiencia previa. Es de lo más común, y justo para eso los primeros módulos son en dummies antes de ver pacientes.',
  'Parece que le preocupa que al final salga más caro de lo que le dije. Lo entiendo: el total del diplomado es de $137,000, y los materiales y sus pacientes se manejan aparte.',
  'tenemos una promoción vigente: si un colega suyo también se inscribe, se bonifica el módulo 15. Los detalles de cómo se aplica se los confirma Karla.',
  'el grupo ya se está formando y el cupo es limitado. Si le parece, lo comunico con Karla para que le pase los datos y reserve su lugar con la inscripción, y cualquier otra duda la vemos sobre la marcha. Le parece bien?',
  'claro, tómese su tiempo, sin presión. Hay algo que le pueda aclarar para que decida con calma?',
  'Contamos con dos diplomados, Rehabilitación y Estética Avanzada e Implantología Dental. Agradezco me indique cuál es de su interés',
  'Me permito escribirle nuevamente ya que ya se está formando el grupo... la apertura está programada para el 28 y 29 de noviembre de 2026. Si continúa interesado, con gusto le envío los detalles y las opciones para reservar su lugar',
  // "el paciente" es vocabulario legítimo de CECOD (los pacientes de cada alumno).
  'CECOD no proporciona pacientes: cada alumno consigue y programa a los suyos. Si el paciente no puede cubrir el tratamiento completo, el presupuesto lo ve usted directo con él, y la clínica se programa según los pacientes registrados.',
  'Gracias, ya recibí su cédula. Con eso Karla le confirma si aplica para Implantología.',
  // Respaldos del yaml y líneas neutrales del worker: también pasan por el guard.
  'Hola Laura, le escribo de CECOD. Pudo revisar la información del diplomado? Con gusto le resuelvo cualquier duda para que pueda reservar su lugar, el grupo ya se está formando.',
  'Hola Laura, retomo por aquí. El cupo de la próxima generación es limitado. Le comparto cómo reservar su lugar?',
  'Listo, ya le pasé tu mensaje al equipo y en un momento te escriben por aquí 😊',
  'Gracias por tu mensaje 😊 En un momento una persona del equipo te confirma por aquí.',
];
for (const texto of buenas) {
  const m = motivoMetaComentario(texto);
  ok(`sale: ${texto.slice(0, 60).replace(/\n/g, ' ')}…`, m === null, m);
}

// ── extraerMensajeSeguimiento ───────────────────────────────────────────────
const casosExtraer = [
  ['solo la etiqueta', '<mensaje>Hola Dr. Pérez, pudo ver el calendario?</mensaje>', 'Hola Dr. Pérez, pudo ver el calendario?'],
  ['análisis afuera se tira',
    '**Análisis de la conversación:** el contacto preguntó por Implantología.\n\n<mensaje>\nHola, quedó pendiente lo de su título en trámite. Ya es egresado?\n</mensaje>',
    'Hola, quedó pendiente lo de su título en trámite. Ya es egresado?'],
  ['sin etiquetas → no sale', 'Hola, pudo revisar la información?', null],
  ['etiqueta vacía → no sale', '<mensaje>   </mensaje>', null],
  ['solo centinela → no sale', 'NO_INSISTIR', null],
  ['varias → la última', '<mensaje>borrador</mensaje>\nMejor así:\n<mensaje>Versión final</mensaje>', 'Versión final'],
  ['mayúsculas en la etiqueta', '<MENSAJE>Hola</MENSAJE>', 'Hola'],
  ['etiqueta sin cerrar → no sale', '<mensaje>Hola, sigo aquí', null],
];
for (const [nombre, entrada, esperado] of casosExtraer) {
  const r = extraerMensajeSeguimiento(entrada);
  ok(`extraer: ${nombre}`, r === esperado, r);
}

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
