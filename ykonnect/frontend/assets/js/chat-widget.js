/* chat-widget.js — floating chatbot, auto-injecté sur toutes les pages */
(function () {

  /* ── Avatars disponibles ── */
  var AVATARS = [
    { id: 'robot',    emoji: '🤖', name: 'Robot' },
    { id: 'alien',    emoji: '👾', name: 'Alien' },
    { id: 'cyber',    emoji: '🦾', name: 'Cyber' },
    { id: 'linux',    emoji: '🐧', name: 'Linux' },
    { id: 'brain',    emoji: '🧠', name: 'IA' },
    { id: 'ufo',      emoji: '🛸', name: 'Cosmique' },
    { id: 'gear',     emoji: '⚙️',  name: 'Système' },
    { id: 'laptop',   emoji: '💻', name: 'Dev' },
  ];

  var currentAvatar = localStorage.getItem('yk_avatar') || '🤖';
  var conversationHistory = JSON.parse(sessionStorage.getItem('yk_history') || '[]');
  var isOpen = false;
  var isStreaming = false;
  var hasUnread = false;

  /* ── CSS ── */
  var css = `
#ykChat{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:"Inter",system-ui,sans-serif;}

#ykToggle{
  width:58px;height:58px;border-radius:50%;
  background:linear-gradient(135deg,#a855f7,#06b6d4);
  border:none;cursor:pointer;font-size:28px;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 26px rgba(168,85,247,.55),0 8px 28px rgba(0,0,0,.5);
  transition:transform .2s,box-shadow .2s;position:relative;
}
#ykToggle:hover{transform:scale(1.09);box-shadow:0 0 44px rgba(168,85,247,.75),0 8px 32px rgba(0,0,0,.55);}

.yk-notif{
  position:absolute;top:0;right:0;
  width:15px;height:15px;border-radius:50%;
  background:#f43f5e;border:2px solid #030014;
  display:none;
}
.yk-notif.show{display:block;}

#ykPanel{
  position:absolute;bottom:70px;right:0;
  width:370px;height:520px;
  display:flex;flex-direction:column;
  background:rgba(10,4,32,.97);
  border:1px solid rgba(168,85,247,.28);
  border-radius:22px;overflow:hidden;
  backdrop-filter:blur(22px);
  box-shadow:0 0 70px rgba(168,85,247,.14),0 32px 80px rgba(0,0,0,.7);
  transform-origin:bottom right;
  transform:scale(.84) translateY(12px);
  opacity:0;pointer-events:none;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;
}
#ykPanel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}

/* Header */
.yk-hd{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 14px;flex-shrink:0;
  border-bottom:1px solid rgba(168,85,247,.1);
  background:rgba(168,85,247,.05);
}
.yk-bot{display:flex;align-items:center;gap:10px;}
.yk-bot-av{
  width:36px;height:36px;border-radius:50%;font-size:20px;
  display:flex;align-items:center;justify-content:center;
  background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);
}
.yk-bot-name{font-size:14px;font-weight:600;color:#f8fafc;}
.yk-bot-status{font-size:11px;color:#86efac;}
.yk-hd-actions{display:flex;gap:6px;}
.yk-ico{
  width:28px;height:28px;border-radius:8px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
  color:#94a3b8;cursor:pointer;font-size:14px;
  display:flex;align-items:center;justify-content:center;
  transition:background .14s,color .14s;
}
.yk-ico:hover{background:rgba(168,85,247,.18);color:#f8fafc;}

/* Avatar picker */
#ykAvatarPicker{
  position:absolute;inset:0;border-radius:22px;
  background:rgba(10,4,32,.98);z-index:10;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;padding:24px;
  transform:scale(.92);opacity:0;pointer-events:none;
  transition:transform .22s,opacity .18s;
}
#ykAvatarPicker.open{transform:scale(1);opacity:1;pointer-events:all;}
#ykAvatarPicker h3{color:#f8fafc;font-size:15px;font-weight:700;letter-spacing:.01em;}
#ykAvatarPicker p{color:#64748b;font-size:12px;text-align:center;}
.yk-av-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%;}
.yk-av-opt{
  aspect-ratio:1;border-radius:14px;
  border:2px solid rgba(168,85,247,.15);
  background:rgba(168,85,247,.05);
  cursor:pointer;font-size:26px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  transition:border-color .15s,background .15s,transform .15s;
}
.yk-av-label{font-size:9px;color:#64748b;font-family:"Inter",sans-serif;}
.yk-av-opt:hover{border-color:rgba(168,85,247,.5);background:rgba(168,85,247,.12);transform:scale(1.06);}
.yk-av-opt.sel{border-color:#a855f7;background:rgba(168,85,247,.2);box-shadow:0 0 18px rgba(168,85,247,.3);}
.yk-av-close{
  margin-top:4px;padding:8px 22px;border-radius:99px;border:none;
  background:linear-gradient(135deg,#a855f7,#06b6d4);
  color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
  box-shadow:0 0 18px rgba(168,85,247,.4);transition:filter .14s;
}
.yk-av-close:hover{filter:brightness(1.1);}

/* Messages */
#ykMessages{
  flex:1;overflow-y:auto;padding:12px;
  display:flex;flex-direction:column;gap:8px;
  scrollbar-width:thin;scrollbar-color:rgba(168,85,247,.25) transparent;
}
.yk-msg{display:flex;gap:8px;align-items:flex-end;}
.yk-msg-bot{flex-direction:row;}
.yk-msg-user{flex-direction:row-reverse;}
.yk-msg-av{
  width:28px;height:28px;border-radius:50%;flex-shrink:0;
  font-size:16px;display:flex;align-items:center;justify-content:center;
  background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);
}
.yk-bubble{
  max-width:80%;padding:9px 13px;font-size:12.5px;line-height:1.58;
}
.yk-msg-bot .yk-bubble{
  border-radius:16px 16px 16px 4px;
  background:rgba(168,85,247,.08);
  border:1px solid rgba(168,85,247,.15);
  color:#cbd5e1;
}
.yk-msg-user .yk-bubble{
  border-radius:16px 16px 4px 16px;
  background:linear-gradient(135deg,rgba(168,85,247,.22),rgba(6,182,212,.14));
  border:1px solid rgba(168,85,247,.25);
  color:#f8fafc;
}
.yk-bubble a{color:#67e8f9;text-decoration:underline;}

/* Footer */
.yk-ft{
  padding:10px;border-top:1px solid rgba(168,85,247,.1);
  flex-shrink:0;background:rgba(168,85,247,.03);
}
.yk-suggests{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}
.yk-sug{
  font-size:11px;padding:4px 10px;border-radius:99px;
  border:1px solid rgba(168,85,247,.2);background:rgba(168,85,247,.06);
  color:#94a3b8;cursor:pointer;transition:all .14s;font-family:inherit;
}
.yk-sug:hover{border-color:rgba(168,85,247,.45);color:#f8fafc;background:rgba(168,85,247,.12);}
.yk-input-row{display:flex;gap:8px;}
.yk-input{
  flex:1;padding:9px 14px;border-radius:99px;
  border:1px solid rgba(168,85,247,.2);background:rgba(3,0,20,.65);
  color:#f8fafc;font-size:13px;font-family:inherit;outline:none;
  transition:border-color .14s,box-shadow .14s;
}
.yk-input::placeholder{color:rgba(148,163,184,.4);}
.yk-input:focus{border-color:#a855f7;box-shadow:0 0 0 3px rgba(168,85,247,.1);}
.yk-send{
  width:36px;height:36px;border-radius:50%;flex-shrink:0;
  background:linear-gradient(135deg,#a855f7,#06b6d4);
  border:none;color:#fff;font-size:17px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 16px rgba(168,85,247,.4);transition:transform .14s,box-shadow .14s;
}
.yk-send:hover{transform:scale(1.1);box-shadow:0 0 28px rgba(168,85,247,.65);}
.yk-send:disabled{opacity:.45;cursor:default;transform:none;box-shadow:none;}

@media(max-width:480px){
  #ykPanel{width:calc(100vw - 32px);right:-8px;}
}
`;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── HTML ── */
  var avatarOptsHtml = AVATARS.map(function (a) {
    return '<button class="yk-av-opt' + (a.emoji === currentAvatar ? ' sel' : '') + '" data-emoji="' + a.emoji + '">'
      + a.emoji + '<span class="yk-av-label">' + a.name + '</span></button>';
  }).join('');

  var wrap = document.createElement('div');
  wrap.id = 'ykChat';
  wrap.innerHTML = `
    <button id="ykToggle" aria-label="Ouvrir le chatbot">
      <span id="ykToggleIcon">${currentAvatar}</span>
      <span class="yk-notif" id="ykNotif"></span>
    </button>

    <div id="ykPanel">

      <!-- Avatar picker -->
      <div id="ykAvatarPicker">
        <h3>Choisir l'avatar du bot</h3>
        <p>L'avatar s'affichera dans toutes les bulles de réponse.</p>
        <div class="yk-av-grid">${avatarOptsHtml}</div>
        <button class="yk-av-close" id="ykAvClose">Confirmer →</button>
      </div>

      <!-- Header -->
      <div class="yk-hd">
        <div class="yk-bot">
          <div class="yk-bot-av" id="ykBotAv">${currentAvatar}</div>
          <div>
            <div class="yk-bot-name">YKonnect Bot</div>
            <div class="yk-bot-status">● En ligne · Llama 3.3</div>
          </div>
        </div>
        <div class="yk-hd-actions">
          <button class="yk-ico" id="ykAvBtn" title="Choisir l'avatar">🎨</button>
          <button class="yk-ico" id="ykCloseBtn" title="Fermer">✕</button>
        </div>
      </div>

      <!-- Messages -->
      <div id="ykMessages">
        <div class="yk-msg yk-msg-bot">
          <div class="yk-msg-av" id="ykWelcomeAv">${currentAvatar}</div>
          <div class="yk-bubble">Bonjour 👋 Je suis le chatbot de YKonnect. Pose-moi une question sur Linux, réseau, sécurité, Docker ou Kubernetes !</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="yk-ft">
        <div class="yk-suggests">
          <button class="yk-sug">Configurer WireGuard ?</button>
          <button class="yk-sug">Hardening Linux</button>
          <button class="yk-sug">RBAC K8s ?</button>
        </div>
        <div class="yk-input-row">
          <input class="yk-input" id="ykInput" type="text" placeholder="Pose ta question IT…" />
          <button class="yk-send" id="ykSend">↑</button>
        </div>
      </div>

    </div>
  `;
  document.body.appendChild(wrap);

  /* ── Refs ── */
  var toggle    = document.getElementById('ykToggle');
  var panel     = document.getElementById('ykPanel');
  var notif     = document.getElementById('ykNotif');
  var messagesEl = document.getElementById('ykMessages');
  var input     = document.getElementById('ykInput');
  var sendBtn   = document.getElementById('ykSend');
  var closeBtn  = document.getElementById('ykCloseBtn');
  var avBtn     = document.getElementById('ykAvBtn');
  var avPicker  = document.getElementById('ykAvatarPicker');
  var avClose   = document.getElementById('ykAvClose');
  var toggleIcon = document.getElementById('ykToggleIcon');
  var botAvEl   = document.getElementById('ykBotAv');
  var welcomeAv = document.getElementById('ykWelcomeAv');

  /* ── Toggle panel ── */
  toggle.addEventListener('click', function () {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) {
      notif.classList.remove('show');
      hasUnread = false;
      setTimeout(function () { input.focus(); }, 250);
    }
  });

  closeBtn.addEventListener('click', function () {
    isOpen = false;
    panel.classList.remove('open');
  });

  /* ── Avatar picker ── */
  avBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    avPicker.classList.toggle('open');
  });

  avClose.addEventListener('click', function () {
    avPicker.classList.remove('open');
  });

  avPicker.querySelectorAll('.yk-av-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      avPicker.querySelectorAll('.yk-av-opt').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      var emoji = btn.getAttribute('data-emoji');
      currentAvatar = emoji;
      localStorage.setItem('yk_avatar', emoji);

      // Mettre à jour tous les affichages
      toggleIcon.textContent = emoji;
      botAvEl.textContent = emoji;
      welcomeAv.textContent = emoji;
      messagesEl.querySelectorAll('.yk-msg-bot .yk-msg-av').forEach(function (av) {
        av.textContent = emoji;
      });
    });
  });

  /* ── Chat ── */
  function appendUserMsg(text) {
    var div = document.createElement('div');
    div.className = 'yk-msg yk-msg-user';
    div.innerHTML = '<div class="yk-bubble"></div>';
    div.querySelector('.yk-bubble').textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createBotMsgEl() {
    var div = document.createElement('div');
    div.className = 'yk-msg yk-msg-bot';
    var av = document.createElement('div');
    av.className = 'yk-msg-av';
    av.textContent = currentAvatar;
    var bubble = document.createElement('div');
    bubble.className = 'yk-bubble';
    bubble.textContent = '▋';
    div.appendChild(av);
    div.appendChild(bubble);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function handleSend() {
    if (isStreaming) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    isStreaming = true;

    appendUserMsg(text);
    var bubble = createBotMsgEl();
    var fullResponse = '';

    fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: conversationHistory })
    })
    .then(function (res) {
      if (!res.ok) {
        bubble.textContent = 'Erreur serveur — réessaie dans un instant.';
        finalize(null); return;
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) { flush(); return; }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.startsWith('data: ')) continue;
            var data = line.slice(6);
            if (data === '[DONE]') { flush(); return; }
            try {
              fullResponse += JSON.parse(data).content;
              bubble.textContent = fullResponse + '▋';
              messagesEl.scrollTop = messagesEl.scrollHeight;
            } catch (e) {}
          }
          read();
        }).catch(function () {
          bubble.textContent = fullResponse || 'Impossible de joindre le serveur.';
          finalize(null);
        });
      }

      function flush() {
        bubble.innerHTML = fullResponse || 'Aucune réponse.';
        messagesEl.scrollTop = messagesEl.scrollHeight;
        // Notification si le panel est fermé
        if (!isOpen) { hasUnread = true; notif.classList.add('show'); }
        finalize(fullResponse);
      }

      read();
    })
    .catch(function () {
      bubble.textContent = 'Impossible de joindre le serveur.';
      finalize(null);
    });

    function finalize(resp) {
      if (resp) {
        conversationHistory.push({ role: 'user', content: text });
        conversationHistory.push({ role: 'assistant', content: resp });
        if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
        try { sessionStorage.setItem('yk_history', JSON.stringify(conversationHistory)); } catch (e) {}
      }
      sendBtn.disabled = false;
      isStreaming = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
  });

  panel.querySelectorAll('.yk-sug').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (isStreaming) return;
      input.value = btn.textContent.trim();
      handleSend();
    });
  });

})();
