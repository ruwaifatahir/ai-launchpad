import type { ReactNode } from 'react';

/** One side of the swap: label, amount, and the asset with its balance on the right. */
export function ConvertPanel({
  label,
  amount,
  asset,
  balance,
  onFill,
}: {
  label: string;
  amount: ReactNode;
  asset: ReactNode;
  balance: string | undefined;
  /** Makes the balance a button that fills in all of it. */
  onFill?: (() => void) | undefined;
}) {
  return (
    <div className="convert-panel">
      <span className="convert-panel-label">{label}</span>
      <div className="convert-row">
        <div className="convert-amount">{amount}</div>
        <div className="convert-side">
          {asset}
          {balance && onFill ? (
            <button
              type="button"
              className="convert-balance convert-balance-fill"
              aria-label={`Use the whole balance, ${balance}`}
              onClick={onFill}
            >
              {balance}
            </button>
          ) : balance ? (
            <p className="convert-balance">{balance}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
