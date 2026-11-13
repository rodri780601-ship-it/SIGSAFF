/* =====================================================================
   SIGPM · Vistas de las funciones incorporadas desde el SAF
   Mis tareas (con calendario y subrogancia), registro de consultores,
   reportes, documentos del expediente, salidas a terreno, visación,
   recurso de reposición, avisos de ejecución y planes vigentes.
   ===================================================================== */
const kpiHTML = (l, v, s, cls = '') => `<div class="kpi ${cls}"><div class="kpi-l">${esc(l)}</div><div class="kpi-v">${v}</div>${s ? `<div class="kpi-s">${s}</div>` : ''}</div>`;
const chipTarea = t => t.vence ? `<span class="chip ${t.nivel}" title="Vence el ${fmtFecha(t.vence)}">${t.quedan >= 0 ? `quedan ${t.quedan}` : `vencida hace ${-t.quedan}`} d.h.</span>` : '<span class="muted">—</span>';
const formRow = (lbl, html, cls = '') => `<label class="${cls}">${esc(lbl)}${html}</label>`;
const valorModal = (bg, sel) => { const x = $(sel, bg); return x ? x.value.trim() : ''; };
const conTry = fn => { try { fn(); return true; } catch (e) { toast(e.message, 'error'); return false; } };

/* ====================== Perfil: propio o subrogante (cabecera) ====================== */
function pintarPerfil() {
  const sel = $('#perfil-sel');
  if (!sel || !USUARIO_REAL) return;
  const subs = esInterno(USUARIO_REAL) ? subroganciasComoSubrogante(USUARIO_REAL.id) : [];
  sel.hidden = !subs.length;
  sel.innerHTML = `<option value="">Mi perfil · ${esc(ROLES[USUARIO_REAL.rol])}</option>${subs.map(s => `<option value="${s.titular}" ${USUARIO.subrogante && USUARIO.id === s.titular ? 'selected' : ''}>Subrogante de ${esc(usuario(s.titular).nombre)} · ${esc(ROLES[usuario(s.titular).rol])}</option>`).join('')}`;
  sel.onchange = () => { actuarComo(sel.value || null); pintarUsuario(); route(); toast(USUARIO.subrogante ? `Actuando como subrogante de ${USUARIO.titularNombre}` : 'Actuando con su perfil', 'ok'); };
  document.body.classList.toggle('subrogando', !!USUARIO.subrogante);
  ajustarNav();
  const b = $('#nav-tareas-n');
  if (b) { const n = esInterno(USUARIO) ? tareasDe(USUARIO).filter(t => t.nivel === 'bad' || t.nivel === 'warn').length : 0; b.textContent = n; b.hidden = !n; }
}

/* Si el menú no cabe (más secciones según el rol), se oculta primero el distintivo de maqueta y luego se compacta */
function ajustarNav() {
  const n = $('.nav'); if (!n) return;
  document.body.classList.remove('nav-apretada', 'nav-muy-apretada');
  if (n.scrollWidth > n.clientWidth + 1) document.body.classList.add('nav-apretada');
  if (n.scrollWidth > n.clientWidth + 1) document.body.classList.add('nav-muy-apretada');
}
window.addEventListener('resize', () => { if (USUARIO) ajustarNav(); });

