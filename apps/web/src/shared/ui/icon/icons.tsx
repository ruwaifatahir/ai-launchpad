import { Icon, type IconProps } from './Icon';

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function SunIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" />
      <path
        d="M12 2V3.5M12 20.5V22M19.0708 19.0713L18.0101 18.0106M5.98926 5.98926L4.9286 4.9286M22 12H20.5M3.5 12H2M19.0713 4.92871L18.0106 5.98937M5.98975 18.0107L4.92909 19.0714"
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M17 17L21 21" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12.001 5.00003V19.002" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.002 12.002L4.99998 12.002" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function ChevronLeftIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ChevronRightIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ChevronDownIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function CopyIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M9 15C9 12.1716 9 10.7574 9.87868 9.87868C10.7574 9 12.1716 9 15 9L16 9C18.8284 9 20.2426 9 21.1213 9.87868C22 10.7574 22 12.1716 22 15V16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H15C12.1716 22 10.7574 22 9.87868 21.1213C9 20.2426 9 18.8284 9 16L9 15Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.9999 9C16.9975 6.04291 16.9528 4.51121 16.092 3.46243C15.9258 3.25989 15.7401 3.07418 15.5376 2.90796C14.4312 2 12.7875 2 9.5 2C6.21252 2 4.56878 2 3.46243 2.90796C3.25989 3.07417 3.07418 3.25989 2.90796 3.46243C2 4.56878 2 6.21252 2 9.5C2 12.7875 2 14.4312 2.90796 15.5376C3.07417 15.7401 3.25989 15.9258 3.46243 16.092C4.51121 16.9528 6.04291 16.9975 9 16.9999"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function GlobeIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z" strokeLinejoin="round" />
      <path d="M21 15H3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 9H3" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function CoinsIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <ellipse cx="15.5" cy="11" rx="6.5" ry="2" />
      <path d="M22 15.5C22 16.6046 19.0899 17.5 15.5 17.5C11.9101 17.5 9 16.6046 9 15.5" />
      <path d="M22 11V19.8C22 21.015 19.0899 22 15.5 22C11.9101 22 9 21.015 9 19.8V11" />
      <ellipse cx="8.5" cy="4" rx="6.5" ry="2" />
      <path
        d="M6 11C4.10819 10.7698 2.36991 10.1745 2 9M6 16C4.10819 15.7698 2.36991 15.1745 2 14"
        strokeLinecap="round"
      />
      <path d="M6 21C4.10819 20.7698 2.36991 20.1745 2 19L2 4" strokeLinecap="round" />
      <path d="M15 6V4" strokeLinecap="round" />
    </Icon>
  );
}

export function UsersIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M15.5 11C15.5 9.067 13.933 7.5 12 7.5C10.067 7.5 8.5 9.067 8.5 11C8.5 12.933 10.067 14.5 12 14.5C13.933 14.5 15.5 12.933 15.5 11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.4827 11.3499C15.8047 11.4475 16.1462 11.5 16.5 11.5C18.433 11.5 20 9.933 20 8C20 6.067 18.433 4.5 16.5 4.5C14.6851 4.5 13.1928 5.8814 13.0173 7.65013"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.9827 7.65013C10.8072 5.8814 9.31492 4.5 7.5 4.5C5.567 4.5 4 6.067 4 8C4 9.933 5.567 11.5 7.5 11.5C7.85381 11.5 8.19535 11.4475 8.51727 11.3499"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 16.5C22 13.7386 19.5376 11.5 16.5 11.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M17.5 19.5C17.5 16.7386 15.0376 14.5 12 14.5C8.96243 14.5 6.5 16.7386 6.5 19.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.5 11.5C4.46243 11.5 2 13.7386 2 16.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function SwapIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M16.9767 19.5C19.4017 17.8876 21 15.1305 21 12C21 7.02944 16.9706 3 12 3C11.3126 3 10.6432 3.07706 10 3.22302M16.9767 19.5V16M16.9767 19.5H20.5M7 4.51555C4.58803 6.13007 3 8.87958 3 12C3 16.9706 7.02944 21 12 21C12.6874 21 13.3568 20.9229 14 20.777M7 4.51555V8M7 4.51555H3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ArrowUpRightIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M9 6.65032C9 6.65032 15.9383 6.10759 16.9154 7.08463C17.8924 8.06167 17.3496 15 17.3496 15M16.5 7.5L6.5 17.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ImageIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="7.5" cy="7.5" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" />
      <path d="M5 21C9.37246 15.775 14.2741 8.88406 21.4975 13.5424" />
    </Icon>
  );
}

export function GasStationIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M10.4626 13L9.06858 14.8124C8.91919 15.0066 9.02626 15.2861 9.26987 15.3378L10.7301 15.6477C10.9899 15.7028 11.0889 16.0122 10.9073 16.2011L9.17773 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 10H16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21L4 9C4 6.17157 4 4.75736 4.87868 3.87868C5.75736 3 7.17157 3 10 3C12.8284 3 14.2426 3 15.1213 3.87868C16 4.75736 16 6.17157 16 9L16 21H4Z" />
      <path d="M2 21H18" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M16 14H17.6667C17.9767 14 18.1317 14 18.2588 14.0341C18.6039 14.1265 18.8735 14.3961 18.9659 14.7412C19 14.8683 19 15.0233 19 15.3333V16.5C19 17.3284 19.6716 18 20.5 18C21.3284 18 22 17.3284 22 16.5V10.2111C22 9.60998 22 9.30941 21.9142 9.02598C21.8284 8.74255 21.6616 8.49247 21.3282 7.9923L20.5547 6.83205C20.2082 6.31223 19.6247 6 19 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function UserIcon({ size = 28 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M17 8.5C17 5.73858 14.7614 3.5 12 3.5C9.23858 3.5 7 5.73858 7 8.5C7 11.2614 9.23858 13.5 12 13.5C14.7614 13.5 17 11.2614 17 8.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 20.5C19 16.634 15.866 13.5 12 13.5C8.13401 13.5 5 16.634 5 20.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function WalletIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M3 7.5V17C3 18.6569 4.34315 20 6 20H19C20.1046 20 21 19.1046 21 18V10C21 8.89543 20.1046 8 19 8H5.5C4.11929 8 3 6.88071 3 5.5V5.5C3 4.11929 4.11929 3 5.5 3H17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.5 14H16.51" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M5 14L8.5 17.5L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function AlertIcon({ size = 16 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 7.5V13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16.5H12.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
      <circle cx="12" cy="12" r="9.5" />
    </Icon>
  );
}
