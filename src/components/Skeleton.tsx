interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function TextSkeleton({ width = 'w-full', lines = 1 }: { width?: string; lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-3.5 ${width} skeleton rounded-md`} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4 ${className}`}>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full skeleton" />
        <div className="space-y-2.5 flex-1">
          <div className="h-4 w-3/4 skeleton rounded-md" />
          <div className="h-3 w-1/2 skeleton rounded-md" />
          <div className="h-3 w-1/3 skeleton rounded-md" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full skeleton rounded-md" />
        <div className="h-3 w-5/6 skeleton rounded-md" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-20 skeleton rounded-lg" />
        <div className="h-8 w-20 skeleton rounded-lg" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white/[0.04] border border-white/[0.08] rounded-xl">
          <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 skeleton rounded-md" />
            <div className="h-3 w-1/3 skeleton rounded-md" />
          </div>
          <div className="w-16 h-8 skeleton rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function SubjectCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse border border-white/10">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="h-4 bg-white/10 rounded w-32" />
          <div className="h-3 bg-white/10 rounded w-16" />
        </div>
        <div className="h-5 bg-white/10 rounded-full w-12" />
      </div>
      <div className="h-2 bg-white/10 rounded-full w-full" />
    </div>
  );
}

export function UploadCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse border border-white/10">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-white/10 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-3.5 skeleton rounded-md" style={{ width: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
