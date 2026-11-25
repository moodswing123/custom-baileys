# @victory_is_h1m/custom-baileys

Custom WhatsApp Web API wrapper built on `@whiskeysockets/baileys` with built-in custom pairing code support (`VICT-ORYY`), auto-reconnect, and helper methods.

## Usage
```javascript
import createVictoryBaileys from '@victory_is_h1m/custom-baileys';

const bot = await createVictoryBaileys({
  phoneNumber: '2348162843527',
  customPairingCode: 'VICT-ORYY',
});
```
