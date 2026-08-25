# Installing the X (Twitter) Auto Bulk Delete Userscript

This guide walks you through installing and setting up the `tweetdelete.user.js` script so it runs automatically on x.com / twitter.com.

> **⚠️ Set X's display language to English first.** The script reads your post count directly from the page text (e.g. `"733 posts"`), and while it recognizes a few locale variants, it's only reliably tested against English. Go to **X → Settings → Accessibility, display, and languages → Languages → Display language** and set it to **English** before continuing, otherwise the script may fail to detect your post count.

## 1. Install [Tampermonkey](https://www.tampermonkey.net/)

Tampermonkey is a browser extension that runs userscripts on pages you visit.

1. Go to the extension store for your browser (Chrome Web Store, Firefox Add-ons, Edge Add-ons, etc.) and search for **Tampermonkey**.
2. Click **Add to [Browser]** / **Install**, then confirm in the permissions popup.
3. Once installed, you'll see the Tampermonkey icon (a black-and-white checkered dashboard icon) in your browser's toolbar.

## 2. Open the Tampermonkey Dashboard

1. Click the Tampermonkey icon in the toolbar.
2. From the dropdown menu, select **Dashboard**.

## 3. Create a New Script

1. In the Dashboard, click the **+** tab (or **Create a new script**) near the top.
2. This opens Tampermonkey's built-in code editor with a default template already in it.

## 4. Paste the Script

1. Select all the default template code in the editor (Ctrl+A / Cmd+A) and delete it.
2. Paste the full contents of `tweetdelete.user.js` in its place.
3. Save with **File → Save** or Ctrl+S / Cmd+S.

## 5. Confirm It's Enabled

1. Back in the Dashboard's script list, find **X (Twitter) Auto Bulk Delete**.
2. Make sure the toggle switch next to it is **on** (green).

## 6. About `THRESHOLD`

Near the top of the script there's a settings block with a `THRESHOLD` constant:

```js
const THRESHOLD = 0;  // trigger once your tweet count reaches this
```

This controls the minimum post count that triggers the confirmation prompt. Some things to consider when picking your own value:

- **`0`** (the default) means the script offers to run basically any time it's active on your profile — it triggers on any count. Good if you just want to clean up right now and don't want to think about it.
- **A higher number** (e.g. `500`, `1000`) means it'll stay quiet until your post count is at or above that — useful if you only want to be prompted once things pile up again in the future, rather than every time you open the script.
- If you only want to run this once and don't care about future prompts, you can leave it at `0` and just decline (Cancel) the dialog on any future visits, or disable the script in the Tampermonkey dashboard afterward.

To change it, open the script in the Tampermonkey editor (Dashboard → click the script name), edit the number, and save.

## 7. Open X and Go to Your Posts Tab

1. Navigate to `https://x.com` and go to **your own profile**.
2. **Important:** make sure you're on the **Posts** tab of your profile (not Replies, Media, or Likes) before doing anything else. The script's initial pass expects to start from Posts.
3. Open DevTools (F12, or right-click → Inspect) and switch to the **Console** tab to confirm the script loaded — you should see a line like:
   `[tweetdelete] userscript loaded. Threshold: 0`

## 8. Confirm and Let It Run

1. While on the **Posts** tab, the script will detect your post count and show a browser confirmation dialog asking whether to start deleting.
2. Click **OK** to begin, or **Cancel** to skip.
3. Once confirmed, a small toast notification appears in the bottom-right corner showing live progress, and it will keep going batch by batch without asking again until it's done with your Posts.

## 9. Then Go to Replies

Once the Posts pass finishes (you'll see a "Done" message logged in the console), navigate to the **Replies** tab of your profile. The script will pick up there the same way — detect the content, prompt once, and continue automatically.

## Stopping It Manually

To stop a run in progress, open the Console and type:

```js
STOP_DELETE = true
```

then press Enter. This halts the current batch and prevents it from auto-resuming on the next check — you'll need to confirm again if you want to restart it.
