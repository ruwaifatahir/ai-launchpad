import {
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { formatUnits } from 'viem';
import { useConnectedAddress, useSessionGate, WalletGate, type SessionGate } from '@/features/connect-wallet';
import {
  externalLinks,
  isNativeAsset,
  pairedAssetIcon,
  pairedAssets,
  supportedNetwork,
  type PairedAsset,
} from '@/shared/config';
import { cx } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { ChevronDownIcon, ImageIcon } from '@/shared/ui/icon';
import { TokenIcon } from '@/shared/ui/token-icon';
import { FIELD_LIMITS, LOGO_FILE } from '../config/field-limits';
import { useLaunch, type LaunchStatus } from '../model/launch';
import { useLaunchDraft } from '../model/launch-draft';
import { useLaunchTerms } from '../model/launch-terms';
import { useMintTestAsset, usePairedAssetBalance } from '../model/paired-balance';
import { AdvancedSettings } from './AdvancedSettings';
import { FieldError, FieldNote, GroupField, LabelField } from './Field';

function IdentityFields() {
  const { state, actions } = useLaunchDraft();
  const { errors } = useLaunch().state;
  return (
    <>
      <LabelField label="Name" error={errors.name}>
        <input
          className="launchpad-input"
          placeholder="Token name"
          maxLength={FIELD_LIMITS.name}
          autoComplete="off"
          spellCheck="false"
          aria-invalid={Boolean(errors.name)}
          value={state.name}
          onChange={(event) => actions.set('name', event.target.value)}
        />
      </LabelField>
      <LabelField label="Ticker" error={errors.ticker}>
        <input
          className="launchpad-input"
          placeholder="symbol"
          maxLength={FIELD_LIMITS.ticker}
          autoComplete="off"
          spellCheck="false"
          aria-invalid={Boolean(errors.ticker)}
          value={state.ticker}
          onChange={(event) => actions.set('ticker', event.target.value)}
        />
      </LabelField>
      <LabelField label="Description" span="full">
        <textarea
          className="launchpad-input launchpad-textarea"
          placeholder="A short description of the token"
          maxLength={FIELD_LIMITS.description}
          rows={3}
          value={state.description}
          onChange={(event) => actions.set('description', event.target.value)}
        />
      </LabelField>
    </>
  );
}

const LOGO_NOTE = `${LOGO_FILE.typeNames}, up to ${LOGO_FILE.maxMegabytes} MB. Shown as a square.`;

/** The picker's two lines: what a click does, and what to expect. `busy` runs from the pick until the image draws. */
function imageCopy(gate: SessionGate, busy: boolean, stored: boolean): { heading: string; note: string } {
  switch (gate.kind) {
    case 'connect':
      return { heading: 'Connect to add an image', note: 'Connect and sign in first, then choose a file.' };
    case 'switch-network':
      return {
        heading: `Switch to ${supportedNetwork.name} to add an image`,
        note: 'Switch and sign in first, then choose a file.',
      };
    case 'sign-in':
      return { heading: 'Sign in to add an image', note: 'Sign in first, then choose a file.' };
    default:
      if (busy) return { heading: 'Uploading…', note: LOGO_NOTE };
      return stored
        ? { heading: 'Change image', note: 'Cropped to a square, like it will show.' }
        : { heading: 'Choose image', note: LOGO_NOTE };
  }
}

/**
 * The logo picker. Uploads on pick and shows the stored image, cropped as it will launch, never the
 * local file. Before the wallet is signed in, a click opens the wallet modal in place of the file dialog.
 */
function ImageField() {
  const { state: draft } = useLaunchDraft();
  const { state, actions } = useLaunch();
  const gate = useSessionGate();
  const upload = state.logoUpload;
  const uploading = upload.kind === 'uploading';
  // The stored URL whose image has drawn; until it matches the draft's, the image is still on its way.
  const [drawnLogo, setDrawnLogo] = useState('');
  const busy = uploading || (Boolean(draft.logo) && drawnLogo !== draft.logo);
  // The last upload's refusal comes before the launch's "add an image", or the pick's problem would never show.
  const error = (upload.kind === 'failed' ? upload.reason : undefined) ?? state.errors.logo;
  const { heading, note } = imageCopy(gate, busy, Boolean(draft.logo));

  function onClick(event: MouseEvent<HTMLInputElement>) {
    if (!('open' in gate)) return;
    event.preventDefault();
    gate.open();
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again, after a failure, fires a change.
    event.target.value = '';
    if (file) void actions.uploadLogo(file);
  }

  return (
    <GroupField label="Token image" span="full" error={error}>
      <label className={cx('launchpad-upload', draft.logo && 'is-ready', error && 'is-error', busy && 'is-busy')}>
        <input
          className="launchpad-file-input"
          type="file"
          accept={LOGO_FILE.types.join(',')}
          // While the wallet settles neither the file dialog nor the wallet modal is the right answer yet.
          disabled={uploading || gate.kind === 'settling'}
          aria-invalid={Boolean(error)}
          onClick={onClick}
          onChange={onChange}
        />
        <span className="launchpad-upload-thumb">
          {draft.logo ? (
            <img
              className="launchpad-upload-preview"
              src={draft.logo}
              alt=""
              onLoad={() => setDrawnLogo(draft.logo)}
              // A stored image that will not draw is dropped, so the launch never writes a broken logo.
              onError={actions.rejectUnreadableLogo}
            />
          ) : (
            !busy && <ImageIcon />
          )}
          {busy && <span className="launchpad-upload-spinner" aria-hidden="true" />}
        </span>
        <span className="launchpad-upload-copy" aria-live="polite">
          <span>{heading}</span>
          <small>{note}</small>
        </span>
      </label>
    </GroupField>
  );
}

function PrefixedInput({ prefix, ...inputProps }: { prefix: string } & ComponentProps<'input'>) {
  return (
    <span className="launchpad-prefixed-input">
      <span aria-hidden="true">{prefix}</span>
      <input autoComplete="off" spellCheck="false" {...inputProps} />
    </span>
  );
}

function SocialFields() {
  const { state, actions } = useLaunchDraft();
  return (
    <>
      <LabelField label="X profile">
        <PrefixedInput
          prefix="x.com/"
          placeholder="handle"
          maxLength={FIELD_LIMITS.xHandle}
          aria-label="X profile handle"
          value={state.xHandle}
          onChange={(event) => actions.set('xHandle', event.target.value)}
        />
      </LabelField>
      <LabelField label="Telegram">
        <PrefixedInput
          prefix="t.me/"
          placeholder="community"
          maxLength={FIELD_LIMITS.telegram}
          aria-label="Telegram public username"
          value={state.telegram}
          onChange={(event) => actions.set('telegram', event.target.value)}
        />
      </LabelField>
    </>
  );
}

function PairField() {
  const { state, actions } = useLaunchDraft();
  const { text } = useLaunchTerms(state.pairedAsset);
  const [open, setOpen] = useState(false);
  const selected = state.pairedAsset;
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close once focus leaves the picker (a click elsewhere or Tab), or on Escape.
  const closeOnBlur = (event: FocusEvent) => {
    if (!pickerRef.current?.contains(event.relatedTarget)) setOpen(false);
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <GroupField label="Paired asset" span="full">
      <div ref={pickerRef} className="launchpad-pair launchpad-pair-picker">
        <button
          type="button"
          className="launchpad-pair-trigger"
          aria-expanded={open}
          aria-label={`Paired asset: ${selected.symbol}`}
          onBlur={closeOnBlur}
          onKeyDown={closeOnEscape}
          onClick={() => setOpen((isOpen) => !isOpen)}
        >
          <span className="launchpad-pair-current">
            <TokenIcon src={pairedAssetIcon(selected)} />
            {selected.symbol}
          </span>
          <span className="launchpad-pair-chevron" aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </button>
        {open && (
          <ul className="launchpad-pair-menu">
            {pairedAssets.map((asset) => (
              <li key={asset.address}>
                <button
                  type="button"
                  className={cx('launchpad-pair-option', asset.address === selected.address && 'is-selected')}
                  aria-pressed={asset.address === selected.address}
                  onBlur={closeOnBlur}
                  onKeyDown={closeOnEscape}
                  onClick={() => {
                    actions.set('pairedAsset', asset);
                    setOpen(false);
                  }}
                >
                  <TokenIcon src={pairedAssetIcon(asset)} />
                  {asset.symbol}
                  <span className="launchpad-pair-option-name">{asset.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <FieldNote>
        {text ? `Graduates once the curve raises ${text.graduation}.` : 'Reading graduation terms…'}
      </FieldNote>
    </GroupField>
  );
}

function DeveloperBuyField() {
  const error = useLaunch().state.errors.developerBuy;
  const { state, actions } = useLaunchDraft();
  const asset = state.pairedAsset;
  const balance = usePairedAssetBalance(asset);
  const testMint = useMintTestAsset(asset, balance.refetch);
  const connected = Boolean(useConnectedAddress());
  const balanceText = connected
    ? balance.amount
      ? `${balance.amount} available`
      : 'Reading balance…'
    : 'Connect a wallet to see your balance';

  return (
    <GroupField label="Developer buy" span="full">
      <div className={cx('launchpad-buy-field', error && 'is-invalid')}>
        <div className="launchpad-buy-entry">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Developer buy amount in ${asset.symbol}`}
            aria-invalid={Boolean(error)}
            value={state.developerBuy}
            onChange={(event) => actions.set('developerBuy', event.target.value)}
          />
          <span className="launchpad-buy-token">
            <TokenIcon src={pairedAssetIcon(asset)} />
            {asset.symbol}
          </span>
        </div>
        <div className="launchpad-buy-meta">
          <span role={error ? 'alert' : undefined}>{error ?? balanceText}</span>
          {asset.mintable && connected && (
            <button type="button" className="convert-max" disabled={testMint.minting} onClick={testMint.mint}>
              {testMint.minting ? `Getting ${testMint.amount}…` : `Get ${testMint.amount}`}
            </button>
          )}
          {isNativeAsset(asset) && connected && externalLinks.faucet && (
            <a className="convert-max" href={externalLinks.faucet} target="_blank" rel="noreferrer">
              Get test {asset.symbol}
            </a>
          )}
        </div>
      </div>
      <FieldNote>Bought in the launch transaction, before anyone else can trade. Optional.</FieldNote>
    </GroupField>
  );
}

function buttonLabel(status: LaunchStatus, ready: boolean, uploading: boolean, asset: PairedAsset): string {
  if (uploading) return 'Uploading image…';
  switch (status.kind) {
    case 'approve-signing':
      return `Approve ${asset.symbol} in your wallet`;
    case 'approve-confirming':
      return `Approving ${asset.symbol}…`;
    case 'signing':
      return 'Confirm the launch in your wallet';
    case 'confirming':
      return 'Launching your token…';
    default:
      return ready ? 'Launch token' : 'Loading launch terms…';
  }
}

/** The launch's total: always the native fee, plus the Developer buy in its own asset. */
function costText(cost: { eth: bigint; paired: bigint }, asset: PairedAsset): string {
  const eth = `${formatUnits(cost.eth, 18)} ${supportedNetwork.nativeCurrency.symbol}`;
  return cost.paired > 0n ? `${eth} + ${formatUnits(cost.paired, asset.decimals)} ${asset.symbol}` : eth;
}

function LaunchFooter({ onLaunch }: { onLaunch: () => void }) {
  const { state: draft } = useLaunchDraft();
  const { status, busy, ready, cost, errors, logoUpload } = useLaunch().state;
  const uploading = logoUpload.kind === 'uploading';

  return (
    <footer className="launchpad-create-actions">
      <div className="convert-footer">
        <span className="convert-footer-rate">You pay, plus network gas</span>
        <span className="launchpad-total">{cost ? costText(cost, draft.pairedAsset) : '…'}</span>
      </div>
      <FieldError message={errors.launchFee} />
      <WalletGate>
        <Button className={cx(!ready && 'is-blocked')} disabled={!ready} busy={busy} onClick={onLaunch}>
          {buttonLabel(status, ready, uploading, draft.pairedAsset)}
        </Button>
      </WalletGate>
    </footer>
  );
}

export function LaunchForm() {
  const { state, actions } = useLaunch();
  const formRef = useRef<HTMLDivElement>(null);

  async function submit() {
    if ((await actions.launch()) !== 'invalid') return;
    // Take the creator to the first thing to fix, once the errors have rendered.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  return (
    <section className="split-shell-form launchpad-create-form">
      <header className="launchpad-create-header">
        <h1 className="split-shell-title">Launch token</h1>
      </header>
      <div ref={formRef} className="launchpad-form" inert={state.busy}>
        <IdentityFields />
        <ImageField />
        <SocialFields />
        <PairField />
        <DeveloperBuyField />
        <AdvancedSettings />
      </div>
      <LaunchFooter onLaunch={() => void submit()} />
    </section>
  );
}
