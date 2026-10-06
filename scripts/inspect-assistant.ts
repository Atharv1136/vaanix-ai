import dotenv from "dotenv";
dotenv.config();

import { supabaseAdmin } from "../src/server/supabase.js";

async function main() {
  const { data, error } = await supabaseAdmin
    .from("assistants")
    .select("id, name, user_id, system_prompt, first_message")
    .eq("id", "a5cdea49-610c-4408-99b6-079ff1509a81")
    .single();

  if (error) {
    console.error("Error fetching assistant:", error);
    process.exit(1);
  }

  console.log("=== ASSISTANT NAME & USER_ID ===");
  console.log(data.name, "User ID:", data.user_id);
  const { data: services } = await supabaseAdmin
    .from("services")
    .select("id, name, price, duration_minutes, description, is_active")
    .eq("user_id", data.user_id);
  console.log("=== USER SERVICES ===", JSON.stringify(services, null, 2));
  process.exit(0);
}

main();
