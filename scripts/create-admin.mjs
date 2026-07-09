import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { env, argv } from "process";

const envContent = readFileSync(".env", "utf-8");
const supabaseUrl = envContent.match(/SUPABASE_URL="([^"]+)"/)?.[1];

if (!supabaseUrl) {
  console.error("SUPABASE_URL not found in .env");
  process.exit(1);
}

const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const email = argv[2] || "admin@cmdastudents";
const password = argv[3] || "Admin123/eleco";
const fullName = argv[4] || "Super Admin";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: user, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

if (createError) {
  console.error("Failed to create user:", createError.message);
  process.exit(1);
}

console.log("User created:", user.user.email);

const { error: roleError } = await supabase
  .from("user_roles")
  .insert({ user_id: user.user.id, role: "super_admin" });

if (roleError) {
  console.error("Failed to assign role:", roleError.message);
  process.exit(1);
}

console.log("Super Admin role assigned.");
