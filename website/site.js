/* Tyverix landing page — interactions.
 *
 * Adapted from the TemplateMo "NovaPay" template's script (nav snap, mobile
 * menu, count-up stats, sticky feature stack, FAQ, carousel play/pause, 3D
 * tilt). Anything that renders text waits for i18n.js's `tyverix:lang` event,
 * because a language switch re-renders those sections.
 */
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = (k) => k;

  /* ---------- Nav: snaps up over the ticker once you scroll ---------- */
  const nav = document.getElementById("mainNav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu with body scroll lock ---------- */
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobileMenu");
  let lockedY = 0;
  function setMenu(open) {
    mobileMenu.classList.toggle("open", open);
    hamburger.classList.toggle("open", open);
    hamburger.setAttribute("aria-expanded", String(open));
    if (open) {
      lockedY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockedY}px`;
      document.body.style.width = "100%";
    } else {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo({ top: lockedY, behavior: "instant" });
    }
  }
  hamburger.addEventListener("click", () => setMenu(!mobileMenu.classList.contains("open")));
  mobileMenu.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    setMenu(false);
    const href = a.getAttribute("href");
    if (href.startsWith("#")) {
      e.preventDefault();
      requestAnimationFrame(() => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" }));
    }
  });

  /* ---------- Scroll reveals ---------- */
  const revealObs =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("visible");
                revealObs.unobserve(e.target);
              }
            }),
          { threshold: 0.12 },
        )
      : null;
  function observeReveals() {
    document
      .querySelectorAll(".silk-reveal:not(.visible), .silk-reveal-left:not(.visible), .silk-reveal-right:not(.visible)")
      .forEach((el, i) => {
        if (!revealObs) return el.classList.add("visible");
        el.style.animationDelay = (i % 4) * 0.08 + "s";
        revealObs.observe(el);
      });
  }
  window.addEventListener("load", () => {
    document.querySelectorAll(".hero-content, .hero-visual").forEach((el, i) => {
      setTimeout(() => el.classList.add("visible"), i * 150 + 80);
    });
  });

  /* ---------- Hero demo dashboard (clearly badged "Demo") ---------- */
  const heroBars = document.getElementById("heroBars");
  const BAR_COUNT = 16;
  let barVals = Array.from({ length: BAR_COUNT }, (_, i) => 30 + 25 * Math.sin(i / 2.2) + Math.random() * 18);
  const drawBars = () => {
    heroBars.innerHTML = barVals
      .map((v, i) => `<i class="${i >= BAR_COUNT - 2 ? "hot" : ""}" style="height:${Math.max(8, Math.min(100, v))}%"></i>`)
      .join("");
  };
  drawBars();
  let gauges = [32, 54];
  if (!reduceMotion) {
    setInterval(() => {
      barVals = barVals.slice(1).concat(Math.max(10, Math.min(95, barVals[BAR_COUNT - 1] + (Math.random() * 30 - 15))));
      drawBars();
      gauges = gauges.map((v) => Math.max(8, Math.min(92, v + (Math.random() * 14 - 7))));
      gauges.forEach((v, i) => {
        const val = document.querySelector(`[data-gauge="${i}"]`);
        const meter = document.querySelector(`[data-meter="${i}"]`);
        if (val) val.textContent = Math.round(v) + "%";
        if (meter) meter.style.width = Math.round(v) + "%";
      });
    }, 1800);
  }

  /* ---------- Stats: count up + bar fill, once ---------- */
  const statBlocks = document.querySelectorAll(".stat-block");
  function runStat(block) {
    const el = block.querySelector(".stat-num");
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const bar = block.querySelector(".stat-bar");
    if (bar) setTimeout(() => (bar.style.width = bar.dataset.width), 200);
    if (reduceMotion || target === 0) {
      el.textContent = target + suffix;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 1600, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && !reduceMotion) {
    statBlocks.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transitionDelay = `${i * 0.1}s`;
    });
    const statObs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.style.opacity = "1";
          e.target.style.transform = "";
          setTimeout(() => (e.target.style.transitionDelay = ""), 900);
          runStat(e.target);
          statObs.unobserve(e.target);
        }),
      { threshold: 0.35 },
    );
    statBlocks.forEach((el) => statObs.observe(el));
  } else {
    statBlocks.forEach(runStat);
  }

  /* ---------- Features: sticky stack ---------- */
  let activePanel = 0;
  function setPanel(i) {
    activePanel = i;
    document.querySelectorAll(".sticky-card").forEach((c, j) => c.classList.toggle("active", j === i));
    document.querySelectorAll("[data-panel-img]").forEach((img, j) => img.classList.toggle("active", j === i));
    const card = document.querySelector(`.sticky-card[data-panel="${i}"]`);
    if (card) document.getElementById("panelLabel").textContent = `Tyverix · ${card.dataset.label}`;
  }
  document.getElementById("stickyCards").addEventListener("click", (e) => {
    const card = e.target.closest(".sticky-card");
    if (card) setPanel(Number(card.dataset.panel));
  });
  // Scroll-driven: the card crossing the middle band of the viewport wins.
  // Only on the two-column layout, where the panel is sticky beside the cards.
  const wide = window.matchMedia("(min-width: 961px)");
  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!wide.matches || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const vh = window.innerHeight;
        document.querySelectorAll(".sticky-card").forEach((card, i) => {
          const r = card.getBoundingClientRect();
          if (r.top < vh * 0.55 && r.bottom > vh * 0.35 && i !== activePanel) setPanel(i);
        });
      });
    },
    { passive: true },
  );

  /* ---------- A/B benchmark illustration ---------- */
  // Fixed, clearly-labelled example scenarios — never presented as a measurement.
  const SCENARIOS = {
    helped: { a: 212.4, b: 221.3, lo: 6.2, hi: 11.6, kind: "Helped", chip: "" },
    none: { a: 212.4, b: 213.5, lo: -2.3, hi: 4.5, kind: "None", chip: "neutral" },
    hurt: { a: 212.4, b: 203.9, lo: -11.2, hi: -5.8, kind: "Hurt", chip: "bad" },
  };
  let scenario = "helped";
  // Deterministic pseudo-noise so the bars don't jump on every language switch.
  const noise = (seed) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  function renderBench() {
    const s = SCENARIOS[scenario];
    const fmt = (n, d = 1) =>
      n.toLocaleString(document.documentElement.lang, { minimumFractionDigits: d, maximumFractionDigits: d });
    const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
    const N = 22;
    const min = 170, max = 240;
    const h = (v) => ((v - min) / (max - min)) * 100;
    document.getElementById("benchBars").innerHTML = Array.from({ length: N }, (_, i) => {
      const va = s.a + (noise(i + 1) - 0.5) * 16;
      const vb = s.b + (noise(i + 101) - 0.5) * (scenario === "none" ? 20 : 16);
      return `<div class="bp-pair"><i class="a" style="height:${h(va)}%"></i><i class="b" style="height:${h(vb)}%"></i></div>`;
    }).join("");
    document.getElementById("benchA").textContent = fmt(s.a);
    document.getElementById("benchB").textContent = fmt(s.b);
    const diff = s.b - s.a;
    const diffEl = document.getElementById("benchDiff");
    diffEl.textContent = `${signed(diff)} FPS`;
    diffEl.style.color = scenario === "helped" ? "var(--green)" : scenario === "hurt" ? "var(--red)" : "var(--text)";
    document.getElementById("benchCi").textContent = t("bench.ci").replace("{lo}", signed(s.lo)).replace("{hi}", signed(s.hi));
    // CI strip: ±15 FPS mapped onto the width, zero in the middle.
    const pos = (v) => 50 + (v / 15) * 50;
    const range = document.getElementById("benchRange");
    range.style.left = pos(s.lo) + "%";
    range.style.width = pos(s.hi) - pos(s.lo) + "%";
    range.style.background =
      scenario === "helped" ? "rgba(61,220,132,.55)" : scenario === "hurt" ? "rgba(239,100,97,.55)" : "rgba(245,177,76,.55)";
    document.getElementById("benchPt").style.left = `calc(${pos(diff)}% - 1.5px)`;
    document.getElementById("benchVerdict").innerHTML =
      `<span class="chip ${scenario === "none" ? "warn" : s.chip}" style="font-size:12px;padding:4px 10px">${t("bench.v" + s.kind)}</span>`;
    document.getElementById("benchExplain").textContent = t("bench.e" + s.kind);
    document.querySelectorAll("#benchSeg button").forEach((b) => b.classList.toggle("active", b.dataset.scenario === scenario));
  }
  document.getElementById("benchSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-scenario]");
    if (!b) return;
    scenario = b.dataset.scenario;
    renderBench();
  });

  /* ---------- Screenshot carousel play/pause ---------- */
  const shotsTrack = document.getElementById("shotsTrack");
  let shotsPaused = reduceMotion;
  function renderShotsToggle() {
    shotsTrack.style.animationPlayState = shotsPaused ? "paused" : "running";
    document.getElementById("shotsIcon").innerHTML = shotsPaused
      ? '<polygon points="6,4 20,12 6,20"/>'
      : '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
    document.getElementById("shotsLabel").textContent = t(shotsPaused ? "shots.play" : "shots.pause");
  }
  document.getElementById("shotsToggle").addEventListener("click", () => {
    shotsPaused = !shotsPaused;
    renderShotsToggle();
  });

  /* ---------- FAQ ---------- */
  const faqList = document.getElementById("faqList");
  faqList.addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const item = q.parentElement;
    item.classList.toggle("open");
    q.setAttribute("aria-expanded", String(item.classList.contains("open")));
  });
  let allExpanded = false;
  function renderFaqToggle() {
    document.getElementById("faqToggleLabel").textContent = t(allExpanded ? "faq.collapse" : "faq.expand");
    document.getElementById("faqToggleIcon").innerHTML = allExpanded
      ? '<line x1="5" y1="12" x2="19" y2="12"/>'
      : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
  }
  document.getElementById("faqToggleAll").addEventListener("click", () => {
    allExpanded = !allExpanded;
    faqList.querySelectorAll(".faq-item").forEach((el) => {
      el.classList.toggle("open", allExpanded);
      el.querySelector(".faq-q").setAttribute("aria-expanded", String(allExpanded));
    });
    renderFaqToggle();
  });

  /* ---------- Lightbox for every real screenshot ---------- */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeLightbox = () => {
    lightbox.classList.remove("open");
    lightboxImg.src = "";
  };
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".panel-shot img.active, .shot-card img, .tilt-frame img");
    if (!img) return;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || "";
    lightbox.classList.add("open");
  });
  lightbox.addEventListener("click", (e) => {
    if (e.target !== lightboxImg) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  /* ---------- 3D tilt on the download screenshot (mouse, lerped) ---------- */
  const frame = document.getElementById("tiltFrame");
  if (frame && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    const MAX = 9;
    const animate = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      frame.style.transform = `rotateX(${cy}deg) rotateY(${cx}deg)`;
      raf = Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(animate) : null;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(animate);
    };
    window.addEventListener("mousemove", (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * MAX * 2;
      ty = -(e.clientY / window.innerHeight - 0.5) * MAX;
      kick();
    });
    document.addEventListener("mouseleave", () => {
      tx = ty = 0;
      kick();
    });
  }

  /* ---------- Language (re)render hook ---------- */
  document.addEventListener("tyverix:lang", (e) => {
    t = e.detail.t;
    setPanel(Math.min(activePanel, document.querySelectorAll(".sticky-card").length - 1));
    renderBench();
    renderShotsToggle();
    allExpanded = false;
    renderFaqToggle();
    observeReveals();
  });

  initI18n();
  let saved = null;
  try {
    saved = localStorage.getItem("bf.site.lang");
  } catch (e) {
    /* ignored — falls back to browser language below */
  }
  const sys = (navigator.language || "en").slice(0, 2);
  apply(saved || (["hu", "de"].includes(sys) ? sys : "en"));
})();
