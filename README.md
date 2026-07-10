# HUB Chat

A premium, real-time messaging web app — original interface, built with plain HTML, CSS and JavaScript (ES modules, no build step).

## Try it instantly

Open `index.html` in a browser (or serve the folder with any static file server). HUB Chat boots in **demo mode** automatically: sign in with the "Continue with Google" button (simulated) and explore a fully working product — one-to-one and group chats, reactions, replies, forwarding, edit/delete, typing indicators, read receipts, stories, voice/video call screens, notifications, dark/light mode — all backed by a lightweight in-browser data layer (`js/services/demo-data.js`) that persists to `localStorage`.

> A static file server is required because the app uses ES module imports (`file://` blocks module loading in most browsers). Any of these work:
> ```
> npx serve .
> python3 -m http.server 8080
> ```

## Going live with Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), enable **Authentication → Google**, **Firestore**, and **Storage**.
2. Copy your web app config into `js/config/firebase-config.js`.
3. Deploy the included example rules:
   ```
   firebase deploy --only firestore:rules,storage
   ```
4. `js/services/data-provider.js` automatically switches Google Sign-In to the real Firebase Auth flow once `isFirebaseConfigured` is `true`. Wire the remaining reads/writes in `js/services/firebase-service.js` (every function there already mirrors its demo-mode counterpart 1:1) to move chats, messages, groups, and stories onto Firestore/Storage, and enable Cloud Messaging with your VAPID key for push notifications.

## Project structure

```
hubchat/
├── index.html                 App shell + auth screen + modal template
├── css/
│   ├── variables.css          Design tokens (colors, type, spacing, motion)
│   ├── base.css                Resets & global rules
│   ├── layout.css              App shell grid (rail / sidebar / main panel)
│   ├── components.css          Buttons, inputs, chat list, message bubbles…
│   ├── auth.css                 Sign-in screen
│   ├── stories.css              Stories bar + full-screen viewer
│   ├── calls.css                Voice / video call UI
│   ├── modals.css               Modals, dropdowns, sheets
│   ├── animations.css           Keyframes
│   └── responsive.css           Breakpoints (mobile-first)
├── js/
│   ├── app.js                   Application controller — wires UI to data
│   ├── config/firebase-config.js
│   ├── services/
│   │   ├── data-provider.js     Unified API used by app.js
│   │   ├── firebase-service.js  Real Firebase Auth/Firestore/Storage/FCM calls
│   │   └── demo-data.js         In-browser simulated backend
│   ├── ui/
│   │   ├── theme.js              Dark / light mode
│   │   └── toast.js              Toast notifications
│   └── utils/
│       ├── dom.js, helpers.js, zoom-lock.js
├── firestore.rules
└── storage.rules
```

## Design

- **Palette** — "Signal" gradient (`#6D5DF6 → #14C8B0`) used sparingly on the logo, sent bubbles and primary actions; near-black `#0A0E1A` dark surface / soft `#F2F4FA` light surface.
- **Type** — Sora (display), Inter (UI/body), JetBrains Mono (timestamps, invite codes, call timers).
- **Signature element** — the animated "Signal" wordmark and gradient-ring story tiles, echoing the idea of a message travelling from sender to receiver.

## Zoom lock

Per spec, pinch-zoom, double-tap-zoom, `Ctrl +/-`, and `Ctrl` + mouse-wheel zoom are disabled (`js/utils/zoom-lock.js`), alongside a locked `<meta viewport>`. The layout itself remains fully responsive down to small phones.

## Notes

- All interface icons are from [Lucide](https://lucide.dev) — no emoji are used as UI icons.
- Voice notes use the native `MediaRecorder` API when microphone permission is granted, and fall back to a placeholder clip otherwise.
- Group icon default and any other network images are loaded from public CDNs (dicebear.com for demo avatars, picsum.photos for demo story media) — swap for your own assets in production.
