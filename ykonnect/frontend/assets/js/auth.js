// auth.js
// Hooks de base pour Connexion / Création de compte.
// À terme : ouverture d’une modale, redirection vers /login, appel API, etc.

(function () {
  const btnLogin = document.getElementById("btnLogin");
  const btnRegister = document.getElementById("btnRegister");

  if (btnLogin) {
    btnLogin.addEventListener("click", () => {
      alert("[Prototype] Action Connexion : à brancher sur une vraie page ou une modale d'authentification.");
    });
  }

  if (btnRegister) {
    btnRegister.addEventListener("click", () => {
      alert("[Prototype] Action Création de compte : à brancher sur une vraie page ou une modale d'inscription.");
    });
  }
})();
