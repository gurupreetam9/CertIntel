import type { SVGProps } from 'react';

const DefaultLogoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <rect width="256" height="256" fill="none"/>
    <path d="M160,40H216a8,8,0,0,1,8,8V208a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H48v96H208V56H160a8,8,0,0,1,0-16Zm48,108a12,12,0,1,0-12,12A12,12,0,0,0,208,148ZM88,56a32,32,0,1,0,32,32A32,32,0,0,0,88,56Zm0,48a16,16,0,1,1,16-16A16,16,0,0,1,88,104Z"/>
  </svg>
);


interface AppLogoProps {
  size?: number;
  iconOnly?: boolean;
}

const AppLogo = ({ size = 8, iconOnly = false }: AppLogoProps) => (
  <div className="flex items-center gap-2 select-none">
    <DefaultLogoIcon className={`h-${size} w-${size} text-primary`} />
    {!iconOnly && <span className="text-2xl font-bold font-headline text-foreground">ImageVerse</span>}
  </div>
);
export default AppLogo;
