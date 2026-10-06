import { getConfig, DIAS_SEMANA, hhmmToMinutes } from '../config';
import { slotLocalParts } from './horario';

/**
 * Horario en que atiende una PERSONA del equipo (`horario_equipo` del yaml).
 *
 * En ese horario el bot no contesta: guarda el mensaje y, si nadie lo atendió
 * al cerrar la jornada, lo retoma (workers/retomarWorker.ts). Los seguimientos
 * automáticos tampoco salen en ese horario: se recorren al cierre.
 *
 * Nació en CECOD (oct 2026): Karla atiende de 8:30 a 4:30 y Ana solo fuera de
 * ese horario. Sin el bloque en el yaml, todo esto se apaga y el bot contesta
 * a toda hora, como antes.
 */

export interface VentanaEquipo {
  /** Fin de la ventana actual (ms, instante real). */
  finMs: number;
}

/**
 * Si AHORA es horario del equipo, la ventana en curso; si no, null.
 * Rango [inicio, fin): a la hora de cierre exacta ya es del bot.
 */
export function ventanaEquipoActual(nowMs: number = Date.now()): VentanaEquipo | null {
  const he = getConfig().horario_equipo;
  if (!he) return null;
  const parts = slotLocalParts(new Date(nowMs).toISOString(), he.timezone);
  if (!parts) return null;
  for (const [nombreDia, ventanas] of Object.entries(he.dias)) {
    if (DIAS_SEMANA[nombreDia.trim().toLowerCase()] !== parts.dia) continue;
    for (const rango of ventanas) {
      const [ini, fin] = rango.split('-').map(hhmmToMinutes);
      if (ini === null || fin === null) continue;
      if (parts.minutos >= ini && parts.minutos < fin) {
        // slotLocalParts trunca a minutos: se descuentan los segundos para
        // que el fin caiga en el minuto exacto de cierre.
        const segundos = Math.floor(nowMs / 1000) % 60;
        return { finMs: nowMs + (fin - parts.minutos) * 60_000 - segundos * 1000 };
      }
    }
  }
  return null;
}

export function enHorarioEquipo(nowMs: number = Date.now()): boolean {
  return ventanaEquipoActual(nowMs) !== null;
}
