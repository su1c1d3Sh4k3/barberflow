"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "uploads";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

interface ImageUploadProps {
  currentUrl?: string | null;
  category: "logos" | "avatars" | "general";
  onUpload: (url: string) => void;
  /** Shape variant */
  shape?: "circle" | "square";
  /** Size in px */
  size?: number;
  label?: string;
  className?: string;
}

export function ImageUpload({
  currentUrl,
  category,
  onUpload,
  shape = "circle",
  size = 120,
  label,
  className,
}: ImageUploadProps) {
  const { tenant } = useTenantStore();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side validation
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("Use PNG, JPG, WebP ou SVG.");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError("Máximo 2MB.");
        return;
      }

      setError(null);
      setUploading(true);

      // Instant preview
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);

      try {
        const supabase = createClient();
        const tenantId = tenant?.id || "unknown";
        const ext = file.name.split(".").pop() || "jpg";
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${tenantId}/${category}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        setPreview(urlData.publicUrl);
        onUpload(urlData.publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro no upload");
        setPreview(currentUrl || null);
      } finally {
        setUploading(false);
        URL.revokeObjectURL(objectUrl);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [category, currentUrl, onUpload, tenant?.id]
  );

  const handleRemove = useCallback(() => {
    setPreview(null);
    onUpload("");
  }, [onUpload]);

  const borderRadius = shape === "circle" ? "9999px" : "16px";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative group">
        {/* Main area */}
        <div
          className={cn(
            "flex items-center justify-center border-2 border-dashed overflow-hidden cursor-pointer transition-colors",
            "border-surface-container-high bg-surface-container-low hover:border-[#F59E0B]/50",
            uploading && "pointer-events-none opacity-60"
          )}
          style={{ width: size, height: size, borderRadius }}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img
              src={preview}
              alt={label || "Upload"}
              className="h-full w-full object-cover"
              style={{ borderRadius }}
            />
          ) : (
            <Upload size={size > 80 ? 24 : 16} className="text-muted-foreground" />
          )}

          {uploading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/40"
              style={{ borderRadius }}
            >
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Remove button */}
        {preview && !uploading && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {label && (
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          {label}
        </span>
      )}

      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