/* ====================== Mis tareas ====================== */
let CAL_MES = null;
function vistaTareas(main) {
  if (!esInterno(USUARIO)) { sinPermiso(main); return; }
  const tareas = tareasDe(USUARIO);
  const venc = tareas.filter(t => t.nivel === 'bad'), pronto = tareas.filter(t => t.nivel === 'warn'), legales = tareas.filter(t => t.legal);
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(ROLES[USUARIO.rol])} · ${esc(USUARIO.oficina)}</div><h1>Mis tareas</h1>
      <p class="muted">Cada tarea tiene un plazo: legal (marcado ⚖) o una meta interna de gestión, referencial, para cumplir el plazo legal de ${NORMA.plazoResolucion} días hábiles.</p></div></div>
    ${USUARIO.subrogante ? `<div class="alert info"><b>Actúa como subrogante de ${esc(USUARIO.titularNombre)}</b> (${esc(ROLES[USUARIO.rol])}). Sus actos quedan registrados a su nombre con la indicación (S).</div>` : ''}
    <div class="kpis">${kpiHTML('Tareas pendientes', tareas.length)}${kpiHTML('Vencidas', venc.length, venc.length ? 'Atender primero' : 'Al día', venc.length ? 'warn' : '')}${kpiHTML('Vencen en ≤ 2 días hábiles', pronto.length)}${kpiHTML('Con plazo legal', legales.length)}</div>
    <section class="sec-box mt"><h2>📌 Tareas pendientes</h2><div class="tbl-wrap"><table class="grid clickable"><thead><tr><th>Tarea</th><th>Expediente</th><th>Predio / detalle</th><th>Desde</th><th>Vence</th><th>Plazo de la tarea</th><th>Plazo legal de la solicitud</th></tr></thead><tbody>
      ${tareas.map(t => { const s = t.sol, p = s && predio(s.predioId);
        return `<tr data-href="${t.href}"><td>${t.legal ? '<span title="Plazo legal">⚖</span> ' : ''}${esc(t.txt)}</td><td class="nowrap">${s ? `<a href="${t.href}"><b>${esc(s.id)}</b></a>` : `<a href="${t.href}">${esc(t.consultor.id)}</a>`}</td>
        <td>${s ? `${esc(p ? p.nombre : '—')}<div class="muted small">${esc(s.interesado.nombre || '')}</div>` : `${esc(t.consultor.titulo)} · ${esc(t.consultor.universidad)}`}</td><td>${fmtFecha(t.desde)}</td><td>${fmtFecha(t.vence)}</td><td>${chipTarea(t)}</td><td>${s ? chipPlazo(s) : '<span class="muted">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty-row">No tiene tareas pendientes.</td></tr>'}
    </tbody></table></div></section>
    <div class="split mt"><section class="sec-box"><h2>📅 Calendario de vencimientos</h2><div id="cal"></div></section>
      <section class="sec-box"><h2>👥 Subrogancia</h2><div id="subrog"></div></section></div>`;
  bindFilas(main);
  pintarCalendario(tareas);
  pintarSubrogancia();
}
function pintarCalendario(tareas) {
  const el = $('#cal');
  const base = CAL_MES || hoyISO().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const primero = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate();
  const offset = (primero.getDay() + 6) % 7; // lunes primero
  const porDia = {};
  tareas.filter(t => t.vence).forEach(t => (porDia[t.vence] = porDia[t.vence] || []).push({ txt: `${t.sol ? t.sol.id : t.consultor.id}: ${t.txt}`, href: t.href, nivel: t.nivel }));
  const solsTareas = [...new Set(tareas.filter(t => t.sol).map(t => t.sol))];
  solsTareas.forEach(s => { const p = plazo(s); if (p && !s.resolucion) (porDia[p.vence] = porDia[p.vence] || []).push({ txt: `${s.id}: vence el plazo legal (art. 8° Ley 20.283)`, href: `#exp/${s.id}`, nivel: 'legal' }); });
  const nombreMes = primero.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += '<div class="cal-d vacio"></div>';
  for (let d = 1; d <= dias; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`, f = fechaDe(iso), it = porDia[iso] || [];
    celdas += `<div class="cal-d ${esHabil(f) ? '' : 'inhabil'} ${iso === hoyISO() ? 'hoy' : ''}" ${FERIADOS.has(iso) ? 'title="Feriado"' : ''}><span class="cal-n">${d}</span>${it.slice(0, 3).map(x => `<a class="cal-ev ${x.nivel}" href="${x.href}" title="${esc(x.txt)}">${esc(x.txt)}</a>`).join('')}${it.length > 3 ? `<span class="muted small">+${it.length - 3} más</span>` : ''}</div>`;
  }
  el.innerHTML = `<div class="cal-head"><button class="btn sm ghost" id="cal-prev" aria-label="Mes anterior">‹</button><b>${esc(nombreMes)}</b><button class="btn sm ghost" id="cal-next" aria-label="Mes siguiente">›</button><button class="btn sm ghost" id="cal-hoy">Hoy</button></div>
    <div class="cal">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<div class="cal-h">${x}</div>`).join('')}${celdas}</div>
    <div class="legend-row small"><span><i class="cal-sw bad"></i>Tarea vencida</span><span><i class="cal-sw warn"></i>Vence pronto</span><span><i class="cal-sw ok"></i>En plazo</span><span><i class="cal-sw legal"></i>Plazo legal de 90 días hábiles</span><span><i class="cal-sw inh"></i>Día inhábil</span></div>`;
  const mover = n => { const d = new Date(y, m - 1 + n, 1); CAL_MES = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; pintarCalendario(tareas); };
  $('#cal-prev').onclick = () => mover(-1); $('#cal-next').onclick = () => mover(1); $('#cal-hoy').onclick = () => { CAL_MES = null; pintarCalendario(tareas); };
}
function pintarSubrogancia() {
  const el = $('#subrog');
  const real = USUARIO_REAL;
  const mias = subrogancias().filter(s => s.titular === real.id).sort((a, b) => b.desde.localeCompare(a.desde));
  const comoSub = subrogancias().filter(s => s.subrogante === real.id && !s.caducada && s.hasta >= hoyISO());
  const estadoSub = s => s.caducada ? '<span class="chip">Caducada</span>' : s.hasta < hoyISO() ? '<span class="chip">Terminada</span>' : s.desde > hoyISO() ? '<span class="chip info">Programada</span>' : '<span class="chip ok">Vigente</span>';
  const puede = ROLES_SUBROGABLES.includes(real.rol);
  el.innerHTML = `${puede ? `<p class="muted small">Mientras la subrogancia esté vigente, el subrogante actúa con su perfil de ${esc(ROLES[real.rol])} y usted no puede firmar; para volver a firmar, caduque la subrogancia.</p>
      <div class="row-btns"><button class="btn sm" id="sub-def">Definir subrogante</button></div>
      <div class="tbl-wrap mt"><table class="grid"><thead><tr><th>Subrogante</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${mias.map(s => `<tr><td>${esc(usuario(s.subrogante).nombre)}<div class="muted small">${esc(ROLES[usuario(s.subrogante).rol])}</div></td><td>${fmtFecha(s.desde)}</td><td>${fmtFecha(s.hasta)}</td><td class="small">${esc(s.motivo || '—')}</td><td>${estadoSub(s)}</td>
        <td>${!s.caducada && s.hasta >= hoyISO() ? `<button class="btn sm ghost danger" data-cad="${s.id}">Caducar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-row">No ha definido subrogantes.</td></tr>'}</tbody></table></div>` : '<p class="muted small">Su perfil no define subrogante.</p>'}
    ${comoSub.length ? `<h3 class="mt">Usted subroga a</h3><ul class="list">${comoSub.map(s => { const vig = s.desde <= hoyISO(); return `<li><b>${esc(usuario(s.titular).nombre)}</b> (${esc(ROLES[usuario(s.titular).rol])}) · ${fmtFecha(s.desde)} al ${fmtFecha(s.hasta)} ${vig ? (USUARIO.subrogante && USUARIO.id === s.titular ? '<span class="chip accent">Actuando ahora</span> <button class="btn sm ghost" data-act="">Volver a mi perfil</button>' : `<button class="btn sm" data-act="${s.titular}">Actuar como subrogante</button>`) : '<span class="chip info">Programada</span>'}</li>`; }).join('')}</ul>` : ''}`;
  const def = $('#sub-def');
  if (def) def.onclick = async () => {
    const v = await modal({ titulo: 'Definir subrogante', html: `<p class="muted small">Durante el período, el subrogante podrá ejercer las funciones de ${esc(ROLES[real.rol])}, incluida la firma. Queda registro de cada acto.</p>
      <div class="fgrid">${formRow('Subrogante', `<select id="m-sub">${candidatosSubrogante(real.id).map(u => `<option value="${u.id}" ${real.rol === 'JP' && u.rol === 'JA' ? 'selected' : ''}>${esc(u.nombre)} · ${esc(ROLES[u.rol])}</option>`).join('')}</select>`, 'span2')}
      ${formRow('Desde', `<input type="date" id="m-desde" value="${hoyISO()}" min="${hoyISO()}">`)}${formRow('Hasta', `<input type="date" id="m-hasta" value="${sumarHabiles(hoyISO(), 5)}" min="${hoyISO()}">`)}
      ${formRow('Motivo', '<input id="m-mot" placeholder="Feriado legal, comisión de servicio…">', 'span2')}</div>`,
      botones: [{ txt: 'Cancelar' }, { txt: 'Definir', valor: bg => ({ s: valorModal(bg, '#m-sub'), d: valorModal(bg, '#m-desde'), h: valorModal(bg, '#m-hasta'), m: valorModal(bg, '#m-mot') }) }] });
    if (v && conTry(() => definirSubrogante(v.s, v.d, v.h, v.m))) { toast(`Subrogante definido: ${usuario(v.s).nombre}`, 'ok'); pintarSubrogancia(); pintarPerfil(); }
  };
  $$('[data-cad]', el).forEach(b => b.onclick = async () => {
    const ok = await modal({ titulo: 'Caducar subrogancia', html: '<p>El subrogante dejará de actuar en su nombre desde ahora y usted recupera la firma.</p>', botones: [{ txt: 'Cancelar' }, { txt: 'Caducar', valor: true, cls: 'danger' }] });
    if (ok && caducarSubrogancia(b.dataset.cad)) { toast('Subrogancia caducada', 'ok'); pintarSubrogancia(); }
  });
  $$('[data-act]', el).forEach(b => b.onclick = () => { actuarComo(b.dataset.act || null); pintarUsuario(); route(); toast(USUARIO.subrogante ? `Actuando como subrogante de ${USUARIO.titularNombre}` : 'Actuando con su perfil', 'ok'); });
}

/* ====================== Registro de consultores ====================== */
function vistaConsultores(main, id) {
  if (!esInterno(USUARIO)) { sinPermiso(main); return; }
  const puedeInscribir = ['ST', 'JA'].includes(USUARIO.rol);
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Art. 7° Ley 20.283 · art. 22 e) D.S. 93</div><h1>Registro de consultores</h1>
      <p class="muted">Profesionales que elaboran y suscriben planes de manejo. La secretaría técnica los inscribe y el jefe analista los habilita según el título y el plan de estudios exigidos.</p></div>
      <div class="row-btns wrap">${puedeInscribir ? '<button class="btn" id="co-nuevo">+ Inscribir consultor</button>' : ''}<button class="btn ghost" id="co-csv">Descargar CSV</button></div></div>
    <div class="kpis">${Object.entries(ESTADOS_CONSULTOR).map(([k, e]) => kpiHTML(e.nombre, consultores().filter(c => c.estado === k).length, '', k === 'por_habilitar' && consultores().some(c => c.estado === k) ? 'warn' : '')).join('')}</div>
    <div class="filters mt"><input id="co-q" placeholder="Buscar por nombre, RUT, título o universidad" aria-label="Buscar consultor"><select id="co-est" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${Object.entries(ESTADOS_CONSULTOR).map(([k, e]) => `<option value="${k}">${esc(e.nombre)}</option>`).join('')}</select></div>
    <div id="co-tabla"></div><div id="co-det"></div>`;
  const planesDe = c => DB.solicitudes.filter(s => normRut(s.profesional.rut) === normRut(c.rut));
  const render = () => {
    const q = norm($('#co-q').value), e = $('#co-est').value;
    const l = consultores().filter(c => (!e || c.estado === e) && (!q || norm(`${c.nombre} ${c.rut} ${c.titulo} ${c.universidad}`).includes(q)));
    $('#co-tabla').innerHTML = `<div class="tbl-wrap"><table class="grid clickable"><thead><tr><th>N° registro</th><th>Nombre</th><th>RUT</th><th>Título</th><th>Universidad</th><th class="num">Semestres</th><th>Aptitud (art. 7°)</th><th>Estado</th><th class="num">Planes</th></tr></thead><tbody>
      ${l.map(c => { const a = aptitudConsultor(c); return `<tr data-href="#consultores/${c.id}" class="${c.id === id ? 'row-sel' : ''}"><td class="nowrap"><a href="#consultores/${c.id}"><b>${esc(c.id)}</b></a></td><td>${esc(c.nombre)}</td><td class="nowrap">${esc(c.rut)}</td><td>${esc(c.titulo)}${c.postitulo ? ' + postítulo' : ''}</td><td>${esc(c.universidad)}</td><td class="num">${esc(c.semestres)}</td>
        <td class="small">${a.forestal ? '<span class="chip ok">Planes forestales</span> ' : ''}${a.preservacion ? '<span class="chip ok">Preservación</span>' : ''}${!a.forestal && !a.preservacion ? '<span class="chip bad">No cumple</span>' : ''}</td><td>${chipConsultor(c)}</td><td class="num">${planesDe(c).length}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty-row">Sin consultores.</td></tr>'}</tbody></table></div>`;
    bindFilas($('#co-tabla'));
  };
  $('#co-q').addEventListener('input', render); $('#co-est').addEventListener('change', render); render();
  $('#co-csv').onclick = () => descargar('registro_consultores.csv', csvDe(['registro', 'nombre', 'rut', 'titulo', 'universidad', 'semestres', 'postitulo', 'estado', 'motivo'],
    consultores().map(c => [c.id, c.nombre, c.rut, c.titulo, c.universidad, c.semestres, c.postitulo ? 'sí' : 'no', ESTADOS_CONSULTOR[c.estado].nombre, c.motivo || ''])), 'text/csv');
  const nb = $('#co-nuevo'); if (nb) nb.onclick = () => formConsultor(null);
  const c = id && consultores().find(x => x.id === id);
  if (c) {
    const a = aptitudConsultor(c), pl = planesDe(c);
    const esJA = USUARIO.rol === 'JA';
    $('#co-det').innerHTML = `<section class="sec-box mt" id="co-ficha"><div class="sec-head"><h2>${esc(c.nombre)} ${chipConsultor(c)}</h2><div class="row-btns wrap">
        ${puedeInscribir ? '<button class="btn sm ghost" id="co-edit">Editar datos</button>' : ''}
        ${esJA && c.estado !== 'habilitado' ? '<button class="btn sm" id="co-hab">Habilitar</button>' : ''}${esJA && c.estado === 'por_habilitar' ? '<button class="btn sm ghost danger" id="co-rech">Rechazar</button>' : ''}${esJA && c.estado === 'habilitado' ? '<button class="btn sm ghost danger" id="co-susp">Suspender</button>' : ''}</div></div>
      <div class="cols2"><table class="kv"><tr><th>N° registro</th><td>${esc(c.id)}</td></tr><tr><th>RUT</th><td>${esc(c.rut)}</td></tr><tr><th>Título</th><td>${esc(c.titulo)}${c.postitulo ? ' · acredita postítulo/postgrado' : ''}</td></tr>
        <tr><th>Universidad</th><td>${esc(c.universidad)} · ${esc(c.semestres)} semestres</td></tr><tr><th>Contacto</th><td>${esc(c.email || '—')} ${c.telefono ? '· ' + esc(c.telefono) : ''}</td></tr>
        <tr><th>Aptitud art. 7° Ley 20.283</th><td class="${a.forestal || a.preservacion ? 'ok-txt' : 'warn-txt'}">${esc(a.det)}</td></tr>${c.motivo ? `<tr><th>Motivo</th><td>${esc(c.motivo)}</td></tr>` : ''}</table>
      <div><h3>Historial</h3><ol class="timeline">${c.historial.slice().reverse().map(h => `<li><span class="tl-d">${fmtFechaHora(h.fecha)}</span> <b>${esc(h.accion)}</b> <span class="muted small">${esc(autorDe(h.usuario, h.subrogante))}</span>${h.detalle ? `<div class="small">${esc(h.detalle)}</div>` : ''}</li>`).join('')}</ol></div></div>
      <h3>Planes de manejo suscritos (${pl.length})</h3>${tablaSolicitudes(pl, 'No registra planes en el sistema.')}</section>`;
    bindFilas($('#co-det'));
    const on = (s, fn) => { const b = $(s); if (b) b.onclick = fn; };
    on('#co-edit', () => formConsultor(c));
    on('#co-hab', () => { if (conTry(() => cambiarEstadoConsultor(c, 'habilitado'))) { toast(`${c.nombre} habilitado`, 'ok'); rerender(); } });
    const conMotivo = (estado, titulo) => async () => {
      const m = await modal({ titulo, html: '<label>Motivo<textarea id="m-mot" rows="3"></textarea></label>', botones: [{ txt: 'Cancelar' }, { txt: titulo, cls: 'danger', valor: bg => valorModal(bg, '#m-mot'), validar: bg => !!valorModal(bg, '#m-mot') }] });
      if (m && conTry(() => cambiarEstadoConsultor(c, estado, m))) { toast(`Consultor: ${ESTADOS_CONSULTOR[estado].nombre.toLowerCase()}`, 'ok'); rerender(); }
    };
    on('#co-rech', conMotivo('rechazado', 'Rechazar inscripción'));
    on('#co-susp', conMotivo('suspendido', 'Suspender consultor'));
    $('#co-ficha').scrollIntoView({ block: 'start' });
  }
}
async function formConsultor(c) {
  const v0 = c || { nombre: '', rut: '', titulo: 'Ingeniero forestal', universidad: '', semestres: 10, postitulo: false, email: '', telefono: '' };
  const titulos = [...new Set([...TITULOS_HABILITADOS.forestal, ...TITULOS_HABILITADOS.preservacion, 'Otro'])];
  const v = await modal({ titulo: c ? `Editar ${c.id}` : 'Inscribir consultor', ancho: 640, html: `<div class="fgrid">
      ${formRow('Nombre completo', `<input id="m-nom" value="${esc(v0.nombre)}">`, 'span2')}${formRow('RUT', `<input id="m-rut" value="${esc(v0.rut)}" placeholder="12.345.678-9">`)}
      ${formRow('Título', `<select id="m-tit">${titulos.map(t => `<option ${t === v0.titulo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`)}
      ${formRow('Universidad', `<input id="m-uni" value="${esc(v0.universidad)}">`)}${formRow('Semestres del plan de estudios', `<input id="m-sem" type="number" min="1" value="${esc(v0.semestres)}">`)}
      ${formRow('Correo', `<input id="m-mail" type="email" value="${esc(v0.email || '')}">`)}${formRow('Teléfono', `<input id="m-tel" value="${esc(v0.telefono || '')}">`)}
      <label class="chk span2"><input type="checkbox" id="m-post" ${v0.postitulo ? 'checked' : ''}> Acredita postítulo o postgrado en ciencias forestales</label></div>
      ${c && c.estado === 'habilitado' ? '<p class="warn-txt small">Si cambia el título o el plan de estudios, el consultor vuelve a «por habilitar».</p>' : '<p class="muted small">Queda «por habilitar» hasta que el jefe analista revise sus antecedentes.</p>'}`,
    botones: [{ txt: 'Cancelar' }, { txt: c ? 'Guardar' : 'Inscribir', valor: bg => ({ nombre: valorModal(bg, '#m-nom'), rut: valorModal(bg, '#m-rut'), titulo: valorModal(bg, '#m-tit'), universidad: valorModal(bg, '#m-uni'), semestres: +valorModal(bg, '#m-sem') || 0, email: valorModal(bg, '#m-mail'), telefono: valorModal(bg, '#m-tel'), postitulo: $('#m-post', bg).checked }) }] });
  if (!v) return;
  let r; if (conTry(() => { r = guardarConsultor(v, c && c.id); })) { toast(c ? 'Datos actualizados' : `Consultor inscrito: ${r.id}`, 'ok'); location.hash = `#consultores/${r.id}`; rerender(); }
}
/* Situación del profesional en el registro, en la pestaña de ingreso */
function registroProfesionalHTML(sol, ed) {
  const r = sol.profesional.rut ? registroProfesional(sol) : null;
  return `<p class="small reg-prof">${r ? `<span class="chip ${r.nivel === 'ok' ? 'ok' : 'warn'}">Registro de consultores</span> ${esc(r.txt)}${r.c ? ` · <a href="#consultores/${r.c.id}">ver ficha</a>` : ''}` : '<span class="muted">Indique el RUT del profesional para verificarlo en el registro de consultores.</span>'}
    ${ed ? ' <button class="btn sm ghost" type="button" id="ing-reg">Tomar del registro</button>' : ''}</p>`;
}
async function elegirConsultor(sol) {
  const l = consultores().filter(c => c.estado === 'habilitado');
  const v = await modal({ titulo: 'Profesional desde el registro de consultores', ancho: 640, html: `<p class="muted small">Consultores habilitados. Se copian nombre, RUT, título, universidad y plan de estudios.</p>
    <label>Consultor<select id="m-c">${l.map(c => `<option value="${c.id}" ${normRut(c.rut) === normRut(sol.profesional.rut) ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rut)} · ${esc(c.titulo)}</option>`).join('')}</select></label>`,
    botones: [{ txt: 'Cancelar' }, { txt: 'Usar este profesional', valor: bg => valorModal(bg, '#m-c') }] });
  const c = v && consultores().find(x => x.id === v);
  if (!c) return;
  Object.assign(sol.profesional, { nombre: c.nombre, rut: c.rut, titulo: c.titulo, universidad: c.universidad, semestres: c.semestres, postitulo: !!c.postitulo });
  registrar(sol, 'Profesional tomado del registro de consultores', `${c.nombre} (${c.id})`); guardar(); rerender();
}

/* ====================== Reportes ====================== */
const REPORTES = [['carga', 'Carga de trabajo'], ['tramitacion', 'Tramitación'], ['documentos', 'Documentos emitidos'], ['superficie', 'Superficie aprobada']];
function vistaReportes(main, sub) {
  if (!['ST', 'JA', 'JP'].includes(USUARIO.rol)) { sinPermiso(main, 'Los reportes de gestión son para la secretaría técnica y las jefaturas.'); return; }
  sub = REPORTES.some(r => r[0] === sub) ? sub : 'carga';
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Gestión · ${esc(USUARIO.oficina)}</div><h1>Reportes</h1><p class="muted">Indicadores de tramitación y carga de trabajo, con descarga en CSV (abre en Excel).</p></div></div>
    <nav class="tabs" role="tablist">${REPORTES.map(([k, l]) => `<a role="tab" href="#reportes/${k}" class="${k === sub ? 'on' : ''}" aria-selected="${k === sub}">${esc(l)}</a>`).join('')}</nav><div class="panel" id="rep"></div>`;
  ({ carga: repCarga, tramitacion: repTramitacion, documentos: repDocumentos, superficie: repSuperficie })[sub]($('#rep'));
}
function repCarga(el) {
  const l = cargaTrabajo();
  el.innerHTML = `<p class="hint">Metas internas: evaluación técnica ${METAS_INTERNAS.tecnico.dias} d.h. y análisis jurídico ${METAS_INTERNAS.juridico.dias} d.h. desde la asignación.</p>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>Funcionario</th><th>Rol</th><th class="num">Asignadas (total)</th><th class="num">En curso</th><th class="num">Informes enviados</th><th class="num">Promedio asignación → informe (d.h.)</th><th class="num">Visaciones pendientes</th><th class="num">Tareas vencidas</th></tr></thead><tbody>
    ${l.map(x => `<tr><td>${esc(x.u.nombre)}</td><td>${esc(ROLES[x.u.rol])}</td><td class="num">${x.asignadas}</td><td class="num"><b>${x.activas}</b></td><td class="num">${x.enviados}</td>
      <td class="num">${x.promedio == null ? '—' : `<span class="${x.promedio > METAS_INTERNAS[x.u.rol === 'AN' ? 'tecnico' : 'juridico'].dias ? 'bad-txt' : ''}">${x.promedio}</span>`}</td><td class="num">${x.u.rol === 'AB' ? x.visaciones : '—'}</td><td class="num">${x.vencidas ? `<span class="chip bad">${x.vencidas}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div>
    <div class="row-btns mt"><button class="btn sm ghost" id="rep-csv">Descargar CSV</button></div>`;
  $('#rep-csv').onclick = () => descargar(`carga_trabajo_${hoyISO()}.csv`, csvDe(['funcionario', 'rol', 'asignadas', 'en_curso', 'informes_enviados', 'promedio_dh', 'visaciones_pendientes', 'tareas_vencidas'],
    l.map(x => [x.u.nombre, ROLES[x.u.rol], x.asignadas, x.activas, x.enviados, x.promedio ?? '', x.visaciones, x.vencidas])), 'text/csv');
}
function repTramitacion(el) {
  el.innerHTML = `<div class="filters"><select id="rt-est" aria-label="Estado"><option value="">Todos los estados</option>${Object.entries(ESTADOS).map(([k, e]) => `<option value="${k}">${esc(e.nombre)}</option>`).join('')}</select>
      <label class="small">Ingreso desde <input type="date" id="rt-d"></label><label class="small">hasta <input type="date" id="rt-h"></label><button class="btn sm ghost" id="rep-csv">Descargar CSV</button></div><div id="rt-k"></div><div id="rt-t"></div>`;
  let filas = [];
  const render = () => {
    const e = $('#rt-est').value, d = $('#rt-d').value, h = $('#rt-h').value;
    const l = DB.solicitudes.filter(s => (!e || s.estado === e) && (!d || (s.fechaIngreso && s.fechaIngreso >= d)) && (!h || (s.fechaIngreso && s.fechaIngreso <= h))).sort((a, b) => (a.fechaIngreso || '9').localeCompare(b.fechaIngreso || '9'));
    filas = l.map(s => { const p = plazo(s), pr = predio(s.predioId) || {}; return { s, pr, p, etapa: diasEnEtapa(s) }; });
    const res = filas.filter(f => f.s.resolucion), prom = res.length ? Math.round(sum(res, f => f.p ? f.p.usados : 0) / res.length) : null;
    const vencidas = filas.filter(f => f.p && !f.s.resolucion && f.s.estado !== 'desistida' && f.p.quedan < 0).length;
    $('#rt-k').innerHTML = `<div class="kpis">${kpiHTML('Solicitudes', filas.length)}${kpiHTML('Resueltas', res.length, prom != null ? `Promedio ${prom} días hábiles` : '')}${kpiHTML('En trámite', filas.filter(f => !f.s.resolucion && !['desistida', 'recepcion'].includes(f.s.estado)).length)}${kpiHTML('Con plazo legal vencido', vencidas, '', vencidas ? 'warn' : '')}</div>`;
    $('#rt-t').innerHTML = `<div class="tbl-wrap mt"><table class="grid clickable"><thead><tr><th>N° solicitud</th><th>Predio</th><th>Comuna</th><th>Estado</th><th>Responsable</th><th>Ingreso</th><th class="num">D.h. usados</th><th class="num">D.h. en la etapa</th><th>Vence</th><th>Plazo legal</th></tr></thead><tbody>
      ${filas.map(f => `<tr data-href="#exp/${f.s.id}"><td class="nowrap"><a href="#exp/${f.s.id}"><b>${esc(f.s.id)}</b></a></td><td>${esc(f.pr.nombre || '—')}</td><td>${esc(f.pr.comuna || '—')}</td><td>${chipEstado(f.s)}</td><td class="small">${esc(responsable(f.s))}</td><td>${fmtFecha(f.s.fechaIngreso)}</td>
        <td class="num">${f.p ? f.p.usados : '—'}</td><td class="num">${f.s.resolucion || ['notificada', 'desistida'].includes(f.s.estado) ? '—' : f.etapa ?? '—'}</td><td>${f.p ? fmtFecha(f.p.vence) : '—'}</td><td>${chipPlazo(f.s)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty-row">Sin solicitudes con esos filtros.</td></tr>'}</tbody></table></div>`;
    bindFilas($('#rt-t'));
  };
  ['#rt-est', '#rt-d', '#rt-h'].forEach(x => $(x).addEventListener('change', render)); render();
  $('#rep-csv').onclick = () => descargar(`tramitacion_${hoyISO()}.csv`, csvDe(['solicitud', 'predio', 'rol', 'comuna', 'interesado', 'estado', 'responsable', 'ingreso', 'dh_usados', 'dh_quedan', 'vence', 'dh_en_etapa', 'resolucion', 'tipo_resolucion', 'sup_solicitada_ha', 'sup_aprobada_ha'],
    filas.map(f => [f.s.id, f.pr.nombre, f.pr.rol, f.pr.comuna, f.s.interesado.nombre, ESTADOS[f.s.estado].nombre, responsable(f.s), f.s.fechaIngreso || '', f.p ? f.p.usados : '', f.p && !f.s.resolucion ? f.p.quedan : '', f.p ? f.p.vence : '', f.s.resolucion || ['notificada', 'desistida'].includes(f.s.estado) ? '' : f.etapa ?? '',
      f.s.resolucion ? f.s.resolucion.numero : '', f.s.resolucion ? RESUELVE[f.s.resolucion.tipo] : '', decimalCL(supSol(f.s)), f.s.resolucion ? decimalCL(f.s.resolucion.supAprobada) : ''])), 'text/csv');
}
function repDocumentos(el) {
  el.innerHTML = `<div class="filters"><select id="rd-t" aria-label="Tipo de documento"><option value="">Todos los documentos</option>${Object.entries(TIPOS_DOC).map(([k, t]) => `<option value="${k}">${esc(t.nombre)}</option>`).join('')}</select>
    <label class="small">Desde <input type="date" id="rd-d"></label><label class="small">hasta <input type="date" id="rd-h"></label><button class="btn sm ghost" id="rep-csv">Descargar CSV</button></div><div id="rd-l"></div>`;
  let l = [];
  const render = () => {
    const t = $('#rd-t').value, d = $('#rd-d').value, h = $('#rd-h').value;
    l = todosLosDocumentos().filter(x => (!t || x.tipo === t) && (!d || x.fecha >= d) && (!h || x.fecha <= h));
    $('#rd-l').innerHTML = `<p class="muted small">${l.length} documento(s).</p><div class="tbl-wrap"><table class="grid clickable"><thead><tr><th>Fecha</th><th>Documento</th><th>N°</th><th class="num">Versión</th><th>Solicitud</th><th>Emitido por</th></tr></thead><tbody>
      ${l.map(x => `<tr data-href="#exp/${x.sol.id}/documentos"><td>${fmtFecha(x.fecha)}</td><td>${esc(TIPOS_DOC[x.tipo].nombre)}</td><td class="nowrap">${esc(x.numero)}</td><td class="num">${x.version}</td><td class="nowrap"><a href="#exp/${x.sol.id}/documentos">${esc(x.sol.id)}</a></td><td class="small">${esc(autorDe(x.por, x.subrogante))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-row">Sin documentos.</td></tr>'}</tbody></table></div>`;
    bindFilas($('#rd-l'));
  };
  ['#rd-t', '#rd-d', '#rd-h'].forEach(x => $(x).addEventListener('change', render)); render();
  $('#rep-csv').onclick = () => descargar(`documentos_emitidos_${hoyISO()}.csv`, csvDe(['fecha', 'documento', 'numero', 'version', 'solicitud', 'emitido_por'], l.map(x => [x.fecha, TIPOS_DOC[x.tipo].nombre, x.numero, x.version, x.sol.id, autorDe(x.por, x.subrogante)])), 'text/csv');
}
function repSuperficie(el) {
  const res = DB.solicitudes.filter(s => s.resolucion);
  const porTF = {}, porComuna = {};
  res.filter(s => s.resolucion.tipo !== 'rechaza').forEach(s => {
    const p = predio(s.predioId) || {};
    rodalesAprobadosDe(s).forEach(r => { const k = (TIPOS_FORESTALES[r.tipoForestal] || {}).nombre || '—'; porTF[k] = round2((porTF[k] || 0) + (+r.superficie || 0)); });
    const c = porComuna[p.comuna] = porComuna[p.comuna] || { planes: 0, sup: 0 }; c.planes++; c.sup = round2(c.sup + (+s.resolucion.supAprobada || 0));
  });
  const porTipo = Object.keys(RESUELVE).map(k => [RESUELVE[k], res.filter(s => s.resolucion.tipo === k).length]);
  const totalAp = round2(sum(res, s => s.resolucion.supAprobada)), totalRe = round2(sum(res, s => s.resolucion.supRechazada));
  el.innerHTML = `<div class="kpis">${kpiHTML('Resoluciones firmadas', res.length)}${kpiHTML('Superficie aprobada', `${fmt(totalAp)} ha`)}${kpiHTML('Superficie rechazada', `${fmt(totalRe)} ha`)}${kpiHTML('Recursos de reposición', DB.solicitudes.filter(s => s.recurso).length)}</div>
    <div class="cols2 mt"><section class="card"><h3>Superficie aprobada por tipo forestal</h3><table class="grid"><thead><tr><th>Tipo forestal</th><th class="num">ha</th></tr></thead><tbody>${Object.entries(porTF).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmt(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-row">—</td></tr>'}</tbody></table></section>
      <section class="card"><h3>Por comuna</h3><table class="grid"><thead><tr><th>Comuna</th><th class="num">Planes aprobados</th><th class="num">ha</th></tr></thead><tbody>${Object.entries(porComuna).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.planes}</td><td class="num">${fmt(v.sup)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-row">—</td></tr>'}</tbody></table>
      <h3 class="mt">Resoluciones por resultado</h3><table class="grid"><tbody>${porTipo.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table></section></div>
    <div class="row-btns mt"><button class="btn sm ghost" id="rep-csv">Descargar CSV (por tipo forestal)</button></div>`;
  $('#rep-csv').onclick = () => descargar(`superficie_aprobada_${hoyISO()}.csv`, csvDe(['tipo_forestal', 'ha'], Object.entries(porTF).map(([k, v]) => [k, decimalCL(v)])), 'text/csv');
}

/* ====================== Expediente: documentos ====================== */
function tabDocumentos(el, sol) {
  const l = documentosDe(sol).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.version - a.version);
  const gen = documentosGenerables(sol);
  el.innerHTML = `<p class="hint">Cada etapa emite su documento con número correlativo (comprobante de ingreso, memorándum de asignación, informes, resolución, carta de notificación…). Si un documento cambia, se emite una nueva versión y las anteriores se conservan.</p>
    ${gen.length ? `<div class="row-btns wrap">${gen.map(t => `<button class="btn sm ghost" data-gen="${t}">${documentosDe(sol).some(d => d.tipo === t) ? 'Nueva versión' : 'Emitir'}: ${esc(TIPOS_DOC[t].nombre)}</button>`).join('')}</div>` : ''}
    <div class="tbl-wrap mt"><table class="grid"><thead><tr><th>Fecha</th><th>Documento</th><th>N°</th><th class="num">Versión</th><th>Emitido por</th><th></th></tr></thead><tbody>
    ${l.map(d => { const vigente = !documentosDe(sol).some(x => x.tipo === d.tipo && x.numero === d.numero && x.version > d.version);
      return `<tr class="${vigente ? '' : 'row-old'}"><td>${fmtFecha(d.fecha)}</td><td>${esc(TIPOS_DOC[d.tipo].nombre)}${vigente ? '' : ' <span class="chip">Versión anterior</span>'}</td><td class="nowrap">${esc(d.numero)}</td><td class="num">${d.version}</td><td class="small">${esc(autorDe(d.por, d.subrogante))}</td>
      <td class="nowrap"><button class="btn sm ghost" data-ver="${d.id}">Ver</button> <button class="btn sm ghost" data-imp="${d.id}">Imprimir / PDF</button> <button class="btn sm ghost" data-dl="${d.id}" aria-label="Descargar texto">⤓</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty-row">Aún no se emiten documentos.</td></tr>'}</tbody></table></div>`;
  const doc = id => documentosDe(sol).find(d => d.id === id);
  $$('[data-ver]', el).forEach(b => b.onclick = () => { const d = doc(b.dataset.ver); modal({ titulo: `${TIPOS_DOC[d.tipo].nombre} N° ${d.numero} · versión ${d.version}`, ancho: 820, html: `<pre class="resol">${esc(d.texto)}</pre>`, botones: [{ txt: 'Cerrar' }] }); });
  $$('[data-imp]', el).forEach(b => b.onclick = () => imprimirDocumento(sol, doc(b.dataset.imp)));
  $$('[data-dl]', el).forEach(b => b.onclick = () => { const d = doc(b.dataset.dl); descargar(`${TIPOS_DOC[d.tipo].pref}_${d.numero.replace('/', '-')}_v${d.version}_${sol.id}.txt`, d.texto, 'text/plain'); });
  $$('[data-gen]', el).forEach(b => b.onclick = () => {
    const t = b.dataset.gen;
    const extra = t === 'salida' ? { salidaId: salidasDe(sol)[salidasDe(sol).length - 1].id } : {};
    const d = emitirDocumentoAuto(sol, t, extra, { version: true });
    registrar(sol, `${TIPOS_DOC[t].nombre} N° ${d.numero} emitido`, d.version > 1 ? `Versión ${d.version}` : ''); guardar();
    toast(`${TIPOS_DOC[t].nombre} N° ${d.numero}${d.version > 1 ? ` · versión ${d.version}` : ''}`, 'ok'); rerender();
  });
}

/* ====================== Evaluación técnica: salidas a terreno ====================== */
function seccionSalidasHTML(sol, ed) {
  const l = salidasDe(sol).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const docs = documentosDe(sol).filter(d => d.tipo === 'salida');
  return `<section class="card"><div class="sec-head"><h3>Salidas a terreno</h3>${ed ? '<button class="btn sm ghost" id="sal-add" type="button">+ Registrar salida</button>' : ''}</div>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>Fecha</th><th>Funcionarios</th><th>Vehículo</th><th class="num">Horas</th><th>Rodales</th><th>Observaciones</th><th>Informe de salida</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
    ${l.map(s => { const d = docs.filter(x => x.salidaId === s.id).pop(); return `<tr><td>${fmtFecha(s.fecha)}</td><td class="small">${esc((s.funcionarios || []).map(id => usuario(id).nombre).join(', ') || '—')}</td><td>${esc(s.vehiculo || '—')}</td><td class="num">${esc(s.horas || '—')}</td>
      <td>${esc((s.rodales || []).join(', ') || '—')}</td><td class="small">${esc(s.obs || '—')}</td><td>${d ? `<a href="#exp/${sol.id}/documentos">N° ${esc(d.numero)}</a>` : '<span class="muted">—</span>'}</td>${ed ? `<td><button class="btn sm ghost danger" data-sal-del="${s.id}" aria-label="Eliminar salida">✕</button></td>` : ''}</tr>`; }).join('') || `<tr><td colspan="${ed ? 8 : 7}" class="empty-row">Sin salidas a terreno registradas.</td></tr>`}</tbody></table></div></section>`;
}
function bindSalidas(el, sol) {
  const add = $('#sal-add', el);
  if (add) add.onclick = async () => {
    const internos = USUARIOS.filter(u => ['AN', 'JA', 'AB'].includes(u.rol));
    const v = await modal({ titulo: 'Registrar salida a terreno', ancho: 680, html: `<div class="fgrid">${formRow('Fecha', `<input type="date" id="m-f" value="${hoyISO()}" max="${hoyISO()}">`)}${formRow('Vehículo utilizado', '<input id="m-v" placeholder="Camioneta institucional, patente…">')}
      ${formRow('Horas utilizadas', '<input id="m-h" type="number" min="0" step="0.5">')}<div class="span2"><b class="small">Funcionarios</b><div class="chk-grid">${internos.map(u => `<label class="chk"><input type="checkbox" data-fun="${u.id}" ${u.id === USUARIO.id ? 'checked' : ''}> ${esc(u.nombre)} <span class="muted small">${esc(ROLES[u.rol])}</span></label>`).join('')}</div></div>
      <div class="span2"><b class="small">Rodales visitados</b><div class="chk-grid">${(sol.pmfbn.rodales || []).map(r => `<label class="chk"><input type="checkbox" data-rod-v="${esc(r.numero)}"> Rodal ${esc(r.numero)}</label>`).join('')}</div></div>
      ${formRow('Observaciones', '<textarea id="m-o" rows="4"></textarea>', 'span2')}</div>`,
      botones: [{ txt: 'Cancelar' }, { txt: 'Registrar y emitir informe de salida', valor: bg => ({ fecha: valorModal(bg, '#m-f'), vehiculo: valorModal(bg, '#m-v'), horas: valorModal(bg, '#m-h'), obs: valorModal(bg, '#m-o'),
        funcionarios: $$('[data-fun]', bg).filter(x => x.checked).map(x => x.dataset.fun), rodales: $$('[data-rod-v]', bg).filter(x => x.checked).map(x => x.dataset.rodV) }),
        validar: bg => !!valorModal(bg, '#m-f') && !!valorModal(bg, '#m-v') && $$('[data-fun]', bg).some(x => x.checked) }] });
    if (!v) return;
    const s = { id: uid(), ...v };
    salidasDe(sol).push(s); sincronizarVisita(sol);
    registrar(sol, 'Salida a terreno registrada', `${fmtFecha(s.fecha)} · ${s.funcionarios.map(id => usuario(id).nombre).join(', ')}`);
    const d = emitirDocumentoAuto(sol, 'salida', { salidaId: s.id });
    guardar(); toast(`Salida registrada · informe de salida N° ${d.numero}`, 'ok'); rerender();
  };
  $$('[data-sal-del]', el).forEach(b => b.onclick = async () => {
    const ok = await modal({ titulo: 'Eliminar salida a terreno', html: '<p>Se elimina el registro de la salida. Su informe de salida, si se emitió, se conserva en «Documentos».</p>', botones: [{ txt: 'Cancelar' }, { txt: 'Eliminar', valor: true, cls: 'danger' }] });
    if (!ok) return;
    sol.tecnico.salidas = salidasDe(sol).filter(x => x.id !== b.dataset.salDel); sincronizarVisita(sol);
    registrar(sol, 'Salida a terreno eliminada'); guardar(); rerender();
  });
}

/* ====================== Resolución: visación, recurso de reposición y avisos ====================== */
function seccionesPostResolucionHTML(sol) {
  let h = '';
  const v = sol.visacion;
  if (v && USUARIO.rol !== 'PR') h += `<section class="card mt"><h3>Visación jurídica</h3><p>${v.estado === 'visada' ? `<span class="chip ok">Visado (V°B°)</span> por ${esc(autorDe(v.por, null))} el ${fmtFecha(v.fecha)}` : v.estado === 'devuelta' ? `<span class="chip bad">Devuelto sin visar</span> el ${fmtFecha(v.fecha)}` : `<span class="chip warn">Pendiente</span> · ${esc(usuario(v.abogado).nombre)}`}${v.obs ? ` · ${esc(v.obs)}` : ''}</p></section>`;
  const r = sol.resolucion;
  if (r && sol.notificacion && r.tipo !== 'aprueba' || sol.recurso) {
    const rc = sol.recurso, lim = plazoRecursoDe(sol);
    h += `<section class="card mt"><h3>Recurso de reposición <small class="muted">Art. 59 Ley 19.880</small></h3>`;
    if (!rc) h += `<p>Plazo para interponerlo: hasta el <b>${fmtFecha(lim)}</b> (${NORMA.plazoReposicion} días hábiles desde la notificación). ${hoyISO() > lim ? '<span class="chip">Plazo vencido</span>' : '<span class="chip info">En plazo</span>'}</p><p class="muted small">Sin perjuicio del reclamo judicial de ${NORMA.plazoReclamo} días (art. 5° D.L. 701).</p>`;
    else {
      const est = { analisis: ['En análisis del jefe analista', 'warn'], firma: ['Para firma del jefe provincial', 'accent'], resuelto: ['Resuelto', 'ok'] }[rc.estado];
      h += `<table class="kv"><tr><th>Presentado</th><td>${fmtFecha(rc.fecha)} ${rc.extemporaneo ? `<span class="chip bad">Extemporáneo</span> (vencía el ${fmtFecha(rc.limite)})` : '<span class="chip ok">Dentro de plazo</span>'}</td></tr>
        <tr><th>Estado</th><td><span class="chip ${est[1]}">${est[0]}</span>${rc.estado !== 'resuelto' ? ` · resolver a más tardar el ${fmtFecha(rc.vence)}` : ''}</td></tr>
        <tr><th>Fundamentos</th><td>${esc(rc.fundamentos)}</td></tr>${(rc.rodales || []).length ? `<tr><th>Rodales que pide aprobar</th><td>${esc(rc.rodales.join(', '))}</td></tr>` : ''}
        ${rc.propuesta && USUARIO.rol !== 'PR' ? `<tr><th>Propuesta del jefe analista</th><td><b>${esc(DECISION_RECURSO[rc.propuesta.decision])}</b>${(rc.propuesta.rodales || []).length ? ` · rodales ${esc(rc.propuesta.rodales.join(', '))}` : ''}<div class="small">${esc(rc.propuesta.fundamento)}</div></td></tr>` : ''}
        ${rc.resolucion ? `<tr><th>Resolución</th><td>N° ${esc(rc.resolucion.numero)} de ${fmtFecha(rc.resolucion.fecha)} · ${esc(DECISION_RECURSO[rc.resolucion.decision])}${USUARIO.rol !== 'PR' ? ` · <a href="#exp/${sol.id}/documentos">ver documento</a>` : ''}</td></tr>` : ''}</table>
        ${rc.propuesta && rc.estado !== 'resuelto' && USUARIO.rol !== 'PR' ? `<details class="mt"><summary>Borrador de la resolución del recurso</summary><pre class="resol">${esc(textoResolucionRecurso(sol))}</pre></details>` : ''}`;
    }
    h += '</section>';
  }
  if (r && r.tipo !== 'rechaza') {
    const av = avisosDe(sol).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)), prox = proximoAvance(sol);
    h += `<section class="card mt"><h3>Ejecución del plan <small class="muted">Art. 8° Ley 20.283 · art. 9° D.S. 93</small></h3>
      <div class="tbl-wrap"><table class="grid"><thead><tr><th>Rodal</th><th class="num">Sup. aprobada (ha)</th><th>Año de corta</th><th>Estado de ejecución</th></tr></thead><tbody>
      ${rodalesAprobadosDe(sol).map(x => { const e = ESTADO_EJEC[estadoEjecucion(sol, x.numero)]; return `<tr><td><b>${esc(x.numero)}</b></td><td class="num">${fmt(x.superficie)}</td><td>${esc(x.anioCorta || '—')}</td><td><span class="chip ${e[1]}">${e[0]}</span></td></tr>`; }).join('')}</tbody></table></div>
      ${prox ? `<p class="small ${prox < hoyISO() ? 'bad-txt' : ''}">Próximo informe anual de avance: <b>${fmtFecha(prox)}</b>${prox < hoyISO() ? ' (atrasado)' : ''}.</p>` : ''}
      <h3 class="mt">Avisos recibidos</h3><div class="tbl-wrap"><table class="grid"><thead><tr><th>Fecha</th><th>Aviso</th><th>Rodales</th><th class="num">Sup. (ha)</th><th>Canal</th><th>Observaciones</th></tr></thead><tbody>
      ${av.map(a => `<tr><td>${fmtFecha(a.fecha)}</td><td>${esc(TIPOS_AVISO[a.tipo])}</td><td>${esc(a.rodales.join(', '))}</td><td class="num">${a.superficie ? fmt(a.superficie) : '—'}</td><td class="small">${esc(a.canal)} · ${esc(usuario(a.por).nombre)}</td><td class="small">${esc(a.obs || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-row">Sin avisos de ejecución.</td></tr>'}</tbody></table></div></section>`;
  }
  return h;
}
/* Acciones del expediente para estas funciones (se agregan a la barra de acciones) */
function accionesSAF(sol, btn) {
  const r = USUARIO.rol, e = sol.estado;
  if (puedeEditar(sol, 'visacion')) { btn('ac-vis-dev', 'Devolver al jefe analista sin visar', 'ghost'); btn('ac-vis-ok', 'Visar (V°B°) y enviar al jefe provincial'); }
  if (puedeIngresarRecurso(sol)) btn('ac-rec-ing', 'Ingresar recurso de reposición', 'ghost');
  if (r === 'JA' && sol.recurso && sol.recurso.estado === 'analisis') btn('ac-rec-prop', 'Proponer resolución del recurso');
  if (r === 'JP' && sol.recurso && sol.recurso.estado === 'firma') { btn('ac-rec-dev', 'Devolver propuesta del recurso', 'ghost'); btn('ac-rec-firma', 'Firmar resolución del recurso'); }
  if (puedeAvisar(sol)) btn('ac-aviso', r === 'PR' ? 'Informar faenas (aviso de ejecución)' : 'Registrar aviso de ejecución', 'ghost');
  void e;
}
function bindAccionesSAF(sol) {
  const on = (id, fn) => { const b = $('#' + id); if (b) b.addEventListener('click', fn); };
  const obsModal = (titulo, txtBoton, requerido = true, cls = '') => modal({ titulo, html: '<label>Observaciones<textarea id="m-obs" rows="4"></textarea></label>', botones: [{ txt: 'Cancelar' }, { txt: txtBoton, cls, valor: bg => valorModal(bg, '#m-obs') || ' ', validar: bg => !requerido || !!valorModal(bg, '#m-obs') }] });
  on('ac-vis-ok', async () => {
    const ok = await modal({ titulo: 'Visar el proyecto de resolución', ancho: 820, html: `<pre class="resol">${esc(textoResolucion(sol))}</pre><label>Observaciones (opcional)<textarea id="m-obs" rows="2"></textarea></label>`, botones: [{ txt: 'Cancelar' }, { txt: 'Visar (V°B°)', valor: bg => valorModal(bg, '#m-obs') || ' ' }] });
    if (ok) { visarResolucion(sol, ok.trim()); toast('Proyecto visado y enviado al jefe provincial', 'ok'); rerender(); }
  });
  on('ac-vis-dev', async () => { const o = await obsModal('Devolver sin visar', 'Devolver'); if (o) { devolverVisacion(sol, o.trim()); toast('Devuelto al jefe analista', 'ok'); rerender(); } });
  on('ac-rec-ing', async () => {
    const lim = plazoRecursoDe(sol);
    const obj = sol.resolucion.rodalesObjetados || [];
    const v = await modal({ titulo: 'Ingresar recurso de reposición', ancho: 640, html: `<p class="muted small">Plazo: ${NORMA.plazoReposicion} días hábiles desde la notificación (${fmtFecha(sol.notificacion.fecha)}), hasta el <b>${fmtFecha(lim)}</b> (art. 59 Ley 19.880). Si se presenta después, solo procede declararlo inadmisible.</p>
      <div class="fgrid">${formRow('Fecha de presentación', `<input type="date" id="m-f" value="${hoyISO()}" max="${hoyISO()}">`)}
      ${obj.length ? `<div class="span2"><b class="small">Rodales objetados que pide aprobar</b><div class="chk-grid">${obj.map(n => `<label class="chk"><input type="checkbox" data-rr="${esc(n)}" checked> Rodal ${esc(n)}</label>`).join('')}</div></div>` : ''}
      ${formRow('Fundamentos del recurso', '<textarea id="m-fu" rows="5"></textarea>', 'span2')}</div>`,
      botones: [{ txt: 'Cancelar' }, { txt: 'Ingresar recurso', valor: bg => ({ fecha: valorModal(bg, '#m-f'), fundamentos: valorModal(bg, '#m-fu'), rodales: $$('[data-rr]', bg).filter(x => x.checked).map(x => x.dataset.rr) }), validar: bg => !!valorModal(bg, '#m-f') && !!valorModal(bg, '#m-fu') }] });
    if (v && conTry(() => ingresarRecurso(sol, v))) { toast(sol.recurso.extemporaneo ? 'Recurso ingresado: extemporáneo' : 'Recurso ingresado y enviado al jefe analista', sol.recurso.extemporaneo ? 'warn' : 'ok'); location.hash = `#exp/${sol.id}/resolucion`; rerender(); }
  });
  on('ac-rec-prop', async () => {
    const rc = sol.recurso, obj = sol.resolucion.rodalesObjetados || [];
    const ops = rc.extemporaneo ? ['inadmisible'] : difrolRechaza(sol) ? ['rechaza'] : ['acoge', 'acoge_parcial', 'rechaza'];
    const v = await modal({ titulo: 'Propuesta de resolución del recurso', ancho: 680, html: `${rc.extemporaneo ? '<p class="warn-txt small">El recurso es extemporáneo: solo procede declararlo inadmisible.</p>' : ''}${difrolRechaza(sol) ? '<p class="warn-txt small">La DIFROL rechazó la solicitud: no procede aprobar superficie.</p>' : ''}
      <div class="fgrid">${formRow('Decisión', `<select id="m-d">${ops.map(k => `<option value="${k}">${esc(DECISION_RECURSO[k])}</option>`).join('')}</select>`, 'span2')}
      ${obj.length && !rc.extemporaneo && !difrolRechaza(sol) ? `<div class="span2"><b class="small">Rodales que se aprueban (si acoge)</b><div class="chk-grid">${obj.map(n => { const rd = sol.pmfbn.rodales.find(x => String(x.numero) === String(n)) || {}; return `<label class="chk"><input type="checkbox" data-ra="${esc(n)}" ${(rc.rodales || []).map(String).includes(String(n)) ? 'checked' : ''}> Rodal ${esc(n)} · ${fmt(rd.superficie)} ha</label>`; }).join('')}</div></div>` : ''}
      ${formRow('Fundamento', '<textarea id="m-fu" rows="5"></textarea>', 'span2')}</div>`,
      botones: [{ txt: 'Cancelar' }, { txt: 'Enviar al jefe provincial', valor: bg => ({ decision: valorModal(bg, '#m-d'), rodales: $$('[data-ra]', bg).filter(x => x.checked).map(x => x.dataset.ra), fundamento: valorModal(bg, '#m-fu') }), validar: bg => !!valorModal(bg, '#m-fu') }] });
    if (v) { if (['rechaza', 'inadmisible'].includes(v.decision)) v.rodales = []; if (conTry(() => proponerRecurso(sol, v))) { toast('Propuesta enviada al jefe provincial', 'ok'); rerender(); } }
  });
  on('ac-rec-dev', async () => { const o = await obsModal('Devolver la propuesta del recurso', 'Devolver'); if (o) { devolverRecurso(sol, o.trim()); toast('Propuesta devuelta al jefe analista', 'ok'); rerender(); } });
  on('ac-rec-firma', async () => {
    const ok = await modal({ titulo: 'Firmar resolución del recurso', ancho: 820, html: `<pre class="resol">${esc(textoResolucionRecurso(sol))}</pre>${['acoge', 'acoge_parcial'].includes(sol.recurso.propuesta.decision) ? '<p class="muted small">Al firmar se modifica la resolución, el plan aprobado se actualiza en la ficha predial y en el registro público.</p>' : ''}`, botones: [{ txt: 'Cancelar' }, { txt: 'Firmar', valor: true }] });
    if (ok && conTry(() => resolverRecurso(sol))) { toast(`Resolución N° ${sol.recurso.resolucion.numero} firmada`, 'ok'); location.hash = `#exp/${sol.id}/resolucion`; rerender(); }
  });
  on('ac-aviso', async () => {
    const aprob = rodalesAprobadosDe(sol);
    const v = await modal({ titulo: 'Aviso de ejecución de faenas', ancho: 640, html: `<p class="muted small">El interesado debe avisar antes de iniciar las faenas y, cumplido un año desde su inicio, acreditar anualmente su avance (art. 8° Ley 20.283; art. 9° D.S. 93).</p>
      <div class="fgrid">${formRow('Tipo de aviso', `<select id="m-t">${Object.entries(TIPOS_AVISO).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select>`)}${formRow('Fecha', `<input type="date" id="m-f" value="${hoyISO()}" max="${sol.resolucion.vigenciaHasta}">`)}
      <div class="span2"><b class="small">Rodales</b><div class="chk-grid">${aprob.map(r => `<label class="chk"><input type="checkbox" data-ar="${esc(r.numero)}" data-sup="${r.superficie}"> Rodal ${esc(r.numero)} · ${fmt(r.superficie)} ha <span class="muted small">${ESTADO_EJEC[estadoEjecucion(sol, r.numero)][0]}</span></label>`).join('')}</div></div>
      ${formRow('Superficie intervenida (ha)', '<input type="number" id="m-s" min="0" step="0.01">')}${formRow('Observaciones', '<input id="m-o">')}</div>`,
      botones: [{ txt: 'Cancelar' }, { txt: 'Registrar aviso', valor: bg => ({ tipo: valorModal(bg, '#m-t'), fecha: valorModal(bg, '#m-f'), rodales: $$('[data-ar]', bg).filter(x => x.checked).map(x => x.dataset.ar), superficie: +valorModal(bg, '#m-s') || round2(sum($$('[data-ar]', bg).filter(x => x.checked), x => +x.dataset.sup)), obs: valorModal(bg, '#m-o') }) }] });
    if (v && conTry(() => registrarAviso(sol, v))) { toast(`${TIPOS_AVISO[v.tipo]} registrado`, 'ok'); location.hash = `#exp/${sol.id}/resolucion`; rerender(); }
  });
}

/* ====================== Ficha predial: planes vigentes ====================== */
function fichaVigentesHTML(p) {
  const l = actividadesVigentes(p.id);
  const porTipo = superficieVigentePorTipo(p.id);
  const cons = (p.consolidaciones || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const verExp = s => puedeVerSolicitud(solicitud(s) || {}) ? `<a href="#exp/${s}/resolucion">${esc(s)}</a>` : esc(s);
  return `<h2>Actividades vigentes en el predio</h2>
    <p class="muted small">Rodales aprobados de planes vigentes, consolidados en la ficha predial al firmarse cada resolución. Una solicitud nueva que se superponga con ellos se advierte en el análisis espacial (T18).</p>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>Plan</th><th>Rodal</th><th>Tipo forestal</th><th class="num">Sup. (ha)</th><th>Año de corta</th><th>Vigente hasta</th><th>Ejecución</th></tr></thead><tbody>
    ${l.map(a => { const e = ESTADO_EJEC[a.ejecucion]; return `<tr><td class="nowrap">${verExp(a.solId)}<div class="muted small">Res. ${esc(a.resolucion)}</div></td><td><b>${esc(a.rodal)}</b></td><td>${esc((TIPOS_FORESTALES[a.tipoForestal] || {}).nombre || '—')}<div class="muted small">${esc((METODOS[a.metodo] || {}).nombre || '')}</div></td>
      <td class="num">${fmt(a.superficie)}</td><td>${esc(a.anioCorta || '—')}</td><td>${fmtFecha(a.vigenciaHasta)}</td><td><span class="chip ${e[1]}">${e[0]}</span></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty-row">El predio no tiene actividades vigentes.</td></tr>'}</tbody>
    ${l.length ? `<tfoot><tr><td colspan="3">Superficie vigente${Object.keys(porTipo).length ? ': ' + Object.entries(porTipo).map(([k, v]) => `${esc(k)} ${fmt(v)} ha`).join(' · ') : ''}</td><td class="num">${fmt(sum(l, 'superficie'))}</td><td colspan="3"></td></tr></tfoot>` : ''}</table></div>
    ${cons.length ? `<details class="mt"><summary>Historial de consolidación de la ficha (${cons.length})</summary><ul class="list">${cons.map(c => `<li>${fmtFecha(c.fecha)} · ${verExp(c.solId)} · Res. ${esc(c.resolucion)} · rodales ${esc(c.rodales.join(', '))} · ${fmt(c.superficie)} ha, vigente hasta ${fmtFecha(c.vigenciaHasta)}</li>`).join('')}</ul></details>` : ''}`;
}
function capaVigentes(map, ctrl, p) {
  const l = actividadesVigentes(p.id).filter(a => a.geom);
  if (!l.length) return;
  const g = L.geoJSON(turf.featureCollection(l.map(a => turf.feature(a.geom.geometry, { solId: a.solId, resolucion: a.resolucion, rodal: a.rodal, vig: a.vigenciaHasta }))), {
    style: { color: '#0064a9', weight: 2.5, dashArray: '6 4', fillColor: '#0064a9', fillOpacity: .12 },
    onEachFeature: (f, ly) => ly.bindPopup(`<b>Plan vigente</b><br>${esc(f.properties.solId)} · Res. ${esc(f.properties.resolucion)}<br>Rodal ${esc(f.properties.rodal)} · vigente hasta ${fmtFecha(f.properties.vig)}`),
  }).addTo(map);
  ctrl.addOverlay(g, 'Actividades vigentes (planes aprobados)');
}
