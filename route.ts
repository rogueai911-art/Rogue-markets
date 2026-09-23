import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function n(v: unknown): number | null {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function validPrice(v: unknown): number | null {
  const x = n(v)
  return x != null && x > 0 ? x : null
}

function cleanPair(p: any) {
  return {
    name: p?.baseToken?.name || p?.baseToken?.symbol || 'Unknown asset',
    symbol: p?.baseToken?.symbol || '',
    address: p?.baseToken?.address || '',
    chain: p?.chainId || 'unknown',
    logo: p?.info?.imageUrl || null,
    price: validPrice(p?.priceUsd),
    marketCap: n(p?.marketCap),
    fdv: n(p?.fdv),
    liquidityUsd: n(p?.liquidity?.usd),
    volume24h: n(p?.volume?.h24),
    buys24h: n(p?.txns?.h24?.buys),
    sells24h: n(p?.txns?.h24?.sells),
    change5m: n(p?.priceChange?.m5),
    change1h: n(p?.priceChange?.h1),
    change6h: n(p?.priceChange?.h6),
    change24h: n(p?.priceChange?.h24),
    pairAge: p?.pairCreatedAt ? Math.max(0, Date.now() - Number(p.pairCreatedAt)) : null,
    dex: p?.dexId || null,
    pairAddress: p?.pairAddress || null,
    url: p?.url || null,
  }
}

function scorePair(p: any, q: string) {
  const query = q.toLowerCase()
  const symbol = String(p?.baseToken?.symbol || '').toLowerCase()
  const name = String(p?.baseToken?.name || '').toLowerCase()
  const address = String(p?.baseToken?.address || '').toLowerCase()
  const quote = String(p?.quoteToken?.symbol || '').toLowerCase()
  let score = 0
  if (address === query) score += 1000000
  if (symbol === query) score += 500000
  if (name === query) score += 300000
  if (symbol.startsWith(query)) score += 10000
  if (name.startsWith(query)) score += 5000
  if (['usdc','usdt','usd','usdc.e'].includes(quote)) score += 1500
  if (String(p?.chainId).toLowerCase() === 'solana') score += 500
  const liq = n(p?.liquidity?.usd) || 0
  const vol = n(p?.volume?.h24) || 0
  if (liq > 0) score += Math.min(500, Math.log10(liq + 1) * 40)
  if (vol > 0) score += Math.min(300, Math.log10(vol + 1) * 25)
  return score
}

const COMMON_CRYPTO = new Set(['BTC','WBTC','ETH','WETH','SOL','WSOL','USDC','USDT','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT','TRX','ROGUE'])
const COMMON_SOLANA: Record<string,string> = {
  ROGUE: 'ETFMXFvgNWEKVfT9hRFuSgi2sbRyxi5Qu7jhb4WBpump',
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
}
const COMMON_ETH: Record<string,string> = {
  ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
}

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(9000),
    headers: { accept: 'application/json', ...(init?.headers || {}) },
  })
  if (!r.ok) throw new Error(`Provider returned ${r.status}`)
  return r.json()
}

async function getDexSearch(q: string) {
  const d = await fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`)
  return Array.isArray(d?.pairs) ? d.pairs.filter((p: any) => p?.baseToken) : []
}

async function getDexTokenPairs(chain: string, address: string) {
  const d = await fetchJson(`https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`)
  return Array.isArray(d) ? d.filter((p: any) => p?.baseToken) : []
}

async function getDexExactTokens(chain: string, addresses: string) {
  const d = await fetchJson(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${addresses}`)
  return Array.isArray(d) ? d.filter((p: any) => p?.baseToken) : []
}

async function resolveDex(q: string) {
  const upper = q.toUpperCase()
  const exactPairs: any[] = []
  if (COMMON_SOLANA[upper]) exactPairs.push(...await getDexExactTokens('solana', COMMON_SOLANA[upper]))
  if (COMMON_ETH[upper]) exactPairs.push(...await getDexExactTokens('ethereum', COMMON_ETH[upper]))

  // A contract address gets direct token-pair lookups on Solana first; if it is not
  // a Solana mint, the normal DEX search remains the fallback.
  const looksLikeAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) || /^0x[a-fA-F0-9]{40}$/.test(q)
  if (looksLikeAddress) {
    if (/^0x/i.test(q)) exactPairs.push(...await getDexExactTokens('ethereum', q))
    else exactPairs.push(...await getDexExactTokens('solana', q))
  }

  const searched = await getDexSearch(q)
  const merged = [...exactPairs, ...searched]
  const seen = new Set<string>()
  return merged.filter((p: any) => {
    const id = `${p?.chainId}:${p?.pairAddress}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  }).sort((a: any,b: any) => scorePair(b,q) - scorePair(a,q))
}

async function getFinnhub(symbol: string) {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return null
  const d = await fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${encodeURIComponent(key)}`)
  const price = validPrice(d?.c)
  if (!price) return null
  const previousClose = validPrice(d?.pc)
  return {
    priceUsd: price,
    open: validPrice(d?.o), high: validPrice(d?.h), low: validPrice(d?.l),
    previousClose,
    change24h: previousClose ? ((price - previousClose) / previousClose) * 100 : null,
  }
}

