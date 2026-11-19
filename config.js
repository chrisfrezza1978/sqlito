/* =====================================================================
   SQLito — configuração do front end (edite antes de publicar)
   ---------------------------------------------------------------------
   modo:
     'auto'     → tenta o servidor (/api/saude); se não houver, entra no
                  modo demonstração (progresso salvo só no navegador).
     'demo'     → sempre modo demonstração. Use em hospedagem estática
                  (Netlify Drop, GitHub Pages, Cloudflare) sem back end.
     'servidor' → sempre o servidor; espera até 60 s (servidor gratuito
                  "dormindo" demora para acordar).
   api:
     ''  → a API está no mesmo endereço do site (o servidor Python
           entrega o front end e a API juntos — o caso do Render).
     'https://sqlito.onrender.com' → API em outro endereço (libere
           este site em cors_origens / HM_CORS_ORIGENS no servidor).
   celular: o que fazer em celulares e tablets
     'bloquear' → só computador (tela "exclusivo para computadores")
     'avisar'   → recomenda o computador, com "Continuar mesmo assim"
     'liberar'  → abre direto no layout de celular
   larguraMinima:  menor tela (px) aceita como computador em aparelhos com toque.
   ===================================================================== */
window.MENTA_CONFIG = {
  modo: 'demo',
  api: '',
  celular: 'liberar',
  larguraMinima: 1024
};
