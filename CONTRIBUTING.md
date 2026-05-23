# Contributing to MiraXCode

Thanks for considering a contribution. MiraXCode is a local-first desktop AI app. Changes that keep user data on-device, avoid telemetry, and avoid required cloud services are the best fit.

## Development setup

```bash
git clone https://github.com/miracuves/miraxcode.git
cd miraxcode
npm install
npm run build:js
npm run tauri dev
```

## Before you open a PR

```bash
npm run build:js
npm test
```

## Architecture conventions

- Main chat shell lives in `src/js/app/` — add features as `create*Api(deps)` modules, wire from `bootstrap.js`
- Preserve **`window._H`** exports used by `code-mode.js`, `swarm-maker.js`, and other modes
- Do not commit API keys, `.env`, or `data/secrets.json` (see `.gitignore`)
- Rust commands for FS/shell must go through the permission guard where applicable

See [src/js/app/README.md](src/js/app/README.md) for module map and init order.

## Questions

Open a [Discussion](https://github.com/miracuves/miraxcode/discussions) for design questions; use [Issues](https://github.com/miracuves/miraxcode/issues) for bugs and features.
