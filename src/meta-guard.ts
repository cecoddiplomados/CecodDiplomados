/**
 * Última barrera antes de mandarle algo al contacto: detecta cuando el modelo
 * escribió su razonamiento interno en vez del mensaje.
 *
 * Viene del bot del Dr. Romero (misma plantilla), donde pasó en producción
 * seis veces entre el 13 y el 21 de octubre de 2026, y todas salieron por
 * WhatsApp tal cual. Tres de ellas:
 *   - follow-up: "Para generar el mensaje de seguimiento, necesito evaluar el
 *     contexto: **Análisis de la conversación:** - El contacto llegó desde un
 *     anuncio…" (21-oct)
 *   - follow-up: "No genero mensaje de seguimiento porque la conversación aún
 *     está activa esperando la respuesta del contacto…" (17-oct)
 *   - respuesta normal, después de escalar: "Perfecto. Todos los datos de [nombre]
 *     han sido capturados y la escalación a Karime se completó
 *     exitosamente. La paciente ya está clasificada como 'caliente'…" (14-oct)
 *
 * Ana tiene el mismo prompt de fondo ("nunca muestres tu razonamiento") y el
 * mismo modelo, así que le puede pasar igual: una regla en el prompt es una
 * sugerencia, esto es código. stripReasoning (services/claude.ts) quita
 * párrafos de narración; esto tira el texto completo, porque un análisis con
 * encabezados no tiene ningún párrafo rescatable.
 *
 * Los patrones son frases que Ana NUNCA le diría a un doctor (le habla de
 * "usted", nunca de "el contacto" en tercera persona, ni nombra sus
 * herramientas). Ojo: a diferencia del Dr. Romero, aquí "el paciente" SÍ es
 * vocabulario legítimo (los pacientes que cada alumno atiende en la clínica:
 * "si el paciente tiene…"), así que no está en la lista de tercera persona; la
 * narración de una escalación la atrapa el patrón de escalación. Si alguno da
 * un falso positivo, el costo es una línea neutral + pase a Karla y una línea
 * `[meta-guard]` en logs; el costo contrario es lo de arriba.
 */

const PATRONES: Array<[string, RegExp]> = [
  ['centinela', /\bNO_(FOLLOW_UP|INSISTIR)\b/],
  ['instrucción interna', /\[INSTRUCCI[OÓ]N/i],
  // Todas las que puede registrar buildTools, no solo las que CECOD tiene
  // prendidas hoy (sin calendars): ninguna se le nombra nunca a un contacto.
  ['nombre de herramienta', /\b(mover_a_etapa|consultar_disponibilidad|agendar_cita|cliente_frecuente|cancelar_cita|escalar_a_humano|cerrar_seguimiento|actualizar_campo)\b/],
  ['encabezado de análisis', /an[aá]lisis de la conversaci[oó]n|^\W*evaluaci[oó]n\W*$|^\W*evaluaci[oó]n\s*:/im],
  ['habla del seguimiento', /mensaje de seguimiento|necesito evaluar|no genero (el |ning[uú]n )?mensaje/i],
  ['tercera persona', /\b(el|la) (contacto|prospecto|lead|interesad[oa]) (ya |no |lleg[oó]|dijo|pregunt[oó]|dej[oó]|lleva|mostr[oó]|hizo|est[aá]|fue|ser[aá]|tiene|quer[ií]a)/i],
  ['habla de la escalación', /\bescalaci[oó]n\b|\bescalad[oa]\b|datos obligatorios|clasificad[oa] como|se complet[oó] exitosamente|han sido capturados/i],
];

/** Devuelve el motivo si el texto parece razonamiento interno, o null si se puede mandar. */
export function motivoMetaComentario(text: string): string | null {
  for (const [motivo, re] of PATRONES) {
    if (re.test(text)) return motivo;
  }
  return null;
}
