# @victory_is_h1m/custom-baileys

Custom WhatsApp Web API wrapper built on `@whiskeysockets/baileys` with built-in **`VICT-ORYY`** custom pairing code support, Shared Chat Themes & Wallpapers, A2UI Rich UI Cards, Embedded Audio Stickers, View-Once Downloader, and Native Flow Buttons.

## Installation
```bash
npm install @victory_is_h1m/custom-baileys
```

## Quick Start
```javascript
import createVictoryBaileys, { A2UI, sendA2UIWidget } from '@victory_is_h1m/custom-baileys';

const bot = await createVictoryBaileys({
  phoneNumber: '2348162843527',
  customPairingCode: 'VICT-ORYY',
  onReady: () => console.log('Connected!'),
});

bot.sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages;
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;

  // View-Once Downloader
  const media = await bot.downloadViewOnce(msg);
  if (media?.type === 'image') await bot.sendImage(jid, media.buffer, media.caption);
});
```

## Included Features
- **Custom Pairing Code (`VICT-ORYY`)**: Automatic 8-character pairing code generation with auto-reconnect.
- **Shared Chat Themes & Wallpapers**: `bot.setTheme(jid, 'red')`, `bot.setBubbleColor(jid, 'blue')`, `bot.setWallpaper(jid, buffer)`, `bot.clearTheme(jid)`.
- **A2UI Rich UI Cards**: `new A2UI()` builder + `sendA2UIWidget(sock, jid, { a2ui })`.
- **Embedded Audio Stickers**: `bot.sendAudioSticker(jid, webpBuffer, opusBuffer, isAnimated)`.
- **View-Once Downloader**: `bot.downloadViewOnce(msg)` for images, videos, and audio.
- **Native Flow Buttons & Link Cards**: `bot.sendButtons(...)` and `bot.sendLinkCard(...)`.
