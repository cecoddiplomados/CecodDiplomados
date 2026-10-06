/**
 * Horario del equipo (`horario_equipo`): en ese horario el bot no contesta y
 * los seguimientos se recorren al cierre. Sin red ni base. Corre con TZ=UTC,
 * como el servidor de Railway: la hora del negocio NO es la del servidor.
 *
 *   npm run test:horario-equipo
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://prueba:prueba@localhost:5432/prueba';
const { ventanaEquipoActual } = require('../dist/services/horario-equipo');
const { colaSinContestar } = require('../dist/workers/retomarWorker');
const { clampToWindow } = require('../dist/services/follow-up');

let fallos = 0;
const ok = (cond, nombre) => { console.log(`${cond ? '✅' : '❌'} ${nombre}`); if (!cond) fallos++; };
// Monterrey = UTC-6 todo el año (sin horario de verano desde 2022).
const mty = (fechaHora) => Date.parse(`${fechaHora}:00-06:00`);
const hhmm = (ms) => new Date(ms - 6 * 3600e3).toISOString().slice(11, 16);

console.log('\nLunes a viernes 8:30–16:30');
ok(ventanaEquipoActual(mty('2026-10-05T08:29')) === null, 'lunes 8:29 → contesta Ana');
ok(ventanaEquipoActual(mty('2026-10-05T08:30')) !== null, 'lunes 8:30 → atiende Karla');
const v = ventanaEquipoActual(mty('2026-10-05T10:15'));
ok(v !== null && hhmm(v.finMs) === '16:30', `lunes 10:15 → Karla, cierre a las 16:30 (dio ${v && hhmm(v.finMs)})`);
ok(ventanaEquipoActual(mty('2026-10-09T16:29')) !== null, 'viernes 16:29 → Karla');
ok(ventanaEquipoActual(mty('2026-10-09T16:30')) === null, 'viernes 16:30 → Ana (hora de cierre exacta)');
ok(ventanaEquipoActual(mty('2026-10-07T22:00')) === null, 'miércoles 22:00 → Ana');

console.log('\nSábado 8:30–13:00 y domingo');
ok(ventanaEquipoActual(mty('2026-10-10T12:59')) !== null, 'sábado 12:59 → Karla');
ok(ventanaEquipoActual(mty('2026-10-10T13:00')) === null, 'sábado 13:00 → Ana');
ok(ventanaEquipoActual(mty('2026-10-11T11:00')) === null, 'domingo 11:00 → Ana');

console.log('\nSeguimientos: si caen en horario de Karla, salen al cierre');
const fin = ventanaEquipoActual(mty('2026-10-05T11:00')).finMs;
ok(hhmm(clampToWindow(fin + 2 * 60e3)) === '16:32', `seguimiento del lunes 11:00 → sale 16:32 (dio ${hhmm(clampToWindow(fin + 2 * 60e3))})`);

console.log('\nQué se retoma al cierre');
const t = (h) => new Date(mty(`2026-10-05T${h}`)).toISOString();
const hist = [
  { role: 'user', content: 'hola (anoche)', ts: t('07:00') },
  { role: 'assistant', content: 'Hola! Soy Ana', ts: t('07:01') },
  { role: 'user', content: 'cuánto cuesta?', ts: t('10:00') },
  { role: 'user', content: 'es para implantes', ts: t('10:02') },
];
ok(colaSinContestar(hist, mty('2026-10-05T10:00')) === 2, 'los dos mensajes de la mañana sin contestar se retoman, lo de anoche no');
const contestado = [...hist, { role: 'assistant', content: 'La inversión…', ts: t('17:00') }];
ok(colaSinContestar(contestado, mty('2026-10-05T10:00')) === contestado.length, 'si Ana ya contestó, no hay nada que retomar');

console.log(fallos ? `\n${fallos} prueba(s) fallaron.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
