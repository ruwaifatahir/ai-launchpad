import { vi } from "vitest";

// One delegate per Prisma model. Add a line to prismaMock and txMock for every
// model you add, so a repo test can drive it without touching a database.

const delegate = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
});

export const txMock = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  agent: delegate(),
  consent: delegate(),
  connection: delegate(),
  post: delegate(),
  previewUsage: delegate(),
  logoUpload: delegate(),
  dailyRate: delegate(),
};

export const prismaMock = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  agent: delegate(),
  consent: delegate(),
  connection: delegate(),
  post: delegate(),
  previewUsage: delegate(),
  logoUpload: delegate(),
  dailyRate: delegate(),
};

// Call this in a test that exercises a domain file which opens a transaction, so
// the callback runs against txMock instead of resolving to undefined.
export const runInTransaction = () => {
  prismaMock.$transaction.mockImplementation((callback: unknown) =>
    (callback as (tx: typeof txMock) => unknown)(txMock),
  );
};
