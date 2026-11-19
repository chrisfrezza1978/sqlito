/* =====================================================================
   SQLito — acesso exclusivo em computadores (desktop)
   ---------------------------------------------------------------------
   Roda antes do app. Em celular ou tablet, mostra uma tela explicando
   que o curso é para computador e o app não é iniciado
   (window.MENTA_DESKTOP_OK = false). Para desligar: somenteDesktop:false
   no config.js. O servidor faz a mesma verificação (somente_desktop no
   config.ini) e entrega frontend/somente-desktop.html.
   ===================================================================== */
(function (raiz) {
  'use strict';
  var cfg = raiz.MENTA_CONFIG || {};

  /** Devolve o motivo do bloqueio ('' = é computador). Exportada para os testes. */
  function motivo(amb) {
    amb = amb || {};
    var nav = amb.navigator || raiz.navigator || {};
    var tela = amb.screen || raiz.screen || {};
    var mm = amb.matchMedia || (raiz.matchMedia ? function (q) { return raiz.matchMedia(q).matches; } : function () { return false; });
    var minimo = (amb.cfg || cfg).larguraMinima || 1024;
    var ua = nav.userAgent || '';
    if (nav.userAgentData && nav.userAgentData.mobile) return 'celular';
    if (/iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|webOS/i.test(ua)) return 'celular';
    if (/iPad|Android|Tablet|Silk|Kindle|PlayBook/i.test(ua)) return 'tablet';
    if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return 'tablet';          // iPadOS se apresenta como Mac
    if (mm('(pointer: coarse)') && !mm('(any-pointer: fine)')) return 'toque';    // só tela de toque, sem mouse
    // Tela pequena só conta em aparelho com toque (celular com "versão para computador" ligada).
    // Notebook pequeno com zoom do Windows não é bloqueado: vê o aviso "aumente a janela".
    var maior = Math.max(tela.width || 0, tela.height || 0);
    if (maior && maior < minimo && (mm('(any-pointer: coarse)') || nav.maxTouchPoints > 0)) return 'tela';
    return '';
  }

  var TEXTO = {
    celular: 'Você está num celular.',
    tablet: 'Você está num tablet.',
    toque: 'Este aparelho não tem mouse nem touchpad.',
    tela: 'A tela deste aparelho é pequena demais para o curso.'
  };

  function mostrar(m) {
    var url = String(raiz.location ? raiz.location.href : '').split('#')[0];
    var st = document.createElement('style');
    st.textContent =
      'html.so-desktop body>*:not(#soDesktop){display:none!important}' +
      'html.so-desktop body{padding:0!important;background:#F2FAF6}' +
      '#soDesktop{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font:500 16px/1.5 Nunito,system-ui,"Segoe UI",sans-serif;color:#12332A}' +
      '#soDesktop .c{max-width:440px;width:100%;background:#fff;border:2px solid #DDEFE6;border-radius:24px;padding:28px 22px;text-align:center}' +
      '#soDesktop img{width:84px;height:84px}' +
      '#soDesktop h1{font-size:24px;line-height:1.15;margin:12px 0 6px;font-weight:900}' +
      '#soDesktop .m{color:#3E6B5C;margin:0 0 14px}' +
      '#soDesktop .u{display:block;word-break:break-all;background:#F2FAF6;border:2px dashed #3EB489;border-radius:14px;padding:10px 12px;font:700 15px "JetBrains Mono",ui-monospace,monospace;margin:10px 0 14px}' +
      '#soDesktop button{min-height:50px;width:100%;border:0;border-radius:16px;background:#3EB489;color:#fff;font-weight:900;font-size:16px;font-family:inherit;box-shadow:0 4px 0 #2A8C67;cursor:pointer}' +
      '#soDesktop ul{text-align:left;color:#3E6B5C;padding-left:20px;margin:16px 0 0;font-size:15px}';
    document.head.appendChild(st);
    var d = document.createElement('main');
    d.id = 'soDesktop';
    d.setAttribute('role', 'alert');
    d.innerHTML =
      '<div class="c"><img src="icone.svg" alt="SQLito, mascote do SQLito">' +
      '<h1>O SQLito é exclusivo para computadores</h1>' +
      '<p class="m">' + (TEXTO[m] || '') + ' Abra este endereço no navegador do seu computador (Chrome, Edge ou Firefox):</p>' +
      '<span class="u" id="sdUrl"></span>' +
      '<button type="button" id="sdCopiar">Copiar link</button>' +
      '<ul><li>Os exercícios usam editor de SQL, diagramas do banco e tabelas de resultado que precisam de tela grande.</li>' +
      '<li>Teclado e mouse deixam as consultas muito mais rápidas (Ctrl+Enter executa).</li></ul></div>';
    document.body.appendChild(d);
    document.getElementById('sdUrl').textContent = url;
    document.getElementById('sdCopiar').onclick = function () {
      var b = this;
      var ok = function () { b.textContent = 'Link copiado! Cole no computador'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, ok);
      else ok();
    };
  }

  raiz.MENTA_DESKTOP = { motivo: motivo };
  if (typeof document === 'undefined') return;   // testes em Node
  var m = cfg.somenteDesktop === false ? '' : motivo();
  raiz.MENTA_DESKTOP_OK = !m;
  raiz.MENTA_DESKTOP_MOTIVO = m;
  if (!m) return;
  document.documentElement.classList.add('so-desktop');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mostrar(m); });
  else mostrar(m);
})(typeof window !== 'undefined' ? window : globalThis);
