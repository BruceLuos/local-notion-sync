# Electron Desktop Sync Design

## Background

The current repository is a developer-oriented Node.js toolchain for syncing local Markdown notes into a Notion database. It already supports:

- syncing one file on demand
- watching a directory and syncing on save
- keeping a local `slug -> pageId` state cache
- using a Codex stop hook plus a local queue as a fallback trigger

This works for technical users, but it still assumes users can clone a repository, install Node.js dependencies, configure `.env`, and run commands manually. That setup is not appropriate for non-technical users, and it creates adoption friction even for teammates who only want "install once, then let it run."

The requested direction is to evolve the project into a desktop product for ordinary users on macOS and Windows, while keeping the current "choose a local folder and sync its Markdown files into Notion" core behavior.

## Goals

- Ship a desktop application for macOS and Windows that non-technical users can install without using the command line
- Let users connect to Notion, choose a local Markdown folder, and enable automatic background sync
- Keep syncing active when the main window is closed by running in the system tray or menu bar
- Support optional launch-at-login so sync stays active after reboot
- Reuse the existing Node.js sync logic as much as possible instead of rewriting the sync engine
- Provide understandable status and error feedback for ordinary users

## Non-Goals

- Supporting Linux in the first release
- Building an in-app Markdown editor
- Supporting multiple folders or multiple Notion databases in the first release
- Implementing full OAuth-based Notion auth in the first release
- Adding user accounts, cloud sync of app settings, or team collaboration features
- Replacing the existing CLI workflows for technical users
- Shipping auto-update in the first release

## Product Direction

The first release should be an Electron desktop application with a small settings UI and a persistent background presence.

The user experience should feel like this:

1. Install the app
2. Open it once to complete setup
3. Paste a Notion integration token and database ID
4. Choose a local folder containing Markdown notes
5. Leave the app running in the background
6. Edits to Markdown files sync automatically to Notion

For ordinary users, the desktop app becomes the primary interface. The existing CLI, stop hook, and queue remain internal or developer-facing implementation details rather than part of the normal product workflow.

## Why Electron

Three implementation shapes were considered:

1. Electron single desktop app
2. Tauri desktop app
3. Desktop shell plus separate background service

Electron is the recommended first-release choice because it offers the shortest path from the current codebase to a real installable product:

- the existing sync logic is already written for Node.js
- file watching, local filesystem access, tray integration, and startup behavior fit naturally in Electron's main process
- packaging for macOS and Windows is mature
- the team can focus on productizing the existing sync engine instead of rewriting it

Tauri may be attractive later for footprint reasons, but it would increase first-release complexity because the current Node-based watcher and sync orchestration would need to be wrapped more carefully or partially rewritten. A split shell-plus-service architecture is also viable later, but it adds avoidable packaging and lifecycle complexity for the MVP.

## Architecture

The product should be organized into two layers.

### 1. Sync Core

This layer reuses and incrementally refines the existing Node.js modules:

- Markdown parsing
- Notion API writes
- slug/page state persistence
- sync logging
- watch-triggered sync scheduling

This layer should stay usable outside the desktop app so existing CLI workflows remain possible for advanced users and for internal debugging.

### 2. Desktop App

This is the Electron product shell and should contain:

- `main` process for app lifecycle, tray, startup, notifications, watcher ownership, and sync orchestration
- `preload` bridge for a safe renderer API
- `renderer` UI for onboarding, settings, status, and error display

The desktop layer should call the sync core directly rather than shelling out to `npm run watch`. The goal is one integrated application, not a packaged terminal workflow.

## First-Run Flow

The initial setup experience should be a short onboarding wizard.

### Step 1: Welcome

Explain one core concept in plain language:

- this app watches a local folder of Markdown files
- it automatically syncs changes into a Notion database

### Step 2: Connect Notion

First release input fields:

- Notion integration token
- Notion database ID

These inputs should be stored locally in the app's persistent config, not in a repo `.env` file.

The UI should also explain, in non-technical language:

- how to create an internal integration
- that the target database must be shared with that integration

### Step 3: Choose Folder

The user selects one local folder. The app validates:

- the folder exists
- the folder is readable
- the folder can contain Markdown files

### Step 4: Preflight Check

Before enabling background sync, the app runs a lightweight validation:

- Notion credentials can authenticate
- the database is reachable
- the folder is accessible
- local app storage can save config, state, and logs

### Step 5: Ready

The app confirms:

- automatic sync is enabled
- the app will keep running in the background
- closing the main window will not stop syncing

## Ongoing App Behavior

### Background Presence

Once configured, the app should start the watcher automatically when the application launches. If configuration is missing or invalid, the app should open the main window instead of silently failing.

