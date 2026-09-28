import { darkTheme, type Theme } from '@rainbow-me/rainbowkit';

// RainbowKit also uses the accent for text (group labels, links), and green text is off-limits,
// so its accent is the design system's selected state: a white block with black text.
const base = darkTheme({ accentColor: 'var(--text-primary)', accentColorForeground: 'var(--bg-page)' });
const sharp = '2px';
const flat = 'none';

/** RainbowKit's modals on the design system: grey surfaces, hairlines, 2px corners, no shadows. */
export const walletTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackdrop: 'rgba(0, 0, 0, 0.7)',
    modalBackground: 'var(--bg-white)',
    modalBorder: 'var(--term-line)',
    modalText: 'var(--text-primary)',
    modalTextSecondary: 'var(--text-muted)',
    modalTextDim: 'var(--text-subtle)',
    generalBorder: 'var(--term-line)',
    generalBorderDim: 'var(--accent-soft)',
    actionButtonBorder: 'var(--term-line)',
    actionButtonBorderMobile: 'var(--term-line)',
    actionButtonSecondaryBackground: 'var(--bg-elevated)',
    closeButton: 'var(--text-muted)',
    closeButtonBackground: 'var(--bg-elevated)',
    menuItemBackground: 'var(--accent-soft)',
    profileAction: 'var(--bg-elevated)',
    profileActionHover: 'var(--accent-soft)',
    profileForeground: 'var(--bg-white)',
    selectedOptionBorder: 'var(--term-line)',
    downloadTopCardBackground: 'var(--bg-elevated)',
    downloadBottomCardBackground: 'var(--bg-white)',
  },
  fonts: { body: 'var(--font-sans)' },
  radii: { actionButton: sharp, connectButton: sharp, menuButton: sharp, modal: sharp, modalMobile: sharp },
  shadows: {
    connectButton: flat,
    dialog: flat,
    profileDetailsAction: flat,
    selectedOption: flat,
    selectedWallet: flat,
    walletLogo: flat,
  },
};
