# ROGUE Markets v2

A Next.js AI market terminal with:
- Local browser watchlist
- Live stock/ETF quotes through a server-side Yahoo Finance chart feed
- Live Solana pair search through DexScreener
- News search through Google News RSS
- ROGUE AI API route with OpenAI Responses API support
- Paper trading with browser-persisted simulated cash/positions
- External Pump.fun buy portal using `NEXT_PUBLIC_ROGUE_MINT`
- Responsive terminal UI

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`
3. Add `OPENAI_API_KEY` for full AI responses.
4. Add your verified ROGUE Pump.fun mint to `NEXT_PUBLIC_ROGUE_MINT`.
5. `npm run dev`

## Vercel

Add the same environment variables in the project settings, then deploy the repository.

Important: the app deliberately does not custody wallets or execute trades. The $ROGUE button opens Pump.fun externally.
