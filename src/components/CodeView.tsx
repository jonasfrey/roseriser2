import { useMemo, useState } from 'react';
import { tokenizeScad } from '../openscad';

interface CodeViewProps {
  code: string;
  filename: string;
}

export function CodeView({ code, filename }: CodeViewProps) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenizeScad(code), [code]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const onDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="codeview">
      <div className="codeview__header">
        <span className="codeview__filename">{filename}</span>
        <div className="codeview__actions">
          <button type="button" onClick={onCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button type="button" onClick={onDownload}>
            Download .scad
          </button>
        </div>
      </div>
      <pre className="codeview__pre">
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={`tok tok--${t.kind}`}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
