/* Tyverix marketing site — trilingual content (EN / HU / DE).
 *
 * Everything on the landing page that is text lives here. apply(lang) fills the
 * [data-i18n] elements, renders the list-shaped sections, and then fires a
 * `tyverix:lang` event so site.js can (re)bind the interactive parts.
 *
 * House rule, same as the app: no number on this page may be invented. The
 * ticker, stats and float badges only state facts about the app itself; the
 * hero dashboard and the A/B chart are labelled "Demo" / "Illustrative example".
 */

// The version the site advertises and serves from website/download/. Bump this
// in the same commit that re-copies the freshly built installer — it is the one
// place the version appears on the site, so the badge can never drift away from
// the file the download button actually hands over.
const APP_VERSION = "0.1.16";

// Points at the latest GitHub Release page (the installer's filename changes
// per version, so this links to the release rather than guessing the name).
// Only used as a fallback when config.js has no self-hosted DOWNLOAD_URL.
const GITHUB_REPO = "Bogroliakiraly/tyverix";
const DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
// Replace with your Stripe Payment Link / Checkout URL once payments are set up:
const BUY_URL = "https://buy.stripe.com/your-payment-link";

// Line icons (24×24, stroked) shared by every language.
const ICONS = {
  diagnostics: '<path d="M11 2v2M5 2v2" /><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><path d="M8 15a6 6 0 0 0 12 0v-3" /><circle cx="20" cy="10" r="2" />',
  benchmark: '<path d="M9 3h6M10 3v6L4 20a1 1 0 0 0 1 1.5h14A1 1 0 0 0 20 20l-6-11V3" /><path d="M7 15h10" />',
  boost: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />',
  gamemode: '<rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h4M8 10v4" /><circle cx="15.5" cy="11" r="1" /><circle cx="18" cy="13" r="1" />',
  cleaner: '<polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />',
  safety: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />',
  monitor: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />',
  memory: '<rect x="3" y="7" width="18" height="10" rx="1.5" /><path d="M7 7V5M11 7V5M15 7V5M19 7V5M7 17v2M11 17v2M15 17v2M19 17v2" />',
  network: '<path d="M5 12.55a11 11 0 0 1 14 0" /><path d="M1.4 9a16 16 0 0 1 21.2 0" /><path d="M8.5 16.1a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" />',
  scheduled: '<circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />',
  startup: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" /><path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z" /><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />',
  processes: '<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />',
  x: '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
};

// Each big feature is paired with the real screenshot of that page of the app.
const FEATURE_SHOTS = {
  diagnostics: "screenshots/diagnostics.png",
  benchmark: "screenshots/benchmark.png",
  boost: "screenshots/boost.png",
  gamemode: "screenshots/gamemode.png",
  cleaner: "screenshots/cleaner.png",
  safety: "screenshots/safety.png",
};

// Every page of the app, in sidebar order, for the screenshot carousel.
const ALL_SHOTS = [
  ["dashboard", "Dashboard"], ["diagnostics", "Diagnostics"], ["boost", "Boost"],
  ["benchmark", "A/B benchmark"], ["gamemode", "Game Mode"], ["cleaner", "Cleaner"],
  ["memory", "Memory"], ["network", "Network"], ["startup", "Startup"],
  ["processes", "Processes"], ["safety", "Safety"], ["settings", "Settings"],
];

// Real components the app is built on — shown instead of a "trusted by" row.
const TOOLS = [
  "Intel PresentMon", "powercfg", "System Restore", "Task Scheduler", "WMI",
  "Windows Registry", "StartupApproved", "MMCSS", "nvidia-smi", "WebView2", "Tauri", "Rust",
];

