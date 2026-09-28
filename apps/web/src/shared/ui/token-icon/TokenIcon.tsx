type TokenIconProps = {
  src: string;
  size?: number;
};

/** Small decorative asset logo shown next to a ticker (the ticker itself carries the meaning). */
export function TokenIcon({ src, size = 18 }: TokenIconProps) {
  return <img src={src} alt="" width={size} height={size} className="token-icon" />;
}
