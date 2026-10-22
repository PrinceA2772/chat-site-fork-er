/**
 * halloween-notice.js — one-time "Halloween update" popup for ptr_29 Chat.
 *
 * Loads AFTER client.js so it can reuse the site's modal styling and showToast.
 * Shows exactly once per device per season, then never again: the dismissal is
 * remembered in localStorage under a year-scoped key, so next October it comes
 * back with the theme.
 *
 * Season gating mirrors halloween.js: October only, every year. Keep
 * SEASON_MONTH / SEASON_YEAR in step with that file.
 */
(function () {
  'use strict';

  var SEASON_MONTH = 9;     // October (zero-based)
  var SEASON_YEAR = null;   // null = every October; set a year to pin it
  var SEEN_KEY = 'ptr29_halloween_notice_v1';   // suffixed with the season year
  var DELAY_MS = 1400;      // let the room list settle before interrupting

  var today = new Date();
  if (today.getMonth() !== SEASON_MONTH) return;
  if (SEASON_YEAR !== null && today.getFullYear() !== SEASON_YEAR) return;

  var key = SEEN_KEY + ':' + today.getFullYear();
  try { if (localStorage.getItem(key) === '1') return; } catch (e) {}

  // Don't interrupt the signup gate / age gate: those own the screen first and
  // are dismissed later in the session. Wait until no gate is showing.
  function gateOpen() {
    if (document.getElementById('ag-overlay')) return true;
    if (document.getElementById('ag-age-overlay')) return true;
    if (document.getElementById('ag-terms-overlay')) return true;
    var open = document.querySelector('.modal-overlay.open');
    return !!open;
  }

  function build() {
    var overlay = document.createElement('div');
    overlay.id = 'hw-notice';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hw-notice-title');

    overlay.innerHTML =
      '<div class="modal hw-notice-card">' +
        '<div class="hw-notice-glow" aria-hidden="true"></div>' +
        '<button class="help-close" id="hw-notice-close" type="button" aria-label="Close">×</button>' +
        '<div class="hw-notice-emoji" aria-hidden="true">🎃</div>' +
        '<h3 id="hw-notice-title">Happy Halloween! 🎃</h3>' +
        '<p>ptr_29 Chat has gone full <strong>spooky season</strong> — a brand-new ' +
          '<strong>3D live-motion</strong> Halloween theme and backdrop, here for October only.</p>' +
        '<ul class="hw-notice-list">' +
          '<li>🌕 <strong>Live 3D scene</strong> behind the chat — moon, drifting stars and parallax graveyard that follows your cursor</li>' +
          '<li>🦇 <strong>Ghosts, bats &amp; jack-o\'-lanterns</strong> drifting through the fog</li>' +
          '<li>🎃 <strong>Tap the 🎃 in the header</strong> any time to switch it off (it comes back next October unless you turn it off again)</li>' +
          '<li>⏸ <strong>Keep it calm</strong> — the existing motion toggle still freezes every animation</li>' +
        '</ul>' +
        '<div class="hw-notice-actions">' +
          '<button id="hw-notice-ok" type="button">🎃 Enjoy the spooky season</button>' +
        '</div>' +
      '<p class="hw-notice-foot">Made for the community — thank you for chatting here. 🧡</p>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function open() {
    var overlay = build();
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      try { localStorage.setItem(key, '1'); } catch (e) {}
      overlay.classList.remove('open');
      setTimeout(function () { overlay.remove(); }, 260);
    }

    overlay.querySelector('#hw-notice-close').addEventListener('click', dismiss);
    overlay.querySelector('#hw-notice-ok').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dismiss();
    });

    // Next frame so the .open transition actually runs.
    requestAnimationFrame(function () { if (overlay) overlay.classList.add('open'); });
  }

  // Poll for a clear screen rather than guessing a fixed delay: the age gate,
  // account gate and terms modal can all appear after this script runs.
  var waited = 0;
  var timer = setInterval(function () {
    waited += 500;
    if (!gateOpen() && document.body) {
      clearInterval(timer);
      setTimeout(open, DELAY_MS);
    } else if (waited > 120000) {
      clearInterval(timer);   // gave up after two minutes of gates; skip quietly
    }
  }, 500);
})();