const I18N = {
  en: {
    "nav.features": "Features",
    "nav.benchmark": "Before/after test",
    "nav.honesty": "Honesty",
    "nav.pricing": "Pricing",
    "nav.faq": "FAQ",
    "nav.download": "Download",
    "nav.account": "Account",
    "nav.changelog": "Changelog",
    "nav.changes": "What it changes",
    demo: "Demo",
    realShot: "Real screenshot",
    "hero.pill": "No fake numbers. Ever.",
    "hero.title1": "Optimize Windows for gaming —",
    "hero.title2": "the honest way.",
    "hero.sub":
      "Tyverix makes your PC faster and smoother for games — using only settings that really matter, that you can always undo, and that won't break Windows. No fake “FPS boost”, no magic button.",
    "hero.ctaDownload": "Download free",
    "hero.ctaTour": "See how it works",
    "hero.hint": "Windows 10 & 11 · every download includes 1 day of Pro for free",
    "hero.fbLeft": "Settings can be undone",
    "hero.gpuNa": "Not made up",
    "hero.cpuHistory": "Processor load",
    "hero.last60": "last 60 s",
    "hero.tx1": "Speed setting turned on",
    "hero.tx1sub": "Old value saved first",
    "hero.undo": "Can be undone",
    "hero.tx2": "Game Mode ended",
    "hero.tx2sub": "Everything set back as it was",
    "hero.restored": "Restored",
    "tools.label": "Uses only Windows' own, official tools",
    "stats.tweaks": "Speed settings",
    "stats.tweaksTrend": "Each one undone with a click",
    "stats.cleaner": "Areas it can safely clean",
    "stats.cleanerTrend": "You see the pros and cons of each",
    "stats.fake": "Made-up numbers (FPS, temperature, load)",
    "stats.fakeTrend": "If it can't measure it, it says so",
    "stats.trial": "day of free Pro with every download",
    "stats.trialTrend": "No bank card needed",
    "features.eyebrow": "Real features",
    "features.title": "Everything you need, nothing you don't",
    "features.sub":
      "It shows what slows your PC down, lets you test whether a change really helped, and everything can be undone.",
    "features.zoom": "Click the picture to see it full size.",
    "bench.eyebrow": "Before/after test",
    "bench.title": "It tells you the truth — even when nothing improved",
    "bench.sub":
      "Play a bit, change one thing, play again. Tyverix compares the two and only says “faster” when the difference is real — not just random ups and downs.",
    "bench.window": "Before/after test · Counter-Strike 2",
    "bench.example": "Example only",
    "bench.sHelped": "It helped",
    "bench.sNone": "No change",
    "bench.sHurt": "It got worse",
    "bench.runA": "Before",
    "bench.runB": "After",
    "bench.axis": "FPS second by second",
    "bench.avg": "Average FPS",
    "bench.fps": "Measured for real while you play",
    "bench.diff": "Difference",
    "bench.ci": "Certain range: between {lo} and {hi} FPS",
    "bench.verdict": "Result",
    "bench.vHelped": "Really faster",
    "bench.vNone": "No real difference",
    "bench.vHurt": "Slower",
    "bench.eHelped": "The gain is clearly bigger than random ups and downs — this change was worth it.",
    "bench.eNone": "The difference is as small as normal random ups and downs, so Tyverix won't call it an improvement.",
    "bench.eHurt": "It got worse — undo it with one click, the old setting was saved.",
    "bench.foot": "These numbers are just examples of the three possible results, not a measurement of your PC.",
    "honesty.eyebrow": "Honest by design",
    "honesty.title": "What Tyverix will never do",
    "honesty.sub":
      "Trust matters most. We never break these rules — and we publish exactly what it can change on your PC, before you even download it.",
    "honesty.cta": "See what it changes",
    "honesty.status": "Strict rule",
    "shots.eyebrow": "See it for yourself",
    "shots.title": "The real app, not a mockup",
    "shots.sub": "Real screens from Tyverix. Click any of them to enlarge.",
    "shots.pause": "Pause",
    "shots.play": "Play",
    "pricing.eyebrow": "Pricing",
    "pricing.title": "Start free. Upgrade when you're ready.",
    "pricing.sub": "The free version stays free forever. Pro can be cancelled anytime.",
    "pricing.freeName": "Free",
    "pricing.proName": "Pro",
    "pricing.forever": "free forever",
    "pricing.perMonth": "per month · cancel anytime",
    "pricing.trialBadge": "+1 day of Pro as a gift",
    "pricing.freeCta": "Download",
    "pricing.proCta": "Get Pro",
    "pricing.note":
      "Every download includes 1 day of free Pro so you can try everything — no bank card needed. If you don't subscribe afterwards, you simply keep the free features.",
    "pricing.comingSoon":
      "Online Pro purchases aren't open yet — download the free version below for now, and check back soon.",
    "download.eyebrow": "Get started",
    "download.title": "Download Tyverix",
    "download.sub": "A small installer (1–4 MB). New versions are offered inside the app automatically.",
    "download.cta": "Download for Windows",
    "download.discordSub": "Join the community",
    "download.ctaSub": "Free · +1 day of Pro",
    "download.version": "Version {v}",
    "download.req": "Windows 10 or 11 (64-bit)",
    "download.changes": "What it changes on your PC",
    "download.smartscreen": "On first start Windows may show “Windows protected your PC” — that's normal for new programs. Details in the FAQ.",
    "faq.eyebrow": "Got questions?",
    "faq.title": "Frequently asked",
    "faq.expand": "Expand all",
    "faq.collapse": "Collapse all",
    "footer.desc":
      "An honest Windows optimizer for gamers. It checks your PC, measures for real, and every change can be undone.",
    "footer.tagline": "Measurable. Reversible. Safe.",
    "footer.product": "Product",
    "footer.transparency": "Transparency",
    "footer.support": "Support",
    ticker: [
      ["Speed-up", "15 settings", "all can be undone"],
      ["Cleaning", "9 safe areas", "you see what it deletes"],
      ["Test", "before vs. after", "honest result"],
      ["FPS", "really measured", "not estimated"],
      ["Made-up numbers", "0", "ever"],
      ["Startup programs", "nothing deleted", "just on/off"],
      ["Game Mode", "after the game", "everything restored"],
      ["PC check", "memory · monitor · graphics card", "only looks"],
      ["Windows", "10 & 11", ""],
      ["Version", "{v}", "updates itself"],
    ],
    features: [
      ["diagnostics", "PC check", "Finds the problems that really cost you FPS — for example memory running slower than it could, or a 144 Hz monitor stuck at 60 Hz. It changes nothing, only shows you what's wrong and where to fix it.", ["Only looks", "Memory speed", "Monitor refresh", "Graphics card"]],
      ["benchmark", "Before/after test", "Play a bit, change one thing, then play again. Tyverix compares the two and tells you whether it really got faster — or it was just random variation.", ["Real FPS measurement", "Honest result"]],
      ["boost", "Speed settings", "Windows settings that really affect games. Each one tells you what to expect, and saves your old value first, so you can undo it with one click.", ["15 settings", "Old value saved", "One-click undo"]],
      ["gamemode", "Game Mode", "Switches your PC to maximum performance while you play, then sets everything back exactly as it was.", ["Max performance", "Restored afterwards", "Pro"]],
      ["cleaner", "Safe cleaning", "Only deletes files your PC doesn't need: temporary files, leftovers of old updates, error reports and the like. For each item you see what you gain and what the downside is.", ["9 areas", "Files in use are skipped", "Restore point"]],
      ["safety", "Safety net", "Make a backup before changing anything, and undo any change later. You see everything that happened on your PC in one place.", ["Restore point", "Backup", "Undo"]],
    ],
    more: [
      ["monitor", "Live PC monitor", "See in real time how busy your processor, memory, internet and disk are."],
      ["memory", "Free up memory", "Frees up memory before a game and shows how much it actually freed."],
      ["network", "Connection check", "Measures how fast and stable your connection is to a server — handy before an online match."],
      ["scheduled", "Automatic cleaning", "Runs the safe cleaning every day by itself and logs how much space it freed."],
      ["startup", "Startup programs", "Turn off programs that start with Windows for no reason. Nothing is deleted, you can turn them back on anytime."],
      ["processes", "Running programs", "See which program uses how much of your PC, and close the ones you don't need."],
    ],
    honesty: [
      ["No made-up numbers", "It never shows FPS, temperature or load it didn't actually measure."],
      ["Doesn't switch off important parts", "It never disables Windows services for a “speed-up” that brings no measurable benefit."],
      ["No hidden changes", "It never does anything behind your back that can't be undone."],
      ["No empty promises", "It never promises “+50 FPS” or any number it can't prove."],
      ["Calls things what they are", "It always shows exactly what it measured — no rounding up, no prettifying."],
      ["Luck isn't improvement", "If a difference is just random variation, it won't call it an improvement."],
    ],
    free: ["Live PC monitor", "Safe cleaning", "Running & startup programs", "PC check", "1 day of free Pro"],
    pro: ["Everything in Free", "Game Mode", "Free up memory", "Connection check", "Automatic daily cleaning", "Automatic updates & priority support"],
    faq: [
      ["Is Tyverix safe?", "Yes. Before every change it saves your old setting, so you can always put it back. If something can't be undone (for example deleting a file), it tells you clearly beforehand and only does it after you confirm. The full list is here: <a href=\"changes.html\">What it changes</a>."],
      ["Will I really get more FPS?", "Honestly: it depends on your PC. On a PC that is set up well, no setting works miracles. The biggest gains usually come from something being set up wrong — like memory running slower than it can, or the monitor not running at its full refresh rate. The PC check finds these. With the before/after test you can measure yourself whether a change helped."],
      ["How do I undo what it changed?", "Every setting can be undone one by one, or all at once on the Safety page, where you can also create a restore point. Game Mode puts everything back by itself when you finish playing."],
      ["Why does it ask for administrator permission?", "Because Windows only lets some settings (like power settings) be changed with administrator permission. Tyverix only changes what's listed on the What it changes page."],
      ["Why does Windows warn me when installing?", "For new, lesser-known programs Windows shows “Windows protected your PC” until the program has an expensive special signature. This is not a virus warning. Click “More info”, then “Run anyway”."],
      ["Does it turn off Windows services or delete system files?", "No. These so-called speed-ups don't bring any measurable improvement but can cause problems — so Tyverix doesn't do them."],
      ["What's the difference between Free and Pro?", "Free includes the PC monitor, safe cleaning, managing running and startup programs, and the PC check. Pro adds Game Mode, freeing up memory, the connection check and automatic daily cleaning. Every download comes with 1 day of free Pro, no bank card needed — if you don't subscribe afterwards, you keep the free features."],
      ["How does it update?", "The app tells you when there's a new version and you can update with one click. Every change is listed on the <a href=\"changelog.html\">Changelog</a> page."],
      ["Where can I get help?", "Write to <a href=\"mailto:support@tyverix.com\">support@tyverix.com</a> or join our <a href=\"https://discord.me/tyverix\" target=\"_blank\" rel=\"noopener\">Discord server</a>, where you can ask questions, report problems and chat with other players."],
    ],
  },

  hu: {
    "nav.features": "Funkciók",
    "nav.benchmark": "Előtte–utána teszt",
    "nav.honesty": "Őszinteség",
    "nav.pricing": "Árazás",
    "nav.faq": "GYIK",
    "nav.download": "Letöltés",
    "nav.account": "Fiók",
    "nav.changelog": "Újdonságok",
    "nav.changes": "Mit módosít",
    demo: "Demó",
    realShot: "Valódi képernyő",
    "hero.pill": "Soha nincs hamis szám.",
    "hero.title1": "Optimalizáld a Windowst játékra —",
    "hero.title2": "őszintén.",
    "hero.sub":
      "A Tyverix gyorsabbá és simábbá teszi a géped játékhoz — csak olyan beállításokkal, amik tényleg számítanak, bármikor visszaállíthatók, és nem teszik tönkre a Windowst. Nincs kamu „FPS-növelés”, nincs varázsgomb.",
    "hero.ctaDownload": "Ingyenes letöltés",
    "hero.ctaTour": "Nézd meg, hogyan működik",
    "hero.hint": "Windows 10 és 11 · minden letöltéshez 1 nap ingyenes Pro",
    "hero.fbLeft": "Beállítás visszaállítható",
    "hero.gpuNa": "Nincs kitalálva",
    "hero.cpuHistory": "Processzor-terhelés",
    "hero.last60": "utolsó 60 mp",
    "hero.tx1": "Gyorsító beállítás bekapcsolva",
    "hero.tx1sub": "A régi érték előbb elmentve",
    "hero.undo": "Visszavonható",
    "hero.tx2": "Játék mód vége",
    "hero.tx2sub": "Minden visszaállítva, ahogy volt",
    "hero.restored": "Visszaállítva",
    "tools.label": "Csak a Windows saját, hivatalos eszközeit használja",
    "stats.tweaks": "Gyorsító beállítás",
    "stats.tweaksTrend": "Mind egy kattintással visszaállítható",
    "stats.cleaner": "Biztonságosan tisztítható terület",
    "stats.cleanerTrend": "Mindegyiknél látod az előnyt és a hátrányt",
    "stats.fake": "Kitalált szám (FPS, hőfok, terhelés)",
    "stats.fakeTrend": "Ha nem tudja mérni, megmondja",
    "stats.trial": "nap ingyenes Pro minden letöltéshez",
    "stats.trialTrend": "Bankkártya nélkül",
    "features.eyebrow": "Valódi funkciók",
    "features.title": "Minden, amire szükség van — semmi felesleges",
    "features.sub":
      "Megmutatja, mi lassítja a géped, lemérheted vele, hogy egy változtatás tényleg segített-e, és mindent vissza lehet csinálni.",
    "features.zoom": "Kattints a képre a teljes méretért.",
    "bench.eyebrow": "Előtte–utána teszt",
    "bench.title": "Megmondja az igazat — akkor is, ha nem segített",
    "bench.sub":
      "Játssz egy kicsit, változtass egy dolgon, játssz újra. A Tyverix összehasonlítja a kettőt, és csak akkor mondja, hogy gyorsabb lett, ha a különbség tényleg valódi — nem csak véletlen ingadozás.",
    "bench.window": "Előtte–utána teszt · Counter-Strike 2",
    "bench.example": "Csak példa",
    "bench.sHelped": "Segített",
    "bench.sNone": "Nem változott",
    "bench.sHurt": "Rontott",
    "bench.runA": "Előtte",
    "bench.runB": "Utána",
    "bench.axis": "FPS másodpercről másodpercre",
    "bench.avg": "Átlag FPS",
    "bench.fps": "Valódi mérés játék közben",
    "bench.diff": "Különbség",
    "bench.ci": "Biztos tartomány: {lo} és {hi} FPS között",
    "bench.verdict": "Eredmény",
    "bench.vHelped": "Tényleg gyorsabb lett",
    "bench.vNone": "Nincs valódi különbség",
    "bench.vHurt": "Lassabb lett",
    "bench.eHelped": "A javulás egyértelműen nagyobb a véletlen ingadozásnál — ez a változtatás megérte.",
    "bench.eNone": "A különbség akkora, mint a szokásos véletlen ingadozás, ezért a Tyverix nem nevezi javulásnak.",
    "bench.eHurt": "Rosszabb lett — állítsd vissza egy kattintással, a régi beállítás el van mentve.",
    "bench.foot": "A fenti számok csak példák a három lehetséges eredményre, nem a te gépedről szólnak.",
    "honesty.eyebrow": "Tervezetten őszinte",
    "honesty.title": "Amit a Tyverix soha nem tesz",
    "honesty.sub":
      "A bizalom a legfontosabb. Ezeket a szabályokat soha nem szegjük meg — és még letöltés előtt nyilvánosan leírjuk, pontosan mit módosíthat a gépeden.",
    "honesty.cta": "Nézd meg, mit módosít",
    "honesty.status": "Szigorú szabály",
    "shots.eyebrow": "Nézd meg magad",
    "shots.title": "A valódi app, nem makett",
    "shots.sub": "Valódi képernyők a Tyverixből. Kattints bármelyikre a nagyításhoz.",
    "shots.pause": "Szünet",
    "shots.play": "Lejátszás",
    "pricing.eyebrow": "Árazás",
    "pricing.title": "Kezdd ingyen. Válts, ha készen állsz.",
    "pricing.sub": "Az ingyenes verzió örökre ingyenes marad. A Pro bármikor lemondható.",
    "pricing.freeName": "Ingyenes",
    "pricing.proName": "Pro",
    "pricing.forever": "örökre ingyenes",
    "pricing.perMonth": "havonta · bármikor lemondható",
    "pricing.trialBadge": "+1 nap Pro ajándékba",
    "pricing.freeCta": "Letöltés",
    "pricing.proCta": "Pro beszerzése",
    "pricing.note":
      "Minden letöltéshez jár 1 nap ingyenes Pro, hogy mindent kipróbálhass — bankkártya nélkül. Ha utána nem fizetsz elő, egyszerűen megmaradnak az ingyenes funkciók.",
    "pricing.comingSoon":
      "Az online Pro-vásárlás még nem elérhető — addig töltsd le az ingyenes verziót lent, és nézz vissza hamarosan.",
    "download.eyebrow": "Első lépések",
    "download.title": "Töltsd le a Tyverixet",
    "download.sub": "Kis méretű (1–4 MB) telepítő. Az új verziókat az app magától felajánlja.",
    "download.cta": "Letöltés Windowsra",
    "download.discordSub": "Csatlakozz a közösséghez",
    "download.ctaSub": "Ingyenes · +1 nap Pro",
    "download.version": "{v} verzió",
    "download.req": "Windows 10 vagy 11 (64 bites)",
    "download.changes": "Mit módosít a gépeden",
    "download.smartscreen": "Első indításkor a Windows kiírhatja: „A számítógép védelmet kapott” — ez új programoknál normális. Részletek a GYIK-ben.",
    "faq.eyebrow": "Kérdésed van?",
    "faq.title": "Gyakori kérdések",
    "faq.expand": "Összes kinyitása",
    "faq.collapse": "Összes becsukása",
    "footer.desc":
      "Őszinte Windows-optimalizáló játékosoknak. Átnézi a géped, valóban mér, és minden változtatás visszavonható.",
    "footer.tagline": "Mérhető. Visszafordítható. Biztonságos.",
    "footer.product": "Termék",
    "footer.transparency": "Átláthatóság",
    "footer.support": "Támogatás",
    ticker: [
      ["Gyorsítás", "15 beállítás", "mind visszaállítható"],
      ["Tisztítás", "9 biztonságos terület", "látod, mit töröl"],
      ["Teszt", "előtte–utána", "őszinte eredmény"],
      ["FPS", "valódi mérés", "nem becslés"],
      ["Kitalált szám", "0", "soha"],
      ["Automatikusan induló programok", "semmit nem töröl", "csak ki-be kapcsol"],
      ["Játék mód", "játék után", "minden visszaáll"],
      ["Gépellenőrzés", "memória · monitor · videókártya", "csak megnéz"],
      ["Windows", "10 és 11", ""],
      ["Verzió", "{v}", "magától frissül"],
    ],
    features: [
      ["diagnostics", "Gépellenőrzés", "Megkeresi azokat a hibákat, amik tényleg FPS-be kerülnek — például ha a memóriád lassabban megy, mint amire képes, vagy ha a 144 Hz-es monitorod csak 60 Hz-en fut. Semmit nem módosít, csak megmutatja, mi a gond és hol javíthatod.", ["Csak megnéz", "Memóriasebesség", "Monitor frissítése", "Videókártya"]],
      ["benchmark", "Előtte–utána teszt", "Játssz egy kicsit, változtass egy dolgon, majd játssz újra. A Tyverix összeveti a kettőt, és megmondja, hogy tényleg gyorsabb lett-e — vagy csak véletlen ingadozás volt.", ["Valódi FPS-mérés", "Őszinte eredmény"]],
      ["boost", "Gyorsító beállítások", "Olyan Windows-beállítások, amik tényleg hatnak a játékra. Mindegyiknél leírja, mire számíts, és előtte elmenti a régi értéket, így egy kattintással visszaállíthatod.", ["15 beállítás", "Régi érték elmentve", "Egy kattintással vissza"]],
      ["gamemode", "Játék mód", "Játék idejére maximális teljesítményre állítja a gépet, utána pedig pontosan visszaállít mindent úgy, ahogy volt.", ["Max teljesítmény", "Utána minden visszaáll", "Pro"]],
      ["cleaner", "Biztonságos tisztítás", "Csak olyan fájlokat töröl, amikre a gépnek nincs szüksége: ideiglenes fájlok, régi frissítések maradékai, hibajelentések és hasonlók. Minden tételnél látod, mit nyersz vele és mi a hátránya.", ["9 terület", "Használt fájlokhoz nem nyúl", "Visszaállítási pont"]],
      ["safety", "Biztonsági háló", "Bármilyen módosítás előtt mentést készíthetsz, és minden változtatás visszavonható. Egy helyen látod, mi történt a gépeden.", ["Visszaállítási pont", "Mentés", "Visszavonás"]],
    ],
    more: [
      ["monitor", "Élő gépfigyelő", "Valós időben látod, mennyire terhelt a processzor, a memória, a net és a lemez."],
      ["memory", "Memória felszabadítása", "Játék előtt felszabadítja a lefoglalt memóriát, és megmutatja, mennyit sikerült."],
      ["network", "Kapcsolat-ellenőrzés", "Megméri, mennyire gyors és stabil a kapcsolatod egy szerver felé — hasznos online meccs előtt."],
      ["scheduled", "Automatikus tisztítás", "Naponta magától lefuttatja a biztonságos tisztítást, és feljegyzi, mennyi helyet szabadított fel."],
      ["startup", "Automatikusan induló programok", "Kikapcsolhatod, ami feleslegesen indul el a Windowszal. Semmit nem töröl, bármikor visszakapcsolható."],
      ["processes", "Futó programok", "Látod, melyik program mennyit használ a gépedből, és bezárhatod, amelyikre nincs szükséged."],
    ],
    honesty: [
      ["Nincs kitalált szám", "Soha nem ír ki olyan FPS-t, hőfokot vagy terhelést, amit valójában nem mért meg."],
      ["Nem kapcsol ki fontos részeket", "Soha nem tilt le Windows-szolgáltatásokat olyan „gyorsításért”, aminek nincs mérhető haszna."],
      ["Nincs rejtett változtatás", "Soha nem csinál a hátad mögött olyat, amit nem lehet visszacsinálni."],
      ["Nincs üres ígéret", "Soha nem ígér „+50 FPS”-t vagy bármilyen számot, amit nem tud igazolni."],
      ["Mindent a nevén nevez", "Mindig pontosan azt írja ki, amit mért — nem kerekít felfelé, nem szépít."],
      ["A szerencse nem javulás", "Ha egy különbség csak véletlen ingadozás, nem nevezi javulásnak."],
    ],
    free: ["Élő gépfigyelő", "Biztonságos tisztítás", "Futó és automatikusan induló programok", "Gépellenőrzés", "1 nap ingyenes Pro"],
    pro: ["Minden, ami az Ingyenesben", "Játék mód", "Memória felszabadítása", "Kapcsolat-ellenőrzés", "Automatikus napi tisztítás", "Automatikus frissítés és elsőbbségi támogatás"],
    faq: [
      ["Biztonságos a Tyverix?", "Igen. Minden változtatás előtt elmenti a régi beállítást, így bármikor visszaállíthatod. Ha valamit nem lehet visszacsinálni (például egy fájl törlését), azt előre jól láthatóan jelzi, és csak a jóváhagyásod után csinálja meg. A teljes listát itt olvashatod: <a href=\"changes.html\">Mit módosít</a>."],
      ["Tényleg több FPS-em lesz?", "Őszintén: a gépedtől függ. Egy jól beállított gépen egyetlen beállítás sem csinál csodát. A legnagyobb javulás általában abból jön, ha valami rosszul van beállítva — például lassabban megy a memória, mint amire képes, vagy a monitor nem a legnagyobb frissítési értéken fut. Ezeket a Gépellenőrzés megtalálja. Az előtte–utána teszttel pedig magad lemérheted, hogy egy változtatás segített-e."],
      ["Hogyan tudom visszaállítani, amit módosított?", "Minden beállítás egyenként is visszaállítható, vagy egyszerre az összes a Biztonság oldalon, ahol visszaállítási pontot is készíthetsz. A Játék mód a játék végén magától visszaállít mindent."],
      ["Miért kér rendszergazdai engedélyt?", "Mert a Windows bizonyos beállításokat (például az energiagazdálkodást) csak rendszergazdai engedéllyel enged módosítani. A Tyverix csak azt módosítja, ami a Mit módosít oldalon szerepel."],
      ["Miért figyelmeztet a Windows telepítéskor?", "Új, kevésbé ismert programoknál a Windows kiírja, hogy „A számítógép védelmet kapott”, amíg a program nem kap egy drága, speciális digitális aláírást. Ez nem vírusjelzés. Kattints a „További információ”, majd a „Futtatás mindenképp” gombra."],
      ["Kikapcsol Windows-szolgáltatásokat vagy töröl rendszerfájlokat?", "Nem. Az ilyen „gyorsítások” valójában nem hoznak mérhető javulást, viszont hibákat okozhatnak — ezért a Tyverix nem csinál ilyet."],
      ["Mi a különbség az Ingyenes és a Pro között?", "Az Ingyenesben benne van a gépfigyelő, a biztonságos tisztítás, a futó és automatikusan induló programok kezelése és a gépellenőrzés. A Pro ehhez hozzáadja a Játék módot, a memória felszabadítását, a kapcsolat-ellenőrzést és az automatikus napi tisztítást. Minden letöltéshez jár 1 nap ingyenes Pro, bankkártya nélkül — ha utána nem fizetsz elő, az ingyenes funkciók megmaradnak."],
      ["Hogyan frissül?", "Az app szól, ha van új verzió, és egy kattintással frissíthetsz. Minden változást az <a href=\"changelog.html\">Újdonságok</a> oldalon látsz."],
      ["Hol kérhetek segítséget?", "Írj a <a href=\"mailto:support@tyverix.com\">support@tyverix.com</a> címre, vagy csatlakozz a <a href=\"https://discord.me/tyverix\" target=\"_blank\" rel=\"noopener\">Discord szerverünkhöz</a>, ahol kérdezhetsz, hibát jelezhetsz, és más játékosokkal is beszélgethetsz."],
    ],
  },

  de: {
    "nav.features": "Funktionen",
    "nav.benchmark": "Vorher-nachher-Test",
    "nav.honesty": "Ehrlichkeit",
    "nav.pricing": "Preise",
    "nav.faq": "FAQ",
    "nav.download": "Download",
    "nav.account": "Konto",
    "nav.changelog": "Änderungen",
    "nav.changes": "Was es ändert",
    demo: "Demo",
    realShot: "Echter Screenshot",
    "hero.pill": "Niemals gefälschte Zahlen.",
    "hero.title1": "Windows fürs Gaming optimieren —",
    "hero.title2": "ehrlich.",
    "hero.sub":
      "Tyverix macht deinen PC schneller und flüssiger für Spiele — nur mit Einstellungen, die wirklich zählen, die du jederzeit rückgängig machen kannst und die Windows nicht kaputt machen. Kein falscher „FPS-Boost“, kein Zauberknopf.",
    "hero.ctaDownload": "Kostenlos laden",
    "hero.ctaTour": "So funktioniert es",
    "hero.hint": "Windows 10 & 11 · jeder Download enthält 1 Tag Pro gratis",
    "hero.fbLeft": "Einstellungen umkehrbar",
    "hero.gpuNa": "Nicht erfunden",
    "hero.cpuHistory": "Prozessor-Auslastung",
    "hero.last60": "letzte 60 s",
    "hero.tx1": "Tempo-Einstellung eingeschaltet",
    "hero.tx1sub": "Alter Wert zuerst gesichert",
    "hero.undo": "Umkehrbar",
    "hero.tx2": "Spielmodus beendet",
    "hero.tx2sub": "Alles wie vorher zurückgesetzt",
    "hero.restored": "Wiederhergestellt",
    "tools.label": "Nutzt nur die eigenen, offiziellen Werkzeuge von Windows",
    "stats.tweaks": "Tempo-Einstellungen",
    "stats.tweaksTrend": "Jede mit einem Klick rückgängig",
    "stats.cleaner": "Bereiche, die sicher gereinigt werden",
    "stats.cleanerTrend": "Du siehst jeweils Vor- und Nachteile",
    "stats.fake": "Erfundene Zahlen (FPS, Temperatur, Auslastung)",
    "stats.fakeTrend": "Was es nicht messen kann, sagt es",
    "stats.trial": "Tag Pro gratis bei jedem Download",
    "stats.trialTrend": "Keine Bankkarte nötig",
    "features.eyebrow": "Echte Funktionen",
    "features.title": "Alles, was du brauchst — nichts, was du nicht brauchst",
    "features.sub":
      "Es zeigt, was deinen PC bremst, lässt dich testen, ob eine Änderung wirklich geholfen hat — und alles lässt sich rückgängig machen.",
    "features.zoom": "Klicke auf das Bild für die volle Größe.",
    "bench.eyebrow": "Vorher-nachher-Test",
    "bench.title": "Es sagt dir die Wahrheit — auch wenn sich nichts verbessert hat",
    "bench.sub":
      "Spiel ein bisschen, ändere eine Sache, spiel noch einmal. Tyverix vergleicht beides und sagt nur „schneller“, wenn der Unterschied echt ist — nicht bloß zufällige Schwankung.",
    "bench.window": "Vorher-nachher-Test · Counter-Strike 2",
    "bench.example": "Nur ein Beispiel",
    "bench.sHelped": "Hat geholfen",
    "bench.sNone": "Keine Änderung",
    "bench.sHurt": "Schlechter",
    "bench.runA": "Vorher",
    "bench.runB": "Nachher",
    "bench.axis": "FPS Sekunde für Sekunde",
    "bench.avg": "Durchschnitts-FPS",
    "bench.fps": "Echt gemessen während du spielst",
    "bench.diff": "Unterschied",
    "bench.ci": "Sicherer Bereich: zwischen {lo} und {hi} FPS",
    "bench.verdict": "Ergebnis",
    "bench.vHelped": "Wirklich schneller",
    "bench.vNone": "Kein echter Unterschied",
    "bench.vHurt": "Langsamer",
    "bench.eHelped": "Der Gewinn ist klar größer als zufällige Schwankungen — die Änderung hat sich gelohnt.",
    "bench.eNone": "Der Unterschied ist so klein wie normale Schwankungen, deshalb nennt Tyverix es keine Verbesserung.",
    "bench.eHurt": "Es ist schlechter geworden — mach es mit einem Klick rückgängig, die alte Einstellung wurde gesichert.",
    "bench.foot": "Diese Zahlen sind nur Beispiele für die drei möglichen Ergebnisse, keine Messung deines PCs.",
    "honesty.eyebrow": "Ehrlich konzipiert",
    "honesty.title": "Was Tyverix niemals tut",
    "honesty.sub":
      "Vertrauen ist das Wichtigste. Diese Regeln brechen wir nie — und wir veröffentlichen genau, was es an deinem PC ändern kann, noch bevor du es herunterlädst.",
    "honesty.cta": "Ansehen, was es ändert",
    "honesty.status": "Feste Regel",
    "shots.eyebrow": "Sieh es selbst",
    "shots.title": "Die echte App, kein Mockup",
    "shots.sub": "Echte Bildschirme aus Tyverix. Zum Vergrößern anklicken.",
    "shots.pause": "Pause",
    "shots.play": "Abspielen",
    "pricing.eyebrow": "Preise",
    "pricing.title": "Gratis starten. Upgraden, wenn du bereit bist.",
    "pricing.sub": "Die Gratis-Version bleibt für immer kostenlos. Pro ist jederzeit kündbar.",
    "pricing.freeName": "Gratis",
    "pricing.proName": "Pro",
    "pricing.forever": "für immer kostenlos",
    "pricing.perMonth": "pro Monat · jederzeit kündbar",
    "pricing.trialBadge": "+1 Tag Pro geschenkt",
    "pricing.freeCta": "Download",
    "pricing.proCta": "Pro holen",
    "pricing.note":
      "Jeder Download enthält 1 Tag Pro gratis, damit du alles ausprobieren kannst — ohne Bankkarte. Wenn du danach nicht abonnierst, behältst du einfach die Gratis-Funktionen.",
    "pricing.comingSoon":
      "Online-Pro-Käufe sind noch nicht möglich — lade vorerst unten die kostenlose Version herunter und schau bald wieder vorbei.",
    "download.eyebrow": "Loslegen",
    "download.title": "Tyverix herunterladen",
    "download.sub": "Ein kleiner Installer (1–4 MB). Neue Versionen bietet die App automatisch an.",
    "download.cta": "Für Windows laden",
    "download.discordSub": "Tritt der Community bei",
    "download.ctaSub": "Kostenlos · +1 Tag Pro",
    "download.version": "Version {v}",
    "download.req": "Windows 10 oder 11 (64-Bit)",
    "download.changes": "Was es an deinem PC ändert",
    "download.smartscreen": "Beim ersten Start zeigt Windows evtl. „Der Computer wurde durch Windows geschützt“ — bei neuen Programmen normal. Details in der FAQ.",
    "faq.eyebrow": "Fragen?",
    "faq.title": "Häufig gefragt",
    "faq.expand": "Alle öffnen",
    "faq.collapse": "Alle schließen",
    "footer.desc":
      "Ein ehrlicher Windows-Optimierer für Gamer. Er prüft deinen PC, misst wirklich, und jede Änderung ist umkehrbar.",
    "footer.tagline": "Messbar. Umkehrbar. Sicher.",
    "footer.product": "Produkt",
    "footer.transparency": "Transparenz",
    "footer.support": "Support",
    ticker: [
      ["Beschleunigung", "15 Einstellungen", "alle umkehrbar"],
      ["Reinigung", "9 sichere Bereiche", "du siehst, was gelöscht wird"],
      ["Test", "vorher vs. nachher", "ehrliches Ergebnis"],
      ["FPS", "echt gemessen", "nicht geschätzt"],
      ["Erfundene Zahlen", "0", "niemals"],
      ["Autostart-Programme", "nichts wird gelöscht", "nur an/aus"],
      ["Spielmodus", "nach dem Spiel", "alles zurückgesetzt"],
      ["PC-Check", "Speicher · Monitor · Grafikkarte", "schaut nur"],
      ["Windows", "10 & 11", ""],
      ["Version", "{v}", "aktualisiert sich selbst"],
    ],
    features: [
      ["diagnostics", "PC-Check", "Findet die Probleme, die dich wirklich FPS kosten — zum Beispiel Arbeitsspeicher, der langsamer läuft als möglich, oder einen 144-Hz-Monitor, der auf 60 Hz steht. Es ändert nichts, sondern zeigt dir nur, was falsch ist und wo du es behebst.", ["Schaut nur", "Speichertempo", "Monitor-Hz", "Grafikkarte"]],
      ["benchmark", "Vorher-nachher-Test", "Spiel ein bisschen, ändere eine Sache und spiel noch einmal. Tyverix vergleicht beides und sagt dir, ob es wirklich schneller wurde — oder nur Zufall war.", ["Echte FPS-Messung", "Ehrliches Ergebnis"]],
      ["boost", "Tempo-Einstellungen", "Windows-Einstellungen, die Spiele wirklich beeinflussen. Jede erklärt, was dich erwartet, und sichert vorher deinen alten Wert — so machst du sie mit einem Klick rückgängig.", ["15 Einstellungen", "Alter Wert gesichert", "Ein Klick zurück"]],
      ["gamemode", "Spielmodus", "Stellt deinen PC beim Spielen auf maximale Leistung und setzt danach alles genau so zurück, wie es war.", ["Maximale Leistung", "Danach alles zurück", "Pro"]],
      ["cleaner", "Sichere Reinigung", "Löscht nur Dateien, die dein PC nicht braucht: temporäre Dateien, Reste alter Updates, Fehlerberichte und Ähnliches. Bei jedem Punkt siehst du, was du gewinnst und was der Nachteil ist.", ["9 Bereiche", "Belegte Dateien bleiben", "Wiederherstellungspunkt"]],
      ["safety", "Sicherheitsnetz", "Vor jeder Änderung kannst du eine Sicherung anlegen, und jede Änderung lässt sich rückgängig machen. Du siehst an einem Ort, was auf deinem PC passiert ist.", ["Wiederherstellungspunkt", "Sicherung", "Rückgängig"]],
    ],
    more: [
      ["monitor", "Live-PC-Monitor", "Sieh in Echtzeit, wie ausgelastet Prozessor, Speicher, Internet und Festplatte sind."],
      ["memory", "Speicher freigeben", "Gibt vor dem Spiel belegten Speicher frei und zeigt, wie viel es wirklich war."],
      ["network", "Verbindungs-Check", "Misst, wie schnell und stabil deine Verbindung zu einem Server ist — praktisch vor einem Online-Match."],
      ["scheduled", "Automatische Reinigung", "Führt die sichere Reinigung täglich von selbst aus und notiert, wie viel Platz frei wurde."],
      ["startup", "Autostart-Programme", "Schalte Programme ab, die grundlos mit Windows starten. Nichts wird gelöscht, du kannst sie jederzeit wieder einschalten."],
      ["processes", "Laufende Programme", "Sieh, welches Programm wie viel von deinem PC nutzt, und schließe die, die du nicht brauchst."],
    ],
    honesty: [
      ["Keine erfundenen Zahlen", "Es zeigt nie FPS, Temperaturen oder Auslastung, die es nicht wirklich gemessen hat."],
      ["Schaltet nichts Wichtiges ab", "Es deaktiviert nie Windows-Dienste für einen „Boost“ ohne messbaren Nutzen."],
      ["Keine versteckten Änderungen", "Es tut nie heimlich etwas, das sich nicht rückgängig machen lässt."],
      ["Keine leeren Versprechen", "Es verspricht nie „+50 FPS“ oder eine andere Zahl, die es nicht belegen kann."],
      ["Klare Bezeichnungen", "Es zeigt immer genau das, was es gemessen hat — nichts aufgerundet, nichts geschönt."],
      ["Zufall ist keine Verbesserung", "Ist ein Unterschied nur zufällige Schwankung, nennt es ihn keine Verbesserung."],
    ],
    free: ["Live-PC-Monitor", "Sichere Reinigung", "Laufende & Autostart-Programme", "PC-Check", "1 Tag Pro gratis"],
    pro: ["Alles aus Gratis", "Spielmodus", "Speicher freigeben", "Verbindungs-Check", "Automatische tägliche Reinigung", "Automatische Updates & Priority-Support"],
    faq: [
      ["Ist Tyverix sicher?", "Ja. Vor jeder Änderung sichert es deine alte Einstellung, sodass du sie jederzeit zurückholen kannst. Wenn sich etwas nicht rückgängig machen lässt (z. B. das Löschen einer Datei), sagt es dir das vorher deutlich und tut es erst nach deiner Bestätigung. Die ganze Liste steht hier: <a href=\"changes.html\">Was es ändert</a>."],
      ["Bekomme ich wirklich mehr FPS?", "Ehrlich: Das hängt von deinem PC ab. Auf einem gut eingestellten PC wirkt keine Einstellung Wunder. Der größte Gewinn kommt meist daher, dass etwas falsch eingestellt ist — etwa Arbeitsspeicher, der langsamer läuft als möglich, oder ein Monitor, der nicht mit voller Bildwiederholrate läuft. Das findet der PC-Check. Mit dem Vorher-nachher-Test misst du selbst, ob eine Änderung geholfen hat."],
      ["Wie mache ich Änderungen rückgängig?", "Jede Einstellung lässt sich einzeln zurücksetzen, oder alle auf einmal auf der Sicherheits-Seite, wo du auch einen Wiederherstellungspunkt anlegen kannst. Der Spielmodus setzt nach dem Spielen alles von selbst zurück."],
      ["Warum braucht es Administratorrechte?", "Weil Windows manche Einstellungen (z. B. die Energieoptionen) nur mit Administratorrechten ändern lässt. Tyverix ändert nur, was auf der Seite „Was es ändert“ steht."],
      ["Warum warnt Windows bei der Installation?", "Bei neuen, weniger bekannten Programmen zeigt Windows „Der Computer wurde durch Windows geschützt“, bis das Programm eine teure spezielle Signatur hat. Das ist keine Virenwarnung. Klicke auf „Weitere Informationen“ und dann auf „Trotzdem ausführen“."],
      ["Schaltet es Windows-Dienste ab oder löscht Systemdateien?", "Nein. Solche angeblichen Beschleunigungen bringen keine messbare Verbesserung, können aber Probleme verursachen — deshalb macht Tyverix so etwas nicht."],
      ["Was ist der Unterschied zwischen Gratis und Pro?", "Gratis enthält den PC-Monitor, die sichere Reinigung, laufende und Autostart-Programme sowie den PC-Check. Pro ergänzt Spielmodus, Speicher freigeben, Verbindungs-Check und automatische tägliche Reinigung. Jeder Download enthält 1 Tag Pro gratis, ohne Bankkarte — wenn du danach nicht abonnierst, behältst du die Gratis-Funktionen."],
      ["Wie wird es aktualisiert?", "Die App meldet sich, wenn es eine neue Version gibt, und du aktualisierst mit einem Klick. Alle Änderungen stehen auf der Seite <a href=\"changelog.html\">Änderungen</a>."],
      ["Wo bekomme ich Hilfe?", "Schreib an <a href=\"mailto:support@tyverix.com\">support@tyverix.com</a> oder tritt unserem <a href=\"https://discord.me/tyverix\" target=\"_blank\" rel=\"noopener\">Discord-Server</a> bei — dort kannst du Fragen stellen, Probleme melden und dich mit anderen Spielern austauschen."],
    ],
  },
};

