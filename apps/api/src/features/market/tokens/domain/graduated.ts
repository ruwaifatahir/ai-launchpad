import { cachedMarketList } from "@/features/market/cache";
import { pageWindow } from "@/features/market/request";
import { readListedTokens } from "@/features/market/tokens/domain/item";
import type { GraduatedRequest } from "@/features/market/tokens/domain/schema";
import {
  type ListFilter,
  countListedLaunches,
} from "@/features/market/tokens/tokens.repo";

// Largest market cap first, among the tokens whose pool has opened.
const GRADUATED: ListFilter = {
  sort: "market-cap",
  since: null,
  graduated: true,
  q: "",
  quote: null,
  creator: null,
};

const readGraduated = async ({ query }: Pick<GraduatedRequest, "query">) => {
  const [total, tokens] = await Promise.all([
    countListedLaunches(GRADUATED),
    readListedTokens(GRADUATED, pageWindow(query.page, query.pageSize)),
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    tokens,
  };
};

export const listGraduated = (request: Pick<GraduatedRequest, "query">) =>
  cachedMarketList(
    "graduated",
    { page: request.query.page, pageSize: request.query.pageSize },
    () => readGraduated(request),
  );
