import { cachedMarketList } from "@/features/market/cache";
import { pageWindow } from "@/features/market/request";
import { readListedTokens } from "@/features/market/tokens/domain/item";
import type { CreatorRequest } from "@/features/market/tokens/domain/schema";
import {
  type ListFilter,
  countListedLaunches,
} from "@/features/market/tokens/tokens.repo";

// Every token one creator launched, graduated or not, newest first.
const createdBy = (creator: string): ListFilter => ({
  sort: "newest",
  since: null,
  graduated: null,
  q: "",
  quote: null,
  creator,
});

const readCreatorTokens = async ({ params, query }: CreatorRequest) => {
  const filter = createdBy(params.creator);
  const [total, tokens] = await Promise.all([
    countListedLaunches(filter),
    readListedTokens(filter, pageWindow(query.page, query.pageSize)),
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    tokens,
  };
};

// The schema has already lowercased the creator, so every spelling of one wallet
// shares one entry.
export const listCreatorTokens = (request: CreatorRequest) =>
  cachedMarketList(
    "creator",
    {
      creator: request.params.creator,
      page: request.query.page,
      pageSize: request.query.pageSize,
    },
    () => readCreatorTokens(request),
  );