let CURRENT_LANG = "en";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
const CHECK = '<svg viewBox="0 0 16 16"><polyline points="2,8 6,12 14,4"/></svg>';

function apply(lang) {
  const dict = I18N[lang] || I18N.en;
  CURRENT_LANG = I18N[lang] ? lang : "en";
  document.documentElement.lang = CURRENT_LANG;
  const t = (key) => dict[key] ?? I18N.en[key] ?? "";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] != null) el.textContent = dict[key];
  });

  // The version badges read from APP_VERSION rather than from the file name, so
  // they always state what the download button is about to hand over.
  document.querySelectorAll("[data-version]").forEach((el) => {
    el.textContent = t("download.version").replace("{v}", APP_VERSION);
  });

  // Ticker (duplicated so the CSS loop is seamless).
  const ticker = dict.ticker
    .map(
      ([sym, val, tag]) =>
        `<div class="ticker-item"><span class="ticker-sym">${esc(sym)}</span><span class="ticker-val">${esc(val.replace("{v}", APP_VERSION))}</span>${tag ? `<span class="ticker-tag">${esc(tag)}</span>` : ""}</div>`,
    )
    .join("");
  document.getElementById("tickerTrack").innerHTML = ticker + ticker;

  const tools = TOOLS.map((n) => `<div class="tool-item">${esc(n)}</div>`).join("");
  document.getElementById("toolsTrack").innerHTML = tools + tools;

  // Feature sticky stack + the matching real screenshots.
  document.getElementById("stickyCards").innerHTML = dict.features
    .map(
      ([key, title, body, pills], i) => `
      <button class="sticky-card${i === 0 ? " active" : ""}" data-panel="${i}" data-label="${esc(title)}">
        <div class="sticky-card-top"><div class="icon-box">${svg(key)}</div><h3>${esc(title)}</h3></div>
        <p>${esc(body)}</p>
        <div class="pills">${pills.map((p) => `<span class="pill">${esc(p)}</span>`).join("")}</div>
      </button>`,
    )
    .join("");
  document.getElementById("panelShots").innerHTML = dict.features
    .map(
      ([key, title], i) =>
        `<img src="${FEATURE_SHOTS[key]}" alt="Tyverix — ${esc(title)}" data-panel-img="${i}" class="${i === 0 ? "active" : ""}" loading="${i === 0 ? "eager" : "lazy"}" />`,
    )
    .join("");
  document.getElementById("panelLabel").textContent = `Tyverix · ${dict.features[0][1]}`;

  document.getElementById("moreGrid").innerHTML = dict.more
    .map(
      ([key, title, body]) =>
        `<div class="mini-card silk-reveal"><div class="icon-box">${svg(key)}</div><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`,
    )
    .join("");

  document.getElementById("ruleGrid").innerHTML = dict.honesty
    .map(
      ([name, desc]) =>
        `<div class="rule"><div class="icon-box amber">${svg("x")}</div><div class="rule-name">${esc(name)}</div><div class="rule-desc">${esc(desc)}</div><div class="rule-status">${esc(t("honesty.status"))}</div></div>`,
    )
    .join("");

  const shots = ALL_SHOTS.map(
    ([file, title]) => `
      <div class="shot-card">
        <div class="win-bar"><div class="win-dots"><span></span><span></span><span></span></div><span class="win-title">${esc(title)}</span></div>
        <img src="screenshots/${file}.png" alt="Tyverix — ${esc(title)}" loading="lazy" />
      </div>`,
  ).join("");
  document.getElementById("shotsTrack").innerHTML = shots + shots;

  const li = (items) => items.map((x) => `<li>${CHECK}<span>${esc(x)}</span></li>`).join("");
  document.getElementById("free-list").innerHTML = li(dict.free);
  document.getElementById("pro-list").innerHTML = li(dict.pro);

  // FAQ answers are static strings from this file and may contain links.
  document.getElementById("faqList").innerHTML = dict.faq
    .map(
      ([q, a]) => `
      <div class="faq-item">
        <button class="faq-q" aria-expanded="false"><span class="faq-q-text">${esc(q)}</span><svg class="faq-chevron" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9"/></svg></button>
        <div class="faq-a"><div><p>${a}</p></div></div>
      </div>`,
    )
    .join("");

  document.querySelectorAll("[data-langs] button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === CURRENT_LANG);
  });

  // Opening this file directly (file://) restricts localStorage in some
  // browsers; fail silently rather than breaking language switching.
  try {
    localStorage.setItem("bf.site.lang", CURRENT_LANG);
  } catch (e) {
    /* ignored — not essential, just remembers the choice for next visit */
  }

  document.dispatchEvent(new CustomEvent("tyverix:lang", { detail: { lang: CURRENT_LANG, dict, t } }));
}

