import { cachedMarketRead } from "@/features/market/cache";
import { requireLaunch } from "@/features/market/launches/lookup";
import { TOKEN_DECIMALS, priceOf } from "@/features/market/pricing";
import { PAGE_SIZE, pageWindow } from "@/features/market/request";
import type { TradesRequest } from "@/features/market/trades/domain/schema";
import {
  countTradesByToken,
  findTradesByToken,
} from "@/features/market/trades/trades.repo";

const readTrades = async ({ params, query }: Pick<TradesRequest, "params" | "query">) => {
  const launch = await requireLaunch(params.token);

  const [total, rows] = await Promise.all([
    countTradesByToken(params.token),
    findTradesByToken(params.token, pageWindow(query.page)),
  ]);

  return {
    tokenDecimals: TOKEN_DECIMALS,
    quoteDecimals: launch.quoteDecimals,
    quoteSymbol: launch.quoteSymbol,
    page: query.page,
    pageSize: PAGE_SIZE,
    total,
    trades: rows.map((trade) => ({
      id: trade.id,
      side: trade.side,
      kind: trade.kind,
      venue: trade.venue,
      trader: trade.trader,
      tokenAmount: trade.tokenAmount,
      quoteAmount: trade.quoteAmount,
      price: priceOf(trade, launch.quoteDecimals),
      timestamp: Number(trade.timestamp),
      transactionHash: trade.transactionHash,
    })),
  };
};

export const listTrades = (request: Pick<TradesRequest, "params" | "query">) =>
  cachedMarketRead("trades", request.params.token, request.query.page, () =>
    readTrades(request),
  );
