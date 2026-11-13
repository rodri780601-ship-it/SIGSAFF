/* =====================================================================
   SIGPM · Funciones incorporadas desde el SAF (Sistema de Administración
   Forestal de CONAF): subrogancia, registro de consultores, sugerencia de
   admisibilidad, planes vigentes y consolidación de la ficha predial,
   salidas a terreno, documentos con plantillas y versiones, recurso de
   reposición, avisos de ejecución de faenas, tareas con plazo y reportes.
   Las reglas del procedimiento de SIGPM no cambian: estas funciones se
   suman a ellas.
   ===================================================================== */

/* ====================== Subrogancia (SAF: subrogancia/) ====================== */
const subrogancias = () => DB.subrogancias || (DB.subrogancias = []);
const ROLES_SUBROGABLES = ['JP', 'JA']; // jefaturas que pueden dejar subrogante
const esInterno = u => !!u && !['PR', 'CO'].includes(u.rol);
function subroganciaActivaDe(titularId, fecha = hoyISO()) {
  return subrogancias().find(s => s.titular === titularId && !s.caducada && s.desde <= fecha && fecha <= s.hasta) || null;
}
const subroganciasComoSubrogante = (uid, fecha = hoyISO()) => subrogancias().filter(s => s.subrogante === uid && !s.caducada && s.desde <= fecha && fecha <= s.hasta);
const candidatosSubrogante = titularId => USUARIOS.filter(u => esInterno(u) && u.id !== titularId);

function definirSubrogante(subroganteId, desde, hasta, motivo) {
  const tit = USUARIO_REAL;
  if (!ROLES_SUBROGABLES.includes(tit.rol)) throw new Error('Solo las jefaturas (jefe provincial y jefe analista) definen subrogante.');
  if (!subroganteId || !desde || !hasta) throw new Error('Indique subrogante y período.');
  if (hasta < desde) throw new Error('La fecha de término es anterior a la de inicio.');
  if (hasta < hoyISO()) throw new Error('El período ya terminó.');
  const choca = subrogancias().find(s => s.titular === tit.id && !s.caducada && s.desde <= hasta && desde <= s.hasta);
  if (choca) throw new Error(`Ya tiene un subrogante entre el ${fmtFecha(choca.desde)} y el ${fmtFecha(choca.hasta)}. Caduque esa subrogancia primero.`);
  DB.seq.sub = (DB.seq.sub || 0) + 1;
  const s = { id: `SUB-${DB.seq.sub}`, titular: tit.id, subrogante: subroganteId, desde, hasta, motivo: motivo || '', creada: new Date().toISOString(), caducada: null };
  subrogancias().push(s); guardar();
  return s;
}
function caducarSubrogancia(id) {
  const s = subrogancias().find(x => x.id === id);
  if (!s || s.titular !== USUARIO_REAL.id || s.caducada) return false;
  s.caducada = new Date().toISOString(); guardar();
  return true;
}
/* Cambia el perfil efectivo: propio (null) o el del titular al que se subroga. Los permisos se evalúan con el perfil efectivo
   y cada acto queda registrado con el nombre del subrogante. */
function actuarComo(titularId, silencioso = false) {
  const real = USUARIO_REAL;
  if (!titularId || !real) { USUARIO = real; try { localStorage.removeItem(PERFIL_KEY); } catch (e) { /* */ } return true; }
  const s = DB && subroganciasComoSubrogante(real.id).find(x => x.titular === titularId);
  if (!s) { USUARIO = real; try { localStorage.removeItem(PERFIL_KEY); } catch (e) { /* */ } if (!silencioso) toast('La subrogancia no está vigente', 'warn'); return false; }
  const t = usuario(titularId);
  USUARIO = { ...t, nombre: `${real.nombre} (S)`, subrogante: real.id, titularNombre: t.nombre };
  try { localStorage.setItem(PERFIL_KEY, titularId); } catch (e) { /* */ }
  return true;
}
/* Autor de una entrada del historial o de un documento */
const autorDe = (uid, subId) => subId ? `${usuario(subId).nombre} (S), por ${usuario(uid).nombre}` : usuario(uid).nombre;
const firmanteResolucion = r => r ? (r.subrogante ? `${usuario(r.subrogante).nombre} (S)` : usuario(r.firmadaPor).nombre) : usuario('jp1').nombre;

/* ====================== Registro de consultores (SAF: secretaria/crearConsultor, jefe analista habilita) ====================== */
const ESTADOS_CONSULTOR = {
  por_habilitar: { nombre: 'Por habilitar', color: 'warn' },
  habilitado: { nombre: 'Habilitado', color: 'ok' },
  rechazado: { nombre: 'Rechazado', color: 'bad' },
  suspendido: { nombre: 'Suspendido', color: 'bad' },
};
const consultores = () => DB.consultores || (DB.consultores = []);
const normRut = r => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
const consultorPorRut = rut => normRut(rut) ? consultores().find(c => normRut(c.rut) === normRut(rut)) || null : null;
const chipConsultor = c => `<span class="chip ${ESTADOS_CONSULTOR[c.estado].color}">${esc(ESTADOS_CONSULTOR[c.estado].nombre)}</span>`;
/* Aptitud según el art. 7° Ley 20.283: para qué tipos de plan habilita el título */
function aptitudConsultor(c) {
  const ev = tipo => evaluarProfesional({ profesional: c, tipoPlan: tipo });
  const f = ev('PMF'), p = ev('PMP');
  return { forestal: f.estado === 'cumple', preservacion: p.estado === 'cumple', det: f.estado === 'cumple' ? f.det : p.estado === 'cumple' ? `${p.det} (solo planes de preservación)` : f.det };
}
function guardarConsultor(datos, id) {
  if (!['ST', 'JA'].includes(USUARIO.rol)) throw new Error('Solo la secretaría técnica o el jefe analista registran consultores.');
  if (!datos.nombre || !datos.rut) throw new Error('Indique nombre y RUT.');
  if (!rutValido(datos.rut)) throw new Error('El RUT no es válido.');
  const dup = consultorPorRut(datos.rut);
  if (dup && dup.id !== id) throw new Error(`El RUT ya está registrado (${dup.nombre}).`);
  const ahora = new Date().toISOString();
  let c = id && consultores().find(x => x.id === id);
  if (c) {
    const cambiaHabilitacion = ['titulo', 'semestres', 'postitulo', 'universidad'].some(k => String(c[k]) !== String(datos[k]));
    Object.assign(c, datos);
    c.historial.push({ fecha: ahora, usuario: USUARIO.id, subrogante: USUARIO.subrogante, accion: 'Datos actualizados' });
    if (cambiaHabilitacion && c.estado === 'habilitado') { c.estado = 'por_habilitar'; c.historial.push({ fecha: ahora, usuario: USUARIO.id, accion: 'Vuelve a «por habilitar»: cambió el título o el plan de estudios' }); }
  } else {
    DB.seq.con = (DB.seq.con || 0) + 1;
    c = { id: `CF-${String(DB.seq.con).padStart(4, '0')}`, ...datos, estado: 'por_habilitar', creado: ahora, por: USUARIO.id, historial: [{ fecha: ahora, usuario: USUARIO.id, subrogante: USUARIO.subrogante, accion: 'Consultor inscrito en el registro' }] };
    consultores().push(c);
  }
  guardar();
  return c;
}
function cambiarEstadoConsultor(c, estado, motivo = '') {
  if (USUARIO.rol !== 'JA') throw new Error('Solo el jefe analista habilita, rechaza o suspende consultores.');
  if (estado === 'habilitado') { const a = aptitudConsultor(c); if (!a.forestal && !a.preservacion) throw new Error(`No cumple el art. 7° de la Ley 20.283: ${a.det}`); }
  if (estado !== 'habilitado' && !motivo) throw new Error('Indique el motivo.');
  c.estado = estado; c.motivo = motivo; c.fechaEstado = hoyISO();
  c.historial.push({ fecha: new Date().toISOString(), usuario: USUARIO.id, subrogante: USUARIO.subrogante, accion: ESTADOS_CONSULTOR[estado].nombre, detalle: motivo });
  guardar();
}
/* Situación en el registro del profesional que firma el plan */
function registroProfesional(sol) {
  const c = consultorPorRut((sol.profesional || {}).rut);
  if (!c) return { nivel: 'warn', txt: 'El profesional no figura en el registro de consultores de CONAF', c: null };
  if (c.estado !== 'habilitado') return { nivel: 'warn', txt: `El profesional figura en el registro de consultores como «${ESTADOS_CONSULTOR[c.estado].nombre}»${c.motivo ? `: ${c.motivo}` : ''}`, c };
  return { nivel: 'ok', txt: `Consultor habilitado en el registro de CONAF (${c.id})`, c };
}

