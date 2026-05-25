# Study Site Timer Edge Extension

This Microsoft Edge extension lets a user:

- create a local account with email and password
- add websites they want to control
- set an allowed time limit in minutes
- set a block duration in minutes
- see today's usage in the popup
- block matching websites when the limit is reached

The login is stored locally in the browser extension storage. It is not connected to an online server.

## Load in Microsoft Edge

1. Open `edge://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `D:\study-extension`.
5. Pin or open the `Study Site Timer` extension from the toolbar.

## Website Format

Add one website per line, for example:

```text
youtube.com
instagram.com
facebook.com
```

Subdomains are also matched. For example, adding `youtube.com` will also control `www.youtube.com` and `music.youtube.com`.
