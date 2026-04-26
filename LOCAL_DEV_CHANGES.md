# Local Dev Changes Tracker

Changes made to local config for testing. **Revert these before pushing.**

## trix-api/.env
- Added `COHERE_API_KEY` and `VOYAGE_API_KEY` (permanent — these should stay)
- Changed `EMBEDDING_FALLBACK_PROVIDER` from `"voyage,openai"` to `"cohere,voyage,openai"` (permanent)
- Added `VOYAGE_EMBEDDING_MODEL=voyage-3.5` (can keep but Voyage can't produce 1536 dims anyway)

## ~/.config/trix/config.json
- **Temporarily** changed to point at `localhost:3737` — **REVERTED** back to production

## Daemon node registration
- Created registration token `nrt_374e43d7...` against local API
- Node `164457d5-c8aa-47d1-94d7-d075647e24b3` may have been partially registered
- **Status**: Incomplete — daemon WS connects to URL from registration, not from config.json

## What needs to happen for local daemon testing
1. The daemon WS URL comes from the node registration response (stored in node state)
2. To test locally, need to:
   - Clear daemon state: `rm ~/.trix/node-state.json` (or wherever Go stores it)
   - Set `config.json` to localhost
   - Set `TRIX_NODE_TOKEN` env
   - Start daemon — it registers fresh and gets WS URL from local API
   - Local API WS URL should be `ws://localhost:3737` (check API config)
3. After testing, restore production config and restart daemon