/* ====================== Sugerencia del sistema en la recepción (SAF: include/sugerencias.inc) ======================
   Advierte; no reemplaza la decisión de la secretaría técnica. Lo que es «bad» corresponde a requerir antecedentes (art. 31 Ley 19.880). */
function sugerenciaRecepcion(sol) {
  const obs = [];
  const add = (nivel, txt) => obs.push({ nivel, txt });
  const f = faltantesIngreso(sol);
  if (f.length) add('bad', `No contiene los antecedentes mínimos: ${f.join('; ')}`);
  const ref = sol.fechaIngreso || hoyISO(), d = sol.documentos || {};
  if ((d.dominio || {}).presentado && d.dominio.fecha && habilesEntre(d.dominio.fecha, ref) > NORMA.vigenciaDominio) add('bad', `Certificado de dominio con más de ${NORMA.vigenciaDominio} días hábiles (art. 22 d) D.S. 93)`);
  if (sol.interesado.tipo === 'juridica' && (d.personeria || {}).presentado && d.personeria.fecha && corridosEntre(d.personeria.fecha, ref) > NORMA.vigenciaPersoneria) add('bad', `Personería con más de ${NORMA.vigenciaPersoneria} días corridos (art. 23 b) D.S. 93)`);
  if (sol.profesional.nombre) { const ev = evaluarProfesional(sol); if (ev.estado !== 'cumple') add('bad', `Profesional sin el título requerido para el plan presentado: ${ev.det}`); }
  if (sol.profesional.rut) { const r = registroProfesional(sol); if (r.nivel !== 'ok') add('warn', r.txt); }
  const p = predio(sol.predioId);
  if (p && sol.oficina && norm(sol.oficina) !== norm(oficinaDePredio(p))) add('warn', `El predio está en la provincia de ${p.provincia}: la oficina competente es la ${oficinaDePredio(p)} (art. 2° D.S. 93)`);
  if (esFronteriza(sol)) add('info', `Comuna fronteriza (${textoComunasFronterizas(sol)}): enviar la solicitud a la DIFROL`);
  if (p && sol.cartografia) {
    const sup = superposicionVigentes(sol);
    if (sup.length) add('warn', `Se superpone con planes vigentes del predio: ${[...new Set(sup.map(x => `${x.solId} (Res. ${x.resolucion})`))].join(', ')}. Evalúe si corresponde una modificación del plan vigente (art. 12 Ley 20.283)`);
  }
  const requerir = obs.some(o => o.nivel === 'bad');
  return { requerir, frase: requerir ? 'requerir antecedentes al interesado (art. 31 Ley 19.880)' : 'ingresar la solicitud', obs };
}
function sugerenciaHTML(sol) {
  const s = sugerenciaRecepcion(sol);
  const ic = { bad: '✖', warn: '⚠', info: 'ℹ' };
  return `<section class="card sugerencia ${s.requerir ? 'req' : 'ing'}"><h3>Sugerencia del sistema <small class="muted">Revisión de admisibilidad</small></h3>
    <p><b>El sistema sugiere ${esc(s.frase)}${s.obs.length ? ' considerando:' : '.'}</b></p>
    ${s.obs.length ? `<ul class="list sug-list">${s.obs.map(o => `<li class="${o.nivel}"><span aria-hidden="true">${ic[o.nivel]}</span> ${esc(o.txt)}</li>`).join('')}</ul>` : '<p class="ok-txt small">✔ Antecedentes mínimos completos, certificados vigentes y profesional habilitado.</p>'}
    <p class="muted small">Es una ayuda: la decisión de ingresar o requerir es de la secretaría técnica.</p></section>`;
}

/* ====================== Planes vigentes y consolidación de la ficha predial (SAF: actividadesVigentes, consolidarFichaTmp) ====================== */
const rodalesAprobadosDe = s => (s.pmfbn.rodales || []).filter(r => (s.resolucion.rodalesAprobados || []).map(String).includes(String(r.numero)));
/* Rodales aprobados y vigentes de un predio. hasta: solo planes resueltos hasta esa fecha. */
function actividadesVigentes(predioId, { excluir = null, fecha = hoyISO(), hasta = null } = {}) {
  return DB.solicitudes.filter(s => s.predioId === predioId && s.id !== excluir && s.resolucion && s.resolucion.tipo !== 'rechaza' && (s.resolucion.vigenciaHasta || '') >= fecha && (!hasta || s.resolucion.fecha <= hasta))
    .flatMap(s => rodalesAprobadosDe(s).map(r => {
      const g = ((s.cartografia || {}).features || []).find(f => String(f.properties.rodal) === String(r.numero)) || null;
      return { solId: s.id, resolucion: s.resolucion.numero, fechaRes: s.resolucion.fecha, vigenciaHasta: s.resolucion.vigenciaHasta, rodal: r.numero, tipoForestal: r.tipoForestal,
        metodo: r.metodo, superficie: r.superficie, anioCorta: r.anioCorta, reforestacion: r.reforestacion, geom: g, ejecucion: estadoEjecucion(s, r.numero) };
    }));
}
/* Superposición de los rodales de una solicitud con planes vigentes de otras solicitudes del mismo predio */
function superposicionVigentes(sol, rods) {
  if (!sol.predioId) return [];
  const vig = actividadesVigentes(sol.predioId, { excluir: sol.id, hasta: sol.resolucion ? sol.resolucion.fecha : null }).filter(v => v.geom);
  if (!vig.length) return [];
  const mios = rods || rodalesConGeometria(sol);
  const out = [];
  mios.forEach(r => { if (!r.geom) return; vig.forEach(v => { const ha = interHa(r.geom, v.geom); if (ha > 0.01) out.push({ rodal: r.numero, solId: v.solId, resolucion: v.resolucion, rodalVig: v.rodal, ha: round2(ha), vigenciaHasta: v.vigenciaHasta }); }); });
  return out;
}
/* Al firmar una resolución aprobatoria, el plan se consolida en la ficha predial */
function consolidarFichaPredial(sol, fecha) {
  const p = predio(sol.predioId);
  if (!p || !sol.resolucion || sol.resolucion.tipo === 'rechaza') return;
  p.consolidaciones = p.consolidaciones || [];
  const rods = rodalesAprobadosDe(sol);
  p.consolidaciones.push({ fecha: fecha || hoyISO(), solId: sol.id, resolucion: sol.resolucion.numero, rodales: rods.map(r => r.numero), superficie: round2(sum(rods, 'superficie')), vigenciaHasta: sol.resolucion.vigenciaHasta });
  sol.historial.push({ fecha: (fecha ? fecha + 'T17:00:00' : new Date().toISOString()), usuario: USUARIO ? USUARIO.id : sol.resolucion.firmadaPor, ...(USUARIO && USUARIO.subrogante ? { subrogante: USUARIO.subrogante } : {}), rol: 'JP', accion: 'Plan consolidado en la ficha predial', detalle: `${p.nombre}: ${rods.length} rodal(es), ${fmt(sum(rods, 'superficie'))} ha vigentes hasta ${fmtFecha(sol.resolucion.vigenciaHasta)}` });
}
/* Superficie vigente por tipo forestal (SAF: superficie vigente por grupo) */
function superficieVigentePorTipo(predioId) {
  const o = {};
  actividadesVigentes(predioId).forEach(a => { const k = (TIPOS_FORESTALES[a.tipoForestal] || {}).nombre || a.tipoForestal || '—'; o[k] = round2((o[k] || 0) + (+a.superficie || 0)); });
  return o;
}