// BUY_URL is still a placeholder until Stripe (or another processor) is
// actually wired up — pointing the button at it leads to a broken
// AccessDenied page. Until a real link is configured, intercept the click
// and explain instead of navigating somewhere broken.
function setupBuyButton() {
  const buy = document.getElementById("buy");
  if (!buy) return;

  // 1) A real payment link takes priority once configured.
  if (!BUY_URL.includes("your-payment-link")) {
    buy.href = BUY_URL;
    return;
  }

  // 2) Otherwise, if online accounts are configured, "Get Pro" leads to the
  //    account page where the visitor can register / sign in.
  const cfg = window.TYVERIX_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    buy.href = "account.html";
    return;
  }

  // 3) Last resort (nothing configured yet): explain and point to download.
  buy.href = "#download";
  buy.addEventListener("click", (e) => {
    e.preventDefault();
    const dict = I18N[CURRENT_LANG] || I18N.en;
    alert(dict["pricing.comingSoon"] || I18N.en["pricing.comingSoon"]);
    document.getElementById("download")?.scrollIntoView({ behavior: "smooth" });
  });
}

function initI18n() {
  // Prefer the site config's URL (a direct, self-hosted installer) so the
  // download lands straight on the visitor's machine instead of routing them
  // to a GitHub release page.
  const dl = (window.TYVERIX_CONFIG && window.TYVERIX_CONFIG.DOWNLOAD_URL) || DOWNLOAD_URL;
  const dlEl = document.getElementById("download-link");
  dlEl.href = dl;
  // Name the saved file after the version so a visitor who downloads twice a
  // few releases apart can tell the two installers apart in their Downloads
  // folder. The attribute is ignored for cross-origin URLs, which is exactly
  // the GitHub-release fallback case where the name is already versioned.
  dlEl.setAttribute("download", `Tyverix-Setup-${APP_VERSION}.exe`);
  setupBuyButton();

  document.querySelectorAll("[data-langs] button").forEach((b) => {
    b.addEventListener("click", () => apply(b.dataset.lang));
  });
}
