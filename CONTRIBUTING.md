# Contributing

For a bug report, include the Chrome version, extension version, whether this is a normal or project chat, and reproduction steps. Redact personal information in screenshots. Never post access tokens, cookies, account details or private chat exports.

The extension files live in `extension/`. Load that directory on `chrome://extensions` to try a change, then reload both the extension and the ChatGPT page.

Run `npm ci`, `npm run check` and `npm test`. Navigation, message detection or layout changes should also pass `npm run test:browser` after `npx playwright install chromium`. The browser tests only use synthetic data in isolated profiles.

Keep the scope small: a prompt-navigation rail, previews and reliable jumps. Avoid introducing remote services, telemetry, stored credentials, chat-management features or broad permissions.

If ChatGPT changes its markup, keep selectors in `extension/content.js` consistent with supported versions. History parsing lives in `extension/history.js`; position correction lives in `extension/navigation.js`. Handle partial or failed history reads without claiming completeness.
