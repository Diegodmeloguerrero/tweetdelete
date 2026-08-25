
# Installing the X (Twitter) Auto Bulk Delete Userscript

This guide walks you through installing  and setting up the `tweetdelete.user.js` script so it runs automatically on x.com / twitter.com.

## 1. Install Tampermonkey

Tampermonkey is a browser extension that runs userscripts on pages you visit.

1.  Go to the extension store for your browser (Chrome Web Store, Firefox Add-ons, Edge Add-ons, etc.) and search for **[Tampermonkey](https://www.tampermonkey.net/)**.
2.  Click **Add to [Browser]** / **Install**, then confirm in the permissions popup.
3.  Once installed, you'll see the Tampermonkey icon (a black-and-white checkered dashboard icon) in your browser's toolbar.

## 2. Open the Tampermonkey Dashboard

1.  Click the Tampermonkey icon in the toolbar.
2.  From the dropdown menu, select **Dashboard**.


## 3. Create a New Script

1.  In the Dashboard, click the **+** tab (or **Create a new script**) near the top.
2.  This opens Tampermonkey's built-in code editor with a default template already in it.


## 4. Paste the Script

1.  Select all the default template code in the editor (Ctrl+A / Cmd+A) and delete it.
2.  Paste the full contents of `tweetdelete.user.js` in its place.
3.  Save with **File → Save** or Ctrl+S / Cmd+S.



## 5. Confirm It's Enabled

1.  Back in the Dashboard's script list, find **X (Twitter) Auto Bulk Delete**.
2.  Make sure the toggle switch next to it is **on** (green).



## 6. Open X and Check the Console

1.  Navigate to `https://x.com` and go to your own profile.
2.  Open DevTools (F12, or right-click → Inspect) and switch to the **Console** tab.
3.  Within a few seconds you should see a log line like: `[tweetdelete] userscript loaded. Threshold: 0`


## 7. Confirm and Let It Run

1.  The script will detect your post count and show a browser confirmation dialog asking whether to start deleting.
2.  Click **OK** to begin, or **Cancel** to skip.
3.  Once confirmed, a small toast notification appears in the bottom-right corner showing live progress, and it will keep going batch by batch without asking again until it's done.

## Stopping It Manually

To stop a run in progress, open the Console and type:

```js
STOP_DELETE = true

```

then press Enter. This halts the current batch and prevents it from auto-resuming on the next check — you'll need to confirm again if you want to restart it.