Closing the main window should hide it rather than quit the app. The app should continue running in the tray or menu bar and keep sync active.

### Tray Menu

The tray or menu bar menu should stay intentionally small:

- Open Settings
- View Status
- Sync Now
- Pause Sync / Resume Sync
- Quit

This keeps the desktop app understandable for non-technical users and avoids overloading the first release UI.

### Launch at Login

The app should expose a simple setting for launch at login. This should be user-controlled and recommended during onboarding or settings.

### Notifications

System notifications should be used sparingly:

- show on first successful setup
- show on repeated or important failures
- avoid notifying on every successful file sync

## Sync Trigger Model

For the desktop product, the primary trigger path should be:

- local Markdown file changes
- watcher sees the change
- sync core processes the file
- status and logs update

The current stop-hook plus queue path is still useful for developer workflows, but it is not the main product mechanism for ordinary users. The desktop app should not depend on Codex hooks or `/tmp` queue files to do its core job.

## Data and Local Storage

The desktop app should maintain local app data outside the repository, in OS-appropriate application data directories.

This local app data should include:

- user configuration
- cached `slug -> pageId` state
- sync logs
- lightweight runtime metadata such as last successful sync time

The desktop app should stop requiring ordinary users to manage:

- `.env`
- `.state.json` paths
- repository-local config files
- temporary queue internals

## Error Handling

The product should translate implementation failures into user-readable messages.

Examples:

- "Notion connection failed. Please check your integration token."
- "This database has not been shared with your integration yet."
- "The selected folder is unavailable."
- "A note could not be synced because required metadata is missing."

Detailed logs should still exist for debugging, but logs are secondary. The main product surface should prioritize clear guidance over raw stack traces.

## Status Surface

The main window should include a simple status section showing:

- whether sync is active
- the selected folder
- the last successful sync time
- the most recent synced file
- the most recent error, if any

The app should also offer a way to open the local logs directory from the UI for support and troubleshooting.

## Packaging and Distribution

The first release should produce installable packages for:

- macOS
- Windows

The recommended packaging path is Electron Forge, because it aligns well with the chosen Electron architecture and offers a straightforward path to installers.

Initial distribution can be done with unsigned or lightly managed internal builds for testing, but broader non-technical distribution should plan for:

- macOS code signing
- macOS notarization
- Windows installer signing

Without signing, installation friction for normal users will be too high.

## Repository Evolution

The repository should evolve without discarding the current CLI-oriented core.

Recommended direction:

- keep the existing sync logic as a reusable Node.js core
- add an Electron app layer that imports and orchestrates that core
- preserve CLI entry points for development, debugging, and power users

This avoids a rewrite and keeps the codebase adaptable. It also makes it easier to test the core independently from the desktop shell.

## MVP Scope

The first implementation plan should cover only these end-user capabilities:

- installable macOS and Windows desktop app
- onboarding flow for token, database ID, and folder selection
- automatic folder watching and background sync
- tray/menu bar persistence after window close
- launch-at-login setting
- status view with recent success/error information
- manual "Sync Now" action

Everything else should be deferred until after MVP validation.

## Testing Strategy

Testing should be split by layer.

### Sync Core Tests

Continue and expand automated tests around:

- Markdown parsing
- sync scheduling
- state persistence
- logging
- Notion request shaping

### Desktop Layer Tests

Add focused tests around:

- config loading and persistence
- startup behavior with complete vs incomplete config
- tray action wiring
- renderer-to-main IPC contract
- watcher lifecycle management

### Manual Product Verification

Before release candidates, verify at least:

1. Fresh install on macOS
2. Fresh install on Windows
3. First-run setup with valid Notion configuration
4. First-run setup with invalid Notion configuration
5. Background sync after closing the main window
6. Launch-at-login behavior
7. Recovery from temporary Notion/network failure

## Risks and Boundaries

- Packaging a developer-oriented repository into a polished desktop product will surface configuration and lifecycle issues that the CLI path currently hides
- Notion token plus database ID is acceptable for MVP, but still somewhat technical for normal users
- Cross-platform tray behavior and startup behavior will need explicit testing because macOS and Windows differ in UX expectations
- Unsigned builds will be sufficient for internal testing but not ideal for broad distribution

## Success Criteria

The MVP is successful when:

- a non-technical macOS or Windows user can install the app without cloning a repository
- the user can finish setup through the GUI without editing `.env` or running commands
- the app continues syncing after the main window is closed
- Markdown file changes in the chosen folder appear in Notion reliably
- the user can understand sync state and fix common setup errors from the app UI