/* ====================== Avisos de ejecución de faenas (SAF: avisosEjecucion/) ====================== */
const TIPOS_AVISO = { inicio: 'Aviso de inicio de faenas', avance: 'Informe anual de avance', termino: 'Aviso de término de faenas' };
const avisosDe = sol => sol.avisos || [];
function estadoEjecucion(sol, rodal) {
  const l = avisosDe(sol).filter(a => (a.rodales || []).map(String).includes(String(rodal)));
  if (l.some(a => a.tipo === 'termino')) return 'terminado';
  if (l.some(a => a.tipo === 'inicio')) return 'en_ejecucion';
  return 'sin_iniciar';
}
const ESTADO_EJEC = { sin_iniciar: ['Sin iniciar', ''], en_ejecucion: ['En ejecución', 'info'], terminado: ['Faenas terminadas', 'ok'] };
const puedeAvisar = sol => !!sol.resolucion && sol.resolucion.tipo !== 'rechaza' && ['resuelta', 'notificada'].includes(sol.estado)
  && (USUARIO.rol === 'ST' || (USUARIO.rol === 'PR' && (USUARIO.predios || []).includes(sol.predioId)));
function registrarAviso(sol, a) {
  if (!puedeAvisar(sol)) throw new Error('No puede registrar avisos en esta solicitud.');
  const aprob = (sol.resolucion.rodalesAprobados || []).map(String);
  if (!a.rodales.length) throw new Error('Seleccione al menos un rodal.');
  if (a.rodales.some(r => !aprob.includes(String(r)))) throw new Error('Solo puede informar rodales aprobados en la resolución.');
  if (!a.fecha) throw new Error('Indique la fecha.');
  if (a.fecha > sol.resolucion.vigenciaHasta) throw new Error(`La fecha es posterior a la vigencia del plan (${fmtFecha(sol.resolucion.vigenciaHasta)}).`);
  if (a.tipo !== 'inicio') { const sinInicio = a.rodales.filter(r => estadoEjecucion(sol, r) === 'sin_iniciar'); if (sinInicio.length) throw new Error(`Primero informe el inicio de faenas de los rodales ${sinInicio.join(', ')}.`); }
  if (a.tipo === 'inicio') { const ya = a.rodales.filter(r => estadoEjecucion(sol, r) !== 'sin_iniciar'); if (ya.length) throw new Error(`Los rodales ${ya.join(', ')} ya tienen inicio de faenas.`); }
  sol.avisos = sol.avisos || [];
  DB.seq.av = (DB.seq.av || 0) + 1;
  const reg = { id: `AE-${DB.seq.av}`, ...a, registrado: new Date().toISOString(), por: USUARIO.id, canal: USUARIO.rol === 'PR' ? 'Portal del propietario' : 'Oficina' };
  sol.avisos.push(reg);
  registrar(sol, `${TIPOS_AVISO[a.tipo]} registrado`, `Rodales ${a.rodales.join(', ')} · ${fmtFecha(a.fecha)}${a.superficie ? ` · ${fmt(a.superficie)} ha` : ''}${reg.canal === 'Portal del propietario' ? ' · vía portal' : ''}`);
  guardar();
  return reg;
}
/* Próximo informe anual de avance: un año después del inicio o del último informe (art. 8° Ley 20.283; art. 9° D.S. 93) */
function proximoAvance(sol) {
  const l = avisosDe(sol);
  const ini = l.filter(a => a.tipo === 'inicio');
  if (!ini.length) return null;
  const rodIni = new Set(ini.flatMap(a => a.rodales.map(String)));
  const term = new Set(l.filter(a => a.tipo === 'termino').flatMap(a => a.rodales.map(String)));
  if ([...rodIni].every(r => term.has(r))) return null;
  const base = l.filter(a => a.tipo !== 'termino').map(a => a.fecha).sort().pop();
  const d = fechaDe(base); d.setFullYear(d.getFullYear() + 1);
  return isoDe(d);
}

/* ====================== Salidas a terreno (SAF: fichaEvaluacion/salidaTerreno, informeSalida) ====================== */
function salidasDe(sol) {
  const t = sol.tecnico;
  if (!t.salidas) t.salidas = t.visita && t.visita.fecha ? [{ id: uid(), fecha: t.visita.fecha, funcionarios: [sol.asignacion && sol.asignacion.analista].filter(Boolean), vehiculo: '', horas: '', rodales: [], obs: t.visita.obs || '' }] : [];
  return t.salidas;
}
/* Mantiene el campo «visita» de SIGPM (lo usa el borrador del informe técnico) con el resumen de las salidas */
function sincronizarVisita(sol) {
  const l = salidasDe(sol).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const u = l[l.length - 1];
  sol.tecnico.visita = u ? { fecha: u.fecha, obs: l.length > 1 ? l.map(x => `${fmtFecha(x.fecha)}: ${x.obs || 'sin observaciones'}`).join(' · ') : (u.obs || '') } : { fecha: '', obs: '' };
}

