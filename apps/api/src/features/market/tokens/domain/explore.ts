import { cachedMarketList } from "@/features/market/cache";
import { pageWindow } from "@/features/market/request";
import { sinceOf } from "@/features/market/tokens/domain/age";
import { readListedTokens } from "@/features/market/tokens/domain/item";
import type { ExploreRequest } from "@/features/market/tokens/domain/schema";
import { countLaunches, countListedLaunches } from "@/features/market/tokens/tokens.repo";

// The tokens still on their curve matching the sort and age, the page asked for, and
// every token ever launched.
const readExplore = async ({ query }: Pick<ExploreRequest, "query">) => {
  const filter = {
    sort: query.sort,
    since: sinceOf(query.age),
    graduated: false,
    q: "",
    quote: null,
    creator: null,
  };
  const [total, tokens, launched] = await Promise.all([
    countListedLaunches(filter),
    readListedTokens(filter, pageWindow(query.page, query.pageSize)),
    countLaunches(),
  ]);

  return {
    sort: query.sort,
    age: query.age,
    page: query.page,
    pageSize: query.pageSize,
    total,
    launched,
    tokens,
  };
};

export const listExplore = (request: Pick<ExploreRequest, "query">) =>
  cachedMarketList(
    "explore",
    {
      sort: request.query.sort,
      age: request.query.age,
      page: request.query.page,
      pageSize: request.query.pageSize,
    },
    () => readExplore(request),
  );
