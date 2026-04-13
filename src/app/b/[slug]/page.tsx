import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BookingWizard } from "./booking-wizard";

interface PageProps {
  params: { slug: string };
}

async function fetchBusinessHours(
  supabase: ReturnType<typeof createServiceRoleClient>,
  companyId: string
) {
  const { data } = await supabase
    .from("business_hours")
    .select("weekday, open_time, close_time, closed")
    .eq("company_id", companyId)
    .order("weekday", { ascending: true });
  return data || [];
}

export default async function AgendamentoOnlinePage({ params }: PageProps) {
  const { slug } = params;
  const supabase = createServiceRoleClient();

  // Fetch tenant by public_slug
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, public_slug")
    .eq("public_slug", slug)
    .single();

  if (!tenant) {
    // Try finding by company slug
    const { data: company } = await supabase
      .from("companies")
      .select("id, tenant_id, name, logo_url, public_slug, phone, address")
      .eq("public_slug", slug)
      .single();

    if (!company) {
      notFound();
    }

    // Get the tenant for this company
    const { data: companyTenant } = await supabase
      .from("tenants")
      .select("id, name, public_slug")
      .eq("id", company.tenant_id)
      .single();

    if (!companyTenant) {
      notFound();
    }

    const businessHours = await fetchBusinessHours(supabase, company.id);

    return (
      <BookingWizard
        slug={slug}
        tenant={{ id: companyTenant.id, name: companyTenant.name }}
        company={{
          id: company.id,
          name: company.name,
          logo_url: company.logo_url,
          phone: company.phone,
          address: company.address as CompanyAddress | null,
          business_hours: businessHours,
        }}
      />
    );
  }

  // Fetch default company for this tenant
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, logo_url, phone, address")
    .eq("tenant_id", tenant.id)
    .eq("is_default", true)
    .single();

  if (!company) {
    notFound();
  }

  const businessHours = await fetchBusinessHours(supabase, company.id);

  return (
    <BookingWizard
      slug={slug}
      tenant={{ id: tenant.id, name: tenant.name }}
      company={{
        id: company.id,
        name: company.name,
        logo_url: company.logo_url,
        phone: company.phone,
        address: company.address as CompanyAddress | null,
        business_hours: businessHours,
      }}
    />
  );
}

type CompanyAddress = {
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  zip?: string;
};
