"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit, Clock, MoreVertical, Loader2, Package, X, Percent } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";

interface ServiceCategory {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

interface Service {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  active: boolean;
  promo_active: boolean;
  is_combo?: boolean;
  combo_discount_pct?: number;
  created_at: string;
}

export default function ServicosPage() {
  const tenant = useTenantStore((s) => s.tenant);
  const tenantId = tenant?.id;

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);

  // Dialog states
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewService, setShowNewService] = useState(false);
  const [showComboModal, setShowComboModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [creating, setCreating] = useState(false);

  // Combo modal states
  const [comboName, setComboName] = useState("");
  const [comboDescription, setComboDescription] = useState("");
  const [comboSelectedServices, setComboSelectedServices] = useState<string[]>([]);
  const [comboDiscount, setComboDiscount] = useState("");
  const [comboIsCombo, setComboIsCombo] = useState(false);
  const [allActiveServices, setAllActiveServices] = useState<Service[]>([]);

  const supabase = createClient();

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    if (!tenantId) return;
    setLoadingCategories(true);
    const { data } = await supabase
      .from("service_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    setCategories(data ?? []);
    setLoadingCategories(false);
  }, [tenantId]);

  // Fetch all services (for counts)
  const fetchAllServices = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("services")
      .select("id, category_id")
      .eq("tenant_id", tenantId)
      .eq("active", true);
    setAllServices((data as Service[]) ?? []);
  }, [tenantId]);

  // Fetch all active services (for combo selection)
  const fetchAllActiveServices = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("is_combo", false)
      .order("name");
    setAllActiveServices(data ?? []);
  }, [tenantId]);

  // Fetch services for selected category
  const fetchServices = useCallback(async () => {
    if (!tenantId || !selectedCategoryId) {
      setServices([]);
      return;
    }
    setLoadingServices(true);
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("category_id", selectedCategoryId)
      .eq("active", true);
    setServices(data ?? []);
    setLoadingServices(false);
  }, [tenantId, selectedCategoryId]);

  useEffect(() => {
    fetchCategories();
    fetchAllServices();
  }, [fetchCategories, fetchAllServices]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Auto-select first category
  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  // Count services per category
  const countForCategory = (categoryId: string) =>
    allServices.filter((s) => s.category_id === categoryId).length;

  // Create category
  const handleCreateCategory = async () => {
    if (!tenantId || !newCategoryName.trim()) return;
    setCreating(true);
    const { error } = await supabase
      .from("service_categories")
      .insert({ tenant_id: tenantId, name: newCategoryName.trim() });
    if (error) { console.error("Erro ao criar categoria:", error); setCreating(false); return; }
    setNewCategoryName("");
    setShowNewCategory(false);
    setCreating(false);
    await fetchCategories();
    await fetchAllServices();
  };

  // Create service (with optional combo toggle)
  const handleCreateService = async () => {
    if (!tenantId || !selectedCategoryId || !newServiceName.trim()) return;
    setCreating(true);

    if (comboIsCombo && comboSelectedServices.length >= 2) {
      // Create via combo API
      const discountVal = parseFloat(comboDiscount) || 0;
      const resp = await fetch("/api/services/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceName.trim(),
          description: newServiceDescription.trim() || undefined,
          category_id: selectedCategoryId,
          child_service_ids: comboSelectedServices,
          combo_discount_pct: discountVal,
        }),
      });
      // We don't need to check auth here since the client-side supabase is used
      if (!resp.ok) {
        console.error("Failed to create combo");
      }
    } else {
      const { error: svcError } = await supabase.from("services").insert({
        tenant_id: tenantId,
        category_id: selectedCategoryId,
        name: newServiceName.trim(),
        description: newServiceDescription.trim() || null,
        duration_min: parseInt(newServiceDuration) || 30,
        price: parseFloat(newServicePrice) || 0,
        active: true,
        promo_active: false,
      });
      if (svcError) { console.error("Erro ao criar serviço:", svcError); setCreating(false); return; }
    }

    // Reset form
    setNewServiceName("");
    setNewServiceDescription("");
    setNewServiceDuration("");
    setNewServicePrice("");
    setComboIsCombo(false);
    setComboSelectedServices([]);
    setComboDiscount("");
    setShowNewService(false);
    setCreating(false);
    await fetchServices();
    await fetchAllServices();
  };

  // Create combo from modal
  const handleCreateCombo = async () => {
    if (!tenantId || !comboName.trim() || comboSelectedServices.length < 2) return;
    setCreating(true);

    const discountVal = parseFloat(comboDiscount) || 0;

    await fetch("/api/services/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: comboName.trim(),
        description: comboDescription.trim() || undefined,
        category_id: selectedCategoryId,
        child_service_ids: comboSelectedServices,
        combo_discount_pct: discountVal,
      }),
    });

    setComboName("");
    setComboDescription("");
    setComboSelectedServices([]);
    setComboDiscount("");
    setShowComboModal(false);
    setCreating(false);
    await fetchServices();
    await fetchAllServices();
  };

  // Toggle combo service selection
  const toggleComboService = (serviceId: string) => {
    setComboSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  // Calculate combo totals
  const comboTotal = comboSelectedServices.reduce((sum, id) => {
    const svc = allActiveServices.find((s) => s.id === id);
    return sum + (svc ? Number(svc.price) : 0);
  }, 0);

  const comboDuration = comboSelectedServices.reduce((sum, id) => {
    const svc = allActiveServices.find((s) => s.id === id);
    return sum + (svc ? (svc.duration_min || 0) : 0);
  }, 0);

  const comboFinalPrice = comboTotal * (1 - (parseFloat(comboDiscount) || 0) / 100);

  // Toggle promo
  const handleTogglePromo = async (serviceId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from("services")
      .update({ promo_active: !currentValue })
      .eq("id", serviceId)
      .eq("tenant_id", tenantId!);
    if (error) { console.error("Erro ao alternar promo:", error); return; }
    await fetchServices();
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-foreground">Servicos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os servicos e categorias oferecidos pela sua barbearia.
          </p>
        </div>
        <button
          onClick={() => {
            fetchAllActiveServices();
            setShowComboModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          <Package className="h-4 w-4" />
          Criar combo
        </button>
      </div>

      {/* Combo Modal */}
      {showComboModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-[20px] bg-surface-container-lowest p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Criar Combo</h2>
              <button
                onClick={() => {
                  setShowComboModal(false);
                  setComboName("");
                  setComboDescription("");
                  setComboSelectedServices([]);
                  setComboDiscount("");
                }}
              >
                <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nome do combo"
                value={comboName}
                onChange={(e) => setComboName(e.target.value)}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                autoFocus
              />
              <input
                type="text"
                placeholder="Descricao (opcional)"
                value={comboDescription}
                onChange={(e) => setComboDescription(e.target.value)}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
              />

              {/* Service multi-select */}
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Selecione os servicos (min. 2)
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                  {allActiveServices.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Nenhum servico disponivel
                    </p>
                  ) : (
                    allActiveServices.map((svc) => (
                      <label
                        key={svc.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors",
                          comboSelectedServices.includes(svc.id)
                            ? "bg-amber-50"
                            : "hover:bg-surface-container-low"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={comboSelectedServices.includes(svc.id)}
                          onChange={() => toggleComboService(svc.id)}
                          className="h-4 w-4 rounded border-border text-amber-500 focus:ring-amber-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{svc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {svc.duration_min} min &middot; {formatCurrency(svc.price)}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Discount */}
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  placeholder="Desconto (%)"
                  value={comboDiscount}
                  onChange={(e) => setComboDiscount(e.target.value)}
                  min="0"
                  max="100"
                  className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">opcional</span>
              </div>

              {/* Summary */}
              {comboSelectedServices.length >= 2 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Duracao total:</span>
                    <span className="font-semibold text-foreground">{comboDuration} min</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Preco original:</span>
                    <span className="text-muted-foreground line-through">{formatCurrency(comboTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">Preco final:</span>
                    <span className="text-lg font-extrabold text-amber-600">{formatCurrency(comboFinalPrice)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCreateCombo}
                  disabled={creating || !comboName.trim() || comboSelectedServices.length < 2}
                  className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
                >
                  {creating ? "Criando..." : "Criar combo"}
                </button>
                <button
                  onClick={() => {
                    setShowComboModal(false);
                    setComboName("");
                    setComboDescription("");
                    setComboSelectedServices([]);
                    setComboDiscount("");
                  }}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-8">
        {/* LEFT PANEL - Categories (30%) */}
        <div className="w-[30%] shrink-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Categorias
            </h2>
            <button
              onClick={() => setShowNewCategory(true)}
              className="text-xs font-semibold text-secondary hover:underline"
            >
              Nova categoria
            </button>
          </div>

          {loadingCategories ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-[20px] border-2 border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Crie sua primeira categoria
              </p>
              <button
                onClick={() => setShowNewCategory(true)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline"
              >
                <Plus className="h-4 w-4" />
                Nova categoria
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((categoria) => (
                <button
                  key={categoria.id}
                  onClick={() => setSelectedCategoryId(categoria.id)}
                  className={cn(
                    "group relative w-full rounded-[20px] bg-surface-container-lowest p-5 text-left transition-all",
                    selectedCategoryId === categoria.id
                      ? "border-2 border-secondary shadow-sm"
                      : "border border-transparent hover:border-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{categoria.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {countForCategory(categoria.id)} servicos disponiveis
                      </p>
                    </div>
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      <Edit className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </span>
                  </div>
                </button>
              ))}

              {/* Add category dashed card */}
              <button
                onClick={() => setShowNewCategory(true)}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border p-5 transition-colors hover:border-secondary hover:bg-surface-container-low"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Nova Categoria</span>
              </button>
            </div>
          )}

          {/* New category inline form */}
          {showNewCategory && (
            <div className="mt-3 rounded-[20px] bg-surface-container-lowest p-5">
              <input
                type="text"
                placeholder="Nome da categoria"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                autoFocus
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleCreateCategory}
                  disabled={creating || !newCategoryName.trim()}
                  className="rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
                >
                  {creating ? "Criando..." : "Criar"}
                </button>
                <button
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Services (70%) */}
        <div className="flex-1">
          {selectedCategory ? (
            <>
              {/* Right panel header */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Servicos em {selectedCategory.name}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    fetchAllActiveServices();
                    setShowNewService(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/90"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Servico
                </button>
              </div>

              {/* New service inline form */}
              {showNewService && (
                <div className="mb-6 rounded-[20px] bg-surface-container-lowest p-6">
                  <h3 className="mb-4 text-sm font-bold text-foreground">Novo Servico</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nome do servico"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      className="col-span-2 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Descricao"
                      value={newServiceDescription}
                      onChange={(e) => setNewServiceDescription(e.target.value)}
                      className="col-span-2 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                    />

                    {/* Combo toggle */}
                    <div className="col-span-2 flex items-center gap-3 rounded-lg border border-border p-3">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={comboIsCombo}
                          onChange={() => setComboIsCombo(!comboIsCombo)}
                          className="peer sr-only"
                        />
                        <div
                          className={cn(
                            "h-5 w-9 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-['']",
                            comboIsCombo
                              ? "bg-amber-500 after:translate-x-full"
                              : "bg-surface-container-high"
                          )}
                        />
                      </label>
                      <div>
                        <p className="text-sm font-medium text-foreground">E um combo?</p>
                        <p className="text-xs text-muted-foreground">
                          Combine varios servicos em um pacote
                        </p>
                      </div>
                    </div>

                    {/* Combo service selection */}
                    {comboIsCombo && (
                      <>
                        <div className="col-span-2">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">
                            Selecione os servicos do combo (min. 2)
                          </p>
                          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                            {allActiveServices.map((svc) => (
                              <label
                                key={svc.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm transition-colors",
                                  comboSelectedServices.includes(svc.id)
                                    ? "bg-amber-50"
                                    : "hover:bg-surface-container-low"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={comboSelectedServices.includes(svc.id)}
                                  onChange={() => toggleComboService(svc.id)}
                                  className="h-3.5 w-3.5 rounded border-border text-amber-500"
                                />
                                <span className="flex-1">{svc.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(svc.price)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          <input
                            type="number"
                            placeholder="Desconto (%)"
                            value={comboDiscount}
                            onChange={(e) => setComboDiscount(e.target.value)}
                            min="0"
                            max="100"
                            className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                          />
                          <span className="text-xs text-muted-foreground">opcional</span>
                        </div>
                        {comboSelectedServices.length >= 2 && (
                          <div className="col-span-2 rounded-lg bg-amber-50 p-2 text-xs">
                            <span className="font-semibold">Resumo: </span>
                            {comboDuration} min &middot; {formatCurrency(comboFinalPrice)}
                            {parseFloat(comboDiscount) > 0 && (
                              <span className="ml-1 text-muted-foreground line-through">
                                {formatCurrency(comboTotal)}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {!comboIsCombo && (
                      <>
                        <input
                          type="number"
                          placeholder="Duracao (min)"
                          value={newServiceDuration}
                          onChange={(e) => setNewServiceDuration(e.target.value)}
                          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                        />
                        <input
                          type="number"
                          placeholder="Preco (R$)"
                          value={newServicePrice}
                          onChange={(e) => setNewServicePrice(e.target.value)}
                          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-secondary focus:outline-none"
                        />
                      </>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleCreateService}
                      disabled={
                        creating ||
                        !newServiceName.trim() ||
                        (comboIsCombo && comboSelectedServices.length < 2)
                      }
                      className="rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
                    >
                      {creating ? "Criando..." : comboIsCombo ? "Criar combo" : "Criar servico"}
                    </button>
                    <button
                      onClick={() => {
                        setShowNewService(false);
                        setNewServiceName("");
                        setNewServiceDescription("");
                        setNewServiceDuration("");
                        setNewServicePrice("");
                        setComboIsCombo(false);
                        setComboSelectedServices([]);
                        setComboDiscount("");
                      }}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Service cards grid */}
              {loadingServices ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : services.length === 0 ? (
                <div className="rounded-[20px] border-2 border-dashed border-border p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Adicione seu primeiro servico
                  </p>
                  <button
                    onClick={() => setShowNewService(true)}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline"
                  >
                    <Plus className="h-4 w-4" />
                    Novo servico
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                  {services.map((servico) => (
                    <div
                      key={servico.id}
                      className="group relative rounded-[20px] bg-surface-container-lowest p-6 transition-shadow hover:shadow-md"
                    >
                      {/* Menu dots */}
                      <button className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>

                      {/* Combo badge */}
                      {servico.is_combo && (
                        <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Package className="h-3 w-3" />
                          COMBO
                        </span>
                      )}

                      {/* Service name */}
                      <h3 className="text-lg font-bold text-foreground">{servico.name}</h3>

                      {/* Description */}
                      {servico.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {servico.description}
                        </p>
                      )}

                      {/* Duration pill */}
                      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {servico.duration_min} min
                        </span>
                      </div>

                      {/* Price */}
                      <p className="mt-3 text-lg font-extrabold text-foreground">
                        {formatCurrency(servico.price)}
                      </p>

                      {/* Discount info for combos */}
                      {servico.is_combo && servico.combo_discount_pct && servico.combo_discount_pct > 0 && (
                        <p className="text-xs text-amber-600 font-semibold">
                          {servico.combo_discount_pct}% de desconto
                        </p>
                      )}

                      {/* Footer with promo toggle */}
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                        <span className="text-xs text-muted-foreground">
                          {servico.promo_active ? "Promocional" : "Preco normal"}
                        </span>
                        {/* Toggle switch */}
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={servico.promo_active}
                            onChange={() => handleTogglePromo(servico.id, servico.promo_active)}
                            className="peer sr-only"
                          />
                          <div
                            className={cn(
                              "h-5 w-9 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-['']",
                              servico.promo_active
                                ? "bg-secondary after:translate-x-full"
                                : "bg-surface-container-high"
                            )}
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  {/* Add service dashed card */}
                  <button
                    onClick={() => setShowNewService(true)}
                    className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border p-6 transition-colors hover:border-secondary hover:bg-surface-container-low"
                  >
                    <Plus className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">Novo Servico</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              {loadingCategories ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione uma categoria para ver os servicos
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
