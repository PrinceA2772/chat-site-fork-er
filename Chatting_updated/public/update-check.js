/**
 * update-check.js — "a new version is available, refresh?" notice.
 *
 * Deliberately INDEPENDENT of client.js checkBuildFreshness(). That one fires
 * once at page load and reloads the page silently. This one runs on a timer
 * for the whole life of the tab and never reloads on its own: it only offers.
 * That is what catches the case the other one cannot — a tab that was already
 * open when a deploy landed.
 *
 * Both read the same two deploy-time artifacts, so there is nothing new to
 * stamp or configure:
 *   <meta name="ptr29-build" content="...">  in index.html
 *   version.json                             written by the Pages workflow
 *
 * State lives under its own keys so the two checkers can't interfere.
 */
(function () {
  'use strict';

  var POLL_MS = 5 * 60 * 1000;      // check every 5 minutes
  var FIRST_DELAY_MS = 45 * 1000;   // don't compete with first paint / the tour
  var DISMISS_KEY = 'ptr29_update_dismissed_build';
  var TOASTED_KEY = 'ptr29_update_toasted_build';

  function myBuild() {
    var meta = document.querySelector('meta[name="ptr29-build"]');
    var v = meta && meta.content;
    // '__BUILD__' / 'dev' are the un-stamped local values: nothing to compare.
    if (!v || v === '__BUILD__' || v === 'dev') return null;
    return v;
  }

  function dismissedFor(build) {
    try { return sessionStorage.getItem(DISMISS_KEY) === build; } catch (e) { return false; }
  }

  var overlay = null;

  function build(serverBuild) {
    overlay = document.createElement('div');
    overlay.id = 'update-notice';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'update-notice-title');

    overlay.innerHTML =
      '<div class="modal update-notice-card">' +
        '<div class="update-notice-icon" aria-hidden="true">🚀</div>' +
        '<h3 id="update-notice-title">A new version is ready</h3>' +
        '<p>ptr_29 Chat has been updated since this tab was opened. ' +
          'Refresh to load the latest version — your messages and rooms are saved.</p>' +
        '<div class="update-notice-actions">' +
          '<button type="button" id="update-notice-later" class="secondary">Not now</button>' +
          '<button type="button" id="update-notice-go">Refresh now</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function close() {
      if (overlay) { overlay.classList.remove('open'); }
      var n = overlay;
      overlay = null;
      setTimeout(function () { if (n) n.remove(); }, 260);
    }

    // 'Not now' silences this build for the rest of the tab session, so it
    // cannot nag someone who is mid-conversation.
    function later() {
      try { sessionStorage.setItem(DISMISS_KEY, serverBuild); } catch (e) {}
      close();
    }

    function go() {
      // Remember which build we are loading so a stale service-worker or a
      // proxy cache cannot bounce the user straight back onto the old shell.
      try { sessionStorage.setItem('ptr29_reloaded_for', serverBuild); } catch (e) {}
      location.reload();
    }

    overlay.querySelector('#update-notice-later').addEventListener('click', later);
    overlay.querySelector('#update-notice-go').addEventListener('click', go);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) later(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay) later();
    });

    requestAnimationFrame(function () { if (overlay) overlay.classList.add('open'); });
  }

  function announce(serverBuild) {
    if (overlay) return;                 // already showing
    if (dismissedFor(serverBuild)) return;
    // Never stack on top of the age/terms/signup gates.
    if (document.getElementById('ag-overlay') ||
        document.getElementById('ag-age-overlay') ||
        document.getElementById('ag-terms-overlay')) return;
    try {
      if (sessionStorage.getItem(TOASTED_KEY) === serverBuild) return;
      sessionStorage.setItem(TOASTED_KEY, serverBuild);
    } catch (e) {}
    build(serverBuild);
  }

  function check() {
    var mine = myBuild();
    if (!mine) return;                   // local/dev build: nothing to compare
    if (document.hidden) return;         // don't interrupt a background tab

    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.build || data.build === 'dev') return;
        if (data.build === mine) return;
        announce(data.build);
      })
      .catch(function () { /* offline: try again next tick */ });
  }

  function start() {
    setTimeout(function () {
      check();
      setInterval(check, POLL_MS);
    }, FIRST_DELAY_MS);
    // A tab left open overnight should learn about a deploy as soon as the
    // person comes back to it.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // Exposed so the flow can be exercised without waiting on the poll timer.
  window.PTR29UpdateCheck = { check: check, _announce: announce, _myBuild: myBuild };
})();
