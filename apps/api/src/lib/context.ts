import { AsyncLocalStorage } from "node:async_hooks";

// Per-request context carried implicitly through the async call tree, so every
// log line can inherit the request spine without threading arguments. Add a
// field here (a user id, a tenant) and the logger picks it up everywhere.
export type RequestCtx = {
  requestId: string;
  method: string;
  route: string;
};

export const als = new AsyncLocalStorage<RequestCtx>();

export const getContext = () => als.getStore();
