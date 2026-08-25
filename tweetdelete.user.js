// ==UserScript==
// @name         X (Twitter) Auto Bulk Delete
// @namespace    https://github.com/Diegodmeloguerrero/tweetdelete
// @version      1.0.2
// @description  Watches your tweet count on X and, once it crosses a threshold, offers to bulk-delete your tweets, replies, and retweets. Runs in your own browser session — no API key, nothing stored server-side.
// @author       backzso, modified by Harke
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Diegodmeloguerrero/tweetdelete
// @supportURL   https://github.com/Diegodmeloguerrero/tweetdelete/issues
// @updateURL    https://raw.githubusercontent.com/Diegodmeloguerrero/tweetdelete/main/tweetdelete.user.js
// @downloadURL  https://raw.githubusercontent.com/Diegodmeloguerrero/tweetdelete/main/tweetdelete.user.js
// ==/UserScript==

/*
 * Original script by backzso (https://github.com/backzso/tweetdelete).
 * Modifications (concurrency guard fix, delay tuning) by Harke
 * (https://github.com/Diegodmeloguerrero/tweetdelete).
 *
 * Automation wrapper around the console deleter (delete-tweets.js).
 *
 * FIXES vs 1.0.1:
 *  - tick() now checks a "deletion in progress" flag before doing anything.
 *    Previously, since the post count keeps changing *while* runDelete() is
 *    deleting things, every 60s re-check (or SPA nav re-check) saw a "new"
 *    count and fired confirm() again mid-run. Now tick() just returns early
 *    while a run is active, and re-arms once it finishes.
 *  - DELETE_DELAY_MIN/MAX_MS moved to a middle-ground value. 400ms was too
 *    aggressive and triggered 429s; back to something closer to human pacing
 *    but not as conservative as the original 3-6s.
 *
 * FIXES vs 1.0.0:
 *  - gqlPost now logs the actual API error body to console instead of
 *    swallowing it, so failures are diagnosable (see window.STOP_DELETE / console).
 *  - Retweet detection no longer relies on the hidden dropdown-only
 *    data-testid="unretweet" node (which is only present after opening the
 *    caret menu). It now reads the "socialContext" label X renders above a
 *    post you reposted ("You reposted" / "Reposteaste" / etc.) as the
 *    primary signal, with the old selector kept as a fallback.
 *  - readTweetCount() accepts a couple more locale variants.
 *  - If a delete/unretweet call fails, the reason is now shown in the toast
 *    (truncated) instead of just a silent "failed" counter.
 *
 * STILL DEPENDS ON X's INTERNAL API:
 *  - The DeleteTweet / DeleteRetweet queryId values below are the ones known
 *    at the time this was written. X rotates these periodically. If you see
 *    every action end up in "failed" and the console shows an error like
 *    "does not exist" / "not found" for the graphql endpoint, that's the
 *    signal the queryId is stale. To get current ones: open your profile on
 *    x.com, open DevTools > Network, filter "graphql", delete or retweet one
 *    post manually via the UI, and copy the queryId from the request URL
 *    (…/i/api/graphql/<queryId>/DeleteTweet or …/DeleteRetweet).
 */

