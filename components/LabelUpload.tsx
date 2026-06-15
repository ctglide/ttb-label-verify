"use client";

import { useRef, useState, useCallback } from "react";

interface LabelUploadProps {
  onImageReady: (base64: string, mimeType: string) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export default function LabelUpload({ onImageReady, disabled }: LabelUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES[file.type]) {
        setError("Unsupported file type. Upload a JPEG, PNG, or WebP image.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError("Image exceeds 5 MB. Use a smaller file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // result is "data:image/jpeg;base64,XXXX..."
        const base64 = result.split(",")[1];
        setPreview(result);
        onImageReady(base64, file.type);
      };
      reader.onerror = () => setError("Could not read file. Try again.");
      reader.readAsDataURL(file);
    },
    [onImageReady]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${disabled ? "opacity-50 cursor-not-allowed border-slate-200" : "cursor-pointer hover:border-indigo-400"}
          ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"}
        `}
      >
        {preview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Label preview"
              className="max-h-64 mx-auto object-contain rounded"
            />
            {!disabled && (
              <p className="text-xs text-slate-500">Click or drag to replace</p>
            )}
          </div>
        ) : (
          <div className="space-y-2 py-4">
            <svg
              className="mx-auto h-10 w-10 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium text-slate-700">
              Drop label image here or click to browse
            </p>
            <p className="text-xs text-slate-500">JPEG, PNG, WebP — max 5 MB</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleFileChange}
          disabled={disabled}
          aria-label="Upload label image"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 flex items-center gap-1.5">
          <span aria-hidden>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
