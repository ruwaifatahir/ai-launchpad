import { formatCompactAmount, formatCompactDollars, fromRawAmount, shortenAddress } from '@/shared/lib';
import type { ApiListedToken } from '../api/listed-token';

/** A token card, ready to display. */
export type LaunchToken = {
  /** Lowercase address. */
  address: string;
  /** The logo link as the API returns it, or `null` for the placeholder. */
  image: string | null;
  graduated: boolean;
  name: string;
  ticker: string;
  /** The card's headline amount: market cap, or volume under the Volume sort. */
  figure: {
    /** In dollars at the Paired asset's Dollar rate, e.g. `$1.02M`; in the Paired asset without one, e.g. `4.5K USDC`. */
    value: string;
    label: 'MC' | 'Vol';
    description: 'market cap' | 'volume';
  };
  /** Bonding-curve progress: written, e.g. `42.5%`, and from 0 to 100 for the bar. Null once graduated. */
  graduation: { text: string; percent: number } | null;
  deployer: string;
  time: {
    text: string;
    datetime: string;
    /** `text` is the last buy rather than the launch time. */
    recentBuy: boolean;
  };
};

/** The logo as an image source, exactly as the API returns it, or `null` when there is none. */
export function logoUrl(logo: string): string | null {
  return logo.trim() ? logo : null;
}

const progressFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatAge(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole}s ago`;
  if (whole < 3_600) return `${Math.floor(whole / 60)}m ago`;
  if (whole < 86_400) return `${Math.floor(whole / 3_600)}h ago`;
  return `${Math.floor(whole / 86_400)}d ago`;
}

/** What a card leads with: the market cap or the volume, and the launch time or the last buy. */
export type CardShows = { figure: 'market-cap' | 'volume'; time: 'launch' | 'last-buy' };

/** The market cap and the launch time, as a card shows on most lists. */
export const DEFAULT_CARD_SHOWS: CardShows = { figure: 'market-cap', time: 'launch' };

/**
 * A listed token as a card, as of `nowMs`. A volume the token was not listed with, or a last buy
 * it never had, falls back to the market cap or the launch time.
 */
export function launchToken(
  token: ApiListedToken,
  { shows = DEFAULT_CARD_SHOWS, nowMs }: { shows?: CardShows; nowMs: number },
): LaunchToken {
  const { quoteAsset, quoteUsd: rate } = token;
  const figureOf = (raw: string) => {
    const amount = fromRawAmount(raw, quoteAsset.decimals);
    return rate === null ? `${formatCompactAmount(amount)} ${quoteAsset.symbol}` : formatCompactDollars(amount * rate);
  };
  const volume = shows.figure === 'volume' ? token.volume : undefined;
  const lastBuy = shows.time === 'last-buy' ? token.lastBuyAt : null;
  const shownAt = lastBuy ?? token.launchedAt;

  return {
    address: token.token,
    image: logoUrl(token.logo),
    graduated: token.graduated,
    name: token.name,
    ticker: `$${token.symbol}`,
    figure:
      volume !== undefined
        ? { value: figureOf(volume), label: 'Vol', description: 'volume' }
        : { value: figureOf(token.marketCap), label: 'MC', description: 'market cap' },
    graduation: token.graduated ? null : { text: `${progressFormat.format(token.progress)}%`, percent: token.progress },
    deployer: shortenAddress(token.creator),
    time: {
      text: formatAge(nowMs / 1000 - shownAt),
      datetime: new Date(shownAt * 1000).toISOString(),
      recentBuy: lastBuy !== null,
    },
  };
}
