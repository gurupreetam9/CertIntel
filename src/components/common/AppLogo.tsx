import type { SVGProps } from 'react';

const DefaultLogoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns=""
    viewBox="0 0 100 100"
    fill="none"
    aria-hidden="true"
    {...props}
  >
    {/* Empty path or rect as a placeholder */}
    <rect width="100" height="100" fill="none" />
  </svg>
);


interface AppLogoProps {
  size?: number;
  iconOnly?: boolean;
}

const AppLogo = ({ size = 8, iconOnly = false }: AppLogoProps) => (
  <div className="flex items-center gap-2 select-none">
    <DefaultLogoIcon className={`h-${size} w-${size} text-primary`} />
    {!iconOnly && <span className="text-2xl font-bold font-headline text-foreground">CertIntel</span>}
  </div>
);
export default AppLogo;
