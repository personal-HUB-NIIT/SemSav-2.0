import { useRef, useState, useEffect, type ReactNode } from 'react';

interface Tab {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  variant?: 'pill' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Tabs({ tabs, active, onChange, variant = 'pill', size = 'md', className = '' }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeEl = tabRefs.current.get(active);
    if (activeEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }
  }, [active]);

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };

  if (variant === 'underline') {
    return (
      <div className={`relative ${className}`}>
        <div ref={containerRef} className="flex gap-1 border-b border-white/[0.06]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              ref={el => { if (el) tabRefs.current.set(tab.key, el); }}
              onClick={() => onChange(tab.key)}
              className={`
                relative flex items-center gap-1.5 ${sizeStyles[size]} font-semibold
                transition-colors duration-200 rounded-t-lg
                ${active === tab.key ? 'text-white' : 'text-slate-400 hover:text-slate-200'}
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="absolute bottom-0 h-0.5 bg-indigo-500 rounded-full transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>
    );
  }

  return (
    <div className={`flex gap-1 bg-white/[0.04] rounded-xl p-1 w-fit border border-white/[0.08] relative ${className}`}>
      <div
        className="absolute top-1 bottom-1 bg-indigo-600 rounded-lg shadow-sm shadow-indigo-500/20 transition-all duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {tabs.map(tab => (
        <button
          key={tab.key}
          ref={el => { if (el) tabRefs.current.set(tab.key, el); }}
          onClick={() => onChange(tab.key)}
          className={`
            relative z-10 flex items-center gap-1.5 ${sizeStyles[size]} font-semibold
            transition-colors duration-200 rounded-lg
            ${active === tab.key ? 'text-white' : 'text-slate-400 hover:text-slate-200'}
          `}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
