"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus, MoreVertical, X, Edit, Trash2, Calendar, MessageSquare,
  Loader2, Search, Upload, Ban, Tag, Send, CheckSquare, GitMerge, MessageCircle,
} from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { maskPhone } from "@/lib/masks";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";

type ContactStatus = "agendado" | "respondido" | "pendente" | "follow_up" | "bloqueado";

interface Contact {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  status: ContactStatus;
  ia_enabled: boolean;
  last_message_at: string | null;
  last_rating: number | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
}

interface Appointment {
  id: string;
  start_at: string;
  professionals: { name: string } | null;
  appointment_services: { services: { name: string } | null }[];
}

const PAGE_SIZE = 20;

const filters = [
  { label: "Todos", value: "todos" },
  { label: "Respondidos", value: "respondido" },
  { label: "Pendentes", value: "pendente" },
  { label: "Follow-up", value: "follow_up" },
  { label: "Agendados", value: "agendado" },
  { label: "Bloqueados", value: "bloqueado" },
];

const statusConfig: Record<ContactStatus, { label: string; classes: string }> = {
  agendado: { label: "Agendado", classes: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
  respondido: { label: "Respondido", classes: "bg-surface-container text-foreground/70" },
  pendente: { label: "Pendente", classes: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" },
  "follow_up": { label: "Follow-up", classes: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" },
  bloqueado: { label: "Bloqueado", classes: "bg-red-200 dark:bg-red-900/40 text-red-700 dark:text-red-400" },
};

function getInitials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// CSV parser
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

export default function ContatosPage() {
  const supabase = createClient();
  const tenant = useTenantStore((s) => s.tenant);
  const tenantId = tenant?.id;

  // Contacts + pagination
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState("todos");

  // Selection / bulk
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);

  // Drawer
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  // Edit
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // New contact modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);

  // Merge duplicates
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [duplicates, setDuplicates] = useState<{ a: Contact; b: Contact }[]>([]);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [mergingIds, setMergingIds] = useState<string | null>(null);

  // WhatsApp import
  const [importingWhatsApp, setImportingWhatsApp] = useState(false);
  const [whatsAppImportResult, setWhatsAppImportResult] = useState<string | null>(null);

  // CSV import
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvAllRows, setCsvAllRows] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ─── Debounce search ───
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm]);

  // ─── Fetch contacts ───
  const fetchContacts = useCallback(async (offset = 0, append = false) => {
    if (!tenantId) return;
    if (!append) setLoading(true);
    else setLoadingMore(true);

    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId);

    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
    }

    if (activeFilter !== "todos") {
      query = query.eq("status", activeFilter);
    }

    const { data, count } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const items = (data as Contact[]) || [];
    const totalCount = count ?? 0;

    if (append) {
      setContacts((prev) => [...prev, ...items]);
    } else {
      setContacts(items);
    }
    setTotal(totalCount);
    setHasMore(offset + PAGE_SIZE < totalCount);
    setLoading(false);
    setLoadingMore(false);
  }, [tenantId, debouncedSearch, activeFilter, supabase]);

  // Reset and fetch on search/filter change
  useEffect(() => {
    setSelectedRows(new Set());
    fetchContacts(0, false);
  }, [fetchContacts]);

  // ─── IntersectionObserver for infinite scroll ───
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchContacts(contacts.length, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, contacts.length, fetchContacts]);

  // ─── Fetch appointments for selected contact ───
  useEffect(() => {
    if (!selectedContact) { setAppointments([]); return; }
    const load = async () => {
      setLoadingAppointments(true);
      const { data } = await supabase
        .from("appointments")
        .select("*, professionals(name), appointment_services(services(name))")
        .eq("contact_id", selectedContact.id)
        .order("start_at", { ascending: false })
        .limit(5);
      setAppointments((data as Appointment[]) || []);
      setLoadingAppointments(false);
    };
    load();
  }, [selectedContact, supabase]);

  // ─── Handlers ───
  const toggleIA = async (id: string, currentValue: boolean) => {
    const { error } = await supabase.from("contacts").update({ ia_enabled: !currentValue }).eq("id", id).eq("tenant_id", tenantId!);
    if (error) console.error("Erro ao alterar IA:", error);
    fetchContacts(0, false);
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === contacts.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    if (!window.confirm(`Deseja realmente excluir o contato "${selectedContact.name}"?`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", selectedContact.id).eq("tenant_id", tenantId!);
    if (error) { console.error("Erro ao excluir:", error); return; }
    setSelectedContact(null);
    setEditing(false);
    fetchContacts(0, false);
  };

  const handleEditContact = () => {
    if (!selectedContact) return;
    setEditForm({ name: selectedContact.name, phone: selectedContact.phone, notes: selectedContact.notes || "" });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedContact || !editForm.name.trim() || !editForm.phone.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase.from("contacts").update({
      name: editForm.name.trim(),
      phone: editForm.phone.replace(/\D/g, ""),
      notes: editForm.notes.trim() || null,
    }).eq("id", selectedContact.id).eq("tenant_id", tenantId!);
    if (error) { console.error("Erro ao editar:", error); setSavingEdit(false); return; }
    setSavingEdit(false);
    setEditing(false);
    setSelectedContact(null);
    fetchContacts(0, false);
  };

  const handleImportWhatsApp = async () => {
    setImportingWhatsApp(true);
    setWhatsAppImportResult(null);
    try {
      const res = await fetch("/api/contacts/import-whatsapp", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setWhatsAppImportResult(data.error || "Erro ao importar");
      } else {
        setWhatsAppImportResult(data.data.message);
        fetchContacts(0, false);
      }
    } catch {
      setWhatsAppImportResult("Erro de rede ao importar");
    } finally {
      setImportingWhatsApp(false);
      setTimeout(() => setWhatsAppImportResult(null), 8000);
    }
  };

  const handleCreateContact = async () => {
    if (!tenantId || !newName.trim() || !newPhone.trim()) return;
    setCreating(true);
    await supabase.from("contacts").insert({
      tenant_id: tenantId, name: newName.trim(), phone: newPhone.replace(/\D/g, ""), status: "pendente",
    });
    setCreating(false);
    setShowNewModal(false);
    setNewName("");
    setNewPhone("");
    fetchContacts(0, false);
  };

  // ─── Bulk actions ───
  const bulkBlock = async () => {
    if (selectedRows.size === 0) return;
    const ids = Array.from(selectedRows);
    await supabase.from("contacts").update({ status: "bloqueado" }).in("id", ids).eq("tenant_id", tenantId!);
    setSelectedRows(new Set());
    fetchContacts(0, false);
  };

  const bulkAddTag = async () => {
    if (selectedRows.size === 0 || !bulkTagInput.trim()) return;
    const tag = bulkTagInput.trim();
    // For each selected contact, append tag
    const ids = Array.from(selectedRows);
    for (const id of ids) {
      const contact = contacts.find((c) => c.id === id);
      if (!contact) continue;
      const existingTags = contact.tags || [];
      if (!existingTags.includes(tag)) {
        await supabase.from("contacts").update({ tags: [...existingTags, tag] }).eq("id", id).eq("tenant_id", tenantId!);
      }
    }
    setBulkTagInput("");
    setShowBulkTagInput(false);
    setSelectedRows(new Set());
    fetchContacts(0, false);
  };

  const bulkSendMessage = () => {
    // Placeholder: could open WhatsApp compose or message modal
    const phones = contacts.filter((c) => selectedRows.has(c.id)).map((c) => c.phone);
    alert(`Enviar mensagem para ${phones.length} contato(s):\n${phones.join(", ")}`);
  };

  // ─── Merge Duplicates ───
  const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

  const scanDuplicates = async () => {
    if (!tenantId) return;
    setScanningDuplicates(true);
    setDuplicates([]);

    const { data: allContacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");

    const items = (allContacts as Contact[]) || [];
    const found: { a: Contact; b: Contact }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const key = [a.id, b.id].sort().join("-");
        if (seen.has(key)) continue;

        const phoneA = normalizePhone(a.phone);
        const phoneB = normalizePhone(b.phone);

        // Same phone or one is suffix of the other (e.g., with/without country code)
        const samePhone = phoneA === phoneB ||
          phoneA.endsWith(phoneB.slice(-10)) && phoneB.length >= 10 ||
          phoneB.endsWith(phoneA.slice(-10)) && phoneA.length >= 10;

        // Similar names (simple Levenshtein-like check)
        const nameA = a.name.toLowerCase().trim();
        const nameB = b.name.toLowerCase().trim();
        const similarName = nameA === nameB ||
          nameA.includes(nameB) || nameB.includes(nameA);

        if (samePhone || similarName) {
          seen.add(key);
          found.push({ a, b });
        }
      }
    }

    setDuplicates(found);
    setScanningDuplicates(false);
    setShowMergeModal(true);
  };

  const handleMerge = async (primaryId: string, secondaryId: string) => {
    if (!tenantId) return;
    setMergingIds(`${primaryId}-${secondaryId}`);
    try {
      // Use direct Supabase operations for merge

      // Transfer appointments
      await supabase
        .from("appointments")
        .update({ contact_id: primaryId })
        .eq("contact_id", secondaryId)
        .eq("tenant_id", tenantId);

      // Transfer messages
      await supabase
        .from("messages")
        .update({ contact_id: primaryId })
        .eq("contact_id", secondaryId)
        .eq("tenant_id", tenantId);

      // Get both contacts for tag/notes merge
      const primary = contacts.find((c) => c.id === primaryId) ||
        duplicates.find((d) => d.a.id === primaryId)?.a ||
        duplicates.find((d) => d.b.id === primaryId)?.b;
      const secondary = contacts.find((c) => c.id === secondaryId) ||
        duplicates.find((d) => d.a.id === secondaryId)?.a ||
        duplicates.find((d) => d.b.id === secondaryId)?.b;

      if (primary && secondary) {
        const mergedTags = Array.from(new Set([...(primary.tags || []), ...(secondary.tags || [])]));
        const mergedNotes = [primary.notes, secondary.notes].filter(Boolean).join("\n---\n");

        await supabase
          .from("contacts")
          .update({
            tags: mergedTags.length > 0 ? mergedTags : null,
            notes: mergedNotes || null,
          })
          .eq("id", primaryId);
      }

      // Delete secondary
      await supabase
        .from("contacts")
        .delete()
        .eq("id", secondaryId)
        .eq("tenant_id", tenantId);

      // Remove from duplicates list
      setDuplicates((prev) =>
        prev.filter((d) => !(
          (d.a.id === primaryId && d.b.id === secondaryId) ||
          (d.a.id === secondaryId && d.b.id === primaryId)
        ))
      );
      fetchContacts(0, false);
    } catch {
      // silently fail
    }
    setMergingIds(null);
  };

  // ─── CSV Import ───
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      setCsvAllRows(rows);
      setCsvPreview(rows.slice(0, 5));
      setCsvResult(null);
      setShowCsvModal(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCsvImport = async () => {
    if (!tenantId || csvAllRows.length === 0) return;
    setCsvImporting(true);

    const mapped = csvAllRows.map((r) => ({
      name: r.nome || r.name || "",
      phone: r.telefone || r.phone || "",
      birthday: r.aniversario || r.birthday || undefined,
      tags: (r.tags || "").split(";").map((t) => t.trim()).filter(Boolean) || undefined,
      notes: r.notas || r.notes || undefined,
    }));

    // Bulk insert in batches via Supabase client directly
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 50;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize)
        .filter((r) => r.name && r.phone && r.phone.length >= 10)
        .map((r) => ({
          tenant_id: tenantId,
          name: r.name.trim(),
          phone: r.phone.trim(),
          birthday: r.birthday || null,
          tags: r.tags && r.tags.length > 0 ? r.tags : null,
          notes: r.notes || null,
          status: "pendente" as const,
        }));

      const skipped = mapped.slice(i, i + batchSize).length - batch.length;
      errorCount += skipped;

      if (batch.length === 0) continue;

      const { error } = await supabase.from("contacts").upsert(batch, {
        onConflict: "tenant_id,phone",
        ignoreDuplicates: false,
      });

      if (error) errorCount += batch.length;
      else successCount += batch.length;
    }

    setCsvResult({ success: successCount, errors: errorCount });
    setCsvImporting(false);
    fetchContacts(0, false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Contatos</h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie seus clientes e contatos do WhatsApp
            {total > 0 && <span className="ml-2 text-sm">({total} total)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
          <button
            onClick={scanDuplicates}
            disabled={scanningDuplicates}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface-container-lowest px-4 py-3 font-medium text-foreground transition-colors hover:bg-surface-container-low disabled:opacity-50"
          >
            {scanningDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
            Mesclar duplicados
          </button>
          <button
            onClick={handleImportWhatsApp}
            disabled={importingWhatsApp}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50"
          >
            {importingWhatsApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Importar do WhatsApp
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface-container-lowest px-4 py-3 font-medium text-foreground transition-colors hover:bg-surface-container-low"
          >
            <Upload className="h-4 w-4" />
            Importar CSV
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            Novo contato
          </button>
        </div>
      </div>

      {/* WhatsApp import result */}
      {whatsAppImportResult && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
          <span>{whatsAppImportResult}</span>
          <button onClick={() => setWhatsAppImportResult(null)} className="text-emerald-500 hover:text-emerald-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface-container-lowest py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              activeFilter === filter.value
                ? "bg-primary text-white"
                : "bg-surface-container-lowest text-muted-foreground hover:bg-surface-container-low"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[20px] bg-surface-container-lowest shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            Nenhum contato encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === contacts.length && contacts.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Telefone</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Última Mensagem</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avaliação</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IA</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-container-low/40",
                      selectedRows.has(contact.id) && "border-l-4 border-amber-500 bg-amber-50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(contact.id)}
                        onChange={(e) => { e.stopPropagation(); toggleRowSelection(contact.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {getInitials(contact.name)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{contact.name}</p>
                          {contact.tags && contact.tags[0] && (
                            <span className="text-[10px] font-medium text-muted-foreground">{contact.tags[0]}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatPhone(contact.phone)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", statusConfig[contact.status]?.classes || "bg-surface-container text-foreground/70")}>
                        {statusConfig[contact.status]?.label || contact.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {contact.last_message_at ? new Date(contact.last_message_at).toLocaleDateString("pt-BR") : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {contact.last_rating != null ? (
                        <span className="inline-flex items-center gap-0.5 text-sm font-medium text-amber-500">
                          {"★".repeat(contact.last_rating)}{"☆".repeat(5 - contact.last_rating)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleIA(contact.id, contact.ia_enabled); }}
                          className={cn("relative h-5 w-10 rounded-full transition-colors", contact.ia_enabled ? "bg-primary" : "bg-surface-container-high")}
                        >
                          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", contact.ia_enabled ? "translate-x-5" : "translate-x-0.5")} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button onClick={(e) => e.stopPropagation()} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-container">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Infinite scroll sentinel + load more button */}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              {hasMore && !loadingMore && (
                <button
                  onClick={() => fetchContacts(contacts.length, true)}
                  className="rounded-xl px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Carregar mais
                </button>
              )}
              {!hasMore && contacts.length > 0 && (
                <p className="text-xs text-muted-foreground">Todos os contatos carregados</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bulk Action Bar ─── */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-foreground px-6 py-3 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <CheckSquare className="h-4 w-4" />
            {selectedRows.size} selecionado{selectedRows.size > 1 ? "s" : ""}
          </div>
          <div className="mx-2 h-5 w-px bg-white/20" />
          <button onClick={bulkBlock} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10">
            <Ban className="h-4 w-4" /> Bloquear
          </button>
          {showBulkTagInput ? (
            <div className="flex items-center gap-1">
              <input
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") bulkAddTag(); }}
                placeholder="Nome da tag"
                className="w-32 rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white placeholder-white/50 outline-none"
                autoFocus
              />
              <button onClick={bulkAddTag} className="rounded-lg px-2 py-1.5 text-sm font-medium text-amber-400 hover:bg-white/10">OK</button>
              <button onClick={() => { setShowBulkTagInput(false); setBulkTagInput(""); }} className="text-white/50 hover:text-white"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <button onClick={() => setShowBulkTagInput(true)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10">
              <Tag className="h-4 w-4" /> Adicionar tag
            </button>
          )}
          <button onClick={bulkSendMessage} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10">
            <Send className="h-4 w-4" /> Enviar mensagem
          </button>
          <button onClick={() => setSelectedRows(new Set())} className="ml-2 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── CSV Import Modal ─── */}
      {showCsvModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => { setShowCsvModal(false); setCsvResult(null); }} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <h2 className="text-lg font-bold text-foreground">Importar CSV</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {csvAllRows.length} linha(s) encontrada(s). Pré-visualização das primeiras 5:
            </p>

            {csvPreview.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-container-low">
                      {Object.keys(csvPreview[0]).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvPreview.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-foreground">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {csvResult && (
              <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/30 p-3 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Importados: {csvResult.success} | Erros: {csvResult.errors}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setShowCsvModal(false); setCsvResult(null); }} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container">
                {csvResult ? "Fechar" : "Cancelar"}
              </button>
              {!csvResult && (
                <button
                  onClick={handleCsvImport}
                  disabled={csvImporting || csvAllRows.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {csvImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar importação
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Drawer ─── */}
      {selectedContact && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { setSelectedContact(null); setEditing(false); }} />
          <div className="fixed right-0 top-0 z-50 h-full w-[400px] overflow-y-auto bg-surface-container-lowest shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <button onClick={() => { setSelectedContact(null); setEditing(false); }} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-container">
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={handleEditContact} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-container"><Edit className="h-4 w-4" /></button>
                <button onClick={handleDeleteContact} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="p-6">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Nome</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Telefone</label>
                    <input type="text" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} placeholder="+55 (11) 99999-0000" className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Notas</label>
                    <textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1 w-full resize-none rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setEditing(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container">Cancelar</button>
                    <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.name.trim() || !editForm.phone.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                      {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-[128px] w-[128px] items-center justify-center rounded-[16px] bg-primary/10 text-3xl font-bold text-primary">
                      {getInitials(selectedContact.name)}
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-foreground">{selectedContact.name}</h2>
                    <p className="text-sm text-muted-foreground">{formatPhone(selectedContact.phone)}</p>
                  </div>
                  {selectedContact.tags && selectedContact.tags.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedContact.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agendamentos</h3>
                    <div className="mt-3 space-y-3">
                      {loadingAppointments ? (
                        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                      ) : appointments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado</p>
                      ) : appointments.map((ap) => {
                        const services = ap.appointment_services?.map((as_item) => as_item.services?.name).filter(Boolean).join(", ");
                        return (
                          <div key={ap.id} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                              <Calendar className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{services || "Servico"}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(ap.start_at).toLocaleDateString("pt-BR")}{" "}
                                {ap.professionals?.name && `\u2022 ${ap.professionals.name}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {selectedContact.notes && (
                    <div className="mt-6">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notas</h3>
                      <div className="mt-2 rounded-xl bg-surface-container-lowest p-4">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">{selectedContact.notes}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Merge Duplicates Modal ─── */}
      {showMergeModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowMergeModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-container-lowest p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Mesclar duplicados</h2>
              <button onClick={() => setShowMergeModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-container">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {duplicates.length === 0
                ? "Nenhum contato duplicado encontrado."
                : `${duplicates.length} par(es) de possíveis duplicados encontrado(s). Selecione qual contato manter como principal.`}
            </p>

            {duplicates.length > 0 && (
              <div className="mt-4 space-y-4">
                {duplicates.map(({ a, b }) => {
                  const pairKey = `${a.id}-${b.id}`;
                  const isMerging = mergingIds === `${a.id}-${b.id}` || mergingIds === `${b.id}-${a.id}`;
                  return (
                    <div key={pairKey} className="rounded-xl border border-border p-4">
                      <div className="flex items-center gap-4">
                        {/* Contact A */}
                        <div className="flex-1 rounded-xl bg-surface-container-low p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {getInitials(a.name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{a.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPhone(a.phone)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMerge(a.id, b.id)}
                            disabled={isMerging}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isMerging ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                            Manter este
                          </button>
                        </div>

                        <span className="text-xs font-bold text-muted-foreground">VS</span>

                        {/* Contact B */}
                        <div className="flex-1 rounded-xl bg-surface-container-low p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {getInitials(b.name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{b.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPhone(b.phone)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMerge(b.id, a.id)}
                            disabled={isMerging}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isMerging ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                            Manter este
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowMergeModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container">
                Fechar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── New Contact Modal ─── */}
      {showNewModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowNewModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <h2 className="text-lg font-bold text-foreground">Novo contato</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Nome</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do contato" className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Telefone</label>
                <input type="text" value={newPhone} onChange={(e) => setNewPhone(maskPhone(e.target.value))} placeholder="+55 (11) 99999-0000" className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowNewModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container">Cancelar</button>
              <button onClick={handleCreateContact} disabled={creating || !newName.trim() || !newPhone.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar contato
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
