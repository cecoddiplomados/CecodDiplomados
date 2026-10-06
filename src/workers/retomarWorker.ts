import { boss, enqueueMessage } from '../queue';
import { db } from '../db/client';
import { getConfig } from '../config';
import { ChatMessage, GhlChannel } from '../types';
import { contactoBloqueadoAsync } from '../blocklist';
import { tieneTagSinBot } from '../services/ghl';
import { mensajesDePersona, nuevosParaHistorial } from '../services/atencion-humana';
import { zonaDelNegocio } from '../services/ghl-calendar';
import { ventanaEquipoActual } from '../services/horario-equipo';

/**
 * Retoma al cierre de la jornada lo que llegó en horario del equipo y nadie
 * contestó (ver services/horario-equipo.ts).
 *
 * En horario del equipo el worker de mensajes no contesta: guarda el mensaje
 * en el historial, marca `metadata.pendiente_horario` con la hora del primero,
 * y programa un job aquí para el cierre. Al cierre:
 *   - si una persona del equipo le escribió desde entonces → lo atendió ella,
 *     se guardan sus mensajes en el historial y no se hace nada más;
 *   - si no → los mensajes sin contestar vuelven al pending y se encola un
 *     turno normal, que contesta con todo el contexto (y con las mismas
 *     guardas de siempre: tags, persona escribiendo, lista negra).
 */

export const RETOMAR_QUEUE = 'retomar-horario';

export interface RetomarJobData {
  contactId: string;
  phone: string;
  contactName: string | null;
  channel?: GhlChannel;
}

/** Programa la revisión al cierre. Uno por contacto y por cierre. */
export async function programarRetomar(data: RetomarJobData, finMs: number): Promise<void> {
  const cuando = new Date(finMs + 60_000);
  await boss.send(RETOMAR_QUEUE, data, {
    singletonKey: `${data.contactId}:retomar:${cuando.toISOString().slice(0, 16)}`,
    startAfter: cuando,
  });
}

/** Los mensajes del contacto al final del historial que nadie contestó desde `desdeMs`. */
export function colaSinContestar(history: ChatMessage[], desdeMs: number): number {
  let i = history.length;
  while (i > 0) {
    const m = history[i - 1];
    if (m.role !== 'user') break;
    const t = Date.parse(m.ts);
    if (!isNaN(t) && t < desdeMs) break;
    i--;
  }
  return i; // índice donde empieza la cola
}

async function limpiarMarca(contactId: string): Promise<void> {
  await db.query(
    `UPDATE conversations SET metadata = COALESCE(metadata, '{}'::jsonb) - 'pendiente_horario' WHERE contact_id = $1`,
    [contactId]
  );
}

async function handleRetomar(data: RetomarJobData): Promise<void> {
  const { contactId } = data;
  const r = await db.query(
    `SELECT messages, metadata, pending_message FROM conversations WHERE contact_id = $1`,
    [contactId]
  );
  if (r.rows.length === 0) return;
  const history: ChatMessage[] = r.rows[0].messages ?? [];
  const desde = (r.rows[0].metadata as { pendiente_horario?: string } | null)?.pendiente_horario;
  if (!desde) return; // ya se contestó por la vía normal

  // Si todavía es horario del equipo (job adelantado, cambio de horario), se recorre.
  const ventana = ventanaEquipoActual();
  if (ventana) {
    await programarRetomar(data, ventana.finMs);
    return;
  }

  if (await contactoBloqueadoAsync(contactId, data.phone)) {
    await limpiarMarca(contactId);
    return;
  }
  // Falla CERRADO: si no se puede saber si lo atendió alguien, no se le habla.
  try {
    if (await tieneTagSinBot(contactId, getConfig().tags_sin_bot)) {
      await limpiarMarca(contactId);
      return;
    }
    const humanos = await mensajesDePersona(contactId, history, zonaDelNegocio(), Date.parse(desde));
    if (humanos.length > 0) {
      const guardados = [...history, ...nuevosParaHistorial(humanos, history)].slice(-100);
      await db.query(
        `UPDATE conversations SET messages = $1::jsonb, metadata = COALESCE(metadata, '{}'::jsonb) - 'pendiente_horario'
          WHERE contact_id = $2`,
        [JSON.stringify(guardados), contactId]
      );
      console.log(`[retomar] lo atendió una persona del equipo, no se retoma | contact=${contactId}`);
      return;
    }
  } catch (e) {
    console.warn(`[retomar] no se pudo revisar GHL — no se retoma: ${(e as Error).message}`);
    return;
  }

  const inicio = colaSinContestar(history, Date.parse(desde));
  const cola = history.slice(inicio);
  if (cola.length === 0) {
    await limpiarMarca(contactId);
    return;
  }
  const texto = cola.map((m) => m.content).join('\n');
  // Los mensajes vuelven al pending: el turno normal los toma como si
  // acabaran de llegar, con todo el historial anterior como contexto.
  await db.query(
    `UPDATE conversations SET
       messages = $1::jsonb,
       pending_message = CASE WHEN pending_message IS NULL OR pending_message = '' THEN $2
                              ELSE $2 || E'\\n' || pending_message END,
       pending_at = now(),
       metadata = COALESCE(metadata, '{}'::jsonb) - 'pendiente_horario'
     WHERE contact_id = $3`,
    [JSON.stringify(history.slice(0, inicio)), texto, contactId]
  );
  await enqueueMessage({
    contactId,
    phone: data.phone,
    contactName: data.contactName,
    message: texto,
    channel: data.channel ?? 'WhatsApp',
  });
  console.warn(
    `[retomar] ${cola.length} mensaje(s) de horario del equipo sin contestar — Ana los retoma | contact=${contactId}`
  );
}

export async function startRetomarWorker(): Promise<void> {
  await boss.work<RetomarJobData>(RETOMAR_QUEUE, { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    if (!job) return;
    try {
      await handleRetomar(job.data);
    } catch (e) {
      console.error(`[retomar] falló | contact=${job.data.contactId}: ${(e as Error).message}`);
      throw e;
    }
  });
  console.log('[retomar] worker started');
}
