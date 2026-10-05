/* Feuilles d'automne qui tombent : deux couches (derrière l'interface, et quelques-unes devant, discrètes) */
(function () {
  const COULEURS = [["#B93A2B", "#E8663A"], ["#D9541E", "#F28A30"], ["#E59A1C", "#F7C948"], ["#A8561C", "#D98532"], ["#8E2B1F", "#C9482F"], ["#CFA02A", "#EAD36B"]];
  const sprites = [];
  function faireSprites() {
    if (sprites.length) return;
    COULEURS.forEach(([c1, c2]) => {
      const s = 96, cv = document.createElement("canvas"); cv.width = cv.height = s;
      const x = cv.getContext("2d"); x.translate(s / 2, s / 2);
      const g = x.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.beginPath();
      for (let i = 0; i <= 180; i++) {
        const a = i / 180 * Math.PI * 2, l = Math.abs(Math.cos(a * 2.5)), r = s * 0.46 * (0.30 + 0.70 * Math.pow(l, 1.5));
        i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.closePath(); x.fillStyle = g; x.fill();
      x.strokeStyle = "rgba(60,20,8,.35)"; x.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4); x.stroke(); }
      x.lineWidth = 2.4; x.beginPath(); x.moveTo(0, 0); x.lineTo(-s * 0.1, s * 0.5); x.stroke();
      sprites.push(cv);
    });
  }
  function creer(canvas, n, o) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, liste = [], raf = 0, dernier = 0, actif = false;
    function taille() { dpr = Math.min(window.devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    function neuve(initial) {
      const p = Math.random(), t = o.min + (o.max - o.min) * p;
      return { x: Math.random() * w, y: initial ? Math.random() * h : -t - Math.random() * h * 0.35, t, v: 24 + 46 * p + Math.random() * 14,
        amp: 16 + Math.random() * 36, f: 0.4 + Math.random() * 0.8, ph: Math.random() * 6.28, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.3,
        flip: Math.random() * 6.28, vf: 0.8 + Math.random() * 1.6, s: sprites[(Math.random() * sprites.length) | 0], a: o.alpha * (0.6 + 0.4 * p) };
    }
    function image(ts) {
      if (!actif) return;
      const dt = Math.min(0.05, (ts - dernier) / 1000 || 0.016); dernier = ts;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      for (const L of liste) {
        L.y += L.v * dt; L.ph += L.f * dt; L.r += L.vr * dt; L.flip += L.vf * dt;
        if (L.y - L.t > h) Object.assign(L, neuve(false));
        ctx.save(); ctx.globalAlpha = L.a; ctx.translate(L.x + Math.sin(L.ph) * L.amp, L.y);
        ctx.rotate(L.r + Math.sin(L.ph) * 0.5); ctx.scale(0.55 + 0.45 * Math.cos(L.flip), 1);
        ctx.drawImage(L.s, -L.t / 2, -L.t / 2, L.t, L.t); ctx.restore();
      }
      raf = requestAnimationFrame(image);
    }
    function demarrer() {
      if (actif) return; actif = true; faireSprites(); taille();
      if (!liste.length) liste = Array.from({ length: n }, () => neuve(true));
      dernier = performance.now(); canvas.hidden = false; raf = requestAnimationFrame(image);
    }
    function arreter() { actif = false; cancelAnimationFrame(raf); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; }
    addEventListener("resize", () => { if (actif) taille(); });
    document.addEventListener("visibilitychange", () => { if (!actif) return; if (document.hidden) cancelAnimationFrame(raf); else { dernier = performance.now(); raf = requestAnimationFrame(image); } });
    return { regler: on => (on ? demarrer() : arreter()) };
  }
  const arriere = creer(document.getElementById("feuilles-arriere"), 16, { min: 18, max: 46, alpha: 1 });
  const avant = creer(document.getElementById("feuilles-avant"), 4, { min: 22, max: 38, alpha: 0.5 });
  window.FEUILLES = { regler: on => { arriere.regler(on); avant.regler(on); } };
})();
