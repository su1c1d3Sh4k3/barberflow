import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const BUCKET = "uploads";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!authHeader || !authHeader.includes(serviceRoleKey || "")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Missing x-tenant-id" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "general"; // "logos" | "avatars" | "general"

    if (!file) {
      return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de arquivo não permitido. Use PNG, JPG, WebP ou SVG." },
        { status: 422 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Arquivo muito grande. Tamanho máximo: 2MB." },
        { status: 422 }
      );
    }

    const supabase = createServiceRoleClient();

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: ALLOWED_TYPES,
      });
    }

    // Build path: tenantId/category/timestamp-filename
    const ext = file.name.split(".").pop() || "jpg";
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${tenantId}/${category}/${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      success: true,
      data: {
        url: urlData.publicUrl,
        path,
        bucket: BUCKET,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ success: false, error: "Erro interno no upload" }, { status: 500 });
  }
}
