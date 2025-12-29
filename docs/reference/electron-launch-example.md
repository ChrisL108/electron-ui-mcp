# Electron Launch Example (bun-app reference)

This snippet mirrors the bun-app Playwright Electron launch pattern and is used as a reference for `electron-ui-mcp`.

```ts
import { _electron as electron } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

const resolveMainEntry = () => {
  const candidate = path.join(process.cwd(), ".vite", "build", "main.js");
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Electron main entry not found at ${candidate}. Run \"npm run package\" first.`
    );
  }
  return candidate;
};

export const launchElectronApp = async () => {
  const userDataDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "bun-app-e2e-")
  );
  const mainEntry = resolveMainEntry();
  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      E2E: "1",
      E2E_USER_DATA_DIR: userDataDir,
    },
    timeout: 60_000,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, userDataDir };
};
```
