# Contributing to MiraXCode

MiraXCode is developed and maintained by the **Miracuves** team. Thanks for helping improve a local-first desktop AI workspace.

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

- Main chat shell: `src/js/app/` — add `create*Api(deps)` modules, wire from `bootstrap.js`
- Preserve **`window._H`** for `code-mode.bundle.js`, `swarm-maker.js`, and other modes
- Never commit API keys, `.env`, or `data/secrets.json`
- Rust FS/shell paths should use the permission guard where applicable

See [src/js/app/README.md](src/js/app/README.md) for the module map and boot order.

## Questions

- [Discussions](https://github.com/miracuves/miraxcode/discussions) — design and usage
- [Issues](https://github.com/miracuves/miraxcode/issues) — bugs and features
