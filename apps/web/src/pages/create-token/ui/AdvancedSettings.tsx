import { useId, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { useConnectedAddress } from '@/features/connect-wallet';
import { shortenAddress } from '@/shared/lib';
import { ChevronDownIcon, CloseIcon, PlusIcon } from '@/shared/ui/icon';
import { useLaunch } from '../model/launch';
import { useLaunchDraft } from '../model/launch-draft';
import { useLaunchTerms } from '../model/launch-terms';
import { FieldError, FieldNote, GroupField, LabelField } from './Field';

function BuybackSwitch() {
  const { state, actions } = useLaunchDraft();
  const enabled = state.buyback;
  return (
    <GroupField label="Buyback" span="full">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className="launchpad-switch"
        onClick={() => actions.set('buyback', !enabled)}
      >
        <span className="launchpad-switch-knob" aria-hidden="true" />
        <span className="launchpad-switch-label">
          {enabled ? 'Half of creator fees buy back the token' : 'Creator fees all go to the creator wallet'}
        </span>
      </button>
      <FieldNote>
        Bought-back tokens are locked and released over five years. The Creator wallet can switch this after launch.
      </FieldNote>
    </GroupField>
  );
}

function CreatorWalletField({ error }: { error: string | undefined }) {
  const { state, actions } = useLaunchDraft();
  const connected = useConnectedAddress();
  return (
    <LabelField label="Creator wallet" span="full" error={error}>
      <input
        className="launchpad-input"
        placeholder={connected ? `Connected wallet (${shortenAddress(connected)})` : 'Connected wallet'}
        autoComplete="off"
        spellCheck="false"
        aria-invalid={Boolean(error)}
        value={state.creatorWallet}
        onChange={(event) => actions.set('creatorWallet', event.target.value)}
      />
      <FieldNote>Receives creator fees and the creator tax. Leave blank to use your connected wallet.</FieldNote>
    </LabelField>
  );
}

function CreatorTaxField({ error }: { error: string | undefined }) {
  const { state, actions } = useLaunchDraft();
  const { text } = useLaunchTerms(state.pairedAsset);
  return (
    <LabelField label="Creator tax" span="full" error={error}>
      <span className="launchpad-prefixed-input">
        <input
          inputMode="decimal"
          placeholder="0"
          aria-label="Creator tax percent"
          aria-invalid={Boolean(error)}
          value={state.creatorTax}
          onChange={(event) => actions.set('creatorTax', event.target.value)}
        />
        <span className="launchpad-suffix" aria-hidden="true">
          %
        </span>
      </span>
      {text && (
        <FieldNote>
          Charged on top of the {text.tradeFee} trade fee, up to {text.maxCreatorTax}, and paid to the Creator wallet.
        </FieldNote>
      )}
    </LabelField>
  );
}

function SnipeExemptionField({ error }: { error: string | undefined }) {
  const { state, actions } = useLaunchDraft();
  const { text } = useLaunchTerms(state.pairedAsset);
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string>();
  const inputId = useId();
  const noteId = useId();
  const wallets = state.snipeExemptions;

  function add() {
    const value = entry.trim();
    if (!isAddress(value)) {
      setEntryError('Enter a wallet address');
      return;
    }
    const wallet = getAddress(value);
    if (!wallets.includes(wallet)) actions.set('snipeExemptions', [...wallets, wallet]);
    setEntry('');
    setEntryError(undefined);
  }

  return (
    <div className="launchpad-field launchpad-field-wide">
      <label className="launchpad-label" htmlFor={inputId}>
        Snipe tax exemptions
      </label>
      <div className={entryError ? 'launchpad-wallet-entry is-error' : 'launchpad-wallet-entry'}>
        <input
          id={inputId}
          placeholder="0x wallet address"
          autoComplete="off"
          spellCheck="false"
          aria-invalid={Boolean(entryError)}
          aria-describedby={noteId}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <button
          type="button"
          className="launchpad-wallet-add"
          disabled={!entry.trim()}
          aria-label="Add wallet to the exemption list"
          onClick={add}
        >
          <PlusIcon size={14} />
        </button>
      </div>
      {wallets.length > 0 && (
        <ul className="launchpad-wallet-list">
          {wallets.map((wallet) => (
            <li key={wallet} className="launchpad-wallet-row">
              <span className="launchpad-wallet-address">{wallet}</span>
              <button
                type="button"
                className="launchpad-wallet-remove"
                aria-label={`Remove ${shortenAddress(wallet)}`}
                onClick={() =>
                  actions.set(
                    'snipeExemptions',
                    wallets.filter((w) => w !== wallet),
                  )
                }
              >
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldError message={entryError ?? error} />
      <FieldNote id={noteId}>
        {text
          ? `Buys in the launch second pay ${text.snipeTax}, decaying to zero across ${text.snipeWindowSeconds}s. `
          : ''}
        Declare the wallets your team opens with. Yours and the Creator wallet are always exempt.
      </FieldNote>
    </div>
  );
}

/** Collapsible panel for buyback, creator fees and snipe exemptions. Closed content is `inert`. */
export function AdvancedSettings() {
  const { errors } = useLaunch().state;
  const [toggled, setToggled] = useState(false);
  const panelId = useId();
  // A problem inside the panel keeps it open, so the creator can see what to fix.
  const hasError = Boolean(errors.creatorWallet || errors.creatorTax || errors.snipeExemptions);
  const open = toggled || hasError;

  return (
    <div className="launchpad-disclosure launchpad-field-wide">
      <button
        type="button"
        className="launchpad-advanced-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setToggled(!open)}
      >
        <span className="launchpad-advanced-title">Advanced</span>
        <span className="launchpad-advanced-chevron" aria-hidden="true" style={{ rotate: open ? '180deg' : 'none' }}>
          <ChevronDownIcon />
        </span>
      </button>
      <section
        id={panelId}
        className="launchpad-advanced-shell"
        aria-label="Advanced launch settings"
        aria-hidden={!open}
        inert={!open}
        style={{ height: open ? 'auto' : '0px' }}
      >
        <div
          className="launchpad-advanced"
          style={open ? undefined : { transform: 'translate(0px, -6px)', opacity: 0 }}
        >
          <BuybackSwitch />
          <CreatorWalletField error={errors.creatorWallet} />
          <CreatorTaxField error={errors.creatorTax} />
          <SnipeExemptionField error={errors.snipeExemptions} />
        </div>
      </section>
    </div>
  );
}
