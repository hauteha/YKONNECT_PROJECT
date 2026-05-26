// chat.js
(function () {
  var messagesEl = document.getElementById('chatMessages');
  var inputEl = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSend');
  var suggestionButtons = document.querySelectorAll('.chat-suggest');

  if (!messagesEl || !inputEl || !sendBtn) return;

  var conversationHistory = [];
  var isStreaming = false;

  function createBotMessageEl() {
    var wrapper = document.createElement('div');
    wrapper.style.marginBottom = '6px';
    var strong = document.createElement('strong');
    strong.textContent = 'Bot : ';
    var span = document.createElement('span');
    span.className = 'text-soft';
    wrapper.appendChild(strong);
    wrapper.appendChild(span);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return span;
  }

  function appendUserMessage(text) {
    var wrapper = document.createElement('div');
    wrapper.style.marginBottom = '6px';
    var strong = document.createElement('strong');
    strong.textContent = 'Vous : ';
    var span = document.createElement('span');
    span.className = 'text-soft';
    span.textContent = text;
    wrapper.appendChild(strong);
    wrapper.appendChild(span);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function handleSend() {
    if (isStreaming) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;
    isStreaming = true;

    appendUserMessage(text);
    var span = createBotMessageEl();
    span.textContent = '▋';

    var fullResponse = '';

    fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: conversationHistory })
    })
    .then(function (res) {
      if (!res.ok) {
        span.textContent = 'Erreur du serveur. Reessaie dans un instant.';
        finalize(null);
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) {
            flush();
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.startsWith('data: ')) continue;
            var data = line.slice(6);
            if (data === '[DONE]') { flush(); return; }
            try {
              var parsed = JSON.parse(data);
              fullResponse += parsed.content;
              span.textContent = fullResponse + '▋';
              messagesEl.scrollTop = messagesEl.scrollHeight;
            } catch (e) {}
          }
          read();
        }).catch(function () {
          span.textContent = fullResponse || 'Impossible de joindre le serveur.';
          finalize(null);
        });
      }

      function flush() {
        span.innerHTML = fullResponse || 'Aucune réponse reçue.';
        messagesEl.scrollTop = messagesEl.scrollHeight;
        finalize(fullResponse);
      }

      read();
    })
    .catch(function () {
      span.textContent = 'Impossible de joindre le serveur.';
      finalize(null);
    });

    function finalize(botResponse) {
      if (botResponse) {
        conversationHistory.push({ role: 'user', content: text });
        conversationHistory.push({ role: 'assistant', content: botResponse });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
      }
      sendBtn.disabled = false;
      isStreaming = false;
      inputEl.focus();
    }
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
