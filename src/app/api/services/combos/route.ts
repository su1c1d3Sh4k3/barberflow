import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

/**
 * GET /api/services/combos — List all combo services with their children
 * POST /api/services/combos — Create a combo service
 */

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const supabase = db();

  // Get all combo services
  const { data: combos, error } = await supabase
    .from("services")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("is_combo", true)
    .eq("active", true)
    .order("name");

  if (error) return apiError(error.message, 500);

  // For each combo, fetch its children
  const combosWithChildren = await Promise.all(
    (combos || []).map(async (combo) => {
      const { data: links } = await supabase
        .from("service_combos")
        .select("child_service_id")
        .eq("parent_service_id", combo.id);

      const childIds = (links || []).map((l: { child_service_id: string }) => l.child_service_id);

      let children: unknown[] = [];
      if (childIds.length > 0) {
        const { data } = await supabase
          .from("services")
          .select("id, name, duration_min, price")
          .in("id", childIds);
        children = data || [];
      }

      return { ...combo, children };
    })
  );

  return ok(combosWithChildren);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const {
    name,
    description,
    category_id,
    child_service_ids,
    combo_discount_pct,
  } = body as {
    name: string;
    description?: string;
    category_id?: string;
    child_service_ids: string[];
    combo_discount_pct?: number;
  };

  if (!name || !child_service_ids || child_service_ids.length < 2) {
    return apiError("Um combo precisa de pelo menos 2 serviços", 422);
  }

  const supabase = db();

  // Fetch child services to compute price and duration
  const { data: children, error: childError } = await supabase
    .from("services")
    .select("id, duration_min, price")
    .in("id", child_service_ids);

  if (childError) return apiError(childError.message, 500);
  if (!children || children.length < 2) {
    return apiError("Serviços filhos não encontrados", 422);
  }

  const totalDuration = children.reduce((sum, s) => sum + s.duration_min, 0);
  const totalPrice = children.reduce((sum, s) => sum + Number(s.price), 0);
  const discount = combo_discount_pct || 0;
  const finalPrice = totalPrice * (1 - discount / 100);

  // Create the combo service
  const { data: combo, error: createError } = await supabase
    .from("services")
    .insert({
      tenant_id: auth.tenantId,
      category_id: category_id || null,
      name,
      description: description || null,
      duration_min: totalDuration,
      price: Math.round(finalPrice * 100) / 100,
      is_combo: true,
      combo_discount_pct: discount,
      active: true,
    })
    .select()
    .single();

  if (createError) return apiError(createError.message, 500);

  // Create junction records
  const comboLinks = child_service_ids.map((childId) => ({
    parent_service_id: combo.id,
    child_service_id: childId,
  }));

  const { error: linkError } = await supabase
    .from("service_combos")
    .insert(comboLinks);

  if (linkError) return apiError(linkError.message, 500);

  return ok({ ...combo, children }, 201);
}
