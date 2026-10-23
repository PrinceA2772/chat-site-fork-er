/**
 * bug-report.js — in-site "Report a bug" form.
 *
 * Reports are submitted to the Supabase bug_reports table through the
 * submit_bug_report() RPC (supabase/037_bug_reports.sql). The operator reads
 * them there, and .github/workflows/bug-reports-to-issues.yml mirrors each new
 * row into a GitHub issue on this repo — no token ever reaches the browser.
 *
 * The form is available to logged-out visitors on purpose.
 */
(function () {
  'use strict';

  var KINDS = [
    ['bug',      '🐞 Something is broken'],
    ['display',  '🎨 Looks wrong / hard to read'],
    ['security', '🔒 Security or privacy'],
    ['content',  '🚫 Abusive or unwanted content'],
    ['other',    '💬 Something else']
  ];
  var SEVERITIES = [
    ['low',      'Minor — cosmetic, no rush'],
    ['normal',   'Normal — it gets in the way'],
    ['high',     'Major — a feature is unusable'],
    ['critical', 'Critical — data loss or security']
  ];

  var lastSent = 0;   // client-side cooldown, mirrors the server's hourly cap
  var COOLDOWN_MS = 30 * 1000;

  function buildCss() { /* styled in index.html via #bug-report-modal */ }

  function reportHref() {
    // Prefer a prefilled GitHub issue when the reporter wants to file it there.
    var base = 'https://github.com/gamer-09/chat-site/issues/new';
    return base;
  }

  function advisoryHref() {
    // Sensitive reports must NOT go through the public issue tracker and
    // SECURITY.md lives in the repo root, so it is never served by Pages —
    // linking it here would 404. GitHub's private advisory form is the
    // intended destination and matches what the issue templates tell people.
    return 'https://github.com/gamer-09/chat-site/security/advisories/new';
  }

  function build() {
    var overlay = document.createElement('div');
    overlay.id = 'bug-report-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bug-report-title');

    var kindOpts = KINDS.map(function (k) {
      return '<option value="' + k[0] + '">' + k[1] + '</option>';
    }).join('');
    var sevOpts = SEVERITIES.map(function (s, i) {
      return '<option value="' + s[0] + '"' + (i === 1 ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');

    overlay.innerHTML =
      '<div class="modal bug-report-card">' +
        '<button class="help-close" id="bug-report-close" type="button" aria-label="Close">×</button>' +
        '<h3 id="bug-report-title">🐞 Report a problem</h3>' +
        '<p class="bug-report-lead"><strong>All fields marked <span class="req">*</span> are required.</strong> ' +
          'Include steps to reproduce and expected vs actual behavior so it can be fixed quickly. ' +
          'No account needed — don\'t include passwords or personal details.</p>' +

        '<form id="bug-report-form" novalidate>' +
          '<label class="bug-field">' +
            '<span>Category <strong class="req">*</strong> <em>Pick the closest match</em></span>' +
            '<select id="bug-kind" name="kind" required>' + kindOpts + '</select>' +
          '</label>' +

          '<label class="bug-field">' +
            '<span>Short summary (one line) <strong class="req">*</strong> <em id="bug-title-count">0/160</em></span>' +
            '<input id="bug-title" name="title" type="text" maxlength="160" ' +
              'placeholder="e.g. Clicking Send duplicates messages in #general" autocomplete="off" required>' +
          '</label>' +

          '<label class="bug-field">' +
            '<span>Expected vs actual <strong class="req">*</strong> <em id="bug-details-count">0/6000</em></span>' +
            '<textarea id="bug-details" name="details" rows="5" maxlength="6000" ' +
              'placeholder="I was doing...&#10;I expected...&#10;Instead, this happened..." required></textarea>' +
          '</label>' +

          '<label class="bug-field">' +
            '<span>Steps to reproduce (exactly) <strong class="req">*</strong></span>' +
            '<textarea id="bug-steps" name="steps" rows="4" maxlength="3000" ' +
              'placeholder="1. Go to #room-name&#10;2. Click/tap ...&#10;3. Do ...&#10;Result: ..." required></textarea>' +
          '</label>' +

          '<label class="bug-field">' +
            '<span>Impact / severity <strong class="req">*</strong> <em>Pick how bad it is</em></span>' +
            '<select id="bug-severity" name="severity" required>' + sevOpts + '</select>' +
          '</label>' +

          '<label class="bug-field">' +
            '<span>Contact you back? <em>optional</em></span>' +
            '<input id="bug-contact" name="contact" type="text" maxlength="200" ' +
              'placeholder="Username or email — only if you want a reply" autocomplete="off">' +
          '</label>' +

          '<details class="bug-details-auto">' +
            '<summary>Technical details that will be attached</summary>' +
            '<pre id="bug-auto"></pre>' +
          '</details>' +

          '<p id="bug-report-status" class="bug-report-status" role="status" hidden></p>' +

          '<div class="modal-actions bug-report-actions">' +
            '<button type="button" id="bug-report-cancel" class="secondary">Cancel</button>' +
            '<button type="submit" id="bug-report-send">Send report</button>' +
          '</div>' +
        '</form>' +

        '<p class="bug-report-foot">Prefer GitHub? ' +
          '<a href="' + reportHref() + '" target="_blank" rel="noopener noreferrer">Open an issue directly</a>. ' +
          'For anything sensitive, use <a href="' + advisoryHref() + '" target="_blank" rel="noopener noreferrer">private ' +
          'vulnerability reporting</a> instead — please don\'t put vulnerabilities in a public report.</p>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function buildMeta() {
    var meta = document.querySelector('meta[name="ptr29-build"]');
    var build = meta && meta.content;
    if (build === '__BUILD__') build = 'dev';
    return {
      userAgent: navigator.userAgent || '',
      viewport: window.innerWidth + 'x' + window.innerHeight + '@' + (window.devicePixelRatio || 1),
      theme: document.documentElement.classList.contains('ptr29-light-theme') ? 'light' : 'dark',
      build: build || '',
      pageUrl: location.href
    };
  }

  var overlay = null;

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    var n = overlay;
    overlay = null;
    setTimeout(function () { if (n) n.remove(); }, 260);
  }

  function setStatus(msg, type) {
    var s = overlay && overlay.querySelector('#bug-report-status');
    if (!s) return;
    if (!msg) { s.hidden = true; s.textContent = ''; return; }
    s.hidden = false;
    s.className = 'bug-report-status' + (type ? ' ' + type : '');
    s.textContent = msg;
  }

  function open() {
    if (overlay) return;
    overlay = build();

    var meta = buildMeta();
    var auto = overlay.querySelector('#bug-auto');
    if (auto) {
      auto.textContent =
        'Build:      ' + (meta.build || 'unknown') + '\n' +
        'Theme:      ' + meta.theme + '\n' +
        'Viewport:   ' + meta.viewport + '\n' +
        'Page:       ' + meta.pageUrl + '\n' +
        'User agent: ' + meta.userAgent;
    }

    // Live character counters so a long paste doesn't silently truncate.
    var pairs = [['#bug-title', '#bug-title-count', 160], ['#bug-details', '#bug-details-count', 6000]];
    pairs.forEach(function (p) {
      var input = overlay.querySelector(p[0]);
      var out = overlay.querySelector(p[1]);
      if (!input || !out) return;
      var sync = function () { out.textContent = input.value.length + '/' + p[2]; };
      input.addEventListener('input', sync);
      sync();
    });

    overlay.querySelector('#bug-report-close').addEventListener('click', close);
    overlay.querySelector('#bug-report-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay) close();
    });

    overlay.querySelector('#bug-report-form').addEventListener('submit', submit);

    requestAnimationFrame(function () { if (overlay) overlay.classList.add('open'); });
    var t = overlay.querySelector('#bug-title');
    if (t) setTimeout(function () { try { t.focus(); } catch (e) {} }, 120);
  }

  function submit(e) {
    e.preventDefault();
    if (!overlay) return;

    var title = (overlay.querySelector('#bug-title').value || '').trim();
    var details = (overlay.querySelector('#bug-details').value || '').trim();
    var steps = (overlay.querySelector('#bug-steps').value || '').trim();
    var contact = (overlay.querySelector('#bug-contact').value || '').trim();
    var kind = overlay.querySelector('#bug-kind').value;
    var severity = overlay.querySelector('#bug-severity').value;
    var sendBtn = overlay.querySelector('#bug-report-send');

    if (title.length < 3) { setStatus('Add a short one-line summary (at least 3 characters).', 'error'); return; }
    if (details.length < 10) { setStatus('Describe expected vs actual (at least 10 characters).', 'error'); return; }
    if (steps.length < 10) { setStatus('Add clear steps to reproduce (include actions in order).', 'error'); return; }

    if (Date.now() - lastSent < COOLDOWN_MS) {
      var wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      setStatus('Just sent one — please wait ' + wait + 's before sending another.', 'error');
      return;
    }

    var api = window.ChatAPI;
    if (!api || typeof api.submitBugReport !== 'function') {
      setStatus('The report service is unavailable right now. Please try again later, ' +
        'or open an issue on GitHub using the link below.', 'error');
      return;
    }

    var meta = buildMeta();
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    setStatus('');

    api.submitBugReport({
      kind: kind, title: title, details: details, steps: steps, severity: severity,
      pageUrl: meta.pageUrl, userAgent: meta.userAgent, viewport: meta.viewport,
      theme: meta.theme, build: meta.build, contact: contact
    }).then(function (res) {
      if (!overlay) return;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send report';

      if (res && res.ok) {
        lastSent = Date.now();
        setStatus('✅ Thank you — your report was sent. I read every one.', 'success');
        var form = overlay.querySelector('#bug-report-form');
        if (form) form.reset();
        setTimeout(close, 2200);
        return;
      }

      var code = res && res.error;
      if (code === 'rate_limited') {
        setStatus('That\'s a few reports in a short time — please try again in an hour.', 'error');
      } else if (code === 'title_too_short' || code === 'details_too_short') {
        setStatus('Please add a bit more detail before sending.', 'error');
      } else if (code && /function|does not exist|schema cache/i.test(code)) {
        setStatus('Reporting isn\'t set up on this deployment yet. Please use the GitHub link below.', 'error');
      } else {
        setStatus('Could not send the report (' + (code || 'unknown') + '). ' +
          'Please try again, or use the GitHub link below.', 'error');
      }
    }).catch(function () {
      if (!overlay) return;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send report';
      setStatus('Could not reach the server. Check your connection and try again.', 'error');
    });
  }

  function installButton() {
    // Sits beside the existing Contact button so both are in the same place.
    var host = document.querySelector('header .header-actions');
    if (!host || document.getElementById('bug-report-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'bug-report-btn';
    btn.className = 'secondary';
    btn.type = 'button';
    btn.title = 'Report a bug';
    btn.setAttribute('aria-label', 'Report a bug');
    btn.textContent = '🐞';
    btn.addEventListener('click', open);

    // After 🎓 tour / before 📥 inbox keeps the emoji row visually ordered.
    var anchor = document.getElementById('inbox-btn');
    if (anchor && anchor.parentNode === host) host.insertBefore(btn, anchor);
    else host.appendChild(btn);
  }

  // Also reachable from the Help modal, where people look for support.
  function installHelpLink() {
    var inner = document.querySelector('.help-modal-inner');
    if (!inner || document.getElementById('bug-report-help-btn')) return;
    var b = document.createElement('button');
    b.id = 'bug-report-help-btn';
    b.type = 'button';
    b.className = 'secondary';
    b.textContent = '🐞 Report a bug';
    b.style.margin = '10px 0 0';
    b.addEventListener('click', function () {
      var help = document.getElementById('help-modal');
      if (help) help.classList.remove('open');
      setTimeout(open, 250);
    });
    inner.appendChild(b);
  }

  function start() {
    installButton();
    installHelpLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.PTR29BugReport = { open: open, close: close };
})();
