(function initAWAExtension() {
  function injectScript(fileName) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(fileName);
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }
  injectScript('var.js');

  const collected = {
    arp_tier: 0, arp_balance: 0, arp_lifetime: 0,
    has_epsilon_rewards: false, epsilon_balance: 0,
    bonusCalendarArp: 0, artifactLangDiscount: 0,
    fragment_balance: 0, arpMultiplier: 1,
    monthly_logins: {}, consecutive_logins: {}
  };

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== 'AWA_IFRAME_BRIDGE') return;
    const g = msg.detail || {};
    collected.monthly_logins     = Object.keys(g.monthly_logins || {}).length ? g.monthly_logins : collected.monthly_logins;
    collected.consecutive_logins = Object.keys(g.consecutive_logins || {}).length ? g.consecutive_logins : collected.consecutive_logins;
    collected.userActiveArtifacts= Object.keys(g.userActiveArtifacts || {}).length ? g.userActiveArtifacts : collected.userActiveArtifacts;
    window.monthly_logins     = collected.monthly_logins;
    window.consecutive_logins = collected.consecutive_logins;
  });

  document.addEventListener('AWA_GLOBALS_READY', (e) => {
    const g = e.detail || {};
    Object.assign(collected, g);

    window.arp_tier             = g.arp_tier;
    window.arp_balance          = g.arp_balance;
    window.arp_lifetime         = g.arp_lifetime;
    window.has_epsilon_rewards  = g.has_epsilon_rewards;
    window.epsilon_balance      = g.epsilon_balance;
    window.bonusCalendarArp     = g.bonusCalendarArp;
    window.artifactLangDiscount = g.artifactLangDiscount;
    window.fragment_balance     = g.fragment_balance;
    window.arpMultiplier        = g.arpMultiplier;
    window.monthly_logins       = g.monthly_logins;
    window.consecutive_logins   = g.consecutive_logins;

    startMeguminCenter();
  });
})();

