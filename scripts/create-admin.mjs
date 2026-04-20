import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vpvsrqkptvphkivwqxoy.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwdnNycWtwdHZwaGtpdndxeG95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTg4ODU5NywiZXhwIjoyMDkxNDY0NTk3fQ.n5iwNixvWJ6o86H-PJs1AkUUbyS5c-m-k4rDkzTpgg8";

const ADMIN_EMAIL = "admin@barbearia.com";
const ADMIN_PASSWORD = "bruno@88119463";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Check if user already exists
const { data: existing } = await supabase.auth.admin.listUsers();
const existingUser = existing?.users?.find((u) => u.email === ADMIN_EMAIL);

if (existingUser) {
  // Update app_metadata to add is_super_admin
  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
    app_metadata: { ...existingUser.app_metadata, is_super_admin: true },
  });
  if (error) {
    console.error("Erro ao atualizar usuário:", error.message);
    process.exit(1);
  }
  console.log("✓ Usuário admin atualizado com is_super_admin: true");
  console.log("  ID:", data.user.id);
  console.log("  Email:", data.user.email);
} else {
  // Create new user
  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: { is_super_admin: true },
  });
  if (error) {
    console.error("Erro ao criar usuário:", error.message);
    process.exit(1);
  }
  console.log("✓ Usuário admin criado com sucesso");
  console.log("  ID:", data.user.id);
  console.log("  Email:", data.user.email);
}

console.log("\nPronto! Acesse /admin e faça login com:");
console.log("  Email:", ADMIN_EMAIL);
console.log("  Senha:", ADMIN_PASSWORD);
