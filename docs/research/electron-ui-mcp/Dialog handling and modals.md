---
Question: Best way to capture and control JS dialog events in Playwright Electron; how to avoid missed dialogs?
---

This is a common pain point. The key issue is that dialogs can fire before you've set up your listener, creating a race condition. Here's the pattern:

## Set Up the Listener *Before* the Triggering Action

```typescript
// ❌ Race condition - dialog may fire before listener is ready
await page.click('#show-alert');
page.on('dialog', async (dialog) => {
  await dialog.accept();
});

// ✅ Correct - listener ready before action
const dialogPromise = page.waitForEvent('dialog');
await page.click('#show-alert');
const dialog = await dialogPromise;
await dialog.accept();
```

## For Persistent Dialog Handling

If dialogs can appear at any time, register the handler early and keep it active:

```typescript
// Register once, early in your test/script
page.on('dialog', async (dialog) => {
  console.log(`Dialog type: ${dialog.type()}, message: ${dialog.message()}`);
  
  if (dialog.type() === 'confirm') {
    await dialog.accept();
  } else if (dialog.type() === 'prompt') {
    await dialog.accept('user input');
  } else {
    await dialog.dismiss();
  }
});
```

## Electron-Specific Considerations

With Electron, you're dealing with `BrowserWindow` dialogs that may not always be standard JS dialogs:

```typescript
import { _electron as electron } from 'playwright';

const app = await electron.launch({ args: ['main.js'] });
const page = await app.firstWindow();

// Standard dialog handling still works for window.alert/confirm/prompt
page.on('dialog', async (dialog) => {
  await dialog.accept();
});

// For Electron's dialog module (showMessageBox, showOpenDialog, etc.)
// you'll need to mock or intercept at the main process level
```

## Avoiding Missed Dialogs Checklist

1. **Register handlers before navigation** — set up `page.on('dialog', ...)` immediately after getting the page
2. **Use `waitForEvent` for one-off dialogs** — guarantees you capture the specific dialog
3. **Handle `beforeunload`** — these fire on navigation/close and are easy to miss
4. **Don't `await` inside the handler unnecessarily** — keep handlers fast to avoid blocking

```typescript
// Handle beforeunload specifically
page.on('dialog', async (dialog) => {
  if (dialog.type() === 'beforeunload') {
    await dialog.accept(); // or dismiss() to cancel navigation
  }
});
```

## Multiple Dialogs in Sequence

```typescript
let dialogCount = 0;
page.on('dialog', async (dialog) => {
  dialogCount++;
  console.log(`Dialog ${dialogCount}: ${dialog.message()}`);
  await dialog.accept();
});

// Or collect them
const dialogs: Dialog[] = [];
page.on('dialog', (dialog) => {
  dialogs.push(dialog);
  dialog.accept(); // fire-and-forget accept
});
```

The golden rule: **always assume the dialog could fire instantly** and structure your code so the listener is ready first.


## Playwright Electron: how to enumerate and switch windows reliably. Any pitfalls when reusing the active window?

