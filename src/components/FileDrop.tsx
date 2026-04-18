import { useCallback, useRef, useState } from 'react';

interface FileDropProps {
  label: string;
  accept?: string;
  file: File | null;
  onFile: (file: File) => void;
  helpText?: string;
}

export function FileDrop({ label, accept = '.dxf', file, onFile, helpText }: FileDropProps) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div
      className={`filedrop ${over ? 'filedrop--over' : ''} ${file ? 'filedrop--has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <div className="filedrop__label">{label}</div>
      <div className="filedrop__body">
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="filedrop__meta">{(file.size / 1024).toFixed(1)} kB</span>
          </>
        ) : (
          <>
            <span>Drop a .dxf file or click to browse</span>
            {helpText && <span className="filedrop__meta">{helpText}</span>}
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onPick}
        style={{ display: 'none' }}
      />
    </div>
  );
}
