import { describe, expect, it } from 'vitest';
import type { ApiListedToken } from '../api/listed-token';
import { launchToken, logoUrl, type CardShows } from './launch-token';

const VOLUME: CardShows = { figure: 'volume', time: 'launch' };
const LAST_BUY: CardShows = { figure: 'market-cap', time: 'last-buy' };

const NOW_MS = 1_790_000_000_000;
const NOW = NOW_MS / 1000;

const token = (overrides: Partial<ApiListedToken> = {}): ApiListedToken => ({
  token: '0x39dbed3a2bd333467115de45665cc57f813c4571',
  name: 'Pons',
  symbol: 'PONS',
  logo: '',
  creator: '0xb9f5a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e624b0',
  marketCap: '4500000000000000000000',
  quoteAsset: { address: '0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7', symbol: 'NVDA', decimals: 18 },
  quoteUsd: null,
  progress: 42.5,
  graduated: false,
  launchedAt: NOW - 3 * 86_400,
  lastBuyAt: NOW - 30,
  ...overrides,
});

const age = (seconds: number) => launchToken(token({ launchedAt: NOW - seconds }), { nowMs: NOW_MS }).time.text;

describe('logoUrl', () => {
  it('passes a logo through exactly as the API returns it', () => {
    for (const logo of ['https://example.com/logo.png', 'ipfs://bafy/logo.png', '/logos/pons.png']) {
      expect(logoUrl(logo)).toBe(logo);
    }
  });

  it('shows no logo for an empty one', () => {
    for (const logo of ['', '   ']) {
      expect(logoUrl(logo)).toBeNull();
    }
  });
});

describe('launchToken', () => {
  it('shows the market cap in the token’s Paired asset when it has no Dollar rate', () => {
    expect(launchToken(token(), { nowMs: NOW_MS }).figure).toEqual({
      value: '4.5K NVDA',
      label: 'MC',
      description: 'market cap',
    });
  });

  it('shows the market cap in dollars at the Paired asset’s Dollar rate', () => {
    // 4,500 NVDA at $225.66018707.
    const view = launchToken(token({ quoteUsd: 225.66018707 }), { nowMs: NOW_MS });
    expect(view.figure).toEqual({ value: '$1.02M', label: 'MC', description: 'market cap' });
  });

  it('shows the volume instead when asked to', () => {
    const view = launchToken(token({ volume: '1250000000000000000' }), { shows: VOLUME, nowMs: NOW_MS });
    expect(view.figure).toEqual({ value: '1.25 NVDA', label: 'Vol', description: 'volume' });
  });

  it('shows the volume in dollars at the Dollar rate', () => {
    const view = launchToken(token({ volume: '1250000000000000000', quoteUsd: 225.66018707 }), {
      shows: VOLUME,
      nowMs: NOW_MS,
    });
    expect(view.figure).toEqual({ value: '$282.08', label: 'Vol', description: 'volume' });
  });

  it('names the token, its ticker and its creator', () => {
    const view = launchToken(token(), { nowMs: NOW_MS });
    expect(view).toMatchObject({
      address: '0x39dbed3a2bd333467115de45665cc57f813c4571',
      name: 'Pons',
      ticker: '$PONS',
      deployer: '0xb9f5…24b0',
      image: null,
    });
  });

  it('shows a curve token’s progress, and none once graduated', () => {
    const graduation = (progress: number) => launchToken(token({ progress }), { nowMs: NOW_MS }).graduation;
    expect(graduation(3.4)).toEqual({ text: '3.4%', percent: 3.4 });
    expect(graduation(60.0512)).toEqual({ text: '60.05%', percent: 60.0512 });
    expect(graduation(0)).toEqual({ text: '0%', percent: 0 });
    expect(launchToken(token({ graduated: true, progress: 100 }), { nowMs: NOW_MS }).graduation).toBeNull();
  });

  it('shows the last buy time when asked to', () => {
    expect(launchToken(token(), { shows: LAST_BUY, nowMs: NOW_MS }).time).toEqual({
      text: '30s ago',
      datetime: new Date((NOW - 30) * 1000).toISOString(),
      recentBuy: true,
    });
  });

  it('shows the launch time otherwise', () => {
    for (const shows of [undefined, VOLUME]) {
      expect(launchToken(token(), { shows, nowMs: NOW_MS }).time).toEqual({
        text: '3d ago',
        datetime: new Date((NOW - 3 * 86_400) * 1000).toISOString(),
        recentBuy: false,
      });
    }
  });

  it('falls back to the launch time for a token nobody has bought', () => {
    const view = launchToken(token({ lastBuyAt: null }), { shows: LAST_BUY, nowMs: NOW_MS });
    expect(view.time.recentBuy).toBe(false);
    expect(view.time.text).toBe('3d ago');
  });

  it('writes an age in seconds, minutes, hours or days', () => {
    expect(age(-5)).toBe('0s ago');
    expect(age(59)).toBe('59s ago');
    expect(age(60)).toBe('1m ago');
    expect(age(3_599)).toBe('59m ago');
    expect(age(3_600)).toBe('1h ago');
    expect(age(86_399)).toBe('23h ago');
    expect(age(86_400)).toBe('1d ago');
  });
});