async function startMeguminCenter() {
  'use strict';
    let currentLang = localStorage.getItem('awa-opt-language') || 'English';
    function t(key, vars = {}) {
        let str = translations[currentLang]?.[key] || translations.en?.[key] || key;
        for (const [k, v] of Object.entries(vars)) {str = str.replace(new RegExp(`{${k}}`, 'g'), v);}
        return str;}

    let artifactsBonus    = { discord:0, steam:0, twitch:0, timesite:0, playtime:0 };
    let equippedArtifacts = [];
    let cachedQuestsHtml  = null;
    let ceStartTs = 0, ceEndTs = 0;
    let currentTab      = sessionStorage.getItem('awa-current-tab') || 'artifacts';
    let cachedReminders = null;
    let cacheDate       = null;

    const ONE_DAY    = 24*60*60*1000;
    const TWO_DAY    = ONE_DAY*2;
    const GH_EVENT   = 'https://raw.githubusercontent.com/MeguminShiro/awa-megumin-alien-center/main/event.json';
    const GH_TTL  = 60 * 60 * 1000;
    const GH_VERSION   = 'https://raw.githubusercontent.com/MeguminShiro/awa-megumin-alien-center/main/ver.json';
    const CURRENT_VERSION = (chrome?.runtime?.getManifest?.() || browser?.runtime?.getManifest?.()).version;

    async function fetchEventConfig(){
        const now    = Date.now();
        const stored = localStorage.getItem('awaEventConfig');
        const then   = +localStorage.getItem('awaEventConfig_ts')||0;
        if(stored && now-then < GH_TTL){return JSON.parse(stored);}
        const r = await fetch(GH_EVENT+'?_='+now, {cache:'no-store'});
        if(!r.ok) throw new Error(r.status);
        const j = await r.json();
        localStorage.setItem('awaEventConfig',   JSON.stringify(j));
        localStorage.setItem('awaEventConfig_ts', String(now));
        return j;
    }
    async function fetchVersionInfo() {
        const now    = Date.now();
        const stored = localStorage.getItem('awaVersionInfo');
        const then   = +localStorage.getItem('awaVersionInfo_ts') || 0;
        if (stored && now - then < GH_TTL) {
            return JSON.parse(stored);
        }
        const r = await fetch(GH_VERSION + '?_=' + now, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        localStorage.setItem('awaVersionInfo', JSON.stringify(j));
        localStorage.setItem('awaVersionInfo_ts', String(now));
        return j;
    }
    (async () => {
        try {
            const data = await fetchVersionInfo();
            if (data.latest !== CURRENT_VERSION) {
                let changelogHtml = "";
                for (const section in data.changelog) {
                    changelogHtml += `<div><strong>${section}</strong><ul>`;
                    data.changelog[section].forEach(item => {
                        changelogHtml += `<li>${item}</li>`;
                    });
                    changelogHtml += "</ul></div>";
                }

                const banner = document.createElement("div");
                banner.id = "awaUpdateBanner";
                banner.innerHTML = `
          <span id="awaUpdateBannerClose">✖</span>
          <strong>Update available!</strong> (Installed: ${CURRENT_VERSION}, Latest: ${data.latest})<br>
          ${changelogHtml}
          <a href="${data.url}" target="_blank">Download latest version</a>
        `;
                document.body.prepend(banner);

                document.getElementById("awaUpdateBannerClose").addEventListener("click", () => {
                    banner.remove();
                });
            }
        } catch (err) {
            console.error("Version check failed", err);
        }
    })();
    const cfg         = await fetchEventConfig();
    // --- Patch: supporto nuovo formato event.json (communityEvents array) ---
    if (!cfg.SCELinkBase && Array.isArray(cfg.communityEvents) && cfg.communityEvents.length) {
        const nowTs  = Date.now();
        const active = cfg.communityEvents.find(e => nowTs >= new Date(e.start).getTime() && nowTs < new Date(e.end).getTime());
        const next   = cfg.communityEvents.find(e => nowTs < new Date(e.start).getTime());
        const ev     = active || next || cfg.communityEvents[0];
        cfg.SCELinkBase = ev.link;
        cfg.SCEStart    = ev.start;
        cfg.SCETime     = ev.end;
    }
    // --- fine patch ---
    const chosenTime  = new Date(cfg.chosenTime).getTime();
    const promoTime   = new Date(cfg.promoTime).getTime();
    const SCETime     = new Date(cfg.SCETime).getTime();
    const SCEStart    = new Date(cfg.SCEStart).getTime();
    const promoStart  = new Date(cfg.promoStart).getTime();
    let SCELinkBase = cfg.SCELinkBase
        ? (u => `${location.protocol}//${location.host}${u.pathname}${u.search}`)(new URL(cfg.SCELinkBase))
        : null;

    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(faLink);

    function formatCountdown(diff) {
        if (diff <= 0) {return "⏰ 00:00";}
        const d = Math.floor(diff / ONE_DAY);
        const h = Math.floor((diff % ONE_DAY) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return d > 0
            ? `⏰ ${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
            : `⏰ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    function getNextUtcHour(hour) {
        const now = new Date();
        const next = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),hour, 0, 0));
        if (next.getTime() <= Date.now()) {next.setUTCDate(next.getUTCDate() + 1);}
        return next;
    }
    function getNextMondayMidnightUTC() {
        const now = new Date();
        const today = now.getUTCDay();
        const daysUntilMon = (8 - today) % 7 || 7;
        const next = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate() + daysUntilMon,0,0,0));
        return next;
    }
    function updateCountdowns() {
        const cd00  = formatCountdown(getNextUtcHour(0) - Date.now());
        const cd04  = formatCountdown(getNextUtcHour(4) - Date.now());
        const cdMon = formatCountdown(getNextMondayMidnightUTC() - Date.now());
        document.querySelectorAll('.countdown').forEach(el => {switch(el.dataset.type) {
            case 'cd04' : el.textContent = cd04; break;
            case 'cdMon': el.textContent = cdMon; break;
            default     : el.textContent = cd00; break;}});
    }

    async function loadCommunityEventInfo() {
        const statusEl = document.getElementById("seCommunityEventStatus");
        const timerEl  = document.getElementById("seCommunityEventTimer");
        statusEl.textContent = "…";
        timerEl.innerHTML    = "…";
        timerEl.className    = "";

        try {
            const html = await fetch(SCELinkBase, { credentials: "same-origin" }).then(r => r.ok ? r.text() : Promise.reject(r.status));
            const doc = new DOMParser().parseFromString(html, "text/html");
            const startTs = new Date(cfg.SCEStart).getTime();
            const endTs   = new Date(cfg.SCETime).getTime() - 3600e3;
            ceStartTs = startTs;
            ceEndTs   = endTs;
            const now = Date.now();
            if (now < startTs) {
                statusEl.textContent = "⏳";
                timerEl.innerHTML    = `<span class="countdown-pre">${ formatCountdown(startTs - now) }</span>`;
                return;}
            if (now > endTs) {
                statusEl.textContent = "-";
                timerEl.textContent  = t('ended');
                timerEl.classList.add("countdown-ended");
                return;}
            const allCells      = Array.from(doc.querySelectorAll(".carousel-cell"));
            const unlockedCells = allCells.filter(cell => cell.querySelector("i.fa-square-check.text-success"));
            if (!unlockedCells.length) {
                statusEl.textContent = "▶️";
                timerEl.innerHTML    = `<span class="countdown-live">${ formatCountdown(endTs - now) }</span>`;
                return;}
            let sumFrag = 0, sumARP = 0, bonusARP = 0;
            unlockedCells.forEach(c => {
                const txt = c.querySelector("h3")?.textContent || "";
                const val = parseInt(txt.replace(/\D/g, "")) || 0;
                if (/fragment/i.test(txt)) sumFrag += val;
                else                       sumARP  += val;
                const boosted = Math.ceil(val * arpMultiplier);
                bonusARP += boosted - val;});
            const lastCell = unlockedCells[unlockedCells.length - 1];
            let mlNum = "?";
            const m = lastCell.querySelector("p:last-child")?.textContent.match(/Milestone\s+(\d+)/);
            if (m) mlNum = m[1];
            statusEl.innerHTML = `<a href="${SCELinkBase}" target="_blank">✅ M${mlNum}</a>`;
            const rewardLine = sumFrag
            ? `${sumFrag} 🪨<br>${sumARP}${bonusARP ? ` + ${bonusARP}` : ""} ARP`
                : `${sumARP}${bonusARP ? ` + ${bonusARP}` : ""} ARP`;
            const cdText    = formatCountdown(endTs - now);
            const timerLine = `<span class="countdown-live">${cdText}</span>`;
            timerEl.innerHTML = rewardLine + "<br>" + timerLine;
        } catch (err) {
            console.error("CE fetch/parse error:", err);
            statusEl.textContent     = "❌";
            timerEl.textContent      = "";
            timerEl.style.color      = "#DC3545";
            timerEl.style.fontWeight = "bold";
        }
    }

    const statusDiv = document.createElement('div');
    statusDiv.id = "arpStatus";
    const showSrp = getPref('awa-opt-uk-srp', false);
    statusDiv.innerHTML = `
    <div id="header" style="display:flex; justify-content:space-between; align-items:center;">
      <button id="toggleButton" title="Hide Widget">X</button>
      <div style="text-align:right;">
        <div class="top-row">
          TIER <span id="arpTier" class="num">${typeof arp_tier!=='undefined'?arp_tier:''}</span>｜
          ARP <span id="arpBalance" class="num">${typeof arp_balance!=='undefined'?arp_balance.toLocaleString():''}</span>
          ${showSrp ? `｜ SRP <span id="srpBalance" class="num">${
          typeof arp_balance!=='undefined' ? Math.floor(arp_balance/700).toLocaleString() : ''
}</span>` : ''}
        </div>
        <div class="bottom-row">
          LIFETIME ARP <span id="arpLifetime" class="num">${typeof arp_lifetime!=='undefined'?arp_lifetime.toLocaleString():''}</span>
        </div>
      </div>
    </div>
    <div class="contents">
      <div class="tabs">
        <button class="tab-button" data-tab="artifacts">${t('artifacts')}</button>
        <button class="tab-button" data-tab="arpDetails">${t('details')}</button>
        <button class="tab-button" data-tab="info">${t('info')}</button>
        <button class="tab-button" data-tab="gameVault">🏦 ${t('gameVault')}</button>
        <button class="tab-button" data-tab="arpLog">💰 ${t('arpLog')}</button>
        <button class="tab-button" data-tab="communityGA">🧑‍🤝‍🧑 ${t('communityGA')}</button>
        <button class="tab-button" data-tab="giveaways">🎁 ${t('GA')}</button>
      </div>
      <div id="tabContentMEG" class="tab-content"></div>
    </div>
  `;
    document.body.appendChild(statusDiv);
    statusDiv.classList.add('minimized');

    function renderWidget() {
        const statusDiv = document.getElementById('arpStatus');
        if (!statusDiv) return;

        const showUkSrp = getPref('awa-opt-uk-srp', false);

        statusDiv.querySelector('.top-row').innerHTML = `
    TIER <span id="arpTier" class="num">${typeof arp_tier!=='undefined' ? arp_tier : ''}</span>｜
    ARP <span id="arpBalance" class="num">${typeof arp_balance!=='undefined' ? arp_balance.toLocaleString() : ''}</span>
    ${showUkSrp ? `｜ SRP <span id="srpBalance" class="num">${
      typeof arp_balance!=='undefined' ? Math.floor(arp_balance/700).toLocaleString() : ''
    }</span>` : ''}
  `;
    }

    function createUpdateBanner(data) {
        if (!data || !data.latest) return;

        if (data.latest !== CURRENT_VERSION) {
            let changelogHtml = "";
            for (const section in data.changelog) {
                changelogHtml += `<div><strong>${section}</strong><ul>`;
                data.changelog[section].forEach(item => {
                    changelogHtml += `<li>${item}</li>`;
                });
                changelogHtml += "</ul></div>";
            }

            const old = document.getElementById("awaUpdateBanner");
            if (old) old.remove();

            const banner = document.createElement("div");
            banner.id = "awaUpdateBanner";
            banner.innerHTML = `
      <span id="awaUpdateBannerClose">✖</span>
      <strong>Update available!</strong> (Installed: ${CURRENT_VERSION}, Latest: ${data.latest})<br>
      ${changelogHtml}
      <a href="${data.url}" target="_blank">Download latest version</a>
    `;
            document.body.prepend(banner);

            const closeEl = document.getElementById("awaUpdateBannerClose");
            if (closeEl) closeEl.addEventListener("click", () => banner.remove());
        } else {
            console.log("You are up to date. Current version:", CURRENT_VERSION);
        }
    }

    (function enableWidgetDragRightAnchored() {
        const widget = document.getElementById('arpStatus');
        const handle = document.getElementById('header');
        const saved = JSON.parse(localStorage.getItem('arpStatus-pos'));
        if (saved) {
            widget.style.top = saved.top;
            widget.style.right = saved.right;
            widget.style.left = 'auto';
        }
        let offsetX = 0, offsetY = 0, dragging = false;
        function startDrag(e) {
            const target = e.target;
            if (
                target.closest('#toggleButton') ||
                target.closest('#optionsButton') ||
                target.tagName === 'BUTTON'
            ) {
                return;
            }
            dragging = true;
            const rect = widget.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            offsetX = rect.right - clientX;
            offsetY = clientY - rect.top;
            widget.style.left = 'auto';
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchmove', onDrag);
            document.addEventListener('touchend', stopDrag);
        }
        function onDrag(e) {
            if (!dragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            widget.style.top = (clientY - offsetY) + 'px';
            widget.style.right = (window.innerWidth - clientX - offsetX) + 'px';
        }
        function stopDrag() {
            dragging = false;
            localStorage.setItem('arpStatus-pos', JSON.stringify({
                top: widget.style.top,
                right: widget.style.right
            }));
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('touchend', stopDrag);
        }
        handle.style.cursor = 'move';
        handle.addEventListener('mousedown', startDrag);
        handle.addEventListener('touchstart', startDrag);
    })();

    const toggleBtn = document.getElementById("toggleButton");
    toggleBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    toggleBtn.addEventListener("click", () => {
        statusDiv.classList.toggle("minimized");

        const isOpen = !statusDiv.classList.contains("minimized");
        toggleBtn.innerHTML = isOpen
            ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-plus"></i>';

        if (isOpen) {
            const defaultTab = localStorage.getItem('awa-opt-default-tab') || 'artifacts';
            const tabBtn = document.querySelector(`.tab-button[data-tab="${defaultTab}"]`);
            if (tabBtn) tabBtn.click();
        }
    });

    if (typeof has_epsilon_rewards!=='undefined' && has_epsilon_rewards) {
        const drpRow = `<div class="drp-row">DRP｜<span class="num">${epsilon_balance.toLocaleString()}</span></div>`;
        statusDiv.querySelector(".bottom-row").insertAdjacentHTML('afterend', drpRow);
    }

    const optsPopup = document.createElement('div');
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'modalOverlay';
    modalOverlay.classList.add('hidden');
    document.body.appendChild(modalOverlay);

    optsPopup.id    = 'optionsPopup';
    optsPopup.className = 'options-popup hidden';
    optsPopup.innerHTML = `
  <div class="popup-header" style="display:flex;justify-content:space-between;align-items:center;">
    <span class="options-title-span">${t('optionsTitle')}</span>
    <button id="checkUpdateBtn" style="background:linear-gradient(135deg,#01eafc,#0175ff);border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;color:#fff;cursor:pointer;">${t('checkUpdate')}</button>
  </div>
  <div class="popup-body">
    <div class="toggle-row">
      <span class="toggle-label lbl-language">${t('language')}</span>
      <select id="optLanguageSelect" style="flex:1; margin-left:10px; padding:4px; border-radius:4px;">
        ${Object.keys(translations).map(k=>`<option value="${k}">${k}</option>`).join('')}
      </select>
    </div>
    <div class="toggle-row">
      <span class="toggle-label lbl-steam-reminder">${t('steamReminder')}</span>
      <label class="switch">
        <input type="checkbox" id="optSteamToggle">
        <span class="slider round"></span>
      </label>
    </div>
    <div class="toggle-row">
      <span class="toggle-label lbl-discount-reminder">${t('discountReminder')}</span>
      <label class="switch">
        <input type="checkbox" id="optDiscountToggle">
        <span class="slider round"></span>
      </label>
    </div>
    <div class="toggle-row">
      <span class="toggle-label">UK SRP</span>
      <label class="switch">
        <input type="checkbox" id="ukSrpToggle">
        <span class="slider"></span>
      </label>
    </div>
    <div class="toggle-row">
      <span class="toggle-label">Default Tab</span>
      <select id="optDefaultTab" style="flex:1; margin-left:10px; padding:4px; border-radius:4px;">
        <option value="artifacts">Artifacts</option>
        <option value="arpDetails">Details</option>
        <option value="info">Info</option>
        <option value="gameVault">Game Vault</option>
        <option value="arpLog">ARP Log</option>
        <option value="communityGA">Community GA</option>
        <option value="giveaways">Giveaway</option>
      </select>
    </div>
  </div>
  <div class="popup-footer" style="display:flex;justify-content:space-between;align-items:center;">
    <div class="version-label" style="font-size:12px;color:#00f2fe;opacity:0.8;">
      💟 AWA Megumin's Alien Center v<span id="currentVersion"></span>
    </div>
    <button id="optsSaveBtn">${t('save')}</button>
  </div>
`;
    document.body.appendChild(optsPopup);

    const headerEl = document.getElementById('header');
    const optsBtn = document.createElement('button');
    optsBtn.id        = 'optionsButton';
    optsBtn.title     = 'Options';
    optsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
    headerEl.insertBefore(optsBtn, headerEl.querySelector('#toggleButton').nextSibling);

    optsBtn.addEventListener('click', () => {
        modalOverlay.classList.toggle('hidden');
        optsPopup.classList.toggle('hidden');
    });
    modalOverlay.addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
        optsPopup.classList.add('hidden');
    });

    const defaultTabSelect = document.getElementById('optDefaultTab');
    defaultTabSelect.value = localStorage.getItem('awa-opt-default-tab') || 'artifacts';

    function getPref(k, def) { const v = localStorage.getItem(k); return v===null? def : v==='true'; }
    function setPref(k, v) { localStorage.setItem(k, v?'true':'false'); }

    const toggleSteam    = document.getElementById('optSteamToggle');
    const toggleDiscount = document.getElementById('optDiscountToggle');
    const toggleUkSrp    = document.getElementById('ukSrpToggle');
    const langSelect     = document.getElementById('optLanguageSelect');
    toggleSteam.checked    = getPref('awa-opt-steam-reminder', true);
    toggleDiscount.checked = getPref('awa-opt-discount-reminder', true);
    toggleUkSrp.checked    = getPref('awa-opt-uk-srp', false);
    langSelect.value       = currentLang;
    document.getElementById('currentVersion').textContent = CURRENT_VERSION;

    function showUpdateModal(data, loading=false) {
        let modal = document.getElementById('updateModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'updateModal';
            modal.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:rgba(30,30,30,0.95);border:1px solid #00f2fe;border-radius:10px;
            padding:20px;width:320px;max-width:90%;color:#e0f8ff;font-family:"Segoe UI",sans-serif;
            z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,0.8);
        `;
            modal.innerHTML = `
            <span id="updateModalClose" style="float:right;cursor:pointer;color:#FFD700;font-weight:bold;">✖</span>
            <h3 style="margin-top:0;color:#FFD700;">Update Check</h3>
            <div id="updateModalContent"></div>
        `;
            document.body.appendChild(modal);
            modal.querySelector('#updateModalClose').onclick = () => { modal.remove(); };
        }

        const content = modal.querySelector('#updateModalContent');
        if (loading) {
            content.innerHTML = `<p>Checking for updates...</p>`;
            return;
        }

        if (data && data.latest && data.latest !== CURRENT_VERSION) {
            let html = `<p><strong>Installed:</strong> ${CURRENT_VERSION}<br><strong>Latest:</strong> ${data.latest}</p>`;
            for (const section in data.changelog) {
                html += `<div><strong>${section}</strong><ul>`;
                data.changelog[section].forEach(item => { html += `<li>${item}</li>`; });
                html += "</ul></div>";
            }
            html += `<p><a href="${data.url}" target="_blank">Download latest version</a></p>`;
            content.innerHTML = html;
        } else if (data && data.latest) {
            content.innerHTML = `<p>You are up to date! Current version: ${CURRENT_VERSION}</p>`;
        } else {
            content.innerHTML = `<p style="color:#ffb3b3;">Failed to load update data.</p>`;
        }
    }

    setTimeout(() => {
        const btn = document.getElementById('checkUpdateBtn');
        if (!btn) {
            console.error("Check Update button not found");
            return;
        }

        btn.addEventListener('click', async () => {
            console.log("Check Update clicked");
            try {
                const data = await fetchVersionInfo();
                createUpdateBanner(data);
            } catch (err) {
                console.error("Version check failed", err);
            }
        });
    }, 0);

    function applyLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('awa-opt-language', lang);
        const titleSpan = document.querySelector('#optionsPopup .options-title-span');
        const lblLang   = document.querySelector('#optionsPopup .lbl-language');
        const lblSteam  = document.querySelector('#optionsPopup .lbl-steam-reminder');
        const lblDisc   = document.querySelector('#optionsPopup .lbl-discount-reminder');
        const saveBtn   = document.getElementById('optsSaveBtn');
        const artBtn    = document.querySelector('.tab-button[data-tab="artifacts"]');
        const detBtn    = document.querySelector('.tab-button[data-tab="arpDetails"]');
        const infoBtn   = document.querySelector('.tab-button[data-tab="info"]');
        const gvBtn     = document.querySelector('.tab-button[data-tab="gameVault"]');
        const logBtn    = document.querySelector('.tab-button[data-tab="arpLog"]');
        const comGABtn  = document.querySelector('.tab-button[data-tab="communityGA"]');
        const GABtn     = document.querySelector('.tab-button[data-tab="giveaways"]');
        if (titleSpan) titleSpan.textContent = t('optionsTitle');
        if (lblLang)   lblLang.textContent   = t('language');
        if (lblSteam)  lblSteam.textContent  = t('steamReminder');
        if (lblDisc)   lblDisc.textContent   = t('discountReminder');
        if (saveBtn)   saveBtn.textContent   = t('save');
        if (artBtn)    artBtn.textContent    = t('artifacts');
        if (detBtn)    detBtn.textContent    = t('details');
        if (infoBtn)   infoBtn.textContent   = t('info');
        if (gvBtn)     gvBtn.textContent     = "🏦 " + t('gameVault');
        if (logBtn)    logBtn.textContent    = "💰 " + t('arpLog');
        if (comGABtn)  comGABtn.textContent  = "🧑‍🤝‍🧑 " + t('communityGA');
        if (GABtn)     GABtn.textContent     = "🎁 " + t('GA');
        updatetabContentMEG(currentTab);
        renderReminders();
    }

    document.getElementById('optsSaveBtn').addEventListener('click', () => {
        setPref('awa-opt-steam-reminder',    toggleSteam.checked);
        setPref('awa-opt-discount-reminder', toggleDiscount.checked);
        setPref('awa-opt-uk-srp', toggleUkSrp.checked);
        const chosenLang = langSelect.value;
        localStorage.setItem('awa-opt-language', chosenLang);
        localStorage.setItem('awa-opt-default-tab', defaultTabSelect.value);
        applyLanguage(chosenLang);
        cacheDate = null;
        cachedReminders = null;
        modalOverlay.classList.add('hidden');
        optsPopup.classList.add('hidden');
        renderReminders();
        renderWidget();
        const statusDiv = document.getElementById('arpStatus');
        if (statusDiv) {
            statusDiv.classList.add('minimized');
            const toggleBtn = document.getElementById("toggleButton");
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }
    });

    function formatNumber(num) {
        const n = parseFloat(num);
        const f = n.toFixed(2);
        return f.endsWith('.00') ? String(Math.round(n)) : f;
    }

    function extractCalendarReward(day, root) {
        const cell = root.querySelector(`.calendar-rewards__day[data-day="${day}"]`);
        if (!cell) return "";
        const rv  = cell.querySelector(".calendar-rewards__reward");
        const img = rv.querySelector("img");
        if (img && !img.src.includes("AW-calendar-reward.svg")) {
            const tip = img.dataset.bsTitle || img.getAttribute("data-bs-title") || img.getAttribute("title") || "";
            return tip || cell.textContent.trim();
        }
        if (img && img.src.includes("AW-calendar-reward.svg")) {
            const base = cell.querySelector("h1")?.textContent.trim() || "0";
            const bonusEl = rv.querySelector(".calendar-rewards__reward-bonus")?.textContent.trim();
            if (bonusEl) {
                const sign = bonusEl[0], num = bonusEl.slice(1).trim();
                return `${base} ${sign} ${num} ARP`;
            }
            return `${base} ARP`;
        }
        const fragH1 = cell.querySelector("h1.calendar-rewards__reward-fragments");
        if (fragH1) {return `${fragH1.textContent.trim()} Fragments`;}
        const tip2 = img?.dataset.bsTitle || img?.getAttribute("title");
        if (tip2) {if (tip2.includes("DRP")) {return `<span class="drp-reward">${tip2}</span>`;}return tip2;}
        return cell.textContent.trim();
    }

    function reloadCalendarData() {
        const sec = document.getElementById('calendarSection');
        if (!sec) return;
        let loader = sec.querySelector('#calendarLoading');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'calendarLoading';
            loader.textContent = 'Loading calendar data…';
            sec.innerHTML = '';
            sec.appendChild(loader);
        }
        const ifr = document.createElement('iframe');
        Object.assign(ifr.style, {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1
        });
        ifr.src = `${location.origin}/control-center`;
        document.body.appendChild(ifr);
        ifr.onload = () => {
            const d = ifr.contentDocument;
            const w = ifr.contentWindow;
            w.scrollTo(0, d.body.scrollHeight);
            let tries = 0;

            const dayCount    = (w.monthly_logins && w.monthly_logins.count) || 0;
            const streakCount = (w.consecutive_logins && w.consecutive_logins.count) || 0;
            const baseExtra   = (w.monthly_logins && w.monthly_logins.extra_arp) || 10;

            const calBonus    = typeof bonusCalendarArp !== 'undefined' ? bonusCalendarArp : 0;
            const langMult    = typeof arpMultiplier    !== 'undefined' ? arpMultiplier    : 1;

            (function poll() {
                tries++;

                if (dayCount > 28) {
                    const totalCal   = Math.ceil((baseExtra + calBonus) * langMult);
                    const bonusCal   = totalCal - baseExtra;
                    const displayCal = `${baseExtra} + ${bonusCal} ARP`;

                    const streakBase   = streakCount > 0 ? streakCount : 0;
                    const totalStreak  = Math.ceil((streakBase + calBonus) * langMult);
                    const bonusStreak  = totalStreak - streakBase;
                    const displayStreak= streakCount > 0 ? `${streakBase} + ${bonusStreak} ARP` : "Logout-Relogin";

                    sec.querySelector('#calendarLoading').outerHTML = `
                <table class="quest-table">
                  <tr><td>Calendar Day</td><td>${dayCount}</td><td>${displayCal}</td></tr>
                  <tr><td>Login Streak</td><td>${streakCount > 0 ? streakCount : "❌"}</td><td>${displayStreak}</td></tr>
                </table>`;
                    document.body.removeChild(ifr);
                    return;
                }

                const cards  = Array.from(d.querySelectorAll('.user-profile__profile-card'));
                const daily  = cards.find(c => c.querySelector('h3')?.textContent.includes('28-Day Daily Login Rewards'));
                const streak = cards.find(c => c.querySelector('h3')?.textContent.includes('7-Day Streak Rewards'));
                const dayCell= daily?.querySelector(`.calendar-rewards__day[data-day="${dayCount}"]`);

                if (daily && streak && dayCell) {
                    const drText = extractCalendarReward(dayCount, daily);
                    let baseCal = 0;
                    const m1 = drText.match(/(\d+)\s*\+\s*(\d+)\s*ARP/i);
                    const m2 = drText.match(/(\d+)\s*ARP/i);
                    if (m1) baseCal = parseInt(m1[1],10) + parseInt(m1[2],10);
                    else if (m2) baseCal = parseInt(m2[1],10);
                    if (!Number.isFinite(baseCal) || baseCal <= 0) baseCal = baseExtra;

                    const totalCal   = Math.ceil((baseCal + calBonus) * langMult);
                    const bonusCal   = totalCal - baseCal;
                    const displayCal = `${baseCal} + ${bonusCal} ARP`;

                    const srText = extractCalendarReward(streakCount, streak);
                    let streakBase = 0;
                    const sm1 = srText.match(/(\d+)\s*\+\s*(\d+)\s*ARP/i);
                    const sm2 = srText.match(/(\d+)\s*ARP/i);
                    if (sm1) streakBase = parseInt(sm1[1],10) + parseInt(sm1[2],10);
                    else if (sm2) streakBase = parseInt(sm2[1],10);
                    if (!Number.isFinite(streakBase) || streakBase <= 0) streakBase = streakCount;

                    const totalStreak   = Math.ceil((streakBase + calBonus) * langMult);
                    const bonusStreak   = totalStreak - streakBase;
                    const displayStreak = streakCount > 0 ? `${streakBase} + ${bonusStreak} ARP` : "Logout-Relogin";

                    sec.querySelector('#calendarLoading').outerHTML = `
                <table class="quest-table">
                  <tr><td>Calendar Day</td><td>${dayCount}</td><td>${displayCal}</td></tr>
                  <tr><td>Login Streak</td><td>${streakCount > 0 ? streakCount : "❌"}</td><td>${displayStreak}</td></tr>
                </table>`;
                    document.body.removeChild(ifr);
                    return;
                } else if (tries < 30) {
                    setTimeout(poll, 200);
                } else {
                    loader.textContent = 'Calendar data not found.';
                    document.body.removeChild(ifr);
                }
            }());
        };
    }

    function buildBonusTable() {
        const items = [
            { id:'bonusCalendar', label: t('bonusCalendar'),  value:bonusCalendarArp,             suffix:"ARP", plus:true  },
            { id:'bonusDiscord',  label: t('bonusDiscord'),   value:artifactsBonus.discord,       suffix:"ARP", plus:true  },
            { id:'bonusSteam',    label: t('bonusSteam'),     value:artifactsBonus.steam,         suffix:"ARP", plus:true  },
            { id:'bonusTwitch',   label: t('bonusTwitch'),    value:artifactsBonus.twitch,        suffix:"ARP", plus:true  },
            { id:'bonusTimesite', label: t('bonusTimesite'),  value:artifactsBonus.timesite,      suffix:"ARP", plus:true  },
            { id:'bonusAllARP',   label: t('bonusAllARP'),    value:(arpMultiplier-1)*100,        suffix:"%",   plus:true  },
            { id:'bonusDiscount', label: t('bonusDiscount'),  value:(1-artifactLangDiscount)*100, suffix:"%",   plus:false },
            { id:'bonusPlaytime', label: t('bonusPlaytime'),  value:artifactsBonus.playtime,      suffix:"%",   plus:true  },
            { id:'bonusFrag',     label: t('bonusFrag'),      value:fragment_balance,             suffix:"",    plus:null  }
        ];
        return `<table class="bonus-table">${
     items.map(it => {
            let disp = it.value==null
            ? '…'
            : (it.plus===true  ? '+'+formatNumber(it.value)
               : it.plus===false ? '-' +formatNumber(it.value)
               :    formatNumber(it.value));
            const cls = ((it.plus === true || it.plus === false) && parseFloat(it.value) !== 0)
            ? 'bonus-bg bonus-nonzero'
            : 'bonus-bg';
            return `
         <tr>
           <td class="bonus-label">${it.label}</td>
           <td class="bonus-value">
             <span id="${it.id}" class="${cls}">${disp}</span>
           </td>
           <td class="bonus-suffix">${it.suffix}</td>
         </tr>
       `;}).join('')}</table>`;
    }

    function buildArtifactsHtml() {
        let html = `<div class="section-title">${t('artifactInfo')}</div>`;
        html += buildBonusTable();
        html += `
  <div class="section-title">
    <a href="https://${location.host}/user-artifacts-room" target="_blank">${t('equippedArtifacts')}</a>
    <i id="refreshArtifactsBtn" class="fa-solid fa-rotate" title="${t('refresh')}" style="cursor:pointer; margin-left:10px;"></i>
  </div>
  <table id="equippedTable" class="quest-table">
    <tbody>
      <tr><td>${t('loadingArtifacts')}</td><td>　</td></tr>
    </tbody>
  </table>`;
        html += `
        <details class="issues-details main-issues">
          <summary>${t('artifactIssues')}</summary>
          <div class="issue-item">
            <div class="issue-title">${t('upgradeArtifact')}</div>
            <div class="issue-method">${t('upgradeArtifactDesc')}</div>
          </div>
          <div class="issue-item">
            <div class="issue-title">${t('changeLinkPrefix')}</div>
            <div class="issue-method">${t('changeLinkPrefixDesc')}</div>
          </div>
          <div class="issue-item">
            <div class="issue-title">${t('logoutRelogin')}</div>
            <div class="issue-method">${t('logoutReloginDesc')}</div>
          </div>
          <details class="issues-details">
            <summary>${t('baliFAQ')}</summary>
            <div class="issue-item">
              <div class="issue-method">${t('baliFAQDesc')}</div>
            </div>
          </details>
          <details class="issues-details">
            <summary>${t('chaiFAQ')}</summary>
            <div class="issue-item">
              <div class="issue-method">${t('chaiFAQDesc1')}</div>
            </div>
            <div class="issue-item">
              <div class="issue-method">${t('chaiFAQDesc2')}</div>
            </div>
            <div class="issue-item">
              <div class="issue-method">${t('chaiFAQDesc3')}</div>
            </div>
          </details>
          <details class="issues-details">
            <summary>${t('pnFAQ')}</summary>
            <div class="issue-item">
              <div class="issue-method">${t('pnFAQDesc1')}</div>
            </div>
            <div class="issue-item">
              <div class="issue-method">${t('pnFAQDesc2')}</div>
            </div>
            <div class="issue-item">
              <div class="issue-title">${t('pnFAQTitle')}</div>
              <div class="issue-method">${t('pnFAQAnswer')}</div>
            </div>
          </details>
          <details class="issues-details">
            <summary>${t('fluxFAQ')}</summary>
            <div class="issue-item">
              <div class="issue-method">${t('fluxFAQDesc')}</div>
            </div>
          </details>
          <details class="issues-details">
            <summary>${t('discountFAQ')}</summary>
            <div class="issue-item">
              <div class="issue-method">${t('discountFAQDesc')}</div>
            </div>
            <div class="issue-item">
              <div class="issue-title">${t('discountFAQTitle')}</div>
              <div class="issue-method">${t('discountFAQAnswer')}</div>
            </div>
          </details>
        </details>
    `;
        return html;
    }

    function buildSpecialEventsHtml() {
        return `
        <div class="section-title">${t('specialEvents')}</div>
        <table class="quest-table" id="specialEventsTable">
          <tr>
            <td><a href="https://${location.host}/marketplace/game-vault" target="_blank">${t('gameVault')}</a></td>
            <td id="seGameVaultStatus">…</td>
            <td id="seGameVaultTimer">…</td>
          </tr>
          <tr>
            <td><a href="${SCELinkBase}" target="_blank">${t('communityEvent')}</a></td>
            <td id="seCommunityEventStatus">…</td>
            <td id="seCommunityEventTimer">…</td>
          </tr>
          <tr>
            <td>${t('promotionalCalendar')}</td>
            <td id="sePromoCalStatus">…</td>
            <td id="sePromoCalTimer">…</td>
          </tr>
        </table>
      `;
    }

    function buildArpDetailsHtml() {
        let html = "";
        html += buildSpecialEventsHtml() + `<div style="height:12px;"></div>`;
        html += `
            <div class="section-title">${t('controlCenterQuests')}</div>
            <div id="questsSection">${t('loadingQuests')}</div>
          `;
        return html;
    }

    function buildQuestsTable(data) {
        if (!data.length) return t('noneFound') || "None found.";
        let tbl = `<table class="quest-table">`;
        data.forEach(r => {
            const isInternal = r.url.startsWith(location.origin + "/quests/");
            const targetAttr = isInternal ? "" : ' target="_blank"';
            const aocAttr    = r.awardOnClick  === "true"? ' data-award-on-click="true"' : "";
            const qidAttr    = r.questId         ? ` data-quest-id="${r.questId}"` : "";
            const rewardCell = r.status === "❌" ? "" : r.reward;
            tbl += `<tr>
        <td><a href="${r.url}" class="quest-title" style="color:#01f5ff;text-decoration:none;" ${targetAttr}${aocAttr}${qidAttr}>${r.title}</a></td>
        <td>${r.status}</td>
        <td>${rewardCell}</td>
      </tr>`;
        });
        tbl += `</table>`;
        return tbl;
    }

    function buildQuestsHtml(htmlText) {
        const doc = new DOMParser().parseFromString(htmlText,'text/html');
        let dailyCard = Array.from(doc.querySelectorAll('.user-profile__profile-card')).find(c=>c.textContent.includes("Daily Quests"));
        const dailyRows = [];
        if (dailyCard) {
            dailyCard.querySelectorAll('div.row.card-table-row, tr.card-table-row').forEach(r=>{
                const link = r.querySelector('a.quest-title');
                const title= link?.textContent.trim()||t('unknownQuest')||"Unknown Quest";
                const url  = link?.href || "#";
                const aoc  = link?.dataset.awardOnClick || "false";
                const qid  = link?.dataset.questId || "";
                const sp   = r.querySelectorAll('span.quest-item-progress');
                const stat = sp[0]?.textContent.trim()==="Complete"?"✅":"❌";
                let rew    = "";
                if (sp[1]) {
                    rew = sp[1].childNodes[0].textContent.trim();
                    const b2 = sp[1].querySelector('.text-arp-bonus');
                    if (b2) rew += " "+b2.textContent.trim();
                    if (!/ARP\s*$/i.test(rew)) rew += " ARP";
                }
                dailyRows.push({ title, url, status:stat, reward:rew, awardOnClick: aoc, questId: qid });
            });
        }
        let html = `<div class="section-title">${t('dailyQuests')}｜<span class="countdown" data-type="cd04"></span></div>`;
        html += buildQuestsTable(dailyRows);
        html += `<br><div class="section-title">${t('dailyCalendar')}｜<span class="countdown" data-type="cd00"></span></div><div id="calendarSection"><div id="calendarLoading">Loading calendar data…</div></div>`;
        let mArp = htmlText.match(/"timeOnSiteArp":\s*(\d+)/);
        let mCap = htmlText.match(/"timeOnSiteCap":\s*(\d+)/);
        if (mArp && mCap) {
            const got  = +mArp[1], cap = +mCap[1];
            const icon = got>=cap?"✅":"❌";
            const pct  = cap>0?formatNumber((got/cap)*100):0;
            html += `<br><div class="section-title">${t('timeOnSite')}</div>
               <div>${icon} ${got} of ${cap} ARP (${pct}%)</div>`;
        }
        html += `<br>
          <div class="section-title">
            <a href="https://${location.host}/control-center" target="_blank">${t('watchTwitch')}</a>
          </div>
          <div id="twitchDynamicInfo">${t('loadingInfo')}</div>`;
        let steamCard = Array.from(doc.querySelectorAll('.user-profile__profile-card')).find(c=>c.textContent.includes("Steam Quests"));
        const steamRows = [];
        if (steamCard) {
            steamCard.querySelectorAll('div.row.card-table-row, tr.card-table-row').forEach(r=>{
                const td    = r.querySelector('.quest-list__quest-details > div');
                const title = td?.textContent.trim()||t('unknownQuest')||"Unknown Quest";
                let link    = r.querySelector('a.quest-list__play')||r.querySelector("a[id^='control-center__steam-quest-play']")||r.querySelector('a');
                let url     = link?.href||"#";
                if (url.startsWith("/")) url = location.origin+url;
                const st    = r.querySelector("[id^='control-center__steam-quest-status']")?.textContent.trim();
                const stat  = st==="Complete"?"✅":"❌";
                let rw = r.querySelector("[id^='control-center__steam-quest-reward']")?.textContent.trim()||"";
                if (stat === "❌") rw = "";
                steamRows.push({ title, url, status:stat, reward:rw });
            });
        }
        html += `<br><div class="section-title">${t('steamQuests')}｜<span class="countdown" data-type="cdMon"></span></div>`;
        html += buildQuestsTable(steamRows);
        return html;
    }

    function buildInfoHtml() {
        const container = document.getElementById('tabContentMEG');
        container.classList.add('info-tab');
        const table = `
      <table class="info-table">
        <thead><tr><th>TIER</th><th>NAME</th><th>LIFETIME ARP</th></tr></thead>
        <tbody>
          <tr><td>🌕0/1</td><td>Lunar</td><td>0–2499</td></tr>
          <tr><td>🌎2</td><td>Planetary</td><td>2500–6999</td></tr>
          <tr><td>🌞3</td><td>Solar</td><td>7000–11999</td></tr>
          <tr><td>🌌4</td><td>Galactic</td><td>12000–17999</td></tr>
          <tr><td>🌟5</td><td>Interstellar</td><td>18000+</td></tr>
        </tbody>
      </table>
    `;
        const links = `
      <div class="section-title">${t('awaInfos')}</div>
      <div class="info-links">
        <div class="meguscript">🖥️ ᴍᴇɢᴜꜱᴄʀɪᴩᴛ</div>
        <div>⌛｜<a href="https://discord.com/channels/97149047281827840/1069815160157511730/1191781855557603328"
                   target="_blank" style="color:#01f5ff;text-decoration:none;">AWA Artifact Equip Timer (Discord)</a></div>
        <div>💟｜<a href="https://docs.google.com/spreadsheets/d/1VCzq6Trwc9T_wEsvTANpL7yy8FaJ6psSsKYn4O4riw8/edit?gid=146458480"
                   target="_blank" style="color:#01f5ff;text-decoration:none;">AWA Megumin's Tools</a></div>
        <div>📜｜<a href="/ucf/show/2167784/"
                   target="_blank" style="color:#01f5ff;text-decoration:none;">Artifact List</a></div>
        <div>❓｜<a href="https://discord.com/channels/97149047281827840/1226927088678867134/1226928672208846868"
                   target="_blank" style="color:#01f5ff;text-decoration:none;">Artifact FAQ (Discord)</a></div>
      </div>
      <div class="section-title">${t('awaFAQ')}</div>
      <details class="issues-details">
        <summary>${t('dailyQuestFAQ')}</summary>
        <div class="issue-item">
          <div class="issue-method">${t('dailyQuestFAQDesc1')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('dailyQuestFAQDesc2')}</div>
        </div>
      </details>
      <details class="issues-details">
        <summary>${t('dailyCalendarFAQ')}</summary>
        <div class="issue-item">
         <div class="issue-method">${t('dailyCalendarFAQDesc1')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('dailyCalendarFAQDesc2')}</div>
        </div>
      </details>
      <details class="issues-details">
        <summary>${t('steamFAQ')}</summary>
        <div class="issue-item">
          <div class="issue-method">${t('steamFAQDesc1')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('steamFAQDesc2')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('steamFAQDesc3')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('dailyQuestFAQDesc2')}</div>
        </div>
      </details>
      <details class="issues-details">
        <summary>${t('progressBarFAQ')}</summary>
        <div class="issue-item">
          <div class="issue-method">${t('progressBarFAQDesc1')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('dailyQuestFAQDesc2')}</div>
        </div>
        <div class="issue-item">
          <div class="issue-method">${t('progressBarFAQDesc2')}</div>
        </div>
      </details>
      `;
        return table + links;
    }

    function fetchControlCenterData() {
        fetch(`${location.origin}/control-center`, { credentials:'same-origin' })
            .then(r => r.ok ? r.text() : Promise.reject(r.status))
            .then(txt => {
            const h = document.querySelector('#questsSection').previousElementSibling;
            if (h?.classList.contains('section-title')) h.remove();
            document.getElementById("questsSection").innerHTML = buildQuestsHtml(txt);
            adjustSteamRewards();
            setTimeout(loadTwitchInfoUsingIframe, 300);
            reloadCalendarData();
            updateCountdowns();
        })
            .catch(e => {
            console.error(e);
            document.getElementById("questsSection").textContent = t('errorLoadingQuests') || "Error loading quests.";
        });
    }

    function adjustSteamRewards(){
        const bonusSteam = artifactsBonus.steam || 0;
        const multi     = arpMultiplier || 1;
        const tables    = document.querySelectorAll("#questsSection .quest-table");
        const steamTbl  = tables[1];
        if (!steamTbl) return;
        Array.from(steamTbl.rows).forEach(tr => {
            const status = tr.cells[1].textContent.trim();
            const td = tr.cells[2];
            if (status === "❌") {
                td.textContent = "";
                return;
            }
            let base = parseInt(td.textContent) || 0;
            let special = Math.ceil((base + bonusSteam) * multi);
            let extra   = special - base;
            td.textContent = extra>0 ? `${base} + ${extra} ARP` : `${base} ARP`;
        });
    }

    function loadTwitchInfoUsingIframe() {
        const ifr = document.createElement('iframe');
        ifr.style.display = 'none';
        ifr.src = location.origin + '/control-center';
        document.body.appendChild(ifr);
        ifr.onload = () => {
            try {
                const d = ifr.contentDocument;
                const s = d.querySelector("#control-center__twitch-arp-status")?.textContent.trim();
                const a = +d.querySelector("#control-center__twitch-arp")?.textContent.trim()||0;
                const tot = 15 + (artifactsBonus.twitch||0);
                const icon = s==="Complete"?"✅":"❌";
                const pct  = tot>0?formatNumber((a/tot)*100):0;
                document.getElementById("twitchDynamicInfo").textContent = `${icon} ${a} of ${tot} ARP (${pct}%)`;
            } catch(e) {console.error(e);} finally {document.body.removeChild(ifr);}
        };
    }

    function loadArtifactsData() {
        equippedArtifacts = [];
        artifactsBonus    = { discord:0, steam:0, twitch:0, timesite:0, playtime:0 };
        const ifr = document.createElement('iframe');
        ifr.style.display = 'none';
        ifr.src = location.origin + '/user-artifacts-room';
        document.body.appendChild(ifr);
        ifr.onload = () => {
            try {
                const doc = ifr.contentDocument;
                doc.querySelectorAll('p.perk').forEach(p => {
                    const ttxt = p.textContent;
                    if (/additional\s+(\d+)\s*ARP\b(?=.*Discord)/i.test(ttxt)) {artifactsBonus.discord += +RegExp.$1;}
                    if (/Steam quest completions/i.test(ttxt)) {const m = ttxt.match(/(\d+)\s*ARP/i);if (m) artifactsBonus.steam += Number(m[1]);}
                    if (/Twitch quests by\s*(\d+)/i.test(ttxt)) {artifactsBonus.twitch += +RegExp.$1;}
                    if (/Time on Site ARP limit by\s*(\d+)/i.test(ttxt)) {artifactsBonus.timesite += +RegExp.$1;}
                    if (/community events by\s*(\d+)%/i.test(ttxt)) {artifactsBonus.playtime += parseInt(RegExp.$1, 10);}
                });

                const slots = doc.querySelectorAll(".equipped-artifact-container .slot");
                slots.forEach(slot => {
                    const nameEl = slot.querySelector(".slot-back .title");
                    const statusEl = slot.querySelector(".slot-front .slot-status i");
                    if (!nameEl || !statusEl) return;
                    const artifactName = nameEl.textContent.trim();
                    const isOpen = statusEl.classList.contains("fa-lock-open");
                    const isLocked = statusEl.classList.contains("fa-lock");

                    const storageKey = "artifactStatus_" + artifactName;
                    const prevData = JSON.parse(localStorage.getItem(storageKey) || "{}");

                    let txt;
                    if (isOpen) {
                        txt = t('replaceable');
                        localStorage.setItem(storageKey, JSON.stringify({ status: "open" }));
                    } else if (isLocked) {
                        if (prevData.status === "open" || !prevData.lockTime) {
                            const nowUTC = Date.now();
                            localStorage.setItem(storageKey, JSON.stringify({ status: "lock", lockTime: nowUTC }));
                            txt = countdownText(nowUTC);
                        } else {
                            txt = countdownText(prevData.lockTime);
                        }
                    } else {
                        txt = t('noreplace');
                        if (!prevData.lockTime) {
                            localStorage.setItem(storageKey, JSON.stringify({ status: "lock", lockTime: Date.now() }));
                        }
                    }

                    equippedArtifacts.push({
                        title: artifactName,
                        timer: txt
                    });
                });
            } catch(e) {
                console.error("Artifact data load error:", e);
            } finally {
                document.body.removeChild(ifr);
                const updates = {
                    bonusDiscord:  artifactsBonus.discord,
                    bonusSteam:    artifactsBonus.steam,
                    bonusTwitch:   artifactsBonus.twitch,
                    bonusTimesite: artifactsBonus.timesite,
                    bonusPlaytime: artifactsBonus.playtime,
                };
                for (let [id, val] of Object.entries(updates)) {
                    const el = document.getElementById(id);
                    if (!el) continue;
                    el.textContent = '+' + formatNumber(val);
                    el.classList.toggle('bonus-nonzero', val !== 0);
                }
                const tbody = document.querySelector('#equippedTable tbody');
                if (tbody) {
                    if (equippedArtifacts.length) {
                        tbody.innerHTML = equippedArtifacts.map(a => {
                            let spanCls = '';
                            if (a.timer.startsWith('✅')) {spanCls = 'countdown-live';}
                            else if (a.timer.startsWith('⏰')) {spanCls = 'countdown-pre';}
                            else if (a.timer.startsWith('❌')) {spanCls = 'countdown-noreplace';}
                            const timerHtml = spanCls ? `<span class="${spanCls}">${a.timer}</span>` : a.timer;
                            return `<tr><td>${a.title}</td><td>${timerHtml}</td></tr>`;
                        }).join('');
                    } else {
                        tbody.innerHTML = `<tr><td colspan="2">${t('noArtifacts')}</td></tr>`;
                    }
                }
                renderReminders();
                setInterval(updateCountdowns, 60000);
            }
        };

        function countdownText(lockTime) {
            const endTime = lockTime + 24 * 60 * 60 * 1000;
            const now = Date.now();
            const remain = endTime - now;
            if (remain <= 0) return "✅ " + t('replaceable');
            const h = Math.floor(remain / 3600000);
            const m = Math.floor((remain % 3600000) / 60000);
            return `⏰ ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ${t('remaining')}`;
        }

        function updateCountdowns() {
            document.querySelectorAll('#equippedTable tbody tr td span.countdown-pre').forEach(span => {
                const artifactName = span.closest("tr").querySelector("td").textContent.trim();
                const prevData = JSON.parse(localStorage.getItem("artifactStatus_" + artifactName) || "{}");
                if (prevData.lockTime) {
                    span.textContent = countdownText(prevData.lockTime);
                }
            });
        }
    }

    function refreshArtifactsProcess() {
        const ifr = document.createElement('iframe');
        ifr.style.display = 'none';
        ifr.src = location.origin + '/user-artifacts-room';
        document.body.appendChild(ifr);
        ifr.onload = () => {
            try {
                const doc = ifr.contentDocument;
                const targetArtifact = doc.querySelector('.artifact-list-item[data-title="H`erkow Warrior Script"]');
                if (!targetArtifact) {
                    console.warn("H`erkow Warrior Script not found");
                    document.body.removeChild(ifr);
                    return;
                }
                const artifactId = targetArtifact.getAttribute("data-id");

                fetch("/upgrade-user-artifact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ artifactId }),
                    credentials: "include"
                })
                    .then(r => r.json())
                    .then(() => {
                    loadArtifactsData();
                })
                    .catch(err => console.error("Upgrade failed:", err))
                    .finally(() => {
                    document.body.removeChild(ifr);
                });
            } catch(e) {
                console.error("Refresh process error:", e);
                document.body.removeChild(ifr);
            }
        };
    }

    function computeReminders() {
        const today = new Date().toDateString();
        if (cacheDate === today && cachedReminders) {return cachedReminders;}
        const nodes = [];
        const now   = new Date(),
              utc   = new Date(now.toUTCString()),
              wd    = utc.getUTCDay(),
              diff  = chosenTime - utc.getTime();

        if (getPref('awa-opt-steam-reminder', true) && (wd === 6 || wd === 0)) {
            const p = document.createElement('p');
            p.className = 'artifact-reminder steam-reminder';
            p.textContent = wd === 6 ? `${t('steamReminderTomorrow')}` : `${t('steamReminderToday')}`;
            nodes.push(p);
        }
        if (getPref('awa-opt-discount-reminder', true)) {
            if (diff > 0 && diff <= ONE_DAY) {
                const p = document.createElement('p');
                p.className = 'artifact-reminder discount-reminder';
                p.textContent = `${t('discountReminderToday')}`;
                nodes.push(p);
            } else if (diff > ONE_DAY && diff <= TWO_DAY) {
                const p = document.createElement('p');
                p.className = 'artifact-reminder discount-reminder';
                p.textContent = `${t('discountReminderTomorrow')}`;
                nodes.push(p);
            }
        }
        cacheDate = today;
        cachedReminders = nodes;
        return nodes;
    }
    function renderReminders() {
        const tab = document.getElementById('tabContentMEG');
        tab.querySelectorAll('.artifact-reminder').forEach(el => el.remove());
        if (currentTab !== 'artifacts') return;
        const anchor = tab.querySelector('.issues-details');
        computeReminders().forEach(n => tab.insertBefore(n, anchor));
    }

    function updateSpecialEvents() {
        const nowMs = Date.now();
        const diff  = chosenTime - nowMs;
        const gvStatus = document.getElementById("seGameVaultStatus");
        const gvTimer  = document.getElementById("seGameVaultTimer");
        if (diff > 0) {
            gvStatus.textContent      = "⏳";
            gvTimer.textContent       = formatCountdown(diff);
            gvTimer.classList.add("countdown-pre");
        } else {
            gvStatus.textContent      = "▶️";
            gvTimer.textContent       = t('open');
            gvTimer.classList.add("countdown-live");
        }
        const promoRoot = document.getElementById("promotional-calendar-container");
        const peStat    = document.getElementById("sePromoCalStatus");
        const peTime    = document.getElementById("sePromoCalTimer");
        if (promoRoot){
            const days    = Array.from(promoRoot.querySelectorAll(".promotional-calendar__day"));
            const claimed = days.filter(d => d.querySelector(".promotional-calendar__day-claimed"));
            const arpDays = claimed.filter(d =>/\d+\s*ARP$/i.test(d.querySelector("h1").textContent));
            const rawSum = arpDays.reduce((sum, d) =>sum + parseInt(d.querySelector("h1").textContent), 0);
            const calB    = bonusCalendarArp || 0;
            let bonus = 0;
            arpDays.forEach(d => {
                const base    = parseInt(d.querySelector("h1").textContent, 10);
                const boosted = Math.ceil((base + calB) * arpMultiplier);
                bonus += boosted - base;
            });
            const cd3   = formatCountdown(promoTime - Date.now());
            peStat.innerText = claimed.length;
            peTime.innerHTML = bonus > 0
                ? `${rawSum} + ${bonus} ARP<br><span class="countdown-live">${cd3}</span>`
                : `${rawSum} ARP<br>${cd3}`;
            const totalDays    = days.reduce((m, d) => Math.max(m, +d.dataset.day), 0);
            const claimedCount = claimed.length;
            const key          = `awa-notified-promo-day-${claimedCount}`;
            if (claimedCount > 0 && !localStorage.getItem(key)) {
                alert(t('promoCalendarDayAlert', { claimedCount, totalDays }));
                localStorage.setItem(key, '1');
                const detailsBtn = document.querySelector('.tab-button[data-tab="arpDetails"]');
                if (detailsBtn) detailsBtn.classList.add('event-notice-promo');
            }
        } else {
            peStat.textContent = "-";
            peTime.textContent = t('ended');
            peTime.classList.add("countdown-ended");
        }
    }

    function updatetabContentMEG(tab) {
        if (tab === 'artifacts') {
            document.getElementById('tabContentMEG').innerHTML = buildArtifactsHtml();
            loadArtifactsData();

            const refreshBtn = document.getElementById("refreshArtifactsBtn");
            if (refreshBtn) {
                refreshBtn.addEventListener("click", () => {
                    refreshBtn.classList.add("fa-spin");
                    const tbody = document.querySelector('#equippedTable tbody');
                    if (tbody) {
                        tbody.innerHTML = `<tr><td>${t('loadingArtifacts')}</td><td>　</td></tr>`;
                    }
                    refreshArtifactsProcess();
                    setTimeout(() => refreshBtn.classList.remove("fa-spin"), 1000);
                });
            }
        }
        else if (tab === 'arpDetails') {
            document.getElementById("tabContentMEG").innerHTML = buildArpDetailsHtml();
            fetchControlCenterData();
            reloadCalendarData();
            loadCommunityEventInfo();
            updateSpecialEvents();
            setInterval(() => {updateSpecialEvents();updateCountdowns();loadCommunityEventInfo();}, 60000);
            updateSpecialEvents();
            updateCountdowns();
        }
        else if (tab==='info') {
            document.getElementById('tabContentMEG').innerHTML = buildInfoHtml();
        }
        else if (tab === 'gameVault') {
            const container = document.getElementById('tabContentMEG');
            container.innerHTML = `<div id="game-vault"></div>`;
            const last = localStorage.getItem('awa-gv-discount') || 'd15';
            renderGameVaultTab(last);
        }
        else if (tab === 'arpLog') {
            const container = document.getElementById('tabContentMEG');
            container.innerHTML = '<div id="arp-log"></div>';
            renderArpLog(container);
        }
        else if (tab === 'communityGA') {
            const container = document.getElementById('tabContentMEG');
            container.innerHTML = '<div id="community-ga"></div>';
            renderCommunityGA(container);
        }
        else if (tab === 'giveaways') {
            const container = document.getElementById('tabContentMEG');
            container.innerHTML = '<div id="ga">Loading…</div>';
            renderGiveaways(1);
        }
    }
    statusDiv.querySelectorAll('.tab-button').forEach(btn=>{
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            statusDiv.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            sessionStorage.setItem('awa-current-tab', currentTab);
            updatetabContentMEG(currentTab);
            btn.classList.remove('event-notice','event-notice-ce','event-notice-promo');
        });
    });
    const initialBtn = statusDiv.querySelector(`.tab-button[data-tab="${currentTab}"]`);
    if (initialBtn) {
        initialBtn.classList.add('active');
        updatetabContentMEG(currentTab);
    } else {
        const def = statusDiv.querySelector('.tab-button[data-tab="artifacts"]');
        def.classList.add('active');
        updatetabContentMEG('artifacts');
    }

    updateDetailsBadge();
    setInterval(updateDetailsBadge, 5000);
    function updateDetailsBadge() {
        const now  = Date.now();
        const btn  = document.querySelector('.tab-button[data-tab="arpDetails"]');
        if (!btn) return;
        const keyCE = `awa-notified-ce-${SCEStart}`;
        if (now >= SCEStart && !localStorage.getItem(keyCE)) {
            if (!btn.querySelector('.event-reminder-ce')) {
                btn.classList.add('event-notice-ce');
                alert(t('communityEventStarted'));
                localStorage.setItem(keyCE, '1');
            }
        }
        const keyP = `awa-notified-promo-${promoStart}`;
        if (now >= promoStart && !localStorage.getItem(keyP)) {
            if (!btn.querySelector('.event-reminder-promo')) {
                btn.classList.add('event-notice-promo');
                alert(t('promotionalCalendarStarted'));
                localStorage.setItem(keyP, '1');
            }
        }
    }

    function updateARPBalance() {
        if (typeof arp_balance!=='undefined') {
            document.getElementById('arpBalance').textContent = arp_balance.toLocaleString();
        }
    }
    setInterval(updateARPBalance, 300000);
    updateARPBalance();

    setInterval(()=>{if (document.querySelector('.tab-button.active')?.dataset.tab==='artifacts') {loadArtifactsData();}}, 300000);

    document.body.addEventListener('click', e => {
        const link = e.target.closest('a.quest-title');
        if (!link || link.dataset.awardOnClick !== 'true') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const id   = link.dataset.questId;
        const href = link.href;
        link.setAttribute('target', '_blank');
        fetch(`/ajax/user/quest-award/${id}`, {credentials: 'include'}).then(r => r.json()).then(json => {
            if (json.success) {window.open(href, '_blank');
                              } else {alert('❌ Quest failed, please retry.');}}).catch(() => {alert('⚠️ Network error when doing quest.');});
    });

    const DISCOUNT_OPTIONS = [
        { key: 'd2',  label: '-2%',  factor: 0.98 },
        { key: 'd15', label: '-15%', factor: 0.85 },
        { key: 'd17', label: '-17%', factor: 0.85 * 0.98 },
        { key: 'd22', label: '-22%', factor: 0.85 * 0.95 * 0.98 }
    ];

    async function fetchGameVaultRows() {
        const res = await fetch(`${location.origin}/ucf/show/2170390/`);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const vaultTable = Array.from(doc.querySelectorAll("table"))
        .find(tbl => {
            const headers = Array.from(tbl.querySelectorAll("th"))
            .map(th => th.textContent.trim().toUpperCase());
            return headers.includes("GAME") && headers.includes("PLATFORM") && headers.includes("TIER");
        });

        if (!vaultTable) return [];

        return Array.from(vaultTable.querySelectorAll("tbody tr"))
            .map(tr => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 4) return null;
            const clean = txt => txt.replace(/\s+/g, "").trim();
            return {
                game: tds[0].innerText.trim(),
                link: tds[0].querySelector("a")?.href,
                platform: clean(tds[1].innerText),
                tier: clean(tds[2].innerText),
                price: parseInt(clean(tds[3].innerText), 10)
            };
        })
            .filter(Boolean);
    }

    function drawGameVault(key, games) {
        const opt = DISCOUNT_OPTIONS.find(x => x.key === key);
        const useSRP = localStorage.getItem("awa-opt-uk-srp") === "true";
        const priceLabel = useSRP ? "PRICE (SRP)" : "PRICE (ARP)";
        const convert = val => useSRP ? Math.round(val / 700) : val;
        const tableWrap = document.createElement("div");
        tableWrap.className = "game-vault-table";

        tableWrap.innerHTML = `
      <table class="quest-table">
        <thead>
          <tr>
            <th>GAME</th>
            <th>PLATFORM</th>
            <th>TIER</th>
            <th>${priceLabel}</th>
            <th>
              DISCOUNT<br>
              <select id="gv-discount">
                ${DISCOUNT_OPTIONS.map(x =>
                                       `<option value="${x.key}" ${x.key === key ? "selected" : ""}>
                     ${x.label}
                   </option>`
                ).join("")}
              </select>
            </th>
          </tr>
        </thead>
        <tbody>
          ${games.map(g => `
            <tr>
              <td><a href="${g.link}" target="_blank">${g.game}</a></td>
              <td>${g.platform}</td>
              <td>${g.tier}</td>
              <td>${convert(g.price)}</td>
              <td>${convert(Math.round(g.price * opt.factor))}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
        return tableWrap;
    }

    async function renderGameVaultTab(selectedKey = "d15") {
        try {
            const games = await fetchGameVaultRows();
            const container = document.getElementById("game-vault");
            if (!container) return;
            container.innerHTML = "";

            if (!games.length) {
                container.textContent = "No Game Vault data found.";
                return;
            }

            container.appendChild(drawGameVault(selectedKey, games));
            container.querySelector("#gv-discount").addEventListener("change", e => {
                const key = e.target.value;
                localStorage.setItem("awa-gv-discount", key);
                renderGameVaultTab(key);
            });
        } catch (e) {
            console.error("Error loading Game Vault:", e);
            const container = document.getElementById("game-vault");
            if (container) container.textContent = "Error loading Game Vault.";
        }
    }

    function renderArpLog(container) {
        container.innerHTML = `
        <div class="arp-controls">
            <input type="date" id="arp-start">
            <span style="margin:0 6px;">to</span>
            <input type="date" id="arp-end">
            <button id="arp-load">Load</button>
        </div>
        <div id="arp-results"></div>
    `;

        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = now.getUTCMonth();

        const start = new Date(Date.UTC(utcYear, utcMonth, 1));
        const end = new Date(Date.UTC(utcYear, utcMonth + 1, 0));

        document.getElementById("arp-start").value = start.toISOString().split("T")[0];
        document.getElementById("arp-end").value = end.toISOString().split("T")[0];

        document.getElementById("arp-load").addEventListener("click", async () => {
            const from = document.getElementById("arp-start").value;
            const to = document.getElementById("arp-end").value;
            const url = `${location.origin}/account/arp-log?from=${from}&to=${to}&max=500000`;

            const resp = await fetch(url, { credentials: "include" });
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, "text/html");

            const rows = doc.querySelectorAll(".card-table-row");
            const entries = [];
            rows.forEach(row => {
                const action = row.querySelector(".col-lg-5, .col-4")?.innerText.trim();
                const arp = row.querySelector(".text-center")?.innerText.trim();
                const date = row.querySelector(".justify-content-end")?.innerText.trim();
                if (action && arp && date) entries.push({ action, arp: parseInt(arp,10), date });
            });

            renderArpAccordion(entries);
        });
    }

    function renderArpAccordion(entries) {
        const grouped = {};
        entries.forEach(e => {
            if (!grouped[e.date]) grouped[e.date] = [];
            grouped[e.date].push(e);
        });

        const container = document.getElementById("arp-results");
        container.innerHTML = "";

        Object.entries(grouped).forEach(([date, items]) => {
            const total = items.reduce((sum,i)=>sum+i.arp,0);
            const priority = [
                "Daily Login Calendar",
                "Daily Login Streak",
                "Time On Site",
                "Twitch Passive",
                "Complete Minigame"
            ];

            items.sort((a,b) => {
                const ai = priority.indexOf(a.action);
                const bi = priority.indexOf(b.action);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.action.localeCompare(b.action);
            });

            const card = document.createElement("div");
            card.className = "arp-card";

            const header = document.createElement("div");
            header.className = "arp-card-header";
            header.innerHTML = `<span>${date}</span><span>${total} ARP ▶</span>`;

            const details = document.createElement("div");
            details.className = "arp-card-details";
            items.forEach(item => {
                const row = document.createElement("div");
                row.innerHTML = `<span>${item.action}</span><span>${item.arp}</span>`;
                details.appendChild(row);
            });

            header.addEventListener("click", () => {
                const open = details.style.display === "block";
                details.style.display = open ? "none" : "block";
                header.querySelector("span:last-child").innerHTML = `${total} ARP ${open ? "▶" : "▼"}`;
            });

            card.appendChild(header);
            card.appendChild(details);
            container.appendChild(card);
        });
    }

    function parseUtcDate(dateStr) {
        if (!dateStr || typeof dateStr !== "string") return null;
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!m) return null;
        const [, y, mo, d, h, mi] = m;
        return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    }

    function countdownString(targetDate) {
        const nowUtcMs = Date.now();
        const diffMs = targetDate.getTime() - nowUtcMs;
        if (diffMs <= 0) return "expired";
        const diffMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        return `${hours} h ${minutes} m`;
    }

    async function fetchGiveawayPage(page = 1) {
        const url = page === 1
        ? `${location.origin}/esi/featured-tile-data/CommunityGiveaway`
    : `${location.origin}/esi/featured-tile-data/CommunityGiveaway/${page}`;
        const res = await fetch(url, {
            headers: { "accept": "*/*", "x-requested-with": "XMLHttpRequest" },
            credentials: "include"
        });
        return res.json();
    }

    function saveGAState(id, state) {
        const key = "awa-ga-state";
        const raw = localStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        map[id] = state;
        localStorage.setItem(key, JSON.stringify(map));
    }
    function getGAState(id) {
        const raw = localStorage.getItem("awa-ga-state");
        if (!raw) return null;
        try {
            const map = JSON.parse(raw);
            return map[id] || null;
        } catch {
            return null;
        }
    }

    async function detectGiveawayType(id) {
        try {
            const res = await fetch(`${location.origin}/community-giveaways/${id}`);
            const html = await res.text();
            const match = html.match(/<h1[^>]*class="js-widget-title"[^>]*>(.*?)<\/h1>/i);
            if (!match) return "";
            const title = match[1];
            if (title.includes("Blind Auction")) return "💵";
            if (title.includes("Sweepstakes")) return "🎟️";
            return "";
        } catch {
            return "";
        }
    }

    function detectEnteredStatus(id, delayMs = 2000) {
        return new Promise(resolve => {
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = `${location.origin}/community-giveaways/${id}`;
            document.body.appendChild(iframe);

            iframe.onload = () => {
                setTimeout(() => {
                    try {
                        const doc = iframe.contentDocument;
                        const statusEl = doc.querySelector(".giveaway-status");
                        const entered = statusEl && /entered/i.test(statusEl.textContent);
                        resolve(entered);
                    } catch {
                        resolve(false);
                    } finally {
                        document.body.removeChild(iframe);
                    }
                }, delayMs);
            };
        });
    }

    let cancelEnteredChecks = false;

    async function runEnteredChecks(rows, concurrency = 2) {
        cancelEnteredChecks = false;
        const queue = rows.filter(({ g }) => {
            const cached = getGAState(g.id);
            return !cached?.entered;
        });
        let index = 0;

        async function nextBatch() {
            if (cancelEnteredChecks) return;
            if (!document.querySelector('#community-ga .community-ga-table')) return;
            if (index >= queue.length) return;

            const batch = queue.slice(index, index + concurrency);
            index += concurrency;

            await Promise.all(batch.map(async ({ g }) => {
                if (cancelEnteredChecks) return;
                const row = document.querySelector(`tr[data-ga-id="${g.id}"]`);
                if (!row) return;

                const entered = await detectEnteredStatus(g.id, 2000);
                if (entered) {
                    row.classList.add("entered-ga");
                }

                const cached = getGAState(g.id) || {};
                saveGAState(g.id, { type: cached.type || "", entered });
            }));

            setTimeout(nextBatch, 200);
        }

        nextBatch();
    }

    async function renderCommunityGA(container) {
        const mount = container.querySelector('#community-ga');
        if (!mount) return;

        mount.innerHTML = `
    <table class="awa-table community-ga-table">
      <thead>
        <tr>
          <th>🎁 GA</th>
          <th>🏆 Tier</th>
          <th>⭐ Host</th>
          <th>⏰ Ends</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
        const tbody = mount.querySelector('tbody');

        let allGiveaways = [];
        for (let page = 1; page <= 5; page++) {
            try {
                const data = await fetchGiveawayPage(page);
                const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
                allGiveaways = allGiveaways.concat(items);
            } catch (e) {
                console.error("Community GA: Error fetching page", page, e);
            }
        }

        const nowUtcMs = Date.now();
        const active = allGiveaways
        .map(g => ({ g, closesUtc: parseUtcDate(g.closesAt) }))
        .filter(x => x.closesUtc && x.closesUtc.getTime() > nowUtcMs);

        active.sort((a, b) => {
            const ad = a.closesUtc.getTime();
            const bd = b.closesUtc.getTime();
            if (ad !== bd) return ad - bd;
            if (a.g.tier !== b.g.tier) return b.g.tier - a.g.tier;
            const tcmp = (a.g.title || "").localeCompare(b.g.title || "");
            if (tcmp !== 0) return tcmp;
            return (a.g.creator?.username || "").localeCompare(b.g.creator?.username || "");
        });

        for (const { g, closesUtc } of active) {
            const countdown = countdownString(closesUtc);
            const url = `${location.origin}/community-giveaways/${g.id}`;
            const cached = getGAState(g.id);

            const row = document.createElement('tr');
            row.setAttribute("data-ga-id", g.id);
            const type = cached?.type || "";
            row.innerHTML = `
      <td><a href="${url}" target="_blank">${type} ${g.title}</a></td>
      <td>${g.tier}</td>
      <td>${g.creator?.username || "unknown"}</td>
      <td data-closesAt="${closesUtc.toISOString()}">${countdown}</td>
    `;
            if (cached?.entered) {
                row.classList.add("entered-ga");
            }
            tbody.appendChild(row);
        }

        active.forEach(async ({ g }) => {
            const cached = getGAState(g.id);
            if (cached?.type) return;
            const type = await detectGiveawayType(g.id);
            const row = tbody.querySelector(`tr[data-ga-id="${g.id}"]`);
            if (!row) return;
            const link = row.querySelector("td:first-child a");
            if (link && type) link.textContent = `${type} ${g.title}`;
            saveGAState(g.id, { type, entered: cached?.entered || false });
        });

        runEnteredChecks(active, 2);

        setInterval(() => {
            if (cancelEnteredChecks) return;
            tbody.querySelectorAll('td[data-closesAt]').forEach(el => {
                const d = new Date(el.getAttribute('data-closesAt'));
                el.textContent = countdownString(d);
            });
        }, 60000);
    }

    function cancelCommunityGA() {
        cancelEnteredChecks = true;
    }

    const GAtabs = [];
    GAtabs.push({
        id: "communityGA",
        title: translations[currentLang].communityGA,
        render: renderCommunityGA,
        onClose: cancelCommunityGA
    });

    const PAGE_SIZE = 15;
    const COOKIE_NAME = "awa_claimed_giveaways";
    const TIER_CACHE_KEY = "awa_ga_tier_cache";
    const GIVEAWAY_KEYS_CACHE_KEY = "awa_giveaway_keys_cache";
    const CACHE_MAX_AGE_MS = 60 * 60 * 1000;

    let giveawayKeysReady = false;

    function getClaimedFromCookie() {
        const raw = document.cookie.split("; ").find(r => r.startsWith(COOKIE_NAME + "="));
        if (!raw) return [];
        try { return JSON.parse(decodeURIComponent(raw.split("=")[1])); }
        catch { return []; }
    }
    function saveClaimedToCookie(ids) {
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(ids))}; expires=${expires.toUTCString()}; path=/`;
    }
    function getTierCache() {
        try { return JSON.parse(localStorage.getItem(TIER_CACHE_KEY) || "{}"); }
        catch { return {}; }
    }
    function saveTierToCache(id, tier) {
        const map = getTierCache();
        map[id] = { tier, ts: Date.now() };
        localStorage.setItem(TIER_CACHE_KEY, JSON.stringify(map));
    }
    function getTierFromCache(id, maxAgeMs = CACHE_MAX_AGE_MS) {
        const map = getTierCache();
        const entry = map[id];
        if (!entry || Date.now() - (entry.ts || 0) > maxAgeMs) return null;
        return entry.tier || null;
    }

    async function fetchTierFromUcf(id) {
        try {
            const res = await fetch(`${location.origin}/ucf/show/${id}/`, {
                headers: { accept: "*/*" },
                credentials: "include"
            });
            const html = await res.text();
            const m = html.match(/(?:\bTier|\bTIER)\s*[:#-]?\s*(\d+)/i);
            if (m) return m[1] === "2" ? "1" : m[1];

            const doc = new DOMParser().parseFromString(html, "text/html");
            const textBlobs = [...doc.querySelectorAll("h1,h2,h3,th,td,div,span,p")].map(el => el.textContent?.trim() || "");
            for (const t of textBlobs) {
                const mm = t.match(/(?:\bTier|\bTIER)\s*[:#-]?\s*(\d+)/i);
                if (mm) return mm[1] === "2" ? "1" : mm[1];
            }
            return "1";
        } catch {
            return "1";
        }
    }

    function formatTitle(rawTitle) {
        let title = rawTitle.replace(/ Key Giveaway$/, "").replace(/ Giveaway$/, "");
        if (title.endsWith(" Steam Playtest")) return `🎮 Steam｜${title.replace(/ Steam Playtest$/, "")} Playtest`;
        if (title.endsWith(" Steam Game Key")) return `🎮 Steam｜${title.replace(/ Steam Game Key$/, "")}`;
        if (title.endsWith(" Steam Game")) return `🎮 Steam｜${title.replace(/ Steam Game$/, "")}`;
        if (title.endsWith(" Steam")) return `🎮 Steam｜${title.replace(/ Steam$/, "")}`;
        if (title.endsWith(" DLC")) return `🧧 DLC｜${title.replace(/ DLC$/, "")}`;
        if (title.endsWith(" Epic Game") || title.endsWith(" Epic Games")) return `🎮 Epic Games｜${title.replace(/ Epic (Game|Games)$/, "")}`;
        if (title.endsWith(" Exclusive Alienware Game Pack")) return `🧧 ${title.replace(/ Exclusive Alienware Game Pack$/, "｜Exclusive Alienware Game Pack")}`;
        if (title.endsWith(" Exclusive Game Pack")) return `🧧 ${title.replace(/ Exclusive Game Pack$/, "｜Exclusive Game Pack")}`;
        if (title.endsWith(" Alienware Game Pack")) return `🧧 ${title.replace(/ Alienware Game Pack$/, "｜Alienware Game Pack")}`;
        if (title.endsWith(" Game Pack")) return `🧧 ${title.replace(/ Game Pack$/, "｜Game Pack")}`;
        return title;
    }
    function getGiveawayKeysCache() {
        try { return JSON.parse(localStorage.getItem(GIVEAWAY_KEYS_CACHE_KEY) || "{}"); }
        catch { return { ts: 0, map: {} }; }
    }
    function saveGiveawayKeysCache(map) {
        localStorage.setItem(GIVEAWAY_KEYS_CACHE_KEY, JSON.stringify({ ts: Date.now(), map }));
    }
    function isFresh(ts, maxAgeMs = CACHE_MAX_AGE_MS) {
        return ts && (Date.now() - ts) < maxAgeMs;
    }
    function buildGiveawayKeysMapFromWindow(win) {
        if (!win || !Array.isArray(win.giveawayKeys)) return {};
        return win.giveawayKeys.reduce((acc, e) => {
            acc[e.giveaway_id] = {
                status: e.status,
                remaining: typeof e.remaining === "number" ? e.remaining : null
            };
            return acc;
        }, {});
    }

    async function ensureGiveawayKeys(firstIdForBootstrap) {
        const cached = getGiveawayKeysCache();
        if (cached.map && Object.keys(cached.map).length && isFresh(cached.ts)) {
            giveawayKeysReady = true;
            return cached.map;
        }

        let map = buildGiveawayKeysMapFromWindow(window);
        if (Object.keys(map).length) {
            saveGiveawayKeysCache(map);
            giveawayKeysReady = true;
            return map;
        }

        if (!firstIdForBootstrap) return {};
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "display:none;width:1px;height:1px;opacity:0;";
        iframe.src = `${location.origin}/community-giveaways/${firstIdForBootstrap}`;
        document.body.appendChild(iframe);

        const maxWaitMs = 8000;
        const intervalMs = 200;
        let waited = 0;

        const mapPromise = new Promise(resolve => {
            const poll = () => {
                try {
                    const iw = iframe.contentWindow;
                    const m = buildGiveawayKeysMapFromWindow(iw);
                    if (Object.keys(m).length) {
                        resolve(m);
                        return;
                    }
                } catch {}
                waited += intervalMs;
                if (waited >= maxWaitMs) resolve({});
                else setTimeout(poll, intervalMs);
            };
            poll();
        });

        const result = await mapPromise;
        document.body.removeChild(iframe);

        if (Object.keys(result).length) {
            saveGiveawayKeysCache(result);
            giveawayKeysReady = true;
            return result;
        }

        giveawayKeysReady = true;
        return {};
    }
    async function renderGiveaways(page = 1) {
        if (typeof page !== "number") page = 1;
        const container = document.querySelector("#ga");
        if (!container) return;

        container.innerHTML = `
    <div style="padding:6px 0; text-align:center; color:#00f2fe; font-weight:600;">
      Initializing giveaway status… <span id="ga-progress">0%</span>
    </div>
  `;

        const progressEl = container.querySelector("#ga-progress");
        let p = 0;
        const progTimer = setInterval(() => {
            p = Math.min(95, p + 5);
            if (progressEl) progressEl.textContent = `${p}%`;
        }, 150);

        try {
            const res = await fetch(`${location.origin}/esi/featured-tile-data/Giveaway/${page}`, {
                headers: { "accept": "*/*", "x-requested-with": "XMLHttpRequest" },
                credentials: "include"
            });
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.data || []);
            const claimedIds = getClaimedFromCookie();
            const firstId = list[0]?.id;
            const gkMap = await ensureGiveawayKeys(firstId);

            const tierPromises = list.slice(0, PAGE_SIZE).map(async item => {
                const cached = getTierFromCache(item.id);
                if (cached) return { id: item.id, tier: cached };
                const tier = await fetchTierFromUcf(item.id);
                saveTierToCache(item.id, tier);
                return { id: item.id, tier };
            });
            const tiers = await Promise.all(tierPromises);
            const tierMap = tiers.reduce((acc, x) => (acc[x.id] = x.tier, acc), {});
            let html = `
      <table class="awa-giveaways-table">
        <thead><tr><th>🎁 GA</th><th>🏆 Tier</th><th>📍 Status</th></tr></thead>
        <tbody>
    `;

            list.slice(0, PAGE_SIZE).forEach(item => {
                const cleanTitle = formatTitle(item.title);
                const link = `${location.origin}/ucf/show/${item.id}/`;
                const tier = tierMap[item.id] ?? "1";

                const gk = gkMap[item.id];
                let status = "❓ Unknown";
                let claimed = false;

                if (gk?.status === "assigned") {
                    status = "🔑 CLAIMED!";
                    claimed = true;
                } else if (claimedIds.includes(item.id)) {
                    status = "🔑 CLAIMED!";
                    claimed = true;
                } else if (typeof gk?.remaining === "number") {
                    status = gk.remaining > 0 ? `✅ Available! (${gk.remaining} left)` : "❌ Out of Stock!";
                } else {
                    status = "❌ Out of Stock!";
                }

                if (claimed && !claimedIds.includes(item.id)) {
                    claimedIds.push(item.id);
                    saveClaimedToCookie(claimedIds);
                }

                html += `
        <tr class="${claimed ? "claimed-ga" : ""}">
          <td><a href="${link}" target="_blank">${cleanTitle}</a></td>
          <td>${tier}</td>
          <td>${status}</td>
        </tr>
      `;
            });

            html += `
        </tbody></table>
        <div class="awa-pagination">
          <button id="awa-ga-prev" ${page <= 1 ? "disabled" : ""}>« Prev</button>
          <span>Page ${page}</span>
          <button id="awa-ga-next">Next »</button>
        </div>
        <div class="awa-pagination-manual">
  <label for="awa-ga-page-input">🔢 Jump to page:</label>
  <input id="awa-ga-page-input" type="number" min="1">
  <button id="awa-ga-page-go">Go</button>
  <button id="awa-ga-page-home">⏮ Back to Page 1</button>
</div>
    `;

            container.innerHTML = html;

            container.querySelector("#awa-ga-prev")?.addEventListener("click", () => renderGiveaways(page - 1));
            container.querySelector("#awa-ga-next")?.addEventListener("click", () => renderGiveaways(page + 1));

            const input   = container.querySelector("#awa-ga-page-input");
            const goBtn   = container.querySelector("#awa-ga-page-go");
            const homeBtn = container.querySelector("#awa-ga-page-home");

            goBtn?.addEventListener("click", () => {
                const val = parseInt(input?.value, 10);
                if (Number.isFinite(val) && val > 0) renderGiveaways(val);
            });

            input?.addEventListener("keydown", e => {
                if (e.key === "Enter") goBtn?.click();
            });

            homeBtn?.addEventListener("click", () => renderGiveaways(1));

        } catch (err) {
            clearInterval(progTimer);
            console.error("Error loading giveaways:", err);
            container.textContent = "Error loading giveaways.";
        }
    }
}

;(function(){
    if (!window.user_is_logged_in) return;
    const TOUR_KEY = 'awaMeguminTour';
    if (localStorage.getItem(TOUR_KEY)) return;

    const steps = [
        {
            selector:       '#toggleButton',
            title:          '👽 Welcome to Megumin\'s Alien Center!',
            content:        'Click “+” to expand the tool.',
            mustClick:      true,
            avatarUrl:      'https://lh3.googleusercontent.com/pw/AP1GczNkQ3foGURi5H71qrQhKoqXqmlxeAYKbdEIiSlSCY6qQANAI5JYyTZF-tot6k-r5ba5rsbeBvUqF04CdLBUxjQ5AiBvV0T4SAxFOQwaehX83OePSGc=w2400',
            avatarPosition: 'left',
            action:         null,
            cleanup:        null},
        {
            selector:       '.tab-button[data-tab="artifacts"]',
            title:          "t('tourArtifactsTitle')",
            content:        'View your Artifacts bonuses and manage equipped artifacts here.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_1',
            avatarPosition: 'right',
            action:         () => document.querySelector('.tab-button[data-tab="artifacts"]').click(),
            cleanup:        null},
        {
            selector:       'a[href*="/user-artifacts-room"]',
            title:          '⚙️ Equipped Artifacts',
            content:        'Click to visit your Artifact Room and swap Artifacts.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_2',
            avatarPosition: 'left',
            action:         null,
            cleanup:        null},
        {
            selector:       'details.issues-details.main-issues',
            title:          '⚠️ Have issues with Artifacts?',
            content:        'This panel holds FAQs. Let\'s see what\'s in here.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_3',
            avatarPosition: 'right',
            action:         () => {
                document.querySelector('.tab-button[data-tab="artifacts"]').click();
                const main = document.querySelector('details.issues-details.main-issues');
                if (main) main.open = true;},
            cleanup:        () => {
                const main = document.querySelector('details.issues-details.main-issues');
                if (main) main.open = false;}},
        {
            selector:       'details.issues-details.main-issues > details.issues-details',
            title:          '📙 FAQ',
            content:        'Several FAQs to answer your questions.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_4',
            avatarPosition: 'left',
            action:         () => {
                document.querySelector('.tab-button[data-tab="artifacts"]').click();
                const main = document.querySelector('details.issues-details.main-issues');
                if (main) main.open = true;
                const sub = main.querySelector('details.issues-details');
                if (sub) sub.open = true;},
            cleanup:        () => {
                const sub = document.querySelector('details.issues-details.main-issues > details.issues-details');
                if (sub) sub.open = false;}},
        {
            selector:       '.tab-button[data-tab="arpDetails"]',
            title:          '🛸 Details Tab',
            content:        'Track events, quests, and other daily activities here.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_5',
            avatarPosition: 'right',
            action:         () => {
                document.querySelector('.tab-button[data-tab="arpDetails"]').click();},
            cleanup:        () => {
                const main = document.querySelector('details.issues-details.main-issues');
                if (main) main.open = false;},
            waitFor:        () => new Promise(resolve => {
                const poll = () => {
                    if (document.querySelector('#specialEventsTable')) resolve();
                    else setTimeout(poll, 200);};
                poll();})},
        {
            selector:       '#specialEventsTable',
            title:          '📢 Special Events',
            content:        'You can visit Game Vault & Community Event by clicking on the titles here.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_6',
            avatarPosition: 'left',
            action:         null,
            cleanup:        null},
        {
            selector:       '#tabContent .section-title a[href*="/control-center"]',
            title:          '📺 Watch Twitch',
            content:        'Click to visit Control Center and see current live streamers.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_7',
            avatarPosition: 'right',
            action:         null,
            cleanup:        null,
            waitFor:        () => new Promise(resolve => {
                const poll = () => {
                    if (document.querySelector('#tabContent .section-title a[href*="/control-center"]'))
                        resolve();
                    else setTimeout(poll, 200);};
                poll();})},
        {
            selector:       '.tab-button[data-tab="info"]',
            title:          'ℹ️ Info Tab',
            content:        'You missed the Tier info? Here they are with many useful AWA related links.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_8',
            avatarPosition: 'left',
            action:         () => document.querySelector('.tab-button[data-tab="info"]').click(),
            cleanup:        () => {
                document.querySelector('.tab-button[data-tab="arpDetails"]').click();},
            waitFor:        () => new Promise(resolve => {
                const poll = () => {
                    if (document.querySelector('.info-links')) resolve();
                    else setTimeout(poll, 200);};
                poll();})},
        {
            selector:       '.info-links',
            title:          '🖥️ AWA Infos',
            content:        'Quick links to useful AWA tools & infos.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_9',
            avatarPosition: 'right',
            action:         null,
            cleanup:        null},
        {
            selector:       'details.issues-details > summary',
            title:          '❔ AWA FAQs',
            content:        'Some common issues solution can be found here.',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_10',
            avatarPosition: 'left',
            action:         () => {
                const first = document.querySelector('details.issues-details > summary');
                first?.parentElement && (first.parentElement.open = true);},
            cleanup:        () => {
                const first = document.querySelector('details.issues-details > summary');
                first?.parentElement && (first.parentElement.open = false);}},
        {
            selector:       '#toggleButton',
            title:          '🎉 And... that\'s ALL!',
            content:        'Hope it clears up things and enjoy exploring AWA with Megumin! 💟',
            mustClick:      false,
            avatarUrl:      'AVATAR_URL_STEP_11',
            avatarPosition: 'right',
            action:         () => {
                const w = document.getElementById('arpStatus');
                if (!w.classList.contains('minimized')) {
                    w.classList.add('minimized');}
                steps[idx].state = { minimized: true };},
            cleanup:        null}
    ];

    GM_addStyle(`
    .tour-overlay {
      position:fixed; top:0; left:0; width:100vw; height:100vh;
      background:rgba(0,0,0,0.6); z-index:9998; pointer-events:none;
    }
    .tour-highlight {
      position:relative!important; z-index:9999!important;
      box-shadow:0 0 0 3px #FFD700;
      animation:tourPulse 1.2s infinite ease-in-out;
    }
    @keyframes tourPulse {
      0%,100%{box-shadow:0 0 0 3px #FFD700;}
      50%   {box-shadow:0 0 0 8px #FFD70044;}
    }
    .tour-tooltip {
      position:absolute; z-index:9999;
      background:#111; color:#EEE;
      border:2px solid #FFD700
            border-radius:10px;
      padding:16px; max-width:380px;
      display:flex; align-items:flex-start;
      pointer-events:all; font-family:'Segoe UI',sans-serif;
      box-shadow:0 4px 12px rgba(0,0,0,0.8);
    }
    .tour-tooltip.avatar-right { flex-direction:row-reverse; }
    .tour-avatar {
      width:120px; height:120px;
      background-size:cover; background-position:center;
      margin:0 16px 0 0; flex-shrink:0; border-radius:8px;
    }
    .tour-title {
      color:#FFD700; font-size:18px; font-weight:bold;
      margin:0 0 10px;
    }
    .tour-content {
      font-size:15px; line-height:1.4; margin:0;
    }
    .tour-nav {
      margin-top:14px; text-align:right;
    }
    .tour-nav button {
      background:rgba(255,215,0,0.2); border:1px solid #FFD700;
      width:36px; height:36px; border-radius:6px;
      font-size:18px; color:#FFD700; cursor:pointer;
      margin-left:10px; display:inline-flex;
      align-items:center; justify-content:center;
      transition:background .2s;
    }
    .tour-nav button:hover:not(:disabled) {
      background:rgba(255,215,0,0.4);
    }
    .tour-nav button:disabled {
      opacity:0.3; cursor:default;
    }
  `);

    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';

    const tip = document.createElement('div');
    tip.className = 'tour-tooltip';
    tip.innerHTML = `
    <div class="tour-avatar"></div>
    <div style="flex:1">
      <div class="tour-title"></div>
      <div class="tour-content"></div>
      <div class="tour-nav">
        <button class="tour-prev">&lt;</button>
        <button class="tour-next">&gt;</button>
      </div>
    </div>
  `;
    document.body.append(overlay, tip);

    let idx = 0;
    const prevBtn = tip.querySelector('.tour-prev');
    const nextBtn = tip.querySelector('.tour-next');

    async function goTo(n) {
        const prev = idx;
        const prevStep = steps[prev];
        idx = n;
        if (n < prev && prevStep.cleanup) {
            prevStep.cleanup();
        }
        const step = steps[idx];
        step.action?.();
        if (step.waitFor) {
            nextBtn.disabled = true;
            await step.waitFor();
            nextBtn.disabled = false;
        }
        show();
    }

    function show() {
        if (idx === 0) {
            const w = document.getElementById('arpStatus');
            if (!w.classList.contains('minimized')) {
                document.querySelector('#toggleButton').click();
            }
        }
        document.querySelectorAll('.tour-highlight').forEach(el => {
            el.classList.remove('tour-highlight');
        });
        const s = steps[idx];
        if (idx === steps.length - 1) {
            const prevState = s.state || {};
            if (!prevState.minimized) {
                const w = document.getElementById('arpStatus');
                if (!w.classList.contains('minimized')) {
                    document.querySelector('#toggleButton').click();
                }
                s.state = { minimized: true };
            }
        }
        if (idx > 0 && idx < steps.length - 1) {
            const w = document.getElementById('arpStatus');
            if (w.classList.contains('minimized')) {
                document.querySelector('#toggleButton').click();
            }
        }
        const el = document.querySelector(s.selector);
        if (!el) {return finish();}
        el.classList.add('tour-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tip.querySelector('.tour-title').textContent   = s.title;
        tip.querySelector('.tour-content').textContent = s.content;
        const avatarDiv = tip.querySelector('.tour-avatar');
        avatarDiv.style.backgroundImage = s.avatarUrl
            ? `url('${s.avatarUrl}')`
            : '';
        tip.classList.toggle('avatar-right', s.avatarPosition === 'right');
        prevBtn.disabled    = (idx === 0);
        nextBtn.textContent = (idx === steps.length - 1 ? '💥' : '>');
        const M  = 8;
        const wr = document.getElementById('arpStatus').getBoundingClientRect();
        const er = el.getBoundingClientRect();
        tip.style.left = '0px';
        tip.style.top  = '0px';
        const tr = tip.getBoundingClientRect();
        let left, top;
        if (s.selector.includes('issues-details')) {
            left = window.scrollX + wr.left - tr.width - M;
            top  = window.scrollY + er.top;
        } else {
            left = window.scrollX + wr.left - tr.width - M;
            top  = window.scrollY + (idx === 0 ? er.top : er.bottom + M);
        }
        tip.style.left = `${left}px`;
        tip.style.top  = `${top}px`;
        if (s.mustClick) {
            nextBtn.disabled = true;
            el.addEventListener('click', () => {
                nextBtn.disabled = false;
                setTimeout(() => goTo(idx + 1), 200);
            }, { once: true });
        }
    }

    function prev() {
        if (idx > 0) goTo(idx - 1).catch(console.error);
    }
    function next() {
        if (idx === steps.length - 1) return finish();
        goTo(idx + 1).catch(console.error);
    }
    function finish() {
        steps[idx].cleanup?.();
        overlay.remove();
        tip.remove();
        document.querySelectorAll('.tour-highlight')
            .forEach(el => el.classList.remove('tour-highlight'));
        localStorage.setItem(TOUR_KEY, '1');
    }

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    setTimeout(() => goTo(0), 300);
})();