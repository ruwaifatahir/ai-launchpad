import { cachedMarketList } from "@/features/market/cache";
import { pageWindow } from "@/features/market/request";
import { sinceOf } from "@/features/market/tokens/domain/age";
import { readListedTokens } from "@/features/market/tokens/domain/item";
import type { SearchRequest } from "@/features/market/tokens/domain/schema";
import { countListedLaunches } from "@/features/market/tokens/tokens.repo";

// Every token matching the search, graduated or not, and the page asked for.
const readSearch = async ({ query }: Pick<SearchRequest, "query">) => {
  const filter = {
    sort: query.sort,
    since: sinceOf(query.age),
    graduated: null,
    q: query.q,
    quote: query.quote ?? null,
    creator: null,
  };
  const [total, tokens] = await Promise.all([
    countListedLaunches(filter),
    readListedTokens(filter, pageWindow(query.page, query.pageSize)),
  ]);

  return {
    sort: query.sort,
    age: query.age,
    page: query.page,
    pageSize: query.pageSize,
    total,
    tokens,
  };
};

// The schema has already trimmed and lowercased q and lowercased quote, so every
// spelling of one search shares one entry.
export const searchTokens = (request: Pick<SearchRequest, "query">) =>
  cachedMarketList(
    "search",
    {
      q: request.query.q,
      sort: request.query.sort,
      age: request.query.age,
      quote: request.query.quote ?? "",
      page: request.query.page,
      pageSize: request.query.pageSize,
    },
    () => readSearch(request),
  );
