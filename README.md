# X (Twitter) Auto Bulk Delete — Free Userscript

Automatically watch your tweet count on X (formerly Twitter) and, once it crosses a threshold, offer to bulk-delete your tweets, replies, and retweets. No app to install, no API key, no paid service — it runs entirely in your browser using your own logged-in session, so nothing ever leaves your machine.

Originally created by [backzso](https://github.com/backzso/tweetdelete); this fork continues it with a couple of bug fixes and behavior tweaks (see [Changes in this fork](#changes-in-this-fork)).

⚠️ **Deletion is permanent and irreversible.** There is no undo, and no built-in backup step — if you want to keep a copy of anything before running this, save it yourself first.

## Features

- 🗑️ Deletes tweets, replies, and retweets automatically once you confirm
- 🆓 Completely free — no subscription, no third-party service
- 🔒 Private — no login/password required beyond your existing X session, nothing leaves your browser
- 🔁 Chains batches on its own after you confirm once, without re-prompting every time
- ⏱️ Backs off automatically on rate limits, including a longer cooldown if X keeps rate-limiting in a row

## How it works

The script authenticates with the `ct0` CSRF cookie already present in your logged-in session and calls X's own GraphQL mutations — `DeleteTweet` and `DeleteRetweet` — the same endpoints the website itself uses. It scrolls your profile timeline and acts on whatever's currently rendered, so it only reaches tweets X is willing to load into the page — there's no archive/full-history mode.

## Usage

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Add `tweetdelete.user.js` as a new script (see [`install-guide.md`](./install-guide.md) for a full step-by-step with a `THRESHOLD` explainer).
3. Set your X display language to **English** — the script reads your post count from the page text and is only reliably tested against English.
4. Go to your own profile, **Posts** tab first. The script detects your post count and asks whether to start deleting.
5. Confirm once — it'll keep going batch after batch, then move on to the **Replies** tab the same way once you navigate there.
6. Stop anytime by typing `STOP_DELETE = true` in the console.

It never deletes silently — you always confirm before the first batch.

## Keep the tab open and in the foreground

The script scrolls the page and reads tweets out of the live DOM to work. If you switch away or minimize the window mid-run, X stops rendering new tweets into a tab that isn't visible, so it'll typically just sit there waiting rather than erroring out — it won't stop on its own, and picks back up once the tab is in front again. It only stops if you run `STOP_DELETE = true` yourself or close the tab.

## Configuration

All options live at the top of `tweetdelete.user.js`:

| Option | Default | Purpose |
|---|---|---|
| `THRESHOLD` | `0` | Minimum post count that triggers the prompt. `0` offers to run any time; raise it if you'd rather only be asked once your count builds back up. |
| `CHECK_EVERY_MS` | `60000` | How often it re-checks your post count while you're on your profile. |
| `AUTO_CONFIRM` | `false` | If `true`, skips the confirmation dialog entirely. Off by default on purpose. |
| `DELETE_DELAY_MIN_MS` / `DELETE_DELAY_MAX_MS` | `1500` / `3000` | Randomized delay range between delete calls. |
| `SCROLL_DELAY_MS` | `1500` | Wait after each scroll for new tweets to load. |
| `MAX_IDLE_SCROLLS` | `12` | Stop the current batch after this many scrolls with no new tweets. |
| `ONLY_HANDLES` | `[]` | Restrict the script to specific handles; empty allows any profile you open. |

## Rate limits

X enforces deletion limits server-side, per account — they can't be bypassed by any client-side trick. When the limit is hit, the script reads X's `x-rate-limit-reset` header and waits until the window resets, then resumes automatically. If it gets rate-limited three times in a row, it treats that as a longer account-level cooldown and backs off harder instead of retrying every 15 minutes. Just leave the tab open.

## Changes in this fork

- Fixed a bug where the confirmation dialog kept reappearing mid-run: the post count changes *while* deleting, so every periodic check saw a "new" count and re-prompted. It now tracks whether a run is already active and skips re-prompting.
- Once you confirm for an account, it now auto-continues batch after batch on its own (previously it stopped and waited for the next scheduled check, which could re-trigger the dialog).
- A deliberate `STOP_DELETE = true` now sticks — it won't silently resume on the next check until you confirm again.
- Delay range tuned to a middle ground between the original's more conservative pacing and a more aggressive value that was triggering 429s.

## Notes

- This relies on X's current internal API and some DOM scraping (reading text labels to detect post counts and reposts). Both can break if X changes something on their end — expect bugs, and don't assume a run did exactly what you expected without checking your profile afterward.
- This is a quick fix, not a polished, thoroughly tested tool.
- Likes are out of scope.

## FAQ

**Is it safe / will I get banned?** It uses X's own internal endpoints with your existing session and respects rate limits, so it behaves like normal usage. It only ever touches your own account. Still, use at your own risk.

**Do I need the X API or a developer account?** No. This doesn't use the official API at all.

**Can it delete my entire history, including old tweets that don't show up anymore?** No — it only acts on what X renders into your profile timeline as you scroll. There's no archive-import mode in this fork.

## Disclaimer

For managing your own account only. Use at your own risk; the author is not responsible for data loss.
