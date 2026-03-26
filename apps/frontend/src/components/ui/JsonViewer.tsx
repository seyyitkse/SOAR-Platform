'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
  className?: string;
}

export function JsonViewer({ data, collapsed = false, className }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {isCollapsed ? 'Genislet' : 'Daralt'}
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Kopyalandi' : 'Kopyala'}
        </button>
      </div>
      {!isCollapsed && (
        <pre className="p-3 rounded-lg bg-muted text-xs overflow-auto max-h-64 font-mono">
          {jsonString}
        </pre>
      )}
    </div>
  );
}