async function getGlobalCryptoQuote(symbol: string) {
  const ids: Record<string,string> = { BTC:'bitcoin', ETH:'ethereum', SOL:'solana' }
  const id = ids[symbol.toUpperCase()]
  if (!id) return null
  const d = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`)
  const price = validPrice(d?.[id]?.usd)
  if (!price) return null
  return { priceUsd: price, change24h: n(d?.[id]?.usd_24h_change) }
}

async function enrichSolana(address: string) {
  const key = process.env.HELIUS_API_KEY
  const rpc = process.env.SOLANA_RPC_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : '')
  if (!rpc || !address) return { token: {}, holders: {}, provider: null }

  const call = async (method: string, params: any) => {
    const r = await fetch(rpc, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(9000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    })
    if (!r.ok) throw new Error(`Solana RPC returned ${r.status}`)
    const d = await r.json()
    if (d?.error) throw new Error(d.error.message || 'Solana RPC error')
    return d?.result
  }

  const out:any = { token: {}, holders: {}, provider: 'Solana RPC' }
  try {
    const asset = await call('getAsset', { id: address, displayOptions: { showFungible: true } })
    const ti = asset?.token_info || {}
    const authorities = Array.isArray(asset?.authorities) ? asset.authorities : []
    out.token = {
      supply: n(ti?.supply) != null && n(ti?.decimals) != null ? Number(ti.supply) / (10 ** Number(ti.decimals)) : null,
      decimals: n(ti?.decimals),
      price: validPrice(ti?.price_info?.price_per_token),
      mintAuthority: authorities.find((a:any)=>String(a?.scopes||'').toLowerCase().includes('mint'))?.address || null,
      freezeAuthority: null,
      mutable: asset?.mutable ?? null,
    }
    if (!out.token.mintAuthority && asset?.ownership?.owner) out.token.mintAuthority = null
  } catch {}

  try {
    const largest = await call('getTokenLargestAccounts', [address])
    const values = Array.isArray(largest?.value) ? largest.value : []
    const topHolders = values.slice(0, 20).map((x:any) => ({ owner: x?.address || '', amount: n(x?.uiAmount) || 0, share: null }))
    out.holders = { count: null, exact: false, sampled: topHolders.length, topHolders, sampledConcentration: null }
  } catch {}
  return out
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ ok:false, error:'Enter a token name, symbol, stock symbol, or contract address.' }, { status:400 })
  const upper = q.toUpperCase()
  const isLikelyStock = /^[A-Z]{1,5}$/.test(upper) && !COMMON_CRYPTO.has(upper)

  if (isLikelyStock && process.env.FINNHUB_API_KEY) {
    try {
      const quote = await getFinnhub(upper)
      if (quote) return NextResponse.json({
        ok:true, kind:'stock', source:'Finnhub', observedAt:new Date().toISOString(),
        asset:{name:upper,symbol:upper,address:null,chain:'traditional-market',logo:null},
        market:{...quote,marketCap:null,fdv:null,liquidityUsd:null,volume24h:null,buys24h:null,sells24h:null,change5m:null,change1h:null,change6h:null,pairAge:null,dex:null,pairAddress:null,url:null}, token:{}, holders:{}, alternatives:[]
      })
    } catch {}
  }

  // Native crypto ticker fallback. This prevents a bad DEX search result from ever becoming BTC/ETH/SOL.
  if (['BTC','ETH','SOL'].includes(upper)) {
    try {
      const quote = await getGlobalCryptoQuote(upper)
      if (quote) return NextResponse.json({
        ok:true, kind:'crypto', source:'CoinGecko', observedAt:new Date().toISOString(),
        asset:{name:upper==='BTC'?'Bitcoin':upper==='ETH'?'Ethereum':'Solana',symbol:upper,address:null,chain:'multi-market',logo:null},
        market:{...quote,marketCap:null,fdv:null,liquidityUsd:null,volume24h:null,buys24h:null,sells24h:null,change5m:null,change1h:null,change6h:null,pairAge:null,dex:null,pairAddress:null,url:null}, token:{}, holders:{}, alternatives:[]
      })
    } catch {}
  }

  try {
    const pairs = await resolveDex(q)
    if (!pairs.length) return NextResponse.json({ ok:false,error:'No matching live market pair was returned.', provider:'DEX Screener' }, { status:404 })
    const p = pairs[0]
    const m = cleanPair(p)
    if (m.price == null) return NextResponse.json({ ok:false,error:'A matching pair was found, but it did not provide a valid live USD price.', provider:'DEX Screener' }, { status:422 })
    const enrichment = String(m.chain).toLowerCase()==='solana' && m.address ? await enrichSolana(m.address) : { token:{},holders:{},provider:null }
    return NextResponse.json({
      ok:true,kind:'token',source:enrichment.provider?'DEX Screener + '+enrichment.provider:'DEX Screener',observedAt:new Date().toISOString(),
      asset:{name:m.name,symbol:m.symbol,address:m.address,chain:m.chain,logo:m.logo},
      market:{priceUsd:m.price,marketCap:m.marketCap,fdv:m.fdv,liquidityUsd:m.liquidityUsd,volume24h:m.volume24h,buys24h:m.buys24h,sells24h:m.sells24h,change5m:m.change5m,change1h:m.change1h,change6h:m.change6h,change24h:m.change24h,pairAge:m.pairAge,dex:m.dex,pairAddress:m.pairAddress,url:m.url},
      token:enrichment.token,holders:enrichment.holders,alternatives:pairs.slice(0,10).map(cleanPair)
    })
  } catch (e:any) {
    return NextResponse.json({ ok:false,error:e?.message||'Live market providers were unavailable. Try again.',provider:'DEX Screener' }, { status:502 })
  }
}
