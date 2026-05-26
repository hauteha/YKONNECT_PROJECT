// chat.js
(function () {
  var messagesEl = document.getElementById('chatMessages');
  var inputEl = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSend');
  var suggestionButtons = document.querySelectorAll('.chat-suggest');

  if (!messagesEl || !inputEl || !sendBtn) return;

  function appendMessage(text, from) {
    from = from || 'bot';
    var wrapper = document.createElement('div');
    wrapper.style.marginBottom = '6px';
    var label = from === 'user' ? 'Vous' : 'Bot';
    wrapper.innerHTML = '<strong>' + label + ' :</strong> <span class="text-soft">' + text + '</span>';
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendTyping() {
    var wrapper = document.createElement('div');
    wrapper.id = 'typingIndicator';
    wrapper.style.marginBottom = '6px';
    wrapper.innerHTML = '<strong>Bot :</strong> <span class="text-soft" style="opacity:0.6;">...</span>';
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    var el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  function handleSend() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;

    appendMessage(text, 'user');
    appendTyping();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    })
    .then(function (res) {
      removeTyping();
      if (!res.ok) {
        appendMessage('Erreur du serveur. Reessaie dans un instant.', 'bot');
        sendBtn.disabled = false;
        inputEl.focus();
        return;
      }
      return res.json();
    })
    .then(function (data) {
      if (data) appendMessage(data.response, 'bot');
      sendBtn.disabled = false;
      inputEl.focus();
    })
    .catch(function () {
      removeTyping();
      appendMessage('Impossible de joindre le serveur.', 'bot');
      sendBtn.disabled = false;
      inputEl.focus();
    });
  }

  sendBtn.addEventListener('click', handleSend);

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  });

  suggestionButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      inputEl.value = btn.textContent.trim();
      handleSend();
    });
  });
})();
