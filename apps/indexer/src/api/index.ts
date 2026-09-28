import { Hono } from "hono";

// Ponder requires this file. It serves /health, /ready and /status on its own. No
// GraphQL or SQL route is mounted: the API is the only reader, and it reads the
// database directly.
export default new Hono();