(function () {
  'use strict';

  // ============================ SETTINGS ============================
  const THRESHOLD = 0;        // trigger once your tweet count reaches this
  const CHECK_EVERY_MS = 60000;  // how often to re-check the count while on your profile
  const AUTO_CONFIRM = false;    // false: always ask before deleting (recommended)
  const DELETE_DELAY_MIN_MS = 1500;  // minimum wait between delete calls (ms)
  const DELETE_DELAY_MAX_MS = 3000;  // maximum wait between delete calls (ms) — randomized to vary pacing between calls
  const SCROLL_DELAY_MS = 1500;  // wait after each scroll for tweets to load (ms)
  const MAX_IDLE_SCROLLS = 12;   // stop after this many scrolls with no new tweets
  // Only act on these accounts (lowercase handles). Leave empty to allow any
  // profile you own that you happen to open — but pinning it is safer.
  const ONLY_HANDLES = [];       // e.g. ['backzso']
  // =================================================================

  const LS_KEY = 'tweetdelete_last_prompt';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (name) =>
    document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))?.[2];

  window.STOP_DELETE = window.STOP_DELETE ?? false;
  // NEW: guard so tick() doesn't re-prompt while a run is already active.
  window.__td_running = window.__td_running ?? false;
  // NEW: once the user confirms once for a given handle in this tab, keep
  // auto-continuing batch after batch (runDelete stops every MAX_IDLE_SCROLLS
  // when the timeline stalls) without asking again. Cleared if the user
  // deliberately sets STOP_DELETE = true, so a manual stop stays stopped
  // instead of silently resuming on the next tick.
  window.__td_confirmed_handle = window.__td_confirmed_handle ?? null;

  // ---------- toast so the user sees the script is alive ----------
  function toast(msg, ms = 4000) {
    let el = document.getElementById('td-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'td-toast';
      el.style.cssText =
        'position:fixed;z-index:99999;bottom:20px;right:20px;max-width:320px;' +
        'background:#15202b;color:#fff;border:1px solid #38444d;border-radius:12px;' +
        'padding:12px 16px;font:14px/1.4 system-ui;box-shadow:0 4px 16px rgba(0,0,0,.4)';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    if (ms) el._t = setTimeout(() => (el.style.display = 'none'), ms);
  }

  // ---------- read the tweet count from the profile header ----------
  // The header shows e.g. "733 posts" / "1.2K posts" under the display name.
  function readTweetCount() {
    for (const n of document.querySelectorAll('div, span')) {
      const t = n.textContent?.trim();
      if (!t) continue;
      // Added a couple more locale/legacy wordings ("Tweets", "tuits").
      const sub = t.match(/^([\d.,]+)([KMB])?\s*(posts|gönderi|tweets|tuits)$/i);
      if (sub) return parseCompact(sub[1] + (sub[2] || ''));
    }
    return null;
  }

  function parseCompact(s) {
    s = s.replace(/,/g, '');
    const mult = /K$/i.test(s) ? 1e3 : /M$/i.test(s) ? 1e6 : /B$/i.test(s) ? 1e9 : 1;
    return Math.round(parseFloat(s) * mult);
  }

  function myHandleFromPath() {
    const h = location.pathname.split('/')[1]?.toLowerCase();
    if (!h || ['home', 'search', 'explore', 'notifications', 'i', 'messages', 'settings'].includes(h)) return null;
    return h;
  }

  // ---------- detect "you reposted this" without opening any menu ----------
  // X renders a small label above reposts you made, e.g.
  // <span data-testid="socialContext">You reposted</span> (or localized
  // equivalents like "Reposteaste"). We match on that instead of the
  // dropdown-only [data-testid="unretweet"] node, which isn't in the DOM
  // until you manually open the tweet's caret menu.
  function isRepostByMe(article) {
    const ctx = article.querySelector('[data-testid="socialContext"]');
    if (ctx) {
      const t = ctx.textContent?.trim().toLowerCase() || '';
      if (/repost|retweet|reposte|retuit/i.test(t)) return true;
    }
    // Fallback to the old selector in case the menu happens to be open/cached.
    return !!article.querySelector('[data-testid="unretweet"]');
  }

  // ============================ DELETE CORE ============================
  // (Same GraphQL approach as delete-tweets.js, timeline mode.)
  function buildHeaders() {
    const csrf = getCookie('ct0');
    if (!csrf) return null;
    return {
      authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-csrf-token': csrf,
      'content-type': 'application/json',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
    };
  }

  async function gqlPost(headers, queryId, opName, variables) {
    let netErrors = 0;
    let rateLimitHits = 0;
    while (true) {
      if (window.STOP_DELETE) return { stopped: true };
      let res;
      try {
        res = await fetch(`https://x.com/i/api/graphql/${queryId}/${opName}`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ variables, queryId }),
        });
      } catch (e) {
        if (++netErrors > 8) return { failed: true, reason: 'network error' };
        await sleep(10000 * netErrors);
        continue;
      }
      if (res.status === 429) {
        rateLimitHits++;
        const reset = Number(res.headers.get('x-rate-limit-reset'));
        let waitMs = reset ? reset * 1000 - Date.now() + 5000 : 15 * 60 * 1000;
        waitMs = Math.min(Math.max(waitMs, 5000), 16 * 60 * 1000);
        // If we keep getting 429'd even after waiting out the header's reset
        // time, X has likely applied a longer account-level cooldown on
        // write actions, not just a normal per-window rate limit. Back off
        // harder instead of hammering it every 15 min.
        if (rateLimitHits >= 3) {
          waitMs = Math.max(waitMs, 45 * 60 * 1000);
          toast(`Rate limited ${rateLimitHits}x in a row — this looks like an account-level cooldown, ` +
                `not a normal limit. Waiting ${Math.ceil(waitMs / 60000)} min. Consider stopping ` +
                `and resuming later with a slower delay if this keeps happening.`, waitMs);
        } else {
          toast(`Rate limit — waiting ${Math.ceil(waitMs / 60000)} min, then resuming...`, waitMs);
        }
        await sleep(waitMs);
        continue;
      }
      rateLimitHits = 0;
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.errors) return { ok: true };
      const msg = JSON.stringify(body.errors ?? body);
      // Always log the real reason so failures are diagnosable.
      console.warn(`[tweetdelete] ${opName} failed (HTTP ${res.status}):`, msg);
      if (/not found|no status found|already|deleted/i.test(msg)) return { gone: true };
      return { failed: true, reason: msg.slice(0, 120) };
    }
  }

  async function runDelete(myHandle) {
    const headers = buildHeaders();
    if (!headers) { toast('No session (ct0 cookie missing). Log in first.'); return; }

    window.STOP_DELETE = false;
    window.__td_running = true; // NEW: block tick() from re-prompting
    const stats = { deleted: 0, unretweeted: 0, gone: 0, failed: 0 };
    const processed = new Set();
    let idleScrolls = 0;

    toast('Deleting… type STOP_DELETE = true in the console to stop.', 6000);

    try {
      while (idleScrolls < MAX_IDLE_SCROLLS && !window.STOP_DELETE) {
        const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
        let acted = false;

        for (const article of articles) {
          if (window.STOP_DELETE) break;
          const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
          if (!link) continue;
          const m = link.getAttribute('href').match(/^\/([^/]+)\/status\/(\d+)/);
          if (!m) continue;
          const [, author, id] = m;
          if (processed.has(id)) continue;
          processed.add(id);

          const isMyRetweet = isRepostByMe(article);
          const isMyTweet = author.toLowerCase() === myHandle;
          if (!isMyRetweet && !isMyTweet) continue;

          const r = isMyRetweet
            ? await gqlPost(headers, 'iQtK4dl5hBmXewYZuEOKVw', 'DeleteRetweet', { source_tweet_id: id, dark_request: false })
            : await gqlPost(headers, 'nxpZCY2K-I6QoFHAHeojFQ', 'DeleteTweet', { tweet_id: id, dark_request: false });
          acted = true;
          if (r.ok) isMyRetweet ? stats.unretweeted++ : stats.deleted++;
          else if (r.gone) stats.gone++;
          else if (r.stopped) {
            // Manual stop: don't let the next tick() silently resume.
            window.__td_confirmed_handle = null;
            toast('Stopped.');
            return finish(stats);
          }
          else {
            stats.failed++;
            if (r.reason) toast(`Failed on ${id}: ${r.reason}`, 5000);
          }

          // Live progress in the console after every single action.
          console.log(
            `[tweetdelete] ${isMyRetweet ? 'unretweet' : 'delete'} ${r.ok ? 'OK' : r.gone ? 'already gone' : 'FAILED'} ` +
            `(id ${id}) — totals: deleted ${stats.deleted}, unretweeted ${stats.unretweeted}, ` +
            `gone ${stats.gone}, failed ${stats.failed}`
          );

          article.closest('div[data-testid="cellInnerDiv"]')?.remove();
          const delay = DELETE_DELAY_MIN_MS + Math.random() * (DELETE_DELAY_MAX_MS - DELETE_DELAY_MIN_MS);
          await sleep(delay);
        }

        if (acted) {
          idleScrolls = 0;
          toast(`Deleted ${stats.deleted}, unretweeted ${stats.unretweeted}…`, 3000);
        } else if (document.hidden) {
          // Tab is backgrounded — X's virtualized list stops rendering new
          // tweets while not visible, so "no new tweets found" here doesn't
          // mean we're actually done. Don't burn idle-scroll attempts on it,
          // just wait for the tab to come back to the foreground.
          idleScrolls = 0;
        } else {
          idleScrolls++;
        }
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(SCROLL_DELAY_MS);
      }
      finish(stats);
    } finally {
      // NEW: always clear the guard, even on early return / thrown error,
      // so tick() can resume normal prompting afterwards.
      window.__td_running = false;
      // NEW: if this batch stopped because the timeline stalled (not because
      // of a manual STOP_DELETE, which already cleared __td_confirmed_handle
      // above) and the user is still confirmed, chain into the next batch
      // shortly instead of waiting up to CHECK_EVERY_MS.
      if (window.__td_confirmed_handle === myHandle && !window.STOP_DELETE) {
        setTimeout(tick, 5000);
      }
    }
  }

  function finish(stats) {
    toast(
      `Done. Deleted ${stats.deleted}, unretweeted ${stats.unretweeted}, ` +
      `already gone ${stats.gone}, failed ${stats.failed}. Refresh & reopen your profile to continue.`,
      12000
    );
    console.log('[tweetdelete] finished', stats);
  }

  // ============================ WATCH LOOP ============================
  async function tick() {
    // NEW: bail out immediately if a run is already in progress — this is
    // the actual fix for the repeated confirm() dialog. The post count
    // legitimately changes while deleting, so without this guard every
    // periodic/SPA-nav tick() saw a "new" count and re-prompted mid-run.
    if (window.__td_running) return;

    const myHandle = myHandleFromPath();
    if (!myHandle) return;
    if (ONLY_HANDLES.length && !ONLY_HANDLES.includes(myHandle)) return;

    const count = readTweetCount();
    if (count == null) return; // header not rendered yet
    console.log(`[tweetdelete] @${myHandle} has ~${count} posts (threshold ${THRESHOLD})`);

    if (count < THRESHOLD) return;

    // NEW: already confirmed for this handle in this tab — keep chaining
    // batches (runDelete stops every MAX_IDLE_SCROLLS when the timeline
    // stalls) without asking again. A manual STOP_DELETE clears this.
    if (window.__td_confirmed_handle === myHandle) {
      await runDelete(myHandle);
      return;
    }

    // Don't nag repeatedly in the same session/day for the same count.
    const last = localStorage.getItem(LS_KEY);
    const stamp = new Date().toISOString().slice(0, 10) + ':' + count;
    if (last === stamp) return;

    if (AUTO_CONFIRM ||
        confirm(`@${myHandle} has reached ~${count} posts (threshold ${THRESHOLD}).\n\n` +
                `Delete your tweets, replies and retweets now?\n\n` +
                `This is permanent. Click Cancel to skip.\n\n` +
                `(You'll only be asked once per tab — it'll keep going batch ` +
                `after batch until done or you stop it manually.)`)) {
      localStorage.setItem(LS_KEY, stamp);
      window.__td_confirmed_handle = myHandle;
      await runDelete(myHandle);
    } else {
      localStorage.setItem(LS_KEY, stamp); // remember the decline so it won't re-ask this count today
      toast('Skipped. Will ask again when the count changes.');
    }
  }

  // Kick off: check now and then on an interval while the tab is open.
  setTimeout(tick, 4000);
  setInterval(tick, CHECK_EVERY_MS);
  // Re-check on client-side navigation (X is a SPA).
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; setTimeout(tick, 2500); }
  }, 1500);

  console.log('[tweetdelete] userscript loaded. Threshold:', THRESHOLD);
})();
