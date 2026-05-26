// auth.js — gestion compte utilisateur + modales login/register
(function () {

  var token = localStorage.getItem('yk_token');
  var currentUser = JSON.parse(localStorage.getItem('yk_user') || 'null');

  /* ── CSS modales ── */
  var style = document.createElement('style');
  style.textContent = `
.yk-modal-bg{
  position:fixed;inset:0;z-index:10000;
  background:rgba(3,0,20,.85);backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;
  opacity:0;pointer-events:none;transition:opacity .2s;
}
.yk-modal-bg.open{opacity:1;pointer-events:all;}
.yk-modal{
  background:rgba(13,6,40,.98);border:1px solid rgba(168,85,247,.25);
  border-radius:20px;padding:28px 28px 24px;width:100%;max-width:400px;
  box-shadow:0 0 60px rgba(168,85,247,.15),0 30px 80px rgba(0,0,0,.7);
  transform:translateY(16px) scale(.97);transition:transform .25s;
}
.yk-modal-bg.open .yk-modal{transform:translateY(0) scale(1);}
.yk-modal h2{font-size:18px;font-weight:700;margin-bottom:4px;color:#f8fafc;}
.yk-modal p{font-size:13px;color:#64748b;margin-bottom:20px;}
.yk-modal .field{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;}
.yk-modal .label{font-size:12px;color:#94a3b8;}
.yk-modal .input{
  padding:10px 12px;border-radius:10px;
  border:1px solid rgba(168,85,247,.18);
  background:rgba(3,0,20,.7);color:#f8fafc;
  font-size:13px;font-family:inherit;outline:none;
  transition:border-color .14s,box-shadow .14s;
}
.yk-modal .input:focus{border-color:#a855f7;box-shadow:0 0 0 3px rgba(168,85,247,.1);}
.yk-modal .input::placeholder{color:rgba(148,163,184,.4);}
.yk-modal .btn-full{
  width:100%;padding:11px;border-radius:99px;border:none;
  background:linear-gradient(135deg,#a855f7,#06b6d4);
  color:#fff;font-weight:600;font-size:14px;cursor:pointer;
  font-family:inherit;box-shadow:0 0 22px rgba(168,85,247,.4);
  transition:filter .14s,transform .14s;margin-top:4px;
}
.yk-modal .btn-full:hover{filter:brightness(1.1);transform:translateY(-1px);}
.yk-modal .btn-full:disabled{opacity:.5;cursor:default;transform:none;}
.yk-modal-err{color:#f87171;font-size:12px;margin-top:-8px;margin-bottom:10px;display:none;}
.yk-modal-err.show{display:block;}
.yk-modal-switch{text-align:center;margin-top:16px;font-size:12px;color:#64748b;}
.yk-modal-switch a{color:#a855f7;cursor:pointer;text-decoration:underline;}
.yk-modal-close{
  float:right;background:none;border:none;color:#64748b;
  font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;
}
.yk-modal-close:hover{color:#f8fafc;}
`;
  document.head.appendChild(style);

  /* ── HTML modales ── */
  var modalHtml = `
<div class="yk-modal-bg" id="ykAuthBg">
  <div class="yk-modal">
    <button class="yk-modal-close" id="ykModalClose">✕</button>

    <!-- Login -->
    <div id="ykLoginForm">
      <h2>Connexion</h2>
      <p>Accédez à votre espace YKonnect</p>
      <div class="field">
        <label class="label">Email</label>
        <input class="input" id="loginEmail" type="email" placeholder="vous@exemple.fr" />
      </div>
      <div class="field">
        <label class="label">Mot de passe</label>
        <input class="input" id="loginPassword" type="password" placeholder="••••••••" />
      </div>
      <div class="yk-modal-err" id="loginErr"></div>
      <button class="btn-full" id="loginSubmit">Se connecter</button>
      <div class="yk-modal-switch">
        Pas encore de compte ? <a id="switchToRegister">Créer un compte</a>
      </div>
    </div>

    <!-- Register -->
    <div id="ykRegisterForm" style="display:none;">
      <h2>Créer un compte</h2>
      <p>Rejoignez YKonnect pour soumettre des tickets</p>
      <div class="field">
        <label class="label">Email</label>
        <input class="input" id="regEmail" type="email" placeholder="vous@exemple.fr" />
      </div>
      <div class="field">
        <label class="label">Mot de passe (min. 6 caractères)</label>
        <input class="input" id="regPassword" type="password" placeholder="••••••••" />
      </div>
      <div class="yk-modal-err" id="regErr"></div>
      <button class="btn-full" id="regSubmit">Créer mon compte</button>
      <div class="yk-modal-switch">
        Déjà un compte ? <a id="switchToLogin">Se connecter</a>
      </div>
    </div>
  </div>
</div>
`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  /* ── Refs ── */
  var bg           = document.getElementById('ykAuthBg');
  var loginForm    = document.getElementById('ykLoginForm');
  var regForm      = document.getElementById('ykRegisterForm');
  var modalClose   = document.getElementById('ykModalClose');
  var loginErr     = document.getElementById('loginErr');
  var regErr       = document.getElementById('regErr');
  var loginSubmit  = document.getElementById('loginSubmit');
  var regSubmit    = document.getElementById('regSubmit');

  /* ── Helpers ── */
  function openModal(mode) {
    bg.classList.add('open');
    loginForm.style.display = mode === 'login' ? '' : 'none';
    regForm.style.display   = mode === 'register' ? '' : 'none';
    loginErr.classList.remove('show');
    regErr.classList.remove('show');
  }

  function closeModal() { bg.classList.remove('open'); }

  function showErr(el, msg) {
    el.textContent = msg;
    el.classList.add('show');
  }

  function saveAuth(data) {
    localStorage.setItem('yk_token', data.token);
    localStorage.setItem('yk_user', JSON.stringify({ email: data.email }));
    token = data.token;
    currentUser = { email: data.email };
    updateUI();
    closeModal();
  }

  function logout() {
    localStorage.removeItem('yk_token');
    localStorage.removeItem('yk_user');
    token = null;
    currentUser = null;
    updateUI();
  }

  /* ── UI selon état auth ── */
  function updateUI() {
    var actions = document.querySelector('.nav-actions');
    if (!actions) return;

    if (currentUser) {
      actions.innerHTML =
        '<span style="font-size:12px;color:#94a3b8;padding:0 6px;">' + currentUser.email + '</span>' +
        '<a href="tickets.html" class="btn btn-ghost" style="font-size:13px;">🎫 Mes tickets</a>' +
        '<button class="btn btn-outline-primary" id="btnLogout">Déconnexion</button>';
      document.getElementById('btnLogout').addEventListener('click', logout);
    } else {
      actions.innerHTML =
        '<button class="btn btn-outline-primary" id="btnLogin">🔑 Connexion</button>' +
        '<button class="btn btn-primary" id="btnRegister">✨ Créer un compte</button>';
      document.getElementById('btnLogin').addEventListener('click', function () { openModal('login'); });
      document.getElementById('btnRegister').addEventListener('click', function () { openModal('register'); });
    }
  }

  /* ── Events ── */
  modalClose.addEventListener('click', closeModal);
  bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });

  document.getElementById('switchToRegister').addEventListener('click', function () {
    loginForm.style.display = 'none';
    regForm.style.display = '';
    loginErr.classList.remove('show');
  });
  document.getElementById('switchToLogin').addEventListener('click', function () {
    regForm.style.display = 'none';
    loginForm.style.display = '';
    regErr.classList.remove('show');
  });

  loginSubmit.addEventListener('click', function () {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) { showErr(loginErr, 'Remplissez tous les champs.'); return; }
    loginSubmit.disabled = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) { showErr(loginErr, res.data.detail || 'Erreur.'); loginSubmit.disabled = false; return; }
      saveAuth(res.data);
    })
    .catch(function () { showErr(loginErr, 'Impossible de joindre le serveur.'); loginSubmit.disabled = false; });
  });

  regSubmit.addEventListener('click', function () {
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    if (!email || !password) { showErr(regErr, 'Remplissez tous les champs.'); return; }
    regSubmit.disabled = true;
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) { showErr(regErr, res.data.detail || 'Erreur.'); regSubmit.disabled = false; return; }
      saveAuth(res.data);
    })
    .catch(function () { showErr(regErr, 'Impossible de joindre le serveur.'); regSubmit.disabled = false; });
  });

  /* ── Enter key ── */
  ['loginEmail','loginPassword'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loginSubmit.click();
    });
  });
  ['regEmail','regPassword'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') regSubmit.click();
    });
  });

  /* ── Init ── */
  updateUI();

  /* ── Expose helpers pour les autres pages ── */
  window.ykAuth = {
    token: function () { return localStorage.getItem('yk_token'); },
    user: function () { return JSON.parse(localStorage.getItem('yk_user') || 'null'); },
    openLogin: function () { openModal('login'); },
    openRegister: function () { openModal('register'); },
    headers: function () {
      var t = localStorage.getItem('yk_token');
      return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }
  };

})();
