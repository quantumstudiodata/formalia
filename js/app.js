(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const clonar = (o) => JSON.parse(JSON.stringify(o));

  const TIPOS = {
    unica: { nombre: 'Opción única', icono: 'radio' },
    multiple: { nombre: 'Opción múltiple', icono: 'checkbox' },
    vf: { nombre: 'Verdadero / Falso', icono: 'toggle' },
    menu: { nombre: 'Menú desplegable', icono: 'menu' },
    corta: { nombre: 'Respuesta corta', icono: 'texto' },
    parrafo: { nombre: 'Respuesta larga', icono: 'parrafo' },
    ...Tipos.LISTA
  };
  const DESC_TIPOS = {
    unica: 'Elige una sola respuesta', multiple: 'Elige varias respuestas', vf: 'Verdadero o falso',
    menu: 'Elige una opción de una lista', corta: 'Texto breve con respuesta correcta', parrafo: 'Texto libre, sin calificar',
    subrespuestas: 'Varios campos por completar', puntoImagen: 'Señalar un punto en la imagen', etiquetarImagen: 'Nombrar puntos numerados',
    zonasImagen: 'Opción o texto por punto', ordenar: 'Arrastrar en orden', relacionar: 'Unir dos columnas',
    huecos: 'Completar espacios en el texto', escala: 'Escala numérica o de acuerdo (Likert)',
    numero: 'Un valor numérico, con tolerancia', lineaNumerica: 'Marcar un valor sobre una línea'
  };
  // Tipos que se editan como una lista de opciones (una sola marca correcta salvo "multiple").
  const esOpciones = (t) => t === 'unica' || t === 'multiple' || t === 'vf' || t === 'menu';
  // Enunciado sugerido según el tipo, para orientar a quien redacta la pregunta.
  const PLACEHOLDER_TIPO = {
    puntoImagen: 'Ej. Señala la salida de emergencia en la imagen',
    zonasImagen: 'Ej. Identifica las estructuras señaladas en la imagen',
    numero: 'Ej. ¿Cuál es el resultado de la concentración?',
    lineaNumerica: 'Ej. Ubica el valor de pH sobre la línea'
  };

  const CONFIG_BASE = {
    esExamen: true,
    mostrarResultados: true,
    mostrarCorrectas: true,
    aceptaRespuestas: true,
    pedirNombre: true,
    pedirCorreo: false,
    mezclarPreguntas: false,
    aprobatorio: 70,
    mensajeFinal: ''
  };

  function nuevaPregunta(tipo) {
    const p = { id: uid(), tipo, texto: '', obligatoria: true, puntos: 1, opciones: [], correctas: [], respuestasAceptadas: [] };
    if (tipo === 'unica' || tipo === 'multiple' || tipo === 'menu') p.opciones = [{ id: uid(), texto: 'Opción 1' }, { id: uid(), texto: 'Opción 2' }];
    if (tipo === 'vf') p.opciones = [{ id: 'v', texto: 'Verdadero' }, { id: 'f', texto: 'Falso' }];
    if (tipo === 'parrafo') p.puntos = 0;
    return Object.assign(p, Tipos.nueva(tipo));
  }

  function cambiarTipo(p, tipo) {
    const antes = p.tipo;
    p.tipo = tipo;
    Tipos.aplicarTipo(p, tipo);
    if (tipo === 'vf') {
      p.opciones = [{ id: 'v', texto: 'Verdadero' }, { id: 'f', texto: 'Falso' }];
      p.correctas = [];
    } else if (tipo === 'unica' || tipo === 'multiple' || tipo === 'menu') {
      if (antes === 'vf' || !esOpciones(antes)) {
        p.opciones = [{ id: uid(), texto: 'Opción 1' }, { id: uid(), texto: 'Opción 2' }];
        p.correctas = [];
      }
      if (tipo === 'unica' || tipo === 'menu') p.correctas = p.correctas.slice(0, 1);
    } else {
      p.opciones = [];
      p.correctas = [];
    }
    if (tipo === 'parrafo') p.puntos = 0;
    else if (!p.puntos) p.puntos = 1;
  }

  // ---------- Utilidades de UI ----------
  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.innerHTML = `${ic(tipo === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function modal(html, alMontar) {
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const cerrar = () => {
      el.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), 220);
    };
    const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) cerrar(); });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    if (alMontar) alMontar(el, cerrar);
    return cerrar;
  }

  function confirmar(titulo, texto, textoOk = 'Eliminar') {
    return new Promise((resolve) => {
      let respuesta = false;
      const cerrar = modal(`
        <div class="modal-icon danger">${ic('trash')}</div>
        <h3>${esc(titulo)}</h3>
        <p class="muted">${esc(texto)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cerrar>Cancelar</button>
          <button class="btn btn-danger" data-ok>${esc(textoOk)}</button>
        </div>`, (el) => {
        el.querySelector('[data-ok]').addEventListener('click', () => { respuesta = true; cerrar(); });
        const obs = new MutationObserver(() => {
          if (!document.body.contains(el)) { obs.disconnect(); resolve(respuesta); }
        });
        obs.observe(document.body, { childList: true });
      });
    });
  }

  function fechaRelativa(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'hace un momento';
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `hace ${d} día${d > 1 ? 's' : ''}`;
    return new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const fechaCompleta = (ts) => new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const ligaPublica = (id) => `${location.origin}${location.pathname}#/responder/${id}`;
  const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  function autoAltura(t) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 'px';
  }

  async function copiar(texto, mensaje = 'Liga copiada') {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    toast(mensaje);
  }

  // Logo de Formalia (se pinta con el color del texto, así sirve en temas claros y oscuros).
  const logo = (tam = '') => `<div class="brand ${tam}"><span class="brand-logo" role="img" aria-label="${esc(window.CONFIG.NOMBRE)}"></span></div>`;

  function topbar(conCrear = false) {
    const u = Sesion.usuario() || {};
    return `
      <header class="topbar">
        <a href="#/formularios" class="brand-link">${logo()}</a>
        ${conCrear ? `<nav class="topbar-nav" aria-label="Principal">
          <a href="#/formularios" class="active">Inicio</a>
          <button type="button" data-ir="plantillas">Plantillas</button>
          <button type="button" data-ir="misformularios">Resultados</button>
        </nav>` : ''}
        <div class="topbar-right">
          ${conCrear ? `<button type="button" class="btn btn-primary btn-sm" data-crear="formulario">${ic('plus')} Crear</button>` : ''}
          ${API.modoDemo ? '<span class="chip chip-demo" title="Configura Supabase en js/config.js">Modo demo</span>' : ''}
          <div class="user-menu">
            <button class="avatar" id="avatarBtn" aria-label="Cuenta">${esc(iniciales(u.nombre))}</button>
            <div class="dropdown" id="userDropdown">
              <div class="dropdown-head"><strong>${esc(u.nombre)}</strong><span>${esc(u.email)}</span></div>
              <button class="dropdown-item" data-accion="logout">${ic('logout')} Cerrar sesión</button>
            </div>
          </div>
        </div>
      </header>`;
  }

  function enlazarTopbar() {
    const btn = $('#avatarBtn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      $('#userDropdown').classList.toggle('open');
    });
    $('[data-accion="logout"]').addEventListener('click', async () => {
      await guardarSiHayCambios();
      try { await API.call('logout'); } catch (e) {}
      Sesion.cerrar();
      E = null;
      location.hash = '#/login';
    });
  }

  // ---------- Barra flotante al seleccionar texto: negrita/cursiva/tachado, o "Marcar espacio" en huecos ----------
  const barraFormato = document.createElement('div');
  barraFormato.className = 'rt-bar';
  barraFormato.setAttribute('role', 'toolbar');
  document.body.appendChild(barraFormato);
  barraFormato.addEventListener('mousedown', (e) => e.preventDefault());
  barraFormato.addEventListener('click', (e) => {
    const bh = e.target.closest('[data-hueco-btn]');
    if (bh) {
      const campo = barraFormato._campoHuecos;
      const p = campo && preguntaDe(campo);
      barraFormato.classList.remove('show');
      if (campo && p && Tipos.marcarHueco(campo, p)) {
        pintarPreguntas();
        programarGuardado();
      }
      return;
    }
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    document.execCommand(b.dataset.cmd, false);
    actualizarBarraFormato();
  });
  function actualizarBarraFormato() {
    const sel = window.getSelection();
    const nodo = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
    const elNodo = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentElement);
    const campoHuecos = elNodo && elNodo.closest('.huecos-edit[contenteditable="true"]');
    const campo = campoHuecos || (elNodo && elNodo.closest('.rt[contenteditable="true"]'));
    if (!campo || sel.isCollapsed) { barraFormato.classList.remove('show'); return; }
    if (campoHuecos) {
      const r0 = sel.getRangeAt(0);
      if (r0.startContainer !== r0.endContainer || r0.startContainer.nodeType !== 3) { barraFormato.classList.remove('show'); return; }
      barraFormato.innerHTML = `<button type="button" data-hueco-btn title="Marcar como espacio a completar">${ic('blank')} Marcar espacio</button>`;
      barraFormato._campoHuecos = campoHuecos;
    } else {
      barraFormato.innerHTML = [['bold', '<b>B</b>', 'Negrita (Ctrl+B)'], ['italic', '<i>I</i>', 'Cursiva (Ctrl+I)'], ['strikeThrough', '<s>S</s>', 'Tachado']]
        .map(([c, t, n]) => `<button type="button" data-cmd="${c}" title="${n}" aria-label="${n}">${t}</button>`).join('');
      barraFormato._campoHuecos = null;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    barraFormato.style.left = `${Math.max(8, Math.min(innerWidth - 170, r.left + r.width / 2 - 70))}px`;
    barraFormato.style.top = `${Math.max(8, r.top - 46)}px`;
    if (!campoHuecos) $$('[data-cmd]', barraFormato).forEach((b) => b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)));
    barraFormato.classList.add('show');
  }
  document.addEventListener('selectionchange', actualizarBarraFormato);
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.rt-bar, .rt, .huecos-edit')) barraFormato.classList.remove('show'); });
  window.addEventListener('scroll', () => barraFormato.classList.remove('show'), { passive: true });
  // Al pegar en un campo con formato o en el de espacios, solo se pega el texto.
  document.addEventListener('paste', (e) => {
    if (!e.target.closest || !e.target.closest('.rt[contenteditable="true"], .huecos-edit[contenteditable="true"]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });

  // Ampliar imágenes de apoyo.
  const ampliar = (img) => modal(`
      <button class="icon-btn modal-x" data-cerrar aria-label="Cerrar">${ic('x')}</button>
      <img class="zoom-img" src="${img.src}" alt="${esc(img.alt)}">`, (el) => el.querySelector('.modal-card').classList.add('zoom'));
  document.addEventListener('click', (e) => { const img = e.target.closest('[data-ampliar]'); if (img) ampliar(img); });
  document.addEventListener('keydown', (e) => {
    const img = e.target.closest && e.target.closest('[data-ampliar]');
    if (img && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ampliar(img); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tipo-picker')) $$('.tipo-pop.open').forEach((m) => m.classList.remove('open'));
    if (!e.target.closest('.dropdown, .menu')) $$('.dropdown.open, .menu.open').forEach((m) => m.classList.remove('open'));
  });

  // ---------- Versión de la base de datos ----------
  // Si no se ha vuelto a ejecutar supabase.sql, los participantes no ven lo nuevo.
  const VERSION_BD = 6;
  let versionBd = null;
  let consultaVersion = null;
  async function avisoVersion() {
    if (versionBd === null) {
      consultaVersion = consultaVersion || API.call('version')
        .then((v) => { versionBd = v; })
        .catch(() => {})
        .finally(() => { consultaVersion = null; });
      await consultaVersion;
      if (versionBd === null) return;
    }
    const main = $('main.container');
    if (versionBd >= VERSION_BD || !main || $('.db-alert')) return;
    const ref = (window.CONFIG.SUPABASE_URL.match(/https:\/\/([^.]+)\./) || [])[1] || '';
    main.insertAdjacentHTML('afterbegin', `
      <section class="db-alert">
        <span class="db-alert-ic">${ic('alert')}</span>
        <div class="db-alert-txt">
          <strong>Actualiza tu base de datos de Supabase</strong>
          <p>Tus participantes no verán los diseños ni los tipos de pregunta nuevos hasta que vuelvas a ejecutar <code>supabase.sql</code>. No se borra nada.</p>
          <ol><li>Copia el SQL.</li><li>Ábrelo en Supabase → SQL Editor, pégalo y presiona <b>Run</b>.</li><li>Regresa y presiona “Ya lo ejecuté”.</li></ol>
        </div>
        <div class="db-alert-btns">
          <button class="btn btn-primary btn-sm" id="copiarSql">${ic('copy')} Copiar SQL</button>
          ${ref ? `<a class="btn btn-ghost btn-sm" href="https://supabase.com/dashboard/project/${ref}/sql/new" target="_blank" rel="noopener">${ic('external')} Abrir Supabase</a>` : ''}
          <button class="btn btn-ghost btn-sm" id="yaSql">${ic('check')} Ya lo ejecuté</button>
        </div>
      </section>`);
    $('#copiarSql').addEventListener('click', async () => {
      try {
        const r = await fetch(`supabase.sql?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) throw new Error();
        await copiar(await r.text(), 'SQL copiado. Pégalo en Supabase y presiona Run.');
      } catch (e) { toast('No se pudo copiar el SQL. Ábrelo desde el repositorio.', 'err'); }
    });
    $('#yaSql').addEventListener('click', async () => {
      versionBd = null;
      try { versionBd = await API.call('version'); } catch (e) { versionBd = 0; }
      if (versionBd >= VERSION_BD) {
        $('.db-alert').remove();
        toast('¡Listo! Tu base de datos está actualizada.');
      } else toast('Todavía no se detecta la actualización. Revisa que el SQL se haya ejecutado sin errores.', 'err');
    });
  }

  // ---------- Router ----------
  let renderId = 0;
  function ruta() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    return { partes: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
  }

  async function render() {
    const id = ++renderId;
    const { partes, params } = ruta();
    $$('.modal-backdrop').forEach((m) => m.remove());

    Diseno.quitarDePagina();
    if (partes[0] === 'responder') return vistaResponder(partes[1], params.get('preview') === '1', id);
    if (partes[0] === 'confirmado') return vistaConfirmado(params.get('error') === '1');
    if (!Sesion.usuario()) return vistaLogin();
    if (partes[0] === 'login') { location.hash = '#/formularios'; return; }

    if (partes[0] === 'editar' && partes[1]) {
      if (E && E.form.id !== partes[1]) await guardarSiHayCambios();
      return vistaEditor(partes[1], partes[2] || 'preguntas', id);
    }
    await guardarSiHayCambios();
    E = null;
    return vistaDashboard(id);
  }

  // ---------- Login ----------
  // ---------- Login ----------
  const REQUISITOS = [
    ['largo', 'Mínimo 8 caracteres', (v) => v.length >= 8],
    ['mayus', 'Una letra mayúscula', (v) => /[A-ZÁÉÍÓÚÑ]/.test(v)],
    ['numero', 'Un número', (v) => /\d/.test(v)],
    ['especial', 'Un carácter especial (!@#$…)', (v) => /[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ\s]/.test(v)]
  ];

  function vistaLogin() {
    document.title = `Iniciar sesión · ${window.CONFIG.NOMBRE}`;
    const ojo = (campo) => `<button type="button" class="icon-btn sm pass-ver" data-ver="${campo}" aria-label="Mostrar contraseña">${ic('eye')}</button>`;
    app.innerHTML = `
      <div class="auth">
        <section class="auth-brand">
          ${logo('grande')}
          <div class="auth-copy">
            <h1>Crea evaluaciones. Obtén resultados. <span class="grad-text">Ahorra tiempo.</span></h1>
            <p class="auth-lead">Diseña exámenes, cuestionarios y formularios interactivos en minutos. Compártelos mediante una liga y deja que la plataforma califique las respuestas y organice los resultados automáticamente.</p>
            <div class="feature-hero">
              <span class="fh-ic">${ic('sparkles')}</span>
              <div><strong>Crea sin complicaciones</strong><p>Diseña evaluaciones con diferentes tipos de preguntas, imágenes y opciones de calificación.</p></div>
            </div>
            <ul class="features">
              <li><span>${ic('award')}</span>Exámenes con calificación automática</li>
              <li><span>${ic('link')}</span>Comparte con una liga, sin que se registren</li>
              <li><span>${ic('chart')}</span>Resultados y estadísticas al instante</li>
            </ul>
          </div>
        </section>
        <section class="auth-panel">
          <div class="mascota" id="mascota" aria-hidden="true">
            <span class="mascota-halo"></span>
            ${[1, 2, 3, 4].map((n) => `<img src="img/foca${n}.png" alt="" class="foca foca${n} ${n === 2 ? 'on' : ''}" draggable="false">`).join('')}
            <span class="mascota-globo" id="globo">¡Hola! Qué gusto verte.</span>
          </div>
          <div class="auth-card">
            <div class="seg" role="tablist">
              <button type="button" class="seg-btn active" data-modo="login">Iniciar sesión</button>
              <button type="button" class="seg-btn" data-modo="registro">Crear cuenta</button>
              <span class="seg-ind"></span>
            </div>
            <div class="auth-head">
              <h2 id="authTitulo">Bienvenido de vuelta</h2>
              <p class="muted" id="authSub">Ingresa a tu cuenta de ${esc(window.CONFIG.NOMBRE)}.</p>
            </div>
            <form id="authForm" novalidate>
              <label class="field solo-registro" hidden>
                <span>Nombre completo</span>
                <input name="nombre" autocomplete="name" placeholder="Ej. Ana López">
              </label>
              <label class="field">
                <span>Correo electrónico</span>
                <input name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required>
              </label>
              <label class="field">
                <span>Contraseña</span>
                <span class="pass-wrap"><input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>${ojo('password')}</span>
              </label>
              <ul class="pass-req solo-registro" id="passReq" hidden>
                ${REQUISITOS.map(([k, t]) => `<li data-req="${k}">${ic('check')}<span>${t}</span></li>`).join('')}
              </ul>
              <label class="field solo-registro" hidden>
                <span>Repetir contraseña</span>
                <span class="pass-wrap"><input name="password2" type="password" autocomplete="new-password" placeholder="••••••••">${ojo('password2')}</span>
                <small class="pass-match" id="passMatch"></small>
              </label>
              <p class="form-msg" id="authMsg" hidden></p>
              <button class="btn btn-primary btn-block btn-lg" id="authBtn">Entrar</button>
            </form>
            ${API.modoDemo ? `<p class="demo-note">${ic('sparkles')} Modo demo: los datos se guardan solo en este navegador.</p>` : ''}
          </div>
        </section>
      </div>`;

    let modo = 'login';
    const form = $('#authForm');
    const msg = $('#authMsg');
    const mostrarMsg = (t, tipo = 'err') => { msg.hidden = false; msg.className = `form-msg ${tipo}`; msg.textContent = t; };

    // Mascota: cambia de pose según lo que hace la persona.
    const mascota = $('#mascota');
    const globo = $('#globo');
    let globoTimer = null;
    const pose = (n, texto, anim) => {
      $$('.foca', mascota).forEach((f) => f.classList.toggle('on', f.classList.contains(`foca${n}`)));
      if (texto) {
        globo.textContent = texto;
        globo.classList.remove('show');
        void globo.offsetWidth;
        globo.classList.add('show');
        clearTimeout(globoTimer);
        globoTimer = setTimeout(() => globo.classList.remove('show'), 3200);
      }
      if (anim) {
        mascota.classList.remove('salta', 'tiembla');
        void mascota.offsetWidth;
        mascota.classList.add(anim);
      }
    };
    setTimeout(() => pose(2, '¡Hola! Qué gusto verte.', 'salta'), 350);
    form.addEventListener('focusin', (e) => {
      const n = e.target.name;
      if (n === 'password' || n === 'password2') pose(3, 'Tranquilo, no estoy mirando…');
      else if (n === 'email') pose(4, modo === 'login' ? '¿Con qué correo entras?' : 'Tu correo será tu usuario.');
      else if (n === 'nombre') pose(1, '¿Cómo te llamas?');
    });
    form.addEventListener('focusout', () => setTimeout(() => { if (!form.contains(document.activeElement)) pose(2); }, 0));

    const pass = form.password;
    const pass2 = form.password2;
    const revisarPass = () => {
      const v = pass.value;
      REQUISITOS.forEach(([k, , ok]) => $(`[data-req="${k}"]`).classList.toggle('ok', ok(v)));
      const m = $('#passMatch');
      if (!pass2.value) { m.textContent = ''; m.className = 'pass-match'; return; }
      const igual = pass2.value === v;
      m.textContent = igual ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden';
      m.className = `pass-match ${igual ? 'ok' : 'bad'}`;
    };
    pass.addEventListener('input', revisarPass);
    pass2.addEventListener('input', revisarPass);
    $$('[data-ver]').forEach((b) => b.addEventListener('click', () => {
      const i = form[b.dataset.ver];
      i.type = i.type === 'password' ? 'text' : 'password';
      b.classList.toggle('on', i.type === 'text');
    }));

    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      modo = b.dataset.modo;
      $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      $('.seg').classList.toggle('der', modo === 'registro');
      $$('.solo-registro').forEach((x) => { x.hidden = modo !== 'registro'; });
      $('#authTitulo').textContent = modo === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta';
      $('#authSub').textContent = modo === 'login' ? `Ingresa a tu cuenta de ${window.CONFIG.NOMBRE}.` : 'Empieza a crear tus formularios en minutos.';
      $('#authBtn').textContent = modo === 'login' ? 'Entrar' : 'Crear cuenta';
      pass.autocomplete = modo === 'login' ? 'current-password' : 'new-password';
      msg.hidden = true;
      pose(modo === 'login' ? 2 : 4, modo === 'login' ? '¡Qué bueno que regresas!' : '¡Bienvenido a Formalia!', 'salta');
      revisarPass();
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = Object.fromEntries(new FormData(form));
      const error = (t) => { mostrarMsg(t); pose(1, 'Revisa los datos, por favor.', 'tiembla'); };
      if (modo === 'registro' && !datos.nombre.trim()) return error('Escribe tu nombre.');
      if (!/^\S+@\S+\.\S+$/.test(datos.email)) return error('Escribe un correo válido.');
      if (modo === 'registro') {
        const falta = REQUISITOS.filter(([, , ok]) => !ok(datos.password || ''));
        if (falta.length) return error(`A tu contraseña le falta: ${falta.map(([, t]) => t.toLowerCase()).join(', ')}.`);
        if (datos.password !== datos.password2) return error('Las contraseñas no coinciden.');
      } else if (!datos.password) return error('Escribe tu contraseña.');
      delete datos.password2;
      const btn = $('#authBtn');
      btn.disabled = true;
      btn.classList.add('loading');
      try {
        const s = await API.call(modo === 'login' ? 'login' : 'register', datos);
        Sesion.set(s);
        pose(4, '¡Adelante!', 'salta');
        await new Promise((r) => setTimeout(r, 450));
        location.hash = '#/formularios';
        render();
      } catch (err) {
        mostrarMsg(err.message, err.info ? 'info' : 'err');
        if (err.info) pose(4, '¡Revisa tu correo!', 'salta');
        else pose(1, 'Mmm… algo no coincide.', 'tiembla');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
  }

  // ---------- Panel ----------
  let listaForms = [];
  let filtroForms = 'todos';

  async function vistaDashboard(id) {
    document.title = `Mis formularios · ${window.CONFIG.NOMBRE}`;
    const u = Sesion.usuario();
    filtroForms = 'todos';
    app.innerHTML = `
      ${topbar(true)}
      <main class="container">
        <section class="hero-banner">
          <div class="hb-text">
            <p class="eyebrow">Tu espacio</p>
            <h1>Hola, <span class="grad-text">${esc(String(u.nombre).split(' ')[0])}</span>. Crea evaluaciones que se califican solas.</h1>
            <p class="muted">Empieza con una plantilla o desde cero. La foca se encarga del resto.</p>
          </div>
          <div class="hb-mascota" aria-hidden="true"><img src="img/foca2.png" alt=""></div>
        </section>
        <section id="plantillas">
          <div class="section-head"><h2>Empieza con una plantilla</h2></div>
          <div class="qtpl-grid">
            <button type="button" class="qtpl-tile qtpl-blanco" data-crear="formulario"><span class="qtpl-plus">${ic('plus')}</span>En blanco</button>
            <button type="button" class="qtpl-tile qtpl-examen" data-crear="examen">${ic('award')}<strong>Examen rápido</strong></button>
            <button type="button" class="qtpl-tile qtpl-cuestionario" data-crear="cuestionario">${ic('list')}<strong>Quiz con imágenes</strong></button>
            <button type="button" class="qtpl-tile qtpl-encuesta" data-crear="encuesta">${ic('chart')}<strong>Encuesta de satisfacción</strong></button>
            <button type="button" class="qtpl-tile qtpl-pasos" data-crear="pasos">${ic('list')}<strong>Evaluación paso a paso</strong></button>
          </div>
        </section>
        <section id="misformularios">
          <div class="section-head">
            <h2>Mis formularios</h2>
            <div class="tabs-filtro" role="group" aria-label="Filtrar formularios">
              <button type="button" class="chip-filtro sel" data-filtro="todos">Todos</button>
              <button type="button" class="chip-filtro" data-filtro="abiertos">Abiertos</button>
              <button type="button" class="chip-filtro" data-filtro="cerrados">Cerrados</button>
            </div>
            <label class="search">${ic('search')}<input id="buscar" placeholder="Buscar formularios" autocomplete="off"></label>
          </div>
          <div class="forms-grid" id="formsGrid">${'<div class="form-card skeleton"></div>'.repeat(3)}</div>
        </section>
      </main>`;
    enlazarTopbar();

    $$('[data-crear]').forEach((b) => b.addEventListener('click', () => crearForm(b.dataset.crear, b)));
    $$('[data-ir]').forEach((b) => b.addEventListener('click', () => $(`#${b.dataset.ir}`).scrollIntoView({ behavior: 'smooth', block: 'start' })));
    avisoVersion();
    $('#buscar').addEventListener('input', pintarLista);
    $$('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      filtroForms = b.dataset.filtro;
      $$('[data-filtro]').forEach((x) => x.classList.toggle('sel', x === b));
      pintarLista();
    }));

    try {
      const lista = await API.call('listForms');
      if (id !== renderId) return;
      listaForms = lista;
      pintarLista();
    } catch (err) {
      if (id !== renderId) return;
      $('#formsGrid').innerHTML = `<div class="empty">${ic('alert')}<p>${esc(err.message)}</p></div>`;
    }
  }

  function pintarLista() {
    const grid = $('#formsGrid');
    if (!grid) return;
    const q = normalizarTexto($('#buscar').value);
    let lista = listaForms.filter((f) => !q || normalizarTexto(f.titulo).includes(q));
    if (filtroForms === 'abiertos') lista = lista.filter((f) => f.aceptaRespuestas);
    if (filtroForms === 'cerrados') lista = lista.filter((f) => !f.aceptaRespuestas);
    if (!listaForms.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-art">${ic('sparkles')}</div>
          <h3>Aún no tienes formularios</h3>
          <p class="muted">Crea tu primer examen o formulario con los botones de arriba.</p>
        </div>`;
      return;
    }
    if (!lista.length) {
      grid.innerHTML = `<div class="empty"><p class="muted">No hay formularios que coincidan con la búsqueda o el filtro.</p></div>`;
      return;
    }
    grid.innerHTML = lista.map((f, i) => `
      <article class="form-card" data-id="${esc(f.id)}" style="--i:${i}">
        <a class="fc-cover ${f.portada ? 'con-foto' : ''}" href="#/editar/${esc(f.id)}" style="--cover:${esc(portadaDe(f))}">
          ${f.portada ? '' : `<span class="fc-art">${ic(f.esExamen ? 'award' : 'form')}</span>`}
          <span class="chip chip-glass">${f.esExamen ? 'Examen' : 'Formulario'}</span>
          ${f.aceptaRespuestas ? '' : '<span class="chip chip-glass chip-closed">Cerrado</span>'}
        </a>
        <div class="fc-body">
          <a href="#/editar/${esc(f.id)}" class="fc-title">${esc(f.titulo || 'Sin título')}</a>
          <p class="fc-meta"><span>${ic('list')} ${f.numPreguntas} pregunta${f.numPreguntas === 1 ? '' : 's'}</span><span>${ic('users')} ${f.numRespuestas} respuesta${f.numRespuestas === 1 ? '' : 's'}</span></p>
          <p class="fc-date">${ic('clock')} Editado ${fechaRelativa(f.actualizado)}</p>
        </div>
        <div class="fc-menu">
          <button class="icon-btn" data-menu aria-label="Opciones">${ic('more')}</button>
          <div class="menu">
            <a class="dropdown-item" href="#/editar/${esc(f.id)}">${ic('form')} Abrir</a>
            <a class="dropdown-item" href="#/editar/${esc(f.id)}/respuestas">${ic('chart')} Ver respuestas</a>
            <button class="dropdown-item" data-fa="compartir">${ic('share')} Compartir</button>
            <button class="dropdown-item" data-fa="duplicar">${ic('copy')} Duplicar</button>
            <button class="dropdown-item danger" data-fa="eliminar">${ic('trash')} Eliminar</button>
          </div>
        </div>
      </article>`).join('');

    $$('[data-menu]', grid).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = b.nextElementSibling;
      const abierto = m.classList.contains('open');
      $$('.menu.open').forEach((x) => x.classList.remove('open'));
      if (!abierto) m.classList.add('open');
    }));
    $$('[data-fa]', grid).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('.form-card').dataset.id;
      const f = listaForms.find((x) => x.id === id);
      b.closest('.menu').classList.remove('open');
      if (b.dataset.fa === 'compartir') abrirCompartir(f.id);
      if (b.dataset.fa === 'duplicar') {
        try {
          const orig = await API.call('getForm', { id });
          const copia = clonar(orig);
          delete copia.id;
          copia.titulo = `${orig.titulo || 'Sin título'} (copia)`;
          await API.call('saveForm', { form: copia });
          toast('Formulario duplicado');
          listaForms = await API.call('listForms');
          pintarLista();
        } catch (err) { toast(err.message, 'err'); }
      }
      if (b.dataset.fa === 'eliminar') {
        const ok = await confirmar('¿Eliminar formulario?', `Se eliminará “${f.titulo || 'Sin título'}” junto con sus ${f.numRespuestas} respuestas. No se puede deshacer.`);
        if (!ok) return;
        try {
          await API.call('deleteForm', { id });
          listaForms = listaForms.filter((x) => x.id !== id);
          pintarLista();
          toast('Formulario eliminado');
        } catch (err) { toast(err.message, 'err'); }
      }
    }));
  }

  // Fondo de la tarjeta en "Mis formularios": la imagen de portada o el degradado de su plantilla.
  const portadaDe = (f) => f.portada
    ? `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.45)), url("${f.portada}") center / cover`
    : Diseno.variables({ plantilla: f.plantilla, acento: f.acento })['--hero'];

  async function crearForm(tipo, btn) {
    btn.disabled = true;
    btn.classList.add('loading');
    const PRIMERA_PREGUNTA = { cuestionario: 'multiple', encuesta: 'escala' };
    const form = {
      titulo: tipo === 'examen' ? 'Examen sin título' : 'Formulario sin título',
      descripcion: '',
      config: Object.assign({}, CONFIG_BASE, tipo === 'examen' ? { esExamen: true } : {}),
      preguntas: [nuevaPregunta(PRIMERA_PREGUNTA[tipo] || 'unica')],
      ...(tipo === 'pasos' ? { diseno: { composicion: 'pasos' } } : {})
    };
    try {
      const creado = await API.call('saveForm', { form });
      location.hash = `#/editar/${creado.id}`;
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  function abrirCompartir(id, extra = '') {
    const liga = ligaPublica(id);
    modal(`
      <button class="icon-btn modal-x" data-cerrar aria-label="Cerrar">${ic('x')}</button>
      <div class="modal-icon">${ic('share')}</div>
      <h3>Compartir formulario</h3>
      <p class="muted">Cualquier persona con esta liga puede responder, sin necesidad de cuenta.</p>
      <div class="copy-row">
        <span class="copy-ic">${ic('link')}</span>
        <input readonly value="${esc(liga)}" id="ligaInput">
        <button class="btn btn-primary" id="copiarLiga">${ic('copy')} Copiar</button>
      </div>
      ${extra}
      ${API.modoDemo ? `<p class="demo-note">${ic('alert')} En modo demo la liga solo funciona en este navegador. Configura Supabase para compartirla con otras personas.</p>` : ''}
      <div class="modal-actions">
        <a class="btn btn-ghost" href="${esc(liga)}" target="_blank" rel="noopener">${ic('external')} Abrir formulario</a>
      </div>`, (el) => {
      el.querySelector('#copiarLiga').addEventListener('click', () => copiar(liga));
      el.querySelector('#ligaInput').addEventListener('focus', (e) => e.target.select());
    });
  }

  // ---------- Editor ----------
  let E = null; // { form, tab, respuestas, sucio, timer, guardando }
  let preguntaActiva = null; // id de la pregunta expandida en "Preguntas"; las demás se muestran como fila resumen

  function setEstado(texto, tipo = '') {
    const el = $('#saveState');
    if (!el) return;
    el.className = `save-state ${tipo}`;
    el.innerHTML = `${tipo === 'ok' ? ic('check') : '<span class="dot"></span>'}${esc(texto)}`;
  }

  function programarGuardado() {
    if (!E) return;
    E.sucio = true;
    setEstado('Cambios sin guardar', 'pend');
    clearTimeout(E.timer);
    E.timer = setTimeout(() => guardar(), 800);
  }

  async function guardar() {
    const ed = E;
    if (!ed) return;
    clearTimeout(ed.timer);
    while (ed.guardando) await ed.guardando;
    if (!ed.sucio) return;
    ed.sucio = false;
    if (E === ed) setEstado('Guardando…', 'saving');
    ed.guardando = API.call('saveForm', { form: ed.form })
      .then(() => {
        if (!ed.sucio && E === ed) {
          setEstado('Guardado', 'ok');
          const ifr = $('#livePreview');
          if (ifr && ed.tab === 'preguntas') ifr.src = `${urlMini()}&_=${Date.now()}`;
        }
      })
      .catch((err) => {
        ed.sucio = true;
        if (E === ed) setEstado('No se pudo guardar', 'err');
        toast(err.message, 'err');
      })
      .finally(() => { ed.guardando = null; });
    await ed.guardando;
  }

  async function guardarSiHayCambios() {
    if (E && (E.sucio || E.guardando)) await guardar();
  }

  window.addEventListener('beforeunload', (e) => {
    if (E && (E.sucio || E.guardando)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  async function vistaEditor(id, tab, rid) {
    if (!['preguntas', 'diseno', 'respuestas', 'configuracion'].includes(tab)) tab = 'preguntas';
    if (!E || E.form.id !== id) {
      app.innerHTML = `${topbar()}<main class="container narrow"><div class="loader"><span></span></div></main>`;
      enlazarTopbar();
      try {
        const form = await API.call('getForm', { id });
        if (rid !== renderId) return;
        form.config = Object.assign({}, CONFIG_BASE, form.config || {});
        form.preguntas = form.preguntas || [];
        form.diseno = Diseno.normalizar(form.diseno);
        E = { form, tab, respuestas: null, sucio: false, timer: null, guardando: null };
        preguntaActiva = null;
      } catch (err) {
        if (rid !== renderId) return;
        app.innerHTML = `${topbar()}<main class="container narrow"><div class="empty">${ic('alert')}<h3>No se pudo abrir</h3><p class="muted">${esc(err.message)}</p><a class="btn btn-ghost" href="#/formularios">${ic('back')} Volver</a></div></main>`;
        enlazarTopbar();
        return;
      }
    }
    E.tab = tab;
    const f = E.form;
    document.title = `${f.titulo || 'Sin título'} · ${window.CONFIG.NOMBRE}`;
    const tabs = [['preguntas', 'list', 'Preguntas'], ['diseno', 'palette', 'Diseño'], ['respuestas', 'chart', 'Respuestas'], ['configuracion', 'sliders', 'Configuración']];
    app.innerHTML = `
      <header class="topbar editor-bar">
        <div class="eb-left">
          <a class="icon-btn" href="#/formularios" aria-label="Volver">${ic('back')}</a>
          <div class="eb-title">
            <span class="eb-name" id="ebName">${esc(f.titulo || 'Sin título')}</span>
            <span class="save-state ok" id="saveState">${ic('check')}Guardado</span>
          </div>
        </div>
        <nav class="tabs">
          ${tabs.map(([k, , n]) => `<a href="#/editar/${esc(f.id)}/${k}" class="tab ${k === tab ? 'active' : ''}">${n}</a>`).join('')}
        </nav>
        <div class="eb-actions">
          <button class="btn btn-primary eb-share" id="btnCompartir">Compartir</button>
        </div>
      </header>
      <main class="editor ${tab === 'preguntas' || tab === 'diseno' ? 'full' : 'container narrow'}" id="editorBody"></main>`;

    $('#btnCompartir').addEventListener('click', async () => {
      await guardarSiHayCambios();
      abrirCompartir(f.id, `
        <label class="switch-row">
          <span><strong>Aceptar respuestas</strong><small>Si lo desactivas, la liga mostrará que el formulario está cerrado.</small></span>
          <span class="switch"><input type="checkbox" id="swAcepta" ${f.config.aceptaRespuestas ? 'checked' : ''}><span class="sw"></span></span>
        </label>`);
      $('#swAcepta').addEventListener('change', (e) => {
        f.config.aceptaRespuestas = e.target.checked;
        programarGuardado();
        guardar();
      });
    });

    const cuerpo = $('#editorBody');
    avisoVersionEditor();
    if (tab === 'preguntas') pintarPreguntas();
    else if (tab === 'configuracion') pintarConfig();
    else if (tab === 'diseno') pintarDiseno();
    else pintarRespuestas(rid);

    cuerpo.addEventListener('input', onEditorInput);
    cuerpo.addEventListener('change', onEditorChange);
    cuerpo.addEventListener('click', onEditorClick);
  }

  const preguntaDe = (el) => {
    const card = el.closest('[data-qid]');
    return card ? E.form.preguntas.find((p) => p.id === card.dataset.qid) : null;
  };

  function onEditorInput(e) {
    const t = e.target;
    if (t.tagName === 'TEXTAREA') autoAltura(t);
    if (t.isContentEditable) {
      const { plano, html } = leerRico(t);
      const destino = t.dataset.f ? E.form : preguntaDe(t);
      const campo = t.dataset.f || t.dataset.q;
      if (!destino) return;
      destino[campo] = plano;
      if (html) destino[`${campo}Html`] = html;
      else delete destino[`${campo}Html`];
      programarGuardado();
      return;
    }
    if (t.dataset.f) {
      E.form[t.dataset.f] = t.value;
      if (t.dataset.f === 'titulo') $('#ebName').textContent = t.value || 'Sin título';
      programarGuardado();
      return;
    }
    const p = preguntaDe(t);
    if (!p) return;
    if (t.dataset.t && Tipos.input(t, p)) {
      actualizarAviso(p);
      programarGuardado();
      return;
    }
    if (t.dataset.q === 'texto') p.texto = t.value;
    else if (t.dataset.q === 'puntos') {
      p.puntos = Math.max(0, Number(t.value) || 0);
      actualizarTotal();
    } else if (t.dataset.q === 'aceptadas') {
      p.respuestasAceptadas = t.value.split('\n').map((x) => x.trim()).filter(Boolean);
      actualizarAviso(p);
    } else if (t.dataset.o === 'texto') {
      const o = p.opciones.find((x) => x.id === t.closest('[data-oid]').dataset.oid);
      if (o) o.texto = t.value;
    } else return;
    programarGuardado();
  }

  function onEditorChange(e) {
    const t = e.target;
    if (t.dataset.c) {
      const cfg = E.form.config;
      if (t.type === 'checkbox') cfg[t.dataset.c] = t.checked;
      else if (t.type === 'number') cfg[t.dataset.c] = Math.min(100, Math.max(0, Number(t.value) || 0));
      else cfg[t.dataset.c] = t.value;
      if (t.dataset.c === 'esExamen') pintarConfig();
      programarGuardado();
      return;
    }
    const p = preguntaDe(t);
    if (!p) return;
    if (t.dataset.q === 'apoyoArchivo') {
      leerImagen(t.files[0])
        .then(({ dataUrl }) => {
          p.apoyo = { imagen: dataUrl, posicion: (p.apoyo && p.apoyo.posicion) || 'arriba' };
          pintarPreguntas();
          programarGuardado();
        })
        .catch((err) => toast(err.message, 'err'));
      return;
    }
    if (t.dataset.t === 'imagen') {
      Tipos.change(t, p)
        .then((cambio) => { if (cambio) { pintarPreguntas(); programarGuardado(); } })
        .catch((err) => toast(err.message, 'err'));
      return;
    }
    if (t.dataset.q === 'tipo') {
      cambiarTipo(p, t.value);
      pintarPreguntas();
      programarGuardado();
    } else if (t.dataset.q === 'obligatoria') {
      p.obligatoria = t.checked;
      programarGuardado();
    }
  }

  function onEditorClick(e) {
    const ta = e.target.closest('[data-ta]');
    if (ta && !e.target.closest('[data-qa]')) {
      const pt = preguntaDe(ta);
      if (pt && Tipos.click(e, ta, pt, E.form.config.esExamen)) {
        pintarPreguntas();
        programarGuardado();
      }
      return;
    }
    const b = e.target.closest('[data-qa]');
    if (!b) return;
    const lista = E.form.preguntas;
    const p = preguntaDe(b);
    const i = p ? lista.indexOf(p) : -1;
    const accion = b.dataset.qa;
    let enfocar = null;

    if (accion === 'agregar') {
      const nueva = nuevaPregunta(b.dataset.tipo);
      lista.push(nueva);
      enfocar = nueva.id;
      preguntaActiva = nueva.id;
      $('#tipoMenu') && $('#tipoMenu').classList.remove('open');
    } else if (accion === 'activar') {
      preguntaActiva = p.id;
      pintarPreguntas();
      return;
    } else if (accion === 'menuTipos') {
      e.stopPropagation();
      $('#tipoMenu').classList.toggle('open');
      return;
    } else if (accion === 'subir' && i > 0) {
      [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    } else if (accion === 'bajar' && i < lista.length - 1) {
      [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    } else if (accion === 'duplicar') {
      const copia = clonar(p);
      copia.id = uid();
      if (copia.tipo === 'unica' || copia.tipo === 'multiple' || copia.tipo === 'menu') {
        const mapa = {};
        copia.opciones.forEach((o) => { const n = uid(); mapa[o.id] = n; o.id = n; });
        copia.correctas = copia.correctas.map((c) => mapa[c]);
      }
      lista.splice(i + 1, 0, copia);
    } else if (accion === 'eliminar') {
      lista.splice(i, 1);
    } else if (accion === 'correcta') {
      if (!E.form.config.esExamen) return;
      const oid = b.closest('[data-oid]').dataset.oid;
      if (p.tipo === 'multiple') {
        p.correctas = p.correctas.includes(oid) ? p.correctas.filter((x) => x !== oid) : p.correctas.concat(oid);
      } else {
        p.correctas = p.correctas[0] === oid ? [] : [oid];
      }
    } else if (accion === 'agregarOpcion') {
      const o = { id: uid(), texto: `Opción ${p.opciones.length + 1}` };
      p.opciones.push(o);
      enfocar = p.id + ':' + o.id;
    } else if (accion === 'tamEncabezado') {
      const orden = Object.keys(Diseno.TAMANOS_TEXTO);
      const d = E.form.diseno;
      const k = b.dataset.k;
      const i = orden.indexOf(d[k] || 'normal') + Number(b.dataset.d);
      if (i < 0 || i >= orden.length) return;
      d[k] = orden[i];
      programarGuardado();
      if (E.tab === 'diseno') pintarDiseno();
      return;
    } else if (accion === 'abrirTipos') {
      e.stopPropagation();
      const pop = b.nextElementSibling;
      const abierto = pop.classList.contains('open');
      $$('.tipo-pop.open').forEach((x) => x.classList.remove('open'));
      if (!abierto) pop.classList.add('open');
      return;
    } else if (accion === 'elegirTipo') {
      if (b.dataset.tipo !== p.tipo) cambiarTipo(p, b.dataset.tipo);
    } else if (accion === 'apoyoPos') {
      p.apoyo.posicion = b.dataset.v;
    } else if (accion === 'quitarApoyo') {
      delete p.apoyo;
    } else if (accion === 'quitarOpcion') {
      const oid = b.closest('[data-oid]').dataset.oid;
      p.opciones = p.opciones.filter((x) => x.id !== oid);
      p.correctas = p.correctas.filter((x) => x !== oid);
    } else return;

    pintarPreguntas();
    programarGuardado();
    if (enfocar) {
      const [qid, oid] = enfocar.split(':');
      const card = $(`[data-qid="${qid}"]`);
      if (!card) return;
      if (oid) {
        const inp = $(`[data-oid="${oid}"] input`, card);
        inp.focus();
        inp.select();
      } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('nuevo');
        setTimeout(() => $('[data-q="texto"]', card).focus({ preventScroll: true }), 250);
      }
    }
  }

  function totalPuntos() {
    return E.form.preguntas.filter(esCalificable).reduce((s, p) => s + (Number(p.puntos) || 0), 0);
  }
  function actualizarTotal() {
    const el = $('#totalPts');
    if (el) el.textContent = `${totalPuntos()} pts`;
  }
  function avisoPregunta(p) {
    if (!E.form.config.esExamen || p.tipo === 'parrafo') return '';
    if (p.tipo === 'puntoImagen' && (p.modo || 'automatico') === 'manual') return `<span class="q-manual">${ic('users')} Se calificará manualmente</span>`;
    if (esCalificable(p)) return `<span class="q-ok">${ic('check')} Respuesta configurada</span>`;
    return `<span class="q-warn">${ic('alert')} ${p.tipo === 'corta' ? 'Agrega al menos una respuesta aceptada' : Tipos.es(p.tipo) ? Tipos.aviso(p) : 'Marca la respuesta correcta'}</span>`;
  }
  function actualizarAviso(p) {
    const el = $(`[data-qid="${p.id}"] .q-aviso`);
    if (el) el.innerHTML = avisoPregunta(p);
    actualizarTotal();
  }

  // Icono compacto de estado para la fila resumen (colapsada) de cada pregunta.
  function estadoIconoPregunta(p) {
    const html = avisoPregunta(p);
    if (!html) return '';
    if (html.includes('q-manual')) return `<span class="q-row-estado manual" title="Se calificará manualmente">${ic('users')}</span>`;
    if (html.includes('q-ok')) return `<span class="q-row-estado ok" title="Respuesta configurada">${ic('check')}</span>`;
    return `<span class="q-row-estado warn" title="Falta configurar la respuesta correcta">${ic('alert')}</span>`;
  }

  // Fila resumen de una pregunta colapsada; se expande al hacer clic (ver tarjetaPregunta).
  function filaPregunta(p, i) {
    const examen = E.form.config.esExamen;
    const texto = (p.texto || '').trim();
    return `
      <button type="button" class="q-row" data-qid="${esc(p.id)}" data-qa="activar">
        <span class="q-num">${i + 1}</span>
        <span class="q-row-text">${texto ? esc(texto) : '<em>Sin enunciado</em>'}</span>
        <span class="q-row-meta">${esc(TIPOS[p.tipo].nombre)}${examen && p.tipo !== 'parrafo' ? ` · ${Number(p.puntos) || 0} pts` : ''}</span>
        ${estadoIconoPregunta(p)}
      </button>`;
  }

  const gruposTipos = () => {
    const todos = Object.entries(TIPOS);
    return [['Básicas', todos.filter(([k]) => !Tipos.es(k))], ['Interactivas', todos.filter(([k]) => Tipos.es(k))]];
  };

  function tarjetaPregunta(p, i, total) {
    const examen = E.form.config.esExamen;
    let cuerpo = '';
    if (esOpciones(p.tipo)) {
      cuerpo = `${p.tipo === 'menu' ? '<p class="hint">Se mostrará como una lista desplegable.</p>' : ''}<div class="opts">${p.opciones.map((o) => {
        const ok = examen && p.correctas.includes(o.id);
        return `
          <div class="opt ${ok ? 'is-correct' : ''}" data-oid="${esc(o.id)}">
            <button type="button" class="mark ${p.tipo === 'multiple' ? 'sq' : ''} ${examen ? '' : 'off'}" data-qa="correcta" title="${examen ? 'Marcar como correcta' : ''}" ${examen ? '' : 'tabindex="-1"'}>${ic('check')}</button>
            <input class="opt-input" data-o="texto" value="${esc(o.texto)}" ${p.tipo === 'vf' ? 'readonly' : ''} placeholder="Opción">
            ${p.tipo !== 'vf' && p.opciones.length > 1 ? `<button type="button" class="opt-x" data-qa="quitarOpcion" aria-label="Quitar opción">${ic('x')}</button>` : ''}
          </div>`;
      }).join('')}${p.tipo !== 'vf' ? '<button type="button" class="opt opt-add" data-qa="agregarOpcion">+ Opción</button>' : ''}</div>`;
    } else if (Tipos.es(p.tipo)) {
      cuerpo = Tipos.editor(p, examen);
    } else if (p.tipo === 'corta') {
      cuerpo = `<div class="fake-input">Respuesta corta del participante</div>
        ${examen ? `<label class="field compact"><span>Respuestas aceptadas <small>(una por línea; no distingue mayúsculas ni acentos)</small></span>
          <textarea data-q="aceptadas" rows="2" placeholder="Ej. Ciudad de México">${esc(p.respuestasAceptadas.join('\n'))}</textarea></label>` : ''}`;
    } else {
      cuerpo = `<div class="fake-input tall">Respuesta larga del participante</div>
        ${examen ? '<p class="hint">Las preguntas de párrafo no se califican automáticamente.</p>' : ''}`;
    }
    const texto = `<div class="q-text rt" contenteditable="true" data-q="texto" data-placeholder="${esc(PLACEHOLDER_TIPO[p.tipo] || 'Escribe la pregunta')}" aria-label="Enunciado de la pregunta">${textoRico(p.textoHtml, p.texto)}</div>`;
    const orden = `<span class="q-orden">
            <button type="button" data-qa="subir" ${i === 0 ? 'disabled' : ''} aria-label="Subir pregunta" title="Subir">${ic('up')}</button>
            <button type="button" data-qa="bajar" ${i === total - 1 ? 'disabled' : ''} aria-label="Bajar pregunta" title="Bajar">${ic('down')}</button>
          </span>`;
    return `
      <article class="q-card q-activa" data-qid="${esc(p.id)}" style="--i:${i}">
        <div class="q-head-inline">
          <span class="q-num">${i + 1}</span>
          ${p.apoyo && p.apoyo.imagen ? '<span class="q-head-fill"></span>' : texto}
          ${orden}
        </div>
        ${p.apoyo && p.apoyo.imagen ? `
          <div class="q-indent q-enunciado ${p.apoyo.posicion === 'lado' ? 'lado' : 'arriba'}">
            <figure class="apoyo-edit">
              <img src="${p.apoyo.imagen}" alt="Imagen de la pregunta">
              <figcaption>
                <span class="zm-modo" role="group" aria-label="Posición de la imagen">
                  <button type="button" class="${p.apoyo.posicion === 'lado' ? '' : 'sel'}" data-qa="apoyoPos" data-v="arriba">Arriba</button>
                  <button type="button" class="${p.apoyo.posicion === 'lado' ? 'sel' : ''}" data-qa="apoyoPos" data-v="lado">Al lado</button>
                </span>
                <button type="button" class="icon-btn sm danger" data-qa="quitarApoyo" aria-label="Quitar imagen">${ic('trash')}</button>
              </figcaption>
            </figure>
            ${texto}
          </div>` : ''}
        <div class="q-body q-indent">${cuerpo}</div>
        <div class="q-aviso-row q-indent"><span class="q-aviso">${avisoPregunta(p)}</span></div>
        <div class="q-toolbar q-indent" role="toolbar" aria-label="Herramientas de la pregunta">
          <div class="tipo-picker">
            <button type="button" class="tipo-btn" data-qa="abrirTipos" aria-haspopup="true">${TIPOS[p.tipo].nombre} ▾</button>
            <div class="tipo-pop" role="menu">
              ${gruposTipos().map(([g, tipos]) => `
                <p class="type-group">${g}</p>
                <div class="tipo-grid">${tipos.map(([k, t]) => `
                  <button type="button" role="menuitem" class="tipo-opt ${k === p.tipo ? 'sel' : ''}" data-qa="elegirTipo" data-tipo="${k}">
                    <span class="tipo-ic">${ic(t.icono)}</span><span class="tipo-txt"><strong>${t.nombre}</strong><small>${DESC_TIPOS[k] || ''}</small></span>
                  </button>`).join('')}</div>`).join('')}
            </div>
          </div>
          ${examen && p.tipo !== 'parrafo' ? `<label class="pts"><input type="number" min="0" step="1" data-q="puntos" value="${Number(p.puntos) || 0}" aria-label="Puntos"><span>pts</span></label>` : ''}
          <label class="switch sm" title="Obligatoria"><input type="checkbox" data-q="obligatoria" ${p.obligatoria ? 'checked' : ''}><span class="sw"></span><span class="sw-label">Obligatoria</span></label>
          <span class="tb-sep"></span>
          <label class="apoyo-btn" title="Agregar una imagen a esta pregunta">${p.apoyo && p.apoyo.imagen ? 'Cambiar imagen' : 'Imagen'}<input type="file" accept="image/*" data-q="apoyoArchivo" hidden></label>
          <button type="button" class="tb-item" data-qa="duplicar">Duplicar</button>
          <button type="button" class="tb-item danger" data-qa="eliminar">Eliminar</button>
        </div>
      </article>`;
  }

  const urlMini = () => `${ligaPublica(E.form.id)}?preview=1&mini=1&q=${encodeURIComponent(preguntaActiva || '')}`;
  function avisarPreview() {
    const ifr = $('#livePreview');
    if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ miniActiva: preguntaActiva }, location.origin);
  }

  function pintarPreguntas() {
    const f = E.form;
    if (!f.preguntas.some((p) => p.id === preguntaActiva)) preguntaActiva = f.preguntas.length ? f.preguntas[0].id : null;
    const cuerpo = $('#editorBody');
    const scroll = window.scrollY;
    if (!$('#livePreview', cuerpo)) {
      cuerpo.innerHTML = `
        <div class="q-layout">
          <div class="q-main" id="qMain"></div>
          <aside class="q-preview" aria-label="Vista previa en vivo">
            <p class="q-preview-label">Vista en vivo</p>
            <div class="q-phone"><iframe id="livePreview" title="Vista previa del formulario" src="${esc(urlMini())}"></iframe></div>
            <a class="q-preview-link" id="abrirPreview" href="${esc(ligaPublica(f.id))}?preview=1" target="_blank" rel="noopener">Abrir vista previa completa ↗</a>
          </aside>
        </div>`;
      $('#abrirPreview').addEventListener('click', () => guardarSiHayCambios());
      $('#livePreview').addEventListener('load', avisarPreview);
    }
    $('#qMain').innerHTML = `
      <section class="q-form-head">
        <input class="title-input" data-f="titulo" value="${esc(f.titulo)}" placeholder="Formulario sin título" aria-label="Título">
        <div class="desc-input rt" contenteditable="true" data-f="descripcion" data-placeholder="Agrega una descripción (opcional)" aria-label="Descripción">${textoRico(f.descripcionHtml, f.descripcion)}</div>
      </section>
      <div class="q-list">
        ${f.preguntas.length ? f.preguntas.map((p, i) => p.id === preguntaActiva ? tarjetaPregunta(p, i, f.preguntas.length) : filaPregunta(p, i)).join('') : `<div class="empty small"><p class="muted">Este formulario no tiene preguntas todavía.</p></div>`}
      </div>
      <div class="add-q">
        <button type="button" class="add-q-tile" data-qa="agregar" data-tipo="unica">+ Única</button>
        <button type="button" class="add-q-tile" data-qa="agregar" data-tipo="multiple">+ Múltiple</button>
        <button type="button" class="add-q-tile" data-qa="agregar" data-tipo="vf">+ V / F</button>
        <button type="button" class="add-q-tile" data-qa="agregar" data-tipo="corta">+ Texto</button>
        <button type="button" class="add-q-tile" data-qa="agregar" data-tipo="puntoImagen">+ Imagen</button>
        <button type="button" class="add-q-tile" data-qa="menuTipos">+ Más</button>
        <div class="type-menu" id="tipoMenu">
          ${gruposTipos().map(([g, tipos]) => `<p class="type-group">${g}</p>${tipos.map(([k, t]) => `<button type="button" class="type-opt" data-qa="agregar" data-tipo="${k}"><span class="tipo-ic">${ic(t.icono)}</span><span class="tipo-txt"><strong>${t.nombre}</strong><small>${DESC_TIPOS[k] || ''}</small></span></button>`).join('')}`).join('')}
        </div>
      </div>`;
    $$('textarea', cuerpo).forEach(autoAltura);
    barraFormato.classList.remove('show');
    avisarPreview();
    window.scrollTo(0, scroll);
  }



  // El aviso vive fuera de #editorBody para que no lo borre el cambio de pestaña.
  function avisoVersionEditor() {
    const body = $('#editorBody');
    const host = document.createElement('main');
    host.className = 'container narrow db-host';
    body.parentNode.insertBefore(host, body);
    avisoVersion().then(() => { if (!host.children.length) host.remove(); });
  }

  // ---------- Diseño (mockup A · Estudio: opciones en una barra lateral, vista previa grande a la derecha) ----------
  function miniComposicion(k) {
    switch (k) {
      case 'portada': return '<i class="mc-hero tall"></i><i class="mc-line in"></i>';
      case 'lateral': return '<span class="mc-row"><i class="mc-side"></i><span class="mc-col"><i class="mc-block"></i><i class="mc-block"></i></span></span>';
      case 'pasos': return '<i class="mc-progress"></i><i class="mc-solo"></i>';
      case 'minimal': return '<i class="mc-title"></i><i class="mc-rule"></i><i class="mc-rule"></i>';
      default: return '<i class="mc-hero"></i><i class="mc-line"></i><i class="mc-line"></i>';
    }
  }

  function pintarDiseno() {
    const f = E.form;
    const d = f.diseno;
    const sel = (k, v) => (d[k] === v ? 'sel' : '');
    Diseno.cargarFuentes(Diseno.FUENTES.map((x) => x.nombre));
    const vista = E.vistaDiseno || 'pc';
    const primera = f.preguntas[0];
    const opciones = primera && primera.opciones && primera.opciones.length >= 2 ? primera.opciones.slice(0, 2).map((o) => o.texto) : ['Opción seleccionada', 'Otra opción'];
    const tamanos = Object.keys(Diseno.TAMANOS);
    const tamTxt = (k, n) => `
      <span class="hc-tam" title="Tamaño de ${n.toLowerCase()}">
        <small>${n}</small>
        <button type="button" data-qa="tamEncabezado" data-k="${k}" data-d="-1" aria-label="${n} más chico">A−</button>
        <button type="button" data-qa="tamEncabezado" data-k="${k}" data-d="1" aria-label="${n} más grande">A+</button>
      </span>`;
    $('#editorBody').innerHTML = `
      <div class="design-layout" id="disenoRoot">
        <aside class="dz-side">
          <section class="dz-sec">
            <span class="dz-label">1 · Composición</span>
            <div class="dz-comp">
              ${Object.entries(Diseno.COMPOSICIONES).map(([k, c]) => `
                <button type="button" class="dz-comp-opt ${sel('composicion', k)}" data-d="composicion" data-v="${k}">
                  <span class="mc mc-${k}" aria-hidden="true">${miniComposicion(k)}</span>
                  <span class="dz-comp-txt"><strong>${c.nombre}</strong><small>${c.desc}</small></span>
                </button>`).join('')}
            </div>
          </section>
          <section class="dz-sec">
            <span class="dz-label">2 · Plantilla</span>
            <div class="dz-swatches">
              ${Object.entries(Diseno.PLANTILLAS).map(([k, t]) => `<button type="button" class="dz-tpl ${sel('plantilla', k)}" data-d="plantilla" data-v="${k}" title="${t.nombre}${t.modo === 'claro' ? ' (claro)' : ''}" aria-label="Plantilla ${t.nombre}" style="--tpl:${t.hero}"></button>`).join('')}
            </div>
          </section>
          <section class="dz-sec">
            <span class="dz-label">3 · Tipografía</span>
            <div class="dz-fonts">
              ${Diseno.FUENTES.map((x) => `<button type="button" class="dz-font ${sel('fuente', x.nombre)}" data-d="fuente" data-v="${esc(x.nombre)}" title="${esc(x.nombre)} · ${esc(x.estilo)}" style="font-family:'${x.nombre}'">Aa</button>`).join('')}
            </div>
            <label class="dz-size" title="Tamaño de letra: ${Diseno.TAMANOS[d.tamano].nombre}">
              <span>A</span><input type="range" id="dzTamano" min="0" max="${tamanos.length - 1}" step="1" value="${Math.max(0, tamanos.indexOf(d.tamano))}" aria-label="Tamaño de letra"><span class="big">A</span>
            </label>
          </section>
          <section class="dz-sec">
            <span class="dz-label">4 · Portada y color</span>
            <label class="dz-cover" style="--cover:${d.encabezado ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url('${d.encabezado}') center / cover` : Diseno.PLANTILLAS[d.plantilla].hero}">
              ${d.encabezado ? 'Cambiar imagen de portada' : 'Subir imagen de portada'}
              <input type="file" accept="image/*" id="imgEncabezado" hidden>
            </label>
            ${d.encabezado ? '<button type="button" class="dz-quitar" data-d="encabezado" data-v="">Quitar imagen de portada</button>' : ''}
            <div class="dz-colors">
              <button type="button" class="dz-color auto ${d.acento ? '' : 'sel'}" data-d="acento" data-v="" title="Color de la plantilla">Auto</button>
              ${Diseno.ACENTOS.map((c) => `<button type="button" class="dz-color ${sel('acento', c)}" data-d="acento" data-v="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`).join('')}
              <label class="dz-color custom ${d.acento && !Diseno.ACENTOS.includes(d.acento) ? 'sel' : ''}" title="Color personalizado" style="--sw:${d.acento || '#a855f7'}">
                <input type="color" id="colorLibre" value="${d.acento || '#a855f7'}">+
              </label>
            </div>
          </section>
        </aside>
        <main class="dz-main">
          <div class="dz-toggle" role="group" aria-label="Tamaño de la vista previa">
            <button type="button" class="${vista === 'pc' ? 'sel' : ''}" data-vista="pc">Computadora</button>
            <button type="button" class="${vista === 'cel' ? 'sel' : ''}" data-vista="cel">Celular</button>
          </div>
          <div class="dz-frame ${vista}">
            <div class="dz-chrome"><i></i><i></i><i></i></div>
            <div class="public tema-preview" id="temaPreview">
              ${d.composicion === 'pasos' ? '<div class="pasos-top"><span>Paso 1 de ' + Math.max(1, f.preguntas.length) + '</span><div class="paso-track"><span style="width:' + (100 / Math.max(1, f.preguntas.length)) + '%"></span></div></div>' : ''}
              <section class="pf-hero">
                <div class="hc-tamanos" role="group" aria-label="Tamaño del texto del encabezado">${tamTxt('tamTitulo', 'Título')}${tamTxt('tamDescripcion', 'Descripción')}</div>
                <h1>${esc(f.titulo || 'Formulario')}</h1>
                ${f.descripcion ? `<p>${esc(f.descripcion)}</p>` : ''}
              </section>
              <section class="q-card public-q">
                <div class="pq-head"><span class="q-num">1</span><h3>${esc((primera && primera.texto) || '¿Cuál es la respuesta correcta?')}<span class="req">*</span></h3></div>
                <div class="choices">
                  <label class="choice"><input type="radio" name="demo" checked><span class="ind radio">${ic('check')}</span><span>${esc(opciones[0])}</span></label>
                  <label class="choice"><input type="radio" name="demo"><span class="ind radio">${ic('check')}</span><span>${esc(opciones[1])}</span></label>
                </div>
              </section>
              <div class="pf-actions"><span class="btn btn-primary">Enviar respuestas</span></div>
            </div>
          </div>
          <a class="q-preview-link" href="${esc(ligaPublica(f.id))}?preview=1" target="_blank" rel="noopener">Abrir vista previa completa ↗</a>
        </main>
      </div>`;
    const prev = $('#temaPreview');
    Diseno.aplicar(prev, d);
    const root = $('#disenoRoot');
    root.addEventListener('click', (e) => {
      const v = e.target.closest('[data-vista]');
      if (v) {
        E.vistaDiseno = v.dataset.vista;
        pintarDiseno();
        return;
      }
      const b = e.target.closest('[data-d]');
      if (!b || b.dataset.qa) return;
      d[b.dataset.d] = b.dataset.v;
      if (b.dataset.d === 'encabezado' && !b.dataset.v) d.miniatura = '';
      programarGuardado();
      pintarDiseno();
    });
    const rango = $('#dzTamano');
    rango.addEventListener('input', () => { d.tamano = tamanos[rango.value]; Diseno.aplicar(prev, d); });
    rango.addEventListener('change', () => { d.tamano = tamanos[rango.value]; programarGuardado(); pintarDiseno(); });
    const color = $('#colorLibre');
    color.addEventListener('input', () => { d.acento = color.value; Diseno.aplicar(prev, d); });
    color.addEventListener('change', () => { d.acento = color.value; programarGuardado(); pintarDiseno(); });
    $('#imgEncabezado').addEventListener('change', async (e) => {
      try {
        const archivo = e.target.files[0];
        const { dataUrl } = await leerImagen(archivo, 1600);
        d.encabezado = dataUrl;
        d.miniatura = (await leerImagen(archivo, 480)).dataUrl;
        programarGuardado();
        pintarDiseno();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  function pintarConfig() {
    const c = E.form.config;
    const fila = (k, t, d, deshabilitado = false) => `
      <label class="switch-row ${deshabilitado ? 'disabled' : ''}">
        <span><strong>${t}</strong>${d ? `<small>${d}</small>` : ''}</span>
        <span class="switch"><input type="checkbox" data-c="${k}" ${c[k] ? 'checked' : ''} ${deshabilitado ? 'disabled' : ''}><span class="sw"></span></span>
      </label>`;
    $('#editorBody').innerHTML = `
      <section class="panel">
        <h3>${ic('award')} Calificación</h3>
        ${fila('esExamen', 'Calificar automáticamente', 'Convierte el formulario en examen: asigna puntos y marca las respuestas correctas.')}
        ${fila('mostrarResultados', 'Mostrar calificación al enviar', 'El participante ve su puntaje al terminar.', !c.esExamen)}
        ${fila('mostrarCorrectas', 'Mostrar respuestas correctas', 'Después de enviar, se muestra qué contestó bien y mal.', !c.esExamen || !c.mostrarResultados)}
        <div class="switch-row ${c.esExamen ? '' : 'disabled'}">
          <span><strong>Calificación aprobatoria</strong><small>Porcentaje mínimo para aprobar.</small></span>
          <label class="pts wide"><input type="number" min="0" max="100" data-c="aprobatorio" value="${Number(c.aprobatorio) || 0}" ${c.esExamen ? '' : 'disabled'}><span>%</span></label>
        </div>
      </section>
      <section class="panel">
        <h3>${ic('users')} Respuestas</h3>
        ${fila('aceptaRespuestas', 'Aceptar respuestas', 'Si lo desactivas, la liga mostrará que el formulario está cerrado.')}
        ${fila('pedirNombre', 'Pedir nombre', 'Se pide el nombre completo antes de responder.')}
        ${fila('pedirCorreo', 'Pedir correo electrónico', '')}
        ${fila('mezclarPreguntas', 'Mezclar el orden de las preguntas', 'Cada participante ve las preguntas en distinto orden.')}
      </section>
      <section class="panel">
        <h3>${ic('sparkles')} Mensaje final</h3>
        <label class="field compact"><span>Se muestra al enviar el formulario</span>
          <textarea data-c="mensajeFinal" rows="2" placeholder="¡Gracias por responder!">${esc(c.mensajeFinal)}</textarea></label>
      </section>`;
    const msg = $('[data-c="mensajeFinal"]');
    autoAltura(msg);
    msg.addEventListener('input', () => { c.mensajeFinal = msg.value; programarGuardado(); });
  }

  // ---------- Respuestas ----------
  function textoRespuesta(p, r) {
    if (Tipos.es(p.tipo)) return Tipos.detalle(p, r);
    if (r == null || (Array.isArray(r) && !r.length) || r === '') return '<span class="muted">Sin respuesta</span>';
    if (esOpciones(p.tipo)) {
      const ids = Array.isArray(r) ? r : [r];
      return ids.map((id) => {
        const o = p.opciones.find((x) => x.id === id);
        return o ? esc(o.texto) : '<span class="muted">(opción eliminada)</span>';
      }).join(', ');
    }
    return esc(r);
  }

  async function pintarRespuestas(rid) {
    const cuerpo = $('#editorBody');
    cuerpo.innerHTML = '<div class="loader"><span></span></div>';
    let lista;
    try {
      lista = await API.call('listResponses', { id: E.form.id });
    } catch (err) {
      if (rid !== renderId) return;
      cuerpo.innerHTML = `<div class="empty">${ic('alert')}<p>${esc(err.message)}</p></div>`;
      return;
    }
    if (rid !== renderId) return;
    E.respuestas = lista;
    const f = E.form;
    const calificadas = lista.filter((r) => r.calificado);
    const prom = calificadas.length ? calificadas.reduce((s, r) => s + r.porcentaje, 0) / calificadas.length : 0;
    const aprob = calificadas.filter((r) => r.aprobado).length;
    const mejor = calificadas.length ? Math.max(...calificadas.map((r) => r.porcentaje)) : 0;

    const stat = (icono, valor, etiqueta, cls = '') => `<div class="stat ${cls}"><span class="stat-ic">${ic(icono)}</span><strong>${valor}</strong><span>${etiqueta}</span></div>`;

    const barra = (etiqueta, n, total, ok) => {
      const pct = total ? Math.round(n / total * 100) : 0;
      return `<div class="bar-row ${ok ? 'ok' : ''}"><div class="bar-label"><span>${etiqueta}${ok ? ` ${ic('check')}` : ''}</span><span>${n} · ${pct}%</span></div><div class="bar"><span style="--w:${pct}%"></span></div></div>`;
    };

    const resumen = f.preguntas.map((p, i) => {
      const resp = lista.map((r) => r.respuestas[p.id]).filter((r) => !respuestaVacia(r));
      let contenido;
      if (Tipos.es(p.tipo)) {
        contenido = resp.length ? Tipos.resumen(p, resp, barra) : '<p class="muted">Sin respuestas todavía.</p>';
      } else if (esOpciones(p.tipo)) {
        contenido = p.opciones.map((o) => {
          const n = resp.filter((r) => (Array.isArray(r) ? r.includes(o.id) : r === o.id)).length;
          return barra(esc(o.texto), n, resp.length, f.config.esExamen && p.correctas.includes(o.id));
        }).join('');
      } else {
        contenido = resp.length
          ? `<ul class="text-answers">${resp.slice(0, 8).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>${resp.length > 8 ? `<p class="hint">y ${resp.length - 8} más…</p>` : ''}`
          : '<p class="muted">Sin respuestas todavía.</p>';
      }
      let aciertos = '';
      if (f.config.esExamen && esCalificable(p) && lista.length) {
        const fr = lista.map((r) => (r.detalle || []).find((d) => d.id === p.id)).filter((d) => d && d.puntos);
        const prom = fr.length ? fr.reduce((s, d) => s + d.obtenidos / d.puntos, 0) / fr.length : 0;
        aciertos = `<span class="chip">${Math.round(prom * 100)}% de aciertos</span>`;
      }
      return `<div class="panel q-summary"><div class="qs-head"><span class="q-num">${i + 1}</span><strong>${esc(p.texto || 'Pregunta sin texto')}</strong>${aciertos}</div><p class="hint">${resp.length} respuesta${resp.length === 1 ? '' : 's'}</p>${contenido}</div>`;
    }).join('');

    cuerpo.innerHTML = `
      <div class="resp-head">
        <label class="switch-row inline">
          <span class="switch"><input type="checkbox" id="swAcepta2" ${f.config.aceptaRespuestas ? 'checked' : ''}><span class="sw"></span></span>
          <span><strong>${f.config.aceptaRespuestas ? 'Aceptando respuestas' : 'No acepta respuestas'}</strong></span>
        </label>
        <button class="btn btn-ghost" id="btnCsv" ${lista.length ? '' : 'disabled'}>${ic('download')} Exportar CSV</button>
      </div>
      <div class="stats">
        ${stat('users', lista.length, 'Respuestas')}
        ${f.config.esExamen ? stat('target', `${Math.round(prom)}%`, 'Promedio') + stat('trophy', `${calificadas.length ? Math.round(aprob / calificadas.length * 100) : 0}%`, 'Aprobaron', 'ok') + stat('sparkles', `${Math.round(mejor)}%`, 'Mejor calificación') : ''}
      </div>
      ${lista.length ? `
        <section class="panel">
          <h3>${ic('users')} Respuestas individuales</h3>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Participante</th><th>Fecha</th>${f.config.esExamen ? '<th>Calificación</th><th>Estado</th>' : ''}<th></th></tr></thead>
              <tbody>
                ${lista.map((r) => `
                  <tr data-rid="${esc(r.id)}" tabindex="0">
                    <td><div class="person"><span class="avatar sm">${esc(iniciales(r.nombre || r.correo || 'Anónimo'))}</span><span><strong>${esc(r.nombre || 'Anónimo')}</strong>${r.correo ? `<small>${esc(r.correo)}</small>` : ''}</span></div></td>
                    <td class="muted">${fechaCompleta(r.fecha)}</td>
                    ${f.config.esExamen ? `<td><strong>${r.puntaje}</strong><span class="muted"> / ${r.maximo}</span> <span class="muted">(${Math.round(r.porcentaje)}%)</span></td>
                    <td>${r.calificado ? `<span class="chip ${r.aprobado ? 'chip-ok' : 'chip-bad'}">${r.aprobado ? 'Aprobado' : 'No aprobado'}</span>` : '<span class="chip">Sin calificar</span>'}</td>` : ''}
                    <td class="right"><button class="icon-btn danger" data-borrar aria-label="Eliminar respuesta">${ic('trash')}</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>
        <h3 class="section-title">${ic('chart')} Resumen por pregunta</h3>
        ${resumen}` : `
        <div class="empty">
          <div class="empty-art">${ic('share')}</div>
          <h3>Aún no hay respuestas</h3>
          <p class="muted">Comparte la liga para empezar a recibir respuestas.</p>
          <button class="btn btn-primary" id="btnCompartir2">${ic('share')} Compartir</button>
        </div>`}`;

    $('#swAcepta2').addEventListener('change', (e) => {
      f.config.aceptaRespuestas = e.target.checked;
      e.target.closest('.switch-row').querySelector('strong').textContent = e.target.checked ? 'Aceptando respuestas' : 'No acepta respuestas';
      programarGuardado();
    });
    const b2 = $('#btnCompartir2');
    if (b2) b2.addEventListener('click', () => $('#btnCompartir').click());
    $('#btnCsv').addEventListener('click', () => exportarCsv(lista));
    $$('tr[data-rid]').forEach((tr) => {
      const abrir = () => verRespuesta(lista.find((r) => r.id === tr.dataset.rid));
      tr.addEventListener('click', (e) => { if (!e.target.closest('[data-borrar]')) abrir(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
      $('[data-borrar]', tr).addEventListener('click', async () => {
        const ok = await confirmar('¿Eliminar respuesta?', 'Esta respuesta se eliminará de forma permanente.');
        if (!ok) return;
        try {
          await API.call('deleteResponse', { id: tr.dataset.rid });
          toast('Respuesta eliminada');
          pintarRespuestas(renderId);
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  const estadoDe = (d) => !d || d.correcta === null ? '' : d.correcta ? 'ok' : d.obtenidos > 0 ? 'parcial' : 'bad';

  function verRespuesta(r) {
    const f = E.form;
    const detalle = {};
    (r.detalle || []).forEach((d) => { detalle[d.id] = d; });
    modal(`
      <button class="icon-btn modal-x" data-cerrar aria-label="Cerrar">${ic('x')}</button>
      <div class="resp-detail-head">
        <span class="avatar">${esc(iniciales(r.nombre || r.correo || 'Anónimo'))}</span>
        <div><h3>${esc(r.nombre || 'Anónimo')}</h3><p class="muted">${r.correo ? esc(r.correo) + ' · ' : ''}${fechaCompleta(r.fecha)}</p></div>
        ${r.calificado ? `<div class="score-pill ${r.aprobado ? 'ok' : 'bad'}"><strong>${Math.round(r.porcentaje)}%</strong><span>${r.puntaje}/${r.maximo} pts</span></div>` : ''}
      </div>
      <div class="resp-detail">
        ${f.preguntas.map((p, i) => {
          const d = detalle[p.id];
          const estado = estadoDe(d);
          return `<div class="rd-item ${estado}">
            <div class="rd-q"><span class="q-num">${i + 1}</span><strong>${esc(p.texto || 'Pregunta sin texto')}</strong>${d && d.correcta !== null ? `<span class="rd-pts">${d.obtenidos}/${d.puntos}</span>` : ''}</div>
            ${Tipos.es(p.tipo)
              ? `<div class="rd-rich">${Tipos.detalle(p, r.respuestas[p.id])}</div>`
              : `<div class="rd-a">${estado ? ic(estado === 'ok' ? 'check' : 'x') : ''}<span>${textoRespuesta(p, r.respuestas[p.id])}</span></div>`}
          </div>`;
        }).join('')}
      </div>`);
    $('.modal-card').classList.add('wide');
  }

  function exportarCsv(lista) {
    const f = E.form;
    const celda = (v) => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const plano = (p, r) => {
      if (r == null) return '';
      if (Tipos.es(p.tipo)) return Tipos.textoPlano(p, r);
      if (esOpciones(p.tipo)) return (Array.isArray(r) ? r : [r]).map((id) => (p.opciones.find((o) => o.id === id) || {}).texto || '').join('; ');
      return r;
    };
    const enc = ['Fecha', 'Nombre', 'Correo'];
    if (f.config.esExamen) enc.push('Puntaje', 'Máximo', 'Porcentaje', 'Aprobado');
    f.preguntas.forEach((p, i) => enc.push(`${i + 1}. ${p.texto}`));
    const filas = lista.map((r) => {
      const fila = [fechaCompleta(r.fecha), r.nombre, r.correo];
      if (f.config.esExamen) fila.push(r.puntaje, r.maximo, r.porcentaje, r.calificado ? (r.aprobado ? 'Sí' : 'No') : '');
      f.preguntas.forEach((p) => fila.push(plano(p, r.respuestas[p.id])));
      return fila.map(celda).join(',');
    });
    const csv = '﻿' + [enc.map(celda).join(','), ...filas].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${(f.titulo || 'respuestas').replace(/[\\/:*?"<>|]/g, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Responder (público) ----------
  async function vistaResponder(id, preview, rid) {
    E = null;
    app.innerHTML = `<div class="public"><header class="public-bar">${logo()}</header><main class="container narrow"><div class="loader"><span></span></div></main></div>`;
    let form;
    try {
      form = await API.call('getPublicForm', { id, preview });
    } catch (err) {
      if (rid !== renderId) return;
      return pintarPublico(`<div class="result-card">${ic('alert', 'big muted')}<h2>No disponible</h2><p class="muted">${esc(err.message)}</p></div>`);
    }
    // En vista previa el dueño ve siempre su diseño más reciente.
    if (preview && Sesion.usuario() && !form.cerrado) {
      try { form.diseno = (await API.call('getForm', { id })).diseno; } catch (e) { /* se usa el público */ }
    }
    if (rid !== renderId) return;
    document.title = `${form.titulo || 'Formulario'} · ${window.CONFIG.NOMBRE}`;
    if (form.cerrado) {
      return pintarPublico(`<div class="result-card"><div class="result-icon muted-icon">${ic('clock')}</div><h2>${esc(form.titulo || 'Formulario')}</h2><p class="muted">Este formulario ya no acepta respuestas. Si crees que es un error, contacta a quien te lo compartió.</p></div>`, false, form.diseno);
    }

    const preguntas = form.config.mezclarPreguntas ? mezclar(form.preguntas.slice()) : form.preguntas;
    const total = preguntas.reduce((s, p) => s + (Number(p.puntos) || 0), 0);
    const hayObligatorias = preguntas.some((p) => p.obligatoria) || form.config.pedirNombre || form.config.pedirCorreo;
    const pideDatos = form.config.pedirNombre || form.config.pedirCorreo;
    const enPasos = Diseno.normalizar(form.diseno).composicion === 'pasos' && preguntas.length + (pideDatos ? 1 : 0) > 1;

    const campo = (p, i) => {
      let entrada;
      if (p.tipo === 'menu') {
        entrada = `<span class="select full"><select name="q_${esc(p.id)}" aria-label="Respuesta"><option value="">Elige…</option>${p.opciones.map((o) => `<option value="${esc(o.id)}">${esc(o.texto)}</option>`).join('')}</select>${ic('down', 'chev')}</span>`;
      } else if (esOpciones(p.tipo)) {
        const tipo = p.tipo === 'multiple' ? 'checkbox' : 'radio';
        entrada = `<div class="choices ${p.tipo === 'vf' ? 'row' : ''}">${p.opciones.map((o) => `
          <label class="choice">
            <input type="${tipo}" name="q_${esc(p.id)}" value="${esc(o.id)}">
            <span class="ind ${tipo}">${ic('check')}</span>
            <span>${esc(o.texto)}</span>
          </label>`).join('')}</div>`;
      } else if (Tipos.es(p.tipo)) {
        entrada = Tipos.responder(p);
      } else if (p.tipo === 'corta') {
        entrada = `<input class="answer-input" name="q_${esc(p.id)}" placeholder="Tu respuesta" autocomplete="off">`;
      } else {
        entrada = `<textarea class="answer-input" name="q_${esc(p.id)}" rows="3" placeholder="Tu respuesta"></textarea>`;
      }
      const apoyo = p.apoyo && p.apoyo.imagen
        ? `<figure class="q-apoyo"><img src="${p.apoyo.imagen}" alt="Imagen de la pregunta ${i + 1}" data-ampliar tabindex="0"><span class="q-apoyo-zoom">${ic('search')}</span></figure>` : '';
      const lado = apoyo && p.apoyo.posicion === 'lado';
      const cabeza = `
          <div class="pq-head">
            <span class="q-num">${i + 1}</span>
            <h3>${p.textoHtml || p.texto ? textoRico(p.textoHtml, p.texto) : 'Pregunta'}${p.obligatoria ? '<span class="req">*</span>' : ''}</h3>
            ${p.puntos ? `<span class="chip">${p.puntos} pt${p.puntos === 1 ? '' : 's'}</span>` : ''}
          </div>`;
      return `
        <section class="q-card public-q tipo-${esc(p.tipo)}" data-pid="${esc(p.id)}" style="--i:${i}">
          ${lado ? `<div class="pq-lado">${apoyo}<div>${cabeza}</div></div>` : apoyo + cabeza}
          ${p.tipo === 'multiple' ? '<p class="hint">Selecciona todas las que apliquen.</p>' : ''}
          ${entrada}
          <p class="q-error">${ic('alert')} Esta pregunta es obligatoria.</p>
        </section>`;
    };

    pintarPublico(`
      <div class="pf-layout">
      <section class="pf-hero">
        <h1>${esc(form.titulo || 'Formulario')}</h1>
        ${form.descripcion ? `<p>${textoRico(form.descripcionHtml, form.descripcion)}</p>` : ''}
        <div class="pf-meta">
          <span class="chip chip-glass">${ic('list')} ${preguntas.length} pregunta${preguntas.length === 1 ? '' : 's'}</span>
          ${form.config.esExamen && total ? `<span class="chip chip-glass">${ic('target')} ${total} puntos</span>` : ''}
        </div>
        ${hayObligatorias ? '<p class="req-note"><span class="req">*</span> Obligatorio</p>' : ''}
      </section>
      <div class="pf-main">
      <div class="mini-progress"><span></span></div>
      ${enPasos ? '<div class="pasos-top"><span id="pasoTexto"></span><div class="paso-track"><span id="pasoBarra"></span></div></div>' : ''}
      <form id="pf" novalidate>
        ${form.config.pedirNombre || form.config.pedirCorreo ? `
          <section class="q-card public-q" data-pid="__datos">
            ${form.config.pedirNombre ? `<label class="field"><span>Nombre completo <span class="req">*</span></span><input name="nombre" autocomplete="name" placeholder="Tu nombre"></label>` : ''}
            ${form.config.pedirCorreo ? `<label class="field"><span>Correo electrónico <span class="req">*</span></span><input name="correo" type="email" autocomplete="email" placeholder="tu@correo.com"></label>` : ''}
            <p class="q-error">${ic('alert')} Completa tus datos.</p>
          </section>` : ''}
        ${preguntas.map(campo).join('')}
        <div class="pf-actions">
          ${enPasos ? `<button type="button" class="btn btn-ghost btn-lg" id="btnAnterior">${ic('back')} Anterior</button><span class="pf-spacer"></span>
          <button type="button" class="btn btn-primary btn-lg" id="btnSiguiente">Siguiente ${ic('back', 'flip')}</button>` : ''}
          <button class="btn btn-primary btn-lg" id="btnEnviar">Enviar respuestas</button>
        </div>
      </form>
      </div>
      </div>`, preview, form.diseno);

    const tarjeta = (p) => $(`[data-pid="${CSS.escape(p.id)}"]`);
    preguntas.filter((p) => Tipos.es(p.tipo)).forEach((p) => Tipos.montar(tarjeta(p), p));
    const formEl = $('#pf');
    formEl.addEventListener('input', (e) => {
      const card = e.target.closest('.public-q');
      if (card) card.classList.remove('invalid');
    });
    const recolectar = () => {
      const respuestas = {};
      const invalidas = [];
      preguntas.forEach((p) => {
        const nombre = `q_${p.id}`;
        let r;
        if (Tipos.es(p.tipo)) r = Tipos.leer(tarjeta(p), p);
        else if (p.tipo === 'menu') r = (formEl.elements[nombre] || {}).value || '';
        else if (p.tipo === 'multiple') r = $$(`[name="${CSS.escape(nombre)}"]:checked`, formEl).map((x) => x.value);
        else if (esOpciones(p.tipo)) r = ($(`[name="${CSS.escape(nombre)}"]:checked`, formEl) || {}).value;
        else r = (formEl.elements[nombre] || {}).value || '';
        const vacio = respuestaVacia(r);
        if (!vacio) respuestas[p.id] = r;
        if (p.obligatoria && vacio) invalidas.push(p.id);
      });
      const nombre = formEl.elements.nombre ? formEl.elements.nombre.value.trim() : '';
      const correo = formEl.elements.correo ? formEl.elements.correo.value.trim() : '';
      if ((form.config.pedirNombre && !nombre) || (form.config.pedirCorreo && !/^\S+@\S+\.\S+$/.test(correo))) invalidas.unshift('__datos');
      return { respuestas, invalidas, nombre, correo };
    };

    // Composición "Paso a paso": una pregunta a la vez.
    const tarjetas = $$('.public-q', formEl);
    let paso = 0;
    const irA = (k) => {
      paso = Math.max(0, Math.min(tarjetas.length - 1, k));
      tarjetas.forEach((c, i) => { c.hidden = i !== paso; });
      const actual = tarjetas[paso];
      actual.classList.remove('entra');
      void actual.offsetWidth;
      actual.classList.add('entra');
      $('#pasoTexto').textContent = `Paso ${paso + 1} de ${tarjetas.length}`;
      $('#pasoBarra').style.width = `${(paso + 1) / tarjetas.length * 100}%`;
      $('#btnAnterior').style.visibility = paso === 0 ? 'hidden' : '';
      $('#btnSiguiente').hidden = paso === tarjetas.length - 1;
      $('#btnEnviar').hidden = paso !== tarjetas.length - 1;
      window.dispatchEvent(new Event('resize'));
      const foco = actual.querySelector('input:not([type=radio]):not([type=checkbox]), textarea');
      if (foco && matchMedia('(pointer: fine)').matches) foco.focus({ preventScroll: true });
    };
    const siguiente = () => {
      const actual = tarjetas[paso];
      if (recolectar().invalidas.includes(actual.dataset.pid)) {
        actual.classList.remove('invalid');
        void actual.offsetWidth;
        actual.classList.add('invalid');
        return;
      }
      irA(paso + 1);
    };
    if (enPasos) {
      $('#btnAnterior').addEventListener('click', () => irA(paso - 1));
      $('#btnSiguiente').addEventListener('click', siguiente);
      irA(0);
    }

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (enPasos && paso < tarjetas.length - 1) return siguiente();
      const { respuestas, invalidas, nombre, correo } = recolectar();
      $$('.public-q').forEach((c) => c.classList.toggle('invalid', invalidas.includes(c.dataset.pid)));
      if (invalidas.length) {
        if (enPasos) return irA(tarjetas.findIndex((c) => c.dataset.pid === invalidas[0]));
        $(`[data-pid="${CSS.escape(invalidas[0])}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const btn = $('#btnEnviar');
      btn.disabled = true;
      btn.classList.add('loading');
      try {
        const res = await API.call('submit', { id, nombre, correo, respuestas, preview });
        mostrarResultado(form, preguntas, respuestas, res, preview);
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
  }

  function pintarPublico(html, preview, diseno) {
    const mini = preview && ruta().params.get('mini') === '1';
    app.innerHTML = `
      <div class="public ${mini ? 'mini' : ''}">
        ${mini ? '' : `<header class="public-bar">${logo()}</header>`}
        ${preview && !mini ? `<div class="preview-banner">${ic('eye')} Vista previa · las respuestas no se guardan</div>` : ''}
        <main class="container narrow">${html}</main>
      </div>`;
    Diseno.aplicar($('.public'), diseno);
    if (mini) miniActiva(miniId || ruta().params.get('q'));
    window.scrollTo(0, 0);
  }

  // Vista previa en miniatura (panel "Vista en vivo" del editor): muestra solo el encabezado y la pregunta activa.
  let miniId = null;
  function miniActiva(id) {
    if (id) miniId = id;
    const tarjetas = $$('.public.mini .public-q:not([data-pid="__datos"])');
    if (!tarjetas.length) return;
    const i = Math.max(0, tarjetas.findIndex((t) => t.dataset.pid === id));
    tarjetas.forEach((t, k) => t.classList.toggle('mini-on', k === i));
    const barra = $('.public.mini .mini-progress span');
    if (barra) barra.style.width = `${((i + 1) / tarjetas.length) * 100}%`;
  }
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && 'miniActiva' in e.data) miniActiva(e.data.miniActiva);
  });

  // Página a la que llega quien confirma su correo.
  function vistaConfirmado(error) {
    E = null;
    const conSesion = !!Sesion.usuario();
    document.title = `${error ? 'Liga vencida' : 'Correo confirmado'} · ${window.CONFIG.NOMBRE}`;
    pintarPublico(error ? `
      <div class="result-card confirm-card">
        <div class="result-icon muted-icon">${ic('clock')}</div>
        <h2>Esta liga ya no es válida</h2>
        <p class="muted">La liga de confirmación venció o ya se usó. Si ya confirmaste tu correo, solo inicia sesión; si no, regístrate de nuevo para recibir otra.</p>
        <a class="btn btn-primary btn-lg" href="#/login">Ir a iniciar sesión</a>
      </div>` : `
      <div class="result-card confirm-card">
        <div class="confirm-art">${ic('mail')}<span class="confirm-check">${ic('check')}</span></div>
        <p class="eyebrow">Cuenta verificada</p>
        <h2>¡Tu correo quedó confirmado!</h2>
        <p class="muted">${conSesion ? `Bienvenido${Sesion.usuario().nombre ? ', ' + esc(Sesion.usuario().nombre.split(' ')[0]) : ''}. Tu cuenta de Formalia ya está activa y lista para crear formularios y exámenes.` : 'Tu cuenta de Formalia ya está activa. Inicia sesión para empezar.'}</p>
        <a class="btn btn-primary btn-lg" href="${conSesion ? '#/formularios' : '#/login'}">${conSesion ? 'Ir a mi panel' : 'Iniciar sesión'} ${ic('back', 'flip')}</a>
      </div>`);
  }

  function mezclar(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function mostrarResultado(form, preguntas, respuestas, res, preview) {
    let html;
    if (res.calificado) {
      const pct = Math.round(res.porcentaje);
      const c = 2 * Math.PI * 54;
      html = `
        <div class="result-card">
          <div class="ring ${res.aprobado ? 'ok' : 'bad'}">
            <svg viewBox="0 0 120 120"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--p2)"/><stop offset="1" style="stop-color:var(--p3)"/></linearGradient></defs>
              <circle cx="60" cy="60" r="54" class="ring-bg"/>
              <circle cx="60" cy="60" r="54" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="--off:${c * (1 - pct / 100)}"/></svg>
            <div class="ring-text"><strong data-count="${pct}">0%</strong><span>${res.puntaje} / ${res.maximo} pts</span></div>
          </div>
          <span class="chip big ${res.aprobado ? 'chip-ok' : 'chip-bad'}">${ic(res.aprobado ? 'trophy' : 'alert')} ${res.aprobado ? '¡Aprobado!' : 'No aprobado'}</span>
          <h2>${esc(form.titulo || 'Formulario')}</h2>
          <p class="muted">${esc(res.mensaje || (res.aprobado ? '¡Excelente trabajo!' : 'Sigue practicando, ¡tú puedes!'))}</p>
        </div>`;
      if (res.revision) {
        const rev = {};
        res.revision.forEach((d) => { rev[d.id] = d; });
        html += `<h3 class="section-title">${ic('list')} Revisión</h3>` + preguntas.map((p, i) => {
          const d = rev[p.id];
          const estado = estadoDe(d);
          let correcta = '';
          if (Tipos.es(p.tipo)) {
            return `<div class="rd-item panel ${estado}" style="--i:${i}">
              <div class="rd-q"><span class="q-num">${i + 1}</span><strong>${esc(p.texto || 'Pregunta')}</strong>${d && d.correcta !== null ? `<span class="rd-pts">${d.obtenidos}/${d.puntos}</span>` : ''}</div>
              <div class="rd-rich">${Tipos.detalle(conClave(p, d && d.clave), respuestas[p.id], !!(d && d.clave))}</div>
            </div>`;
          }
          if (d && d.correcta === false && d.clave) {
            correcta = esOpciones(p.tipo)
              ? d.clave.map((cid) => esc((p.opciones.find((o) => o.id === cid) || {}).texto || '')).join(', ')
              : d.clave.map(esc).join(' / ');
          }
          return `<div class="rd-item panel ${estado}" style="--i:${i}">
            <div class="rd-q"><span class="q-num">${i + 1}</span><strong>${esc(p.texto || 'Pregunta')}</strong>${d && d.correcta !== null ? `<span class="rd-pts">${d.obtenidos}/${d.puntos}</span>` : ''}</div>
            <div class="rd-a">${estado ? ic(estado === 'ok' ? 'check' : 'x') : ''}<span>${textoRespuesta(p, respuestas[p.id])}</span></div>
            ${correcta ? `<div class="rd-correct">${ic('check')} Respuesta correcta: <strong>${correcta}</strong></div>` : ''}
          </div>`;
        }).join('');
      }
    } else {
      html = `
        <div class="result-card">
          <div class="result-icon">${ic('check')}</div>
          <h2>¡Respuesta enviada!</h2>
          <p class="muted">${esc(res.mensaje || 'Gracias por responder.')}</p>
        </div>`;
    }
    html += `<div class="pf-actions center"><button class="btn btn-ghost" id="otraVez">Enviar otra respuesta</button></div>`;
    pintarPublico(html, preview, form.diseno);
    $('#otraVez').addEventListener('click', () => render());

    const fg = $('.ring-fg');
    if (fg) {
      requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = 'var(--off)'; }));
      const el = $('[data-count]');
      const meta = Number(el.dataset.count);
      const t0 = performance.now();
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / 1200);
        el.textContent = `${Math.round(meta * (1 - Math.pow(1 - k, 3)))}%`;
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  }

  // ---------- Inicio ----------
  const barra = $('#scrollProgress');
  const alDesplazar = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    barra.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  window.addEventListener('scroll', alDesplazar, { passive: true });
  window.addEventListener('resize', alDesplazar);
  window.addEventListener('hashchange', render);
  // Regreso desde el correo de confirmación de Supabase: la liga trae datos en el hash.
  const hashInicial = location.hash;
  API.iniciar().finally(() => {
    if (/access_token=|error_description=/.test(hashInicial)) {
      const err = new URLSearchParams(hashInicial.replace(/^#\/?/, '')).get('error_description');
      history.replaceState(null, '', location.pathname + (err ? '#/confirmado?error=1' : '#/confirmado'));
    }
    render();
  });
})();
