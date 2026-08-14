import { DynamicIcon } from 'lucide-react/dynamic';
import { Megaphone } from 'lucide-react';

type IconValue = { kind: 'lucide' | 'svg' | 'image'; value: string } | null | undefined;

export default function ComplaintIcon({ icon, className = 'w-6 h-6' }: {
  icon: IconValue;
  className?: string;
}) {
  if (icon?.kind === 'lucide') {
    return (
      <DynamicIcon
        name={icon.value as never}
        className={className}
        fallback={() => <Megaphone className={className} />}
        aria-hidden="true"
      />
    );
  }
  if (icon?.kind === 'svg') {
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.value)}`;
    return <img src={src} alt="" className={`${className} object-contain`} />;
  }
  if (icon?.kind === 'image') {
    return <img src={icon.value} alt="" className={`${className} object-contain`} />;
  }
  return <Megaphone className={className} aria-hidden="true" />;
}
