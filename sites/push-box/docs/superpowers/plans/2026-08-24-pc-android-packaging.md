# PC and Android Packaging Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with verification after each task.

**Goal:** Reuse the existing static Sokoban game to produce a Windows x64 installer/portable package and an Android test APK without duplicating game logic.

**Architecture:** Keep the existing HTML/CSS/JavaScript source as the single web application. Add one deterministic static build step that copies the runtime files to `dist/`; Electron loads that bundle for Windows packaging, and Capacitor uses the same bundle as its Android `webDir`. Build artifacts stay out of Git and are delivered under `release/`.

**Tech Stack:** Node.js 24, Electron Forge, Electron, Capacitor Android, Gradle/Android SDK, Node test runner.

**Spec:** Approved in chat on 2026-08-24: Windows x64 installer plus portable build, Android test APK, no iOS or store signing in v1.

## Global Constraints

- Preserve the browser/Netlify version and existing gameplay behavior.
- Do not duplicate or rewrite `game.js` rules for native wrappers.
- Keep release binaries out of Git; commit packaging source/configuration only.
- Do not commit secrets, signing keys, or local toolchain state.
- Android v1 is an unsigned/debug test APK; production signing is out of scope.

### Task 1: Add a deterministic static bundle and packaging tests

**Files:**
- Create: `scripts/build-static.mjs`
- Create: `tests/packaging.test.js`
- Modify: `package.json`, `.gitignore`

- [ ] Test that the static bundle contains `index.html`, `app.js`, `game.js`, `styles.css`, and both PNG assets.
- [ ] Run the new test and observe the expected failure because `dist/` and the build script do not exist.
- [ ] Implement the copy-only build script with a clean output directory and no source mutation.
- [ ] Add `build:web` and packaging-related npm scripts.
- [ ] Run all tests and the static build; verify the bundle file list.

### Task 2: Add Electron Forge Windows packaging

**Files:**
- Create: `desktop/main.cjs`, `forge.config.cjs`
- Modify: `package.json`, `.gitignore`, `README.md`

- [ ] Add Electron and Forge maker dependencies.
- [ ] Configure Electron to load `dist/index.html` and use `contextIsolation` with no Node integration.
- [ ] Configure Squirrel.Windows installer and Windows ZIP maker.
- [ ] Add scripts for package/make and place outputs under `release/`.
- [ ] Run a Windows x64 make command and verify an installer executable and portable ZIP exist.

### Task 3: Add Capacitor Android project

**Files:**
- Create: `capacitor.config.ts`
- Create: `android/` through Capacitor CLI
- Modify: `package.json`, `.gitignore`, `README.md`

- [ ] Add Capacitor core, CLI, and Android platform dependencies.
- [ ] Initialize the Android project with app name `仓库搬运工` and package id `com.wzszdsa.pushbox`.
- [ ] Configure `webDir: 'dist'` and add scripts for sync/open/build.
- [ ] Verify the generated Android project consumes the same static bundle.
- [ ] Install or locate the JDK and Android SDK required for Gradle.

### Task 4: Build and verify deliverables

- [ ] Run `npm test`, `node --check app.js`, and `npm run build:web`.
- [ ] Build Windows x64 installer and portable ZIP.
- [ ] Build Android debug APK with Gradle.
- [ ] Verify artifacts, file sizes, and checksums; verify no prompt files or secrets are in the release directory.
- [ ] If an emulator/device is available, install and smoke-test the APK; otherwise verify Gradle success and APK existence.

### Task 5: Commit source configuration and report artifacts

- [ ] Review `git status` and confirm only source/config/docs changed.
- [ ] Commit packaging configuration and Android source; never commit `release/`, `dist/`, or signing material.
- [ ] Push `main` to GitHub and verify the remote commit.
- [ ] Report absolute paths for the Windows installer, portable ZIP, and APK.
