// main.js

/* ── Hamburger menu ── */
(function () {
  var btn = document.getElementById('hamburger');
  var nav = document.getElementById('navMobile');
  if (!btn || !nav) return;
  btn.addEventListener('click', function () {
    btn.classList.toggle('open');
    nav.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      btn.classList.remove('open');
      nav.classList.remove('open');
    }
  });
})();

/* ── Typing animation ── */
(function () {
  var el = document.getElementById('typingText');
  if (!el) return;

  var phrases = [
    'Linux · Réseau · Sécurité',
    'Docker · Kubernetes · DevOps',
    'WireGuard · Fail2Ban · HAProxy',
    'CKA · LFCS · CCNA',
  ];

  var phraseIdx = 0;
  var charIdx = 0;
  var deleting = false;
  var pauseTicks = 0;

  function tick() {
    var phrase = phrases[phraseIdx];

    if (deleting) {
      charIdx--;
      el.textContent = phrase.slice(0, charIdx);
      if (charIdx === 0) {
        deleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        setTimeout(tick, 400);
        return;
      }
      setTimeout(tick, 40);
    } else {
      charIdx++;
      el.textContent = phrase.slice(0, charIdx);
      if (charIdx === phrase.length) {
        pauseTicks = 0;
        setTimeout(function pause() {
          pauseTicks++;
          if (pauseTicks < 28) { setTimeout(pause, 60); return; }
          deleting = true;
          tick();
        }, 60);
        return;
      }
      setTimeout(tick, 65);
    }
  }

  setTimeout(tick, 600);
})();

/* ── Compteurs animés (Intersection Observer) ── */
(function () {
  var row = document.getElementById('statsRow');
  if (!row) return;

  var counters = row.querySelectorAll('[data-target]');
  var started = false;

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var duration = 900;
    var start = performance.now();
    function step(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var observer = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting && !started) {
      started = true;
      counters.forEach(function (el) { animateCounter(el); });
    }
  }, { threshold: 0.4 });

  observer.observe(row);
})();

/* ── Recherche dans les articles (index.html) ── */
(function () {
  var input = document.getElementById('searchInput');
  var grid = document.getElementById('articleGrid');
  var empty = document.getElementById('searchEmpty');
  if (!input || !grid) return;

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var cards = grid.querySelectorAll('article');
    var visible = 0;

    cards.forEach(function (card) {
      var tags = (card.getAttribute('data-tags') || '').toLowerCase();
      var title = card.querySelector('h3') ? card.querySelector('h3').textContent.toLowerCase() : '';
      var desc = card.querySelector('.text-soft') ? card.querySelector('.text-soft').textContent.toLowerCase() : '';
      var match = !q || tags.includes(q) || title.includes(q) || desc.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });

    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  });
})();