/* ====================== Documentos con plantillas y versiones (SAF: template/, documento.inc) ====================== */
const TIPOS_DOC = {
  comprobante:   { nombre: 'Comprobante de ingreso', pref: 'CI' },
  requerimiento: { nombre: 'Carta de requerimiento de antecedentes (art. 31 Ley 19.880)', pref: 'CR' },
  desistimiento: { nombre: 'Resolución que tiene por desistida la solicitud', pref: 'RD' },
  memo:          { nombre: 'Memorándum de asignación', pref: 'MEM' },
  devTecnica:    { nombre: 'Devolución técnica', pref: 'MEM' },
  devLegal:      { nombre: 'Devolución legal', pref: 'MEM' },
  salida:        { nombre: 'Informe de salida a terreno', pref: 'IST' },
  informeTecnico:{ nombre: 'Informe técnico', pref: 'IT' },
  informeJuridico:{ nombre: 'Informe jurídico', pref: 'IJ' },
  resolucion:    { nombre: 'Resolución', pref: 'RES' },
  notificacion:  { nombre: 'Carta de notificación de la resolución', pref: 'CN' },
  recurso:       { nombre: 'Resolución que resuelve el recurso de reposición', pref: 'RES' },
};
/* Documentos que el usuario puede generar a mano en cada etapa (los demás se emiten solos en cada transición) */
function documentosGenerables(sol) {
  const r = USUARIO.rol, l = [];
  if (r === 'ST' && sol.fechaIngreso) l.push('comprobante');
  if (r === 'ST' && sol.requerimientos.length) l.push('requerimiento');
  if (['AN', 'JA'].includes(r) && salidasDe(sol).length) l.push('salida');
  if (['AN', 'JA'].includes(r) && (sol.tecnico.informe || '').trim()) l.push('informeTecnico');
  if (r === 'AB' && (sol.juridico.informe || '').trim()) l.push('informeJuridico');
  if (r === 'ST' && sol.resolucion) l.push('notificacion');
  return l;
}
const documentosDe = sol => sol.documentosEmitidos || (sol.documentosEmitidos = []);
function emitirDocumentoAuto(sol, tipo, extra = {}, opts = {}) {
  const l = documentosDe(sol);
  const y = (opts.fecha || hoyISO()).slice(0, 4);
  DB.seq.doc = DB.seq.doc || {};
  const pref = TIPOS_DOC[tipo].pref;
  /* Cada transición emite un documento nuevo con su número; «nueva versión» (opts.version) conserva el número del último del mismo tipo */
  const ult = l.filter(d => d.tipo === tipo && (!extra.salidaId || d.salidaId === extra.salidaId)).pop();
  let numero;
  if (tipo === 'resolucion' && sol.resolucion) numero = sol.resolucion.numero;
  else if (tipo === 'recurso' && sol.recurso && sol.recurso.resolucion) numero = sol.recurso.resolucion.numero;
  else if (opts.version && ult) numero = ult.numero;
  else { DB.seq.doc[pref] = (DB.seq.doc[pref] || 0) + 1; numero = `${DB.seq.doc[pref]}/${y}`; }
  const version = l.filter(d => d.tipo === tipo && d.numero === numero).length + 1;
  const doc = { id: uid(), tipo, numero, version, fecha: opts.fecha || hoyISO(), por: opts.por || (USUARIO && USUARIO.id), subrogante: opts.por ? null : (USUARIO && USUARIO.subrogante) || null, salidaId: extra.salidaId || null, texto: '' };
  doc.texto = textoDocumento(sol, doc, extra);
  l.push(doc);
  return doc;
}
const encabezadoDoc = sol => `CORPORACIÓN NACIONAL FORESTAL · ${String(sol.oficina || 'Oficina Provincial').toUpperCase()}`;
function textoDocumento(sol, doc, extra = {}) {
  const p = predio(sol.predioId) || {};
  const pl = plazo(sol);
  const quien = autorDe(doc.por, doc.subrogante);
  const cargo = ROLES[usuario(doc.por).rol] || '';
  const fecha = fmtFecha(doc.fecha);
  const intz = `${sol.interesado.nombre || '—'}, RUT ${sol.interesado.rut || '—'}`;
  const pie = `\n\n${quien}\n${cargo} · ${sol.oficina}`;
  const pred = `predio «${p.nombre || '—'}», rol ${p.rol || '—'}, comuna de ${p.comuna || '—'}`;
  switch (doc.tipo) {
    case 'comprobante': {
      const docs = documentosRequeridos(sol).map(d => `  [${(sol.documentos[d.key] || {}).presentado ? 'X' : ' '}] ${d.nombre} (${d.art})`).join('\n');
      return `${encabezadoDoc(sol)}\nCOMPROBANTE DE INGRESO N° ${doc.numero}\n${fecha}\n
Se deja constancia del ingreso de la solicitud ${sol.id}: ${TIPOS_PLAN[sol.tipoPlan].nombre}.
Interesado: ${intz}.
Predio: ${pred}.
Superficie solicitada: ${fmt(supSol(sol))} ha en ${(sol.pmfbn.rodales || []).length} rodal(es).
Profesional: ${sol.profesional.nombre || '—'}, ${sol.profesional.titulo}.
Fecha de ingreso: ${fmtFecha(sol.fechaIngreso)}.

Antecedentes acompañados (arts. 21 a 23 D.S. 93):
${docs}

La Corporación se pronunciará dentro de ${NORMA.plazoResolucion} días hábiles contados desde el ingreso${pl ? `, esto es, a más tardar el ${fmtFecha(pl.vence)}` : ''} (art. 8° Ley 20.283; art. 6° D.S. 93).${pie}`;
    }
    case 'requerimiento': {
      const r = sol.requerimientos[sol.requerimientos.length - 1] || {};
      return `${encabezadoDoc(sol)}\nCARTA N° ${doc.numero}\n${fecha}\n
Señor(a)
${sol.interesado.nombre || '—'}
${sol.interesado.domicilio || '—'}${sol.interesado.comuna ? ', ' + sol.interesado.comuna : ''}

Ref.: Solicitud ${sol.id} · ${TIPOS_PLAN[sol.tipoPlan].nombre} · ${pred}.

De conformidad con el art. 31 de la Ley N° 19.880, se le requiere para que, en un plazo de ${NORMA.plazoSubsanar} días, subsane la falta o acompañe los documentos que se indican, con indicación de que, si así no lo hiciere, se le tendrá por desistido de su petición:

${r.detalle || '—'}

Plazo para subsanar: hasta el ${fmtFecha(r.plazo)}.${pie}`;
    }
    case 'desistimiento':
      return `${encabezadoDoc(sol)}\nRESOLUCIÓN N° ${doc.numero}\n${fecha}\n
VISTOS: La solicitud ${sol.id} de ${intz}, para el ${pred}; el requerimiento de antecedentes efectuado conforme al art. 31 de la Ley N° 19.880; y el D.S. N° 93 de 2008.

CONSIDERANDO: Que el interesado no subsanó la falta ni acompañó los documentos requeridos dentro del plazo otorgado.

RESUELVO:
1. TÉNGASE POR DESISTIDA la solicitud ${sol.id}, de conformidad con el art. 31 de la Ley N° 19.880.
2. Notifíquese al interesado y archívense los antecedentes.${pie}`;
    case 'memo': {
      const a = sol.asignacion || {};
      return `${encabezadoDoc(sol)}\nMEMORÁNDUM N° ${doc.numero}\n${fecha}\n
DE: ${quien}, ${cargo}
A:  ${usuario(a.analista).nombre} (analista) · ${usuario(a.abogado).nombre} (abogado, Unidad Jurídica)
MAT.: Asigna la evaluación de la solicitud ${sol.id}.

Se asigna la evaluación de la solicitud ${sol.id} (${TIPOS_PLAN[sol.tipoPlan].nombre}) de ${intz}, ${pred}, por ${fmt(supSol(sol))} ha.

Metas internas: evaluación técnica en ${METAS_INTERNAS.tecnico.dias} días hábiles y análisis jurídico en ${METAS_INTERNAS.juridico.dias} días hábiles desde esta asignación.
Plazo legal para resolver: ${pl ? fmtFecha(pl.vence) : '—'} (art. 8° Ley 20.283).${esFronteriza(sol) ? `\nComuna fronteriza (${textoComunasFronterizas(sol)}): la resolución requiere la respuesta de la DIFROL.` : ''}${pie}`;
    }
    case 'devTecnica':
    case 'devLegal': {
      const a = sol.asignacion || {};
      const dest = doc.tipo === 'devTecnica' ? `${usuario(a.analista).nombre} (analista)` : `${usuario(a.abogado).nombre} (abogado)`;
      return `${encabezadoDoc(sol)}\nMEMORÁNDUM N° ${doc.numero}\n${fecha}\n
DE: ${quien}, ${cargo}
A:  ${dest}
MAT.: Devuelve ${doc.tipo === 'devTecnica' ? 'la evaluación técnica' : 'el informe jurídico'} de la solicitud ${sol.id}.

Revisado el ${doc.tipo === 'devTecnica' ? 'informe técnico' : 'informe jurídico'}, se devuelve para corregir lo siguiente:

${extra.obs || '—'}${pie}`;
    }
    case 'salida': {
      const s = salidasDe(sol).find(x => x.id === extra.salidaId) || salidasDe(sol)[salidasDe(sol).length - 1] || {};
      return `${encabezadoDoc(sol)}\nINFORME DE SALIDA A TERRENO N° ${doc.numero}\n${fecha}\n
Solicitud: ${sol.id} · ${pred}.
Fecha de la salida: ${fmtFecha(s.fecha)}.
Funcionarios: ${(s.funcionarios || []).map(id => usuario(id).nombre).join(', ') || '—'}.
Vehículo: ${s.vehiculo || '—'} · Horas utilizadas: ${s.horas || '—'}.
Rodales visitados: ${(s.rodales || []).join(', ') || '—'}.

Observaciones:
${s.obs || 'Sin observaciones.'}${pie}`;
    }
    case 'informeTecnico':
      return `${encabezadoDoc(sol)}\nINFORME TÉCNICO N° ${doc.numero}\n${fecha}\n\n${sol.tecnico.informe || '—'}\n\nConclusión: ${CONCLUSION_TEC[sol.tecnico.conclusion] || '—'}.${pie}`;
    case 'informeJuridico':
      return `${encabezadoDoc(sol)}\nINFORME JURÍDICO N° ${doc.numero}\n${fecha}\n\n${sol.juridico.informe || '—'}\n\nConclusión: ${CONCLUSION_JUR[sol.juridico.conclusion] || '—'}.${pie}`;
    case 'resolucion':
      return textoResolucion(sol);
    case 'notificacion': {
      const r = sol.resolucion || {};
      return `${encabezadoDoc(sol)}\nCARTA N° ${doc.numero}\n${fecha}\n
Señor(a)
${sol.interesado.nombre || '—'}
${sol.interesado.domicilio || '—'}${sol.interesado.comuna ? ', ' + sol.interesado.comuna : ''}

Ref.: Notifica Resolución N° ${r.numero || '—'} de ${fmtFecha(r.fecha)} · solicitud ${sol.id}.

Por medio de la presente, notifico a usted la Resolución N° ${r.numero || '—'}, que ${(RESUELVE[r.tipo] || '').toLowerCase()} presentado para el ${pred}${r.tipo !== 'rechaza' ? `, en ${fmt(r.supAprobada)} ha, vigente hasta el ${fmtFecha(r.vigenciaHasta)}` : ''}. Se adjunta copia íntegra de la resolución.
${r.tipo === 'aprueba' ? `
Antes de iniciar las faenas deberá dar aviso escrito a la Corporación y, cumplido un año desde su inicio, acreditar anualmente su avance (art. 8° Ley 20.283; art. 9° D.S. 93).` : `
En contra de lo resuelto procede el recurso de reposición ante esta autoridad, dentro de ${NORMA.plazoReposicion} días hábiles contados desde la notificación (art. 59 Ley 19.880), y el reclamo ante el juez de letras en lo civil dentro de ${NORMA.plazoReclamo} días desde la expedición de esta carta certificada (art. 5° D.L. 701; art. 8° Ley 20.283).`}${pie}`;
    }
    case 'recurso': return textoResolucionRecurso(sol);
    default: return '';
  }
}
/* Documento imprimible con la identidad institucional (logo, franja tricolor) */
function htmlDocumento(sol, doc) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(TIPOS_DOC[doc.tipo].nombre)} ${esc(doc.numero)}</title>
<style>body{font-family:"Segoe UI",system-ui,Arial,sans-serif;color:#1d2420;margin:28px 40px}header{display:flex;align-items:center;gap:16px;border-bottom:1px solid #dcdcd3;padding-bottom:10px}
header img{height:58px}header div{font-size:12px;color:#555}.franja{display:flex;height:5px;margin:0 0 18px}.franja span{flex:1}.franja span:nth-child(1){background:#0064a9}.franja span:nth-child(2){background:#c4373b}.franja span:nth-child(3){background:#398245}
pre{white-space:pre-wrap;font:13.5px/1.55 "Segoe UI",system-ui,Arial,sans-serif}footer{margin-top:28px;border-top:1px solid #dcdcd3;padding-top:8px;font-size:11px;color:#6c746e}</style></head>
<body><header><img src="img/logo-conaf-gobierno.svg" alt="Ministerio de Agricultura, Gobierno de Chile · CONAF"><div><b>SIGPM</b> · Planes de Manejo de Bosque Nativo<br>${esc(sol.oficina)}</div></header>
<div class="franja"><span></span><span></span><span></span></div><pre>${esc(doc.texto)}</pre>
<footer>${esc(TIPOS_DOC[doc.tipo].nombre)} N° ${esc(doc.numero)} · versión ${doc.version} · solicitud ${esc(sol.id)} · emitido el ${fmtFecha(doc.fecha)} por ${esc(autorDe(doc.por, doc.subrogante))}<br>Maqueta de demostración: datos ficticios.</footer></body></html>`;
}
function imprimirDocumento(sol, doc) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(htmlDocumento(sol, doc).replace('<head>', `<head><base href="${location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '')}">`)); d.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* */ } setTimeout(() => f.remove(), 1500); };
  const img = d.querySelector('img');
  if (img && !img.complete) { img.onload = img.onerror = go; setTimeout(go, 2500); } else setTimeout(go, 50);
}

/* ====================== Recurso de reposición (SAF: reconsideracion/) ====================== */
const DECISION_RECURSO = { acoge: 'Acoge el recurso y aprueba la superficie indicada', acoge_parcial: 'Acoge parcialmente el recurso', rechaza: 'Rechaza el recurso', inadmisible: 'Declara inadmisible el recurso por extemporáneo' };
const plazoRecursoDe = sol => sol.notificacion ? sumarHabiles(sol.notificacion.fecha, NORMA.plazoReposicion) : null;
const puedeIngresarRecurso = sol => USUARIO.rol === 'ST' && sol.estado === 'notificada' && sol.resolucion && sol.resolucion.tipo !== 'aprueba' && !sol.recurso;
function ingresarRecurso(sol, d) {
  if (!puedeIngresarRecurso(sol)) throw new Error('No corresponde ingresar un recurso en esta solicitud.');
  if (!d.fecha || !d.fundamentos) throw new Error('Indique la fecha de presentación y los fundamentos.');
  const lim = plazoRecursoDe(sol);
  sol.recurso = { fecha: d.fecha, fundamentos: d.fundamentos, rodales: d.rodales || [], extemporaneo: d.fecha > lim, limite: lim, vence: sumarHabiles(d.fecha, NORMA.plazoResolverRecurso),
    estado: 'analisis', ingresadoPor: USUARIO.id, propuesta: null, resolucion: null };
  registrar(sol, 'Recurso de reposición ingresado (art. 59 Ley 19.880)', `${sol.recurso.extemporaneo ? `Presentado fuera de plazo (vencía el ${fmtFecha(lim)})` : `Presentado dentro de plazo (hasta ${fmtFecha(lim)})`}${d.rodales && d.rodales.length ? ` · rodales ${d.rodales.join(', ')}` : ''}`);
  guardar();
}
function proponerRecurso(sol, pr) {
  const rc = sol.recurso;
  if (USUARIO.rol !== 'JA' || !rc || rc.estado !== 'analisis') throw new Error('No corresponde.');
  if (rc.extemporaneo && pr.decision !== 'inadmisible') throw new Error('El recurso es extemporáneo: solo procede declararlo inadmisible.');
  if (difrolRechaza(sol) && ['acoge', 'acoge_parcial'].includes(pr.decision)) throw new Error('La DIFROL rechazó la solicitud: no procede aprobar superficie.');
  if (['acoge', 'acoge_parcial'].includes(pr.decision) && !(pr.rodales || []).length) throw new Error('Indique los rodales que se aprueban.');
  if (!pr.fundamento) throw new Error('Indique el fundamento.');
  rc.propuesta = { ...pr, fecha: hoyISO(), por: USUARIO.id };
  rc.estado = 'firma';
  registrar(sol, 'Propuesta de resolución del recurso enviada al jefe provincial', DECISION_RECURSO[pr.decision]);
  guardar();
}
function devolverRecurso(sol, obs) {
  sol.recurso.estado = 'analisis';
  registrar(sol, 'Propuesta del recurso devuelta al jefe analista', obs);
  guardar();
}
function resolverRecurso(sol) {
  const rc = sol.recurso;
  if (USUARIO.rol !== 'JP' || !rc || rc.estado !== 'firma') throw new Error('No corresponde.');
  const sub = subroganciaActivaDe(USUARIO.id);
  if (sub && !USUARIO.subrogante) throw new Error(`Usted está subrogado por ${usuario(sub.subrogante).nombre} hasta el ${fmtFecha(sub.hasta)}.`);
  const y = new Date().getFullYear();
  DB.seq.res = (DB.seq.res || 0) + 1;
  rc.resolucion = { numero: `${DB.seq.res}/${y}`, fecha: hoyISO(), firmadaPor: USUARIO.id, subrogante: USUARIO.subrogante || null, decision: rc.propuesta.decision };
  rc.estado = 'resuelto';
  if (['acoge', 'acoge_parcial'].includes(rc.propuesta.decision)) {
    const r = sol.resolucion, rods = sol.pmfbn.rodales || [];
    r.original = r.original || { tipo: r.tipo, supAprobada: r.supAprobada, supRechazada: r.supRechazada, rodalesAprobados: [...(r.rodalesAprobados || [])], rodalesObjetados: [...(r.rodalesObjetados || [])] };
    const ap = [...new Set([...(r.rodalesAprobados || []), ...rc.propuesta.rodales].map(String))];
    const aprob = rods.filter(x => ap.includes(String(x.numero)));
    r.rodalesAprobados = aprob.map(x => x.numero);
    r.rodalesObjetados = rods.filter(x => !ap.includes(String(x.numero))).map(x => x.numero);
    r.supAprobada = round2(sum(aprob, 'superficie')); r.supRechazada = round2(sum(rods, 'superficie') - r.supAprobada);
    r.tipo = r.rodalesObjetados.length ? 'parcial' : 'aprueba';
    if (!r.vigenciaHasta || r.vigenciaHasta < hoyISO()) r.vigenciaHasta = propuestaDesde(sol).vigenciaHasta;
    r.modificadaPor = rc.resolucion.numero;
    rc.propuesta.rodales.forEach(n => { if (sol.tecnico.rodales[n]) sol.tecnico.rodales[n] = { ...sol.tecnico.rodales[n], decision: 'aprobar', porRecurso: rc.resolucion.numero }; });
  }
  registrar(sol, `Resolución N° ${rc.resolucion.numero} firmada: ${DECISION_RECURSO[rc.propuesta.decision]}`, USUARIO.subrogante ? `Firmada por ${usuario(USUARIO.subrogante).nombre} (S)` : '');
  emitirDocumentoAuto(sol, 'recurso');
  if (['acoge', 'acoge_parcial'].includes(rc.propuesta.decision)) consolidarFichaPredial(sol);
  guardar();
}
function textoResolucionRecurso(sol) {
  const rc = sol.recurso, p = predio(sol.predioId) || {}, r = sol.resolucion;
  const pr = rc.propuesta || {};
  const num = rc.resolucion ? `N° ${rc.resolucion.numero}` : 'N° ______ (borrador)';
  const res = [];
  if (pr.decision === 'inadmisible') res.push(`DECLÁRASE INADMISIBLE, por extemporáneo, el recurso de reposición interpuesto el ${fmtFecha(rc.fecha)}, por haberse presentado después del plazo de ${NORMA.plazoReposicion} días hábiles que venció el ${fmtFecha(rc.limite)} (art. 59 Ley 19.880).`);
  else if (pr.decision === 'rechaza') res.push(`RECHÁZASE el recurso de reposición interpuesto el ${fmtFecha(rc.fecha)} en contra de la Resolución N° ${r.numero}, la que se mantiene a firme.`);
  else res.push(`${pr.decision === 'acoge' ? 'ACÓGESE' : 'ACÓGESE PARCIALMENTE'} el recurso de reposición interpuesto el ${fmtFecha(rc.fecha)} y, en consecuencia, MODIFÍCASE la Resolución N° ${r.numero}, aprobándose además los rodales ${(pr.rodales || []).join(', ')}, conforme a la cartografía georreferenciada del expediente.`);
  res.push('Notifíquese al interesado por carta certificada.');
  return `${encabezadoDoc(sol)}\nRESOLUCIÓN ${num}\n${fmtFecha(rc.resolucion ? rc.resolucion.fecha : hoyISO())}\n
VISTOS: La Ley N° 19.880, en especial su art. 59; la Ley N° 20.283; el D.S. N° 93 de 2008; la Resolución N° ${r.numero} de ${fmtFecha(r.fecha)} recaída en la solicitud ${sol.id} de ${sol.interesado.nombre}, para el predio «${p.nombre || '—'}», rol ${p.rol || '—'}; y el recurso de reposición presentado el ${fmtFecha(rc.fecha)}.

CONSIDERANDO:
1. Que el recurrente funda su recurso en lo siguiente: ${rc.fundamentos}
2. Que, analizados los antecedentes: ${pr.fundamento || '—'}

RESUELVO:
${res.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${rc.resolucion ? (rc.resolucion.subrogante ? `${usuario(rc.resolucion.subrogante).nombre} (S)` : usuario(rc.resolucion.firmadaPor).nombre) : usuario('jp1').nombre}
Jefe Provincial · ${sol.oficina}`;
}

/* ====================== Tareas con plazo (SAF: tareasPendientes, agregarTarea con fecha de plazo) ====================== */
function tareasDe(u = USUARIO) {
  const t = [];
  const add = (o) => {
    const vence = o.vence || (o.desde ? sumarHabiles(o.desde, METAS_INTERNAS[o.meta].dias) : null);
    const quedan = vence ? (hoyISO() <= vence ? habilesEntre(hoyISO(), vence) : -habilesEntre(vence, hoyISO())) : null;
    t.push({ ...o, vence, quedan, nivel: quedan == null ? 'info' : quedan < 0 ? 'bad' : quedan <= 2 ? 'warn' : 'ok' });
  };
  const S = DB.solicitudes;
  const pl = s => plazo(s);
  const fechaHist = (s, re) => { const h = s.historial.filter(x => re.test(x.accion)).pop(); return h ? h.fecha.slice(0, 10) : null; };
  if (u.rol === 'ST') {
    S.filter(s => s.estado === 'recepcion').forEach(s => add({ sol: s, txt: 'Revisar admisibilidad e ingresar', meta: 'recepcion', desde: (s.creada || '').slice(0, 10) || hoyISO(), href: `#exp/${s.id}/ingreso` }));
    S.filter(s => s.estado === 'subsanacion').forEach(s => { const r = s.requerimientos[s.requerimientos.length - 1]; add({ sol: s, txt: 'Controlar la subsanación (art. 31 Ley 19.880)', vence: r && r.plazo, legal: true, href: `#exp/${s.id}/ingreso` }); });
    S.filter(s => s.estado === 'resuelta').forEach(s => add({ sol: s, txt: 'Despachar la notificación por carta certificada', vence: sumarHabiles(s.resolucion.fecha, NORMA.plazoNotificarRechazo), legal: true, href: `#exp/${s.id}/resolucion` }));
    S.filter(s => difrolPendiente(s) && !s.resolucion && !['desistida'].includes(s.estado) && s.fechaIngreso).forEach(s => add({ sol: s, txt: 'Registrar la respuesta de la DIFROL', vence: pl(s) && pl(s).vence, href: `#exp/${s.id}/resumen` }));
  }
  if (u.rol === 'JA') {
    S.filter(s => s.estado === 'asignacion').forEach(s => add({ sol: s, txt: 'Asignar analista y abogado', meta: 'asignacion', desde: s.fechaIngreso, href: `#exp/${s.id}/resumen` }));
    S.filter(s => s.estado === 'revision').forEach(s => add({ sol: s, txt: 'Revisar informes y proponer la resolución', meta: 'revision', desde: [s.tecnico.fecha, s.juridico.fecha, fechaHist(s, /devuelto al jefe analista/i)].filter(Boolean).sort().pop() || hoyISO(), href: `#exp/${s.id}/revision` }));
    S.filter(s => s.recurso && s.recurso.estado === 'analisis').forEach(s => add({ sol: s, txt: 'Analizar el recurso de reposición', vence: s.recurso.vence, legal: true, href: `#exp/${s.id}/resolucion` }));
    consultores().filter(c => c.estado === 'por_habilitar').forEach(c => add({ consultor: c, txt: `Habilitar consultor: ${c.nombre}`, meta: 'consultor', desde: c.creado.slice(0, 10), href: `#consultores/${c.id}` }));
  }
  if (u.rol === 'AN') S.filter(s => s.estado === 'evaluacion' && s.asignacion && s.asignacion.analista === u.id && s.tecnico.estado !== 'enviado')
    .forEach(s => add({ sol: s, txt: s.tecnico.estado === 'devuelto' ? 'Corregir la evaluación técnica devuelta' : 'Evaluación técnica e informe', meta: 'tecnico', desde: s.asignacion.fecha, href: `#exp/${s.id}/tecnico` }));
  if (u.rol === 'AB') {
    S.filter(s => s.estado === 'evaluacion' && s.asignacion && s.asignacion.abogado === u.id && s.juridico.estado !== 'enviado')
      .forEach(s => add({ sol: s, txt: s.juridico.estado === 'devuelto' ? 'Corregir el informe jurídico devuelto' : 'Análisis jurídico e informe', meta: 'juridico', desde: s.asignacion.fecha, href: `#exp/${s.id}/juridico` }));
    S.filter(s => s.estado === 'visacion' && s.asignacion && s.asignacion.abogado === u.id).forEach(s => add({ sol: s, txt: 'Visar el proyecto de resolución', meta: 'visacion', desde: s.revisionJA.fecha, href: `#exp/${s.id}/resolucion` }));
  }
  if (u.rol === 'JP') {
    S.filter(s => s.estado === 'firma').forEach(s => add({ sol: s, txt: 'Firmar la resolución', meta: 'firma', desde: (s.visacion && s.visacion.fecha) || (s.revisionJA && s.revisionJA.fecha) || hoyISO(), href: `#exp/${s.id}/resolucion` }));
    S.filter(s => s.recurso && s.recurso.estado === 'firma').forEach(s => add({ sol: s, txt: 'Resolver el recurso de reposición', vence: s.recurso.vence, legal: true, href: `#exp/${s.id}/resolucion` }));
  }
  return t.sort((a, b) => (a.quedan ?? 999) - (b.quedan ?? 999));
}

/* ====================== Reportes (SAF: reportes/cargaTrabajo, tramitacion, documentosEmitidos) ====================== */
function csvDe(head, rows) { return '﻿' + [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n'); }
const decimalCL = n => String(n ?? '').replace('.', ',');
/* Días hábiles en la etapa actual: desde el último cambio de estado registrado */
function diasEnEtapa(s) {
  const h = s.historial.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const u = h[h.length - 1];
  return u ? habilesEntre(u.fecha.slice(0, 10), hoyISO()) : null;
}
function cargaTrabajo() {
  return USUARIOS.filter(u => ['AN', 'AB'].includes(u.rol)).map(u => {
    const campo = u.rol === 'AN' ? 'analista' : 'abogado', inf = u.rol === 'AN' ? 'tecnico' : 'juridico';
    const asign = DB.solicitudes.filter(s => s.asignacion && s.asignacion[campo] === u.id);
    const activas = asign.filter(s => s.estado === 'evaluacion' && s[inf].estado !== 'enviado');
    const enviados = asign.filter(s => s[inf].estado === 'enviado' && s[inf].fecha);
    const dias = enviados.map(s => habilesEntre(s.asignacion.fecha, s[inf].fecha));
    const vencidas = tareasDe(u).filter(t => t.nivel === 'bad').length;
    return { u, asignadas: asign.length, activas: activas.length, enviados: enviados.length, promedio: dias.length ? Math.round(sum(dias, x => x) / dias.length) : null, vencidas, visaciones: u.rol === 'AB' ? DB.solicitudes.filter(s => s.estado === 'visacion' && s.asignacion && s.asignacion.abogado === u.id).length : 0 };
  });
}
function todosLosDocumentos() {
  return DB.solicitudes.flatMap(s => documentosDe(s).map(d => ({ ...d, sol: s }))).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tipo.localeCompare(b.tipo));
}

/* ====================== Datos de ejemplo para estas funciones ====================== */
function semillaSAF(db) {
  const hoy = hoyISO();
  const hace = n => restarHabiles(hoy, n);
  const ahoraISO = d => d + 'T09:00:00';
  // Registro de consultores
  db.consultores = [];
  db.seq.con = 0;
  const reg = (d, estado, creado, motivo = '') => { db.seq.con++; db.consultores.push({ id: `CF-${String(db.seq.con).padStart(4, '0')}`, ejemplo: true, email: '', telefono: '', oficina: 'Oficina Provincial Valdivia', ...d, estado, motivo, creado: ahoraISO(creado), por: 'st1', fechaEstado: estado === 'por_habilitar' ? null : creado,
    historial: [{ fecha: ahoraISO(creado), usuario: 'st1', accion: 'Consultor inscrito en el registro' }, ...(estado !== 'por_habilitar' ? [{ fecha: ahoraISO(creado).replace('09:', '15:'), usuario: 'ja1', accion: ESTADOS_CONSULTOR[estado].nombre, detalle: motivo }] : [])] }); };
  reg({ nombre: 'Ignacio Fuentes Paredes', rut: fmtRut(14523876), titulo: 'Ingeniero forestal', universidad: 'Universidad Austral de Chile', semestres: 11, postitulo: false, email: 'ifuentes@ejemplo.cl' }, 'habilitado', '2024-03-04');
  reg({ nombre: 'Daniela Riquelme Ulloa', rut: fmtRut(15678234), titulo: 'Ingeniero forestal', universidad: 'Universidad de Concepción', semestres: 10, postitulo: false, email: 'driquelme@ejemplo.cl' }, 'habilitado', '2024-08-12');
  reg({ nombre: 'Martín Sepúlveda Araya', rut: fmtRut(17345902), titulo: 'Ingeniero en recursos naturales', universidad: 'Universidad de La Frontera', semestres: 10, postitulo: false, email: 'msepulveda@ejemplo.cl' }, 'por_habilitar', hace(4));
  reg({ nombre: 'Óscar Lillo Torres', rut: fmtRut(13987321), titulo: 'Ingeniero forestal', universidad: 'Universidad de Talca', semestres: 10, postitulo: false }, 'suspendido', '2023-05-15', 'Suspendido por incumplimientos reiterados en planes fiscalizados (referencial ficticio).');
  reg({ nombre: 'Paula Gacitúa Neira', rut: fmtRut(16234789), titulo: 'Ingeniero agrónomo especializado', universidad: 'Universidad Austral de Chile', semestres: 10, postitulo: false }, 'rechazado', hace(30), 'No acredita postítulo o postgrado en ciencias forestales (art. 7° Ley 20.283).');
  // Subrogancias (historial; ninguna vigente para no bloquear la firma en la demostración)
  db.subrogancias = [{ id: 'SUB-1', titular: 'jp1', subrogante: 'ja1', desde: '2026-02-02', hasta: '2026-02-20', motivo: 'Feriado legal', creada: '2026-01-28T10:00:00', caducada: null, ejemplo: true }];
  db.seq.sub = 1;
  db.seq.doc = {};
  // Documentos emitidos y consolidación de los casos avanzados, con las fechas de su historial
  db.solicitudes.forEach(s => {
    const H = re => { const h = s.historial.find(x => re.test(x.accion)); return h ? h.fecha.slice(0, 10) : null; };
    if (s.fechaIngreso && s.estado !== 'recepcion') emitirDocumentoAuto(s, 'comprobante', {}, { fecha: s.fechaIngreso, por: 'st1' });
    if (s.requerimientos.length) emitirDocumentoAuto(s, 'requerimiento', {}, { fecha: s.requerimientos[0].fecha, por: 'st1' });
    if (s.asignacion) emitirDocumentoAuto(s, 'memo', {}, { fecha: s.asignacion.fecha, por: s.asignacion.por || 'ja1' });
    if (s.tecnico.estado === 'enviado') {
      salidasDe(s);
      if (s.tecnico.salidas[0]) { s.tecnico.salidas[0].vehiculo = 'Camioneta institucional'; s.tecnico.salidas[0].horas = 6; s.tecnico.salidas[0].rodales = (s.pmfbn.rodales || []).slice(0, 2).map(r => r.numero); emitirDocumentoAuto(s, 'salida', { salidaId: s.tecnico.salidas[0].id }, { fecha: s.tecnico.salidas[0].fecha, por: s.tecnico.por }); }
      emitirDocumentoAuto(s, 'informeTecnico', {}, { fecha: s.tecnico.fecha, por: s.tecnico.por });
    } else if (s.tecnico.visita && s.tecnico.visita.fecha) { salidasDe(s); s.tecnico.salidas[0].vehiculo = 'Camioneta institucional'; s.tecnico.salidas[0].horas = 5; s.tecnico.salidas[0].rodales = (s.pmfbn.rodales || []).slice(0, 2).map(r => r.numero); }
    if (s.juridico.estado === 'enviado') emitirDocumentoAuto(s, 'informeJuridico', {}, { fecha: s.juridico.fecha, por: s.juridico.por });
    if (s.resolucion) { emitirDocumentoAuto(s, 'resolucion', {}, { fecha: s.resolucion.fecha, por: s.resolucion.firmadaPor }); consolidarFichaPredial(s, s.resolucion.fecha); }
    if (s.notificacion) emitirDocumentoAuto(s, 'notificacion', {}, { fecha: s.notificacion.fecha, por: 'st1' });
    void H;
  });
  // Plan aprobado en ejecución: aviso de inicio de faenas en el plan vigente de Los Ulmos (P01)
  const s9 = db.solicitudes.find(s => s.predioId === 'P01' && s.estado === 'notificada');
  if (s9) {
    const f = sumarDias(s9.notificacion.fecha, 40);
    s9.avisos = [{ id: 'AE-1', tipo: 'inicio', fecha: f, rodales: [s9.resolucion.rodalesAprobados[0]], superficie: (s9.pmfbn.rodales.find(r => String(r.numero) === String(s9.resolucion.rodalesAprobados[0])) || {}).superficie || 0, obs: 'Inicio de raleo con tractor; caminos existentes.', registrado: ahoraISO(f), por: 'pr1', canal: 'Portal del propietario' }];
    db.seq.av = 1;
    s9.historial.push({ fecha: ahoraISO(f), usuario: 'pr1', rol: 'PR', accion: 'Aviso de inicio de faenas registrado', detalle: `Rodal ${s9.resolucion.rodalesAprobados[0]} · vía portal` });
  }
  // Recurso de reposición en análisis: plan aprobado parcialmente y notificado hace pocos días
  const sr = db.solicitudes.find(s => s.recursoSeed);
  if (sr) {
    delete sr.recursoSeed;
    const rods = sr.pmfbn.rodales;
    const obj = rods[rods.length - 1];
    sr.tecnico.rodales[obj.numero] = { decision: 'objetar', motivo: `Cobertura remanente ${obj.coberturaRemanente}% inferior al mínimo exigido (arts. 7° y 8° D.S. 82)` };
    sr.tecnico.conclusion = 'parcial';
    const pr = propuestaDesde(sr);
    Object.assign(sr.revisionJA, pr);
    Object.assign(sr.resolucion, { tipo: pr.tipo, supAprobada: pr.supAprobada, supRechazada: pr.supRechazada, rodalesAprobados: pr.rodalesAprobados, rodalesObjetados: pr.rodalesObjetados });
    const ev = sr.historial.find(x => /Resolución N° .* firmada/.test(x.accion)); if (ev) ev.detalle = RESUELVE[pr.tipo];
    sr.estado = 'notificada';
    sr.notificacion = { fecha: hace(3), medio: 'Carta certificada', numero: 'CC-2207', por: 'st1' };
    sr.historial.push({ fecha: ahoraISO(hace(3)), usuario: 'st1', rol: 'ST', accion: 'Resolución notificada', detalle: 'Carta certificada N° CC-2207' });
    // vuelve a emitir los documentos con la resolución ajustada
    sr.documentosEmitidos = sr.documentosEmitidos.filter(d => !['resolucion', 'notificacion'].includes(d.tipo));
    emitirDocumentoAuto(sr, 'resolucion', {}, { fecha: sr.resolucion.fecha, por: 'jp1' });
    emitirDocumentoAuto(sr, 'notificacion', {}, { fecha: hace(3), por: 'st1' });
    const p = db.predios.find(x => x.id === sr.predioId);
    if (p && p.consolidaciones) { const c = p.consolidaciones.find(x => x.solId === sr.id); if (c) { c.rodales = pr.rodalesAprobados; c.superficie = pr.supAprobada; } }
    sr.recurso = { fecha: hace(1), fundamentos: `El rodal ${obj.numero} se intervendrá con corta de baja intensidad; se acompaña inventario complementario que acredita una cobertura remanente de 32 %.`, rodales: [obj.numero], extemporaneo: false,
      limite: sumarHabiles(hace(3), NORMA.plazoReposicion), vence: sumarHabiles(hace(1), NORMA.plazoResolverRecurso), estado: 'analisis', ingresadoPor: 'st1', propuesta: null, resolucion: null };
    sr.historial.push({ fecha: ahoraISO(hace(1)).replace('09:', '11:'), usuario: 'st1', rol: 'ST', accion: 'Recurso de reposición ingresado (art. 59 Ley 19.880)', detalle: `Presentado dentro de plazo · rodal ${obj.numero}` });
  }
}
