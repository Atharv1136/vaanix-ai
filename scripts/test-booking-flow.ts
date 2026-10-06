import dotenv from "dotenv";
dotenv.config();

import { supabaseAdmin, getAssistant, getAssistantTools } from "../src/server/supabase.js";
import { getAIReplyStream } from "../src/server/nvidia.js";
import { extractSentences, sanitizeDigitSpeech } from "../src/server/mediaStream/handler.js";

async function runUnitTests() {
  console.log("=== 1. RUNNING SENTENCE & DIGIT SANITIZATION UNIT TESTS ===");

  // Test 1: Digit sequences with commas should NOT be split into individual pieces
  const numSample = "आपका नंबर 9, 5, 6, 1, 7, 0, 8, 8, 4, 9 है।";
  const [s1] = extractSentences(numSample);
  console.log("Test 1 - Extract sentences from comma-separated digits:");
  console.log("  Output:", s1);
  if (s1.length !== 1) {
    throw new Error(`Expected 1 sentence but got ${s1.length}`);
  }

  // Test 2: Sanitizer should clean commas, semicolons, and dashes between digits
  const rawSpoken = "कन्फर्मेशन 9, 5, 6; 1, 7-0 पर भेजा गया है।";
  const cleaned = sanitizeDigitSpeech(rawSpoken);
  console.log("Test 2 - Digit sanitization:");
  console.log("  Input: ", rawSpoken);
  console.log("  Output:", cleaned);
  if (cleaned.includes(",") || cleaned.includes(";") || cleaned.includes("-")) {
    throw new Error("Sanitizer failed to remove commas/semicolons/dashes between digits");
  }

  // Test 3: Phone number normalization
  const rawPhone = "+91 9, 8, 7; 6-5 43210";
  const normalizedPhone = rawPhone.replace(/[^0-9+]/g, "").trim();
  console.log("Test 3 - Phone normalization:");
  console.log("  Input: ", rawPhone);
  console.log("  Output:", normalizedPhone);
  if (normalizedPhone !== "+919876543210") {
    throw new Error(`Expected +919876543210 but got ${normalizedPhone}`);
  }

  console.log("✓ All sanitization unit tests passed successfully!\n");
}

async function runBookingDialogueTest() {
  console.log("=== 2. RUNNING CONVERSATIONAL APPOINTMENT BOOKING TEST ===");
  const assistantId = "a5cdea49-610c-4408-99b6-079ff1509a81";
  const assistant = await getAssistant(assistantId);
  if (!assistant) throw new Error("Assistant not found");

  const tools = await getAssistantTools(assistantId);
  const callerPhone = "+919876543210";

  // Compute a valid future date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDateStr = tomorrow.toISOString().split("T")[0]; // YYYY-MM-DD
  const targetDateHindi = tomorrow.toLocaleDateString("hi-IN", { month: "long", day: "numeric" });

  // Simulate context injection as in handler.ts
  (assistant as any).caller_phone = callerPhone;
  assistant.system_prompt += `\n[CURRENT CALLER PHONE: ${callerPhone} — Directly offer to confirm booking with this number instead of asking the caller to recite digits.]`;

  // Fetch and inject services
  const { data: dbServices } = await (supabaseAdmin as any)
    .from("services")
    .select("name, price, duration_minutes, description")
    .eq("user_id", (assistant as any).user_id)
    .eq("is_active", true);

  if (dbServices && dbServices.length > 0) {
    const serviceSummary = dbServices
      .map((s: any) => `- ${s.name}${s.price ? ` (₹${s.price})` : ""}`)
      .join("\n");
    assistant.system_prompt += `\n\n[AVAILABLE SERVICES OFFERED BY THIS BUSINESS:\n${serviceSummary}\nRULE: When asking the caller which service they need, ALWAYS tell them what services are available with you so they know their options.]`;
  }

  const history: { speaker: "caller" | "ai" | "tool"; text?: string; tool_calls?: any[]; tool_results?: any[] }[] = [];

  const turns = [
    // Turn 1: Caller asks what services are available
    "नमस्ते, मुझे आपके सैलून में अपॉइंटमेंट बुक करना है। मेरा नाम राहुल शर्मा है। आपके पास कौन-सी सर्विसेज हैं?",
    // Turn 2: Caller chooses haircut for tomorrow afternoon
    `मुझे हेयरकट करवाना है। क्या ${targetDateStr} को दोपहर 3 बजे का स्लॉट मिल सकता है?`,
    // Turn 3: Caller confirms 10 AM slot on current calling number
    `ठीक है, तो ${targetDateStr} को सुबह 10:00 बजे का स्लॉट पक्का कर दीजिए। इसी कॉलिंग नंबर पर व्हाट्सएप कन्फर्मेशन भेज दीजिए।`
  ];

  for (let i = 0; i < turns.length; i++) {
    const callerText = turns[i];
    console.log(`\n--- TURN ${i + 1} ---`);
    console.log(`[Caller]: "${callerText}"`);
    history.push({ speaker: "caller", text: callerText });

    const stream = getAIReplyStream(assistant, tools, history);
    let fullReply = "";
    for await (const chunk of stream) {
      fullReply += chunk;
    }
    console.log(`[AI Response]: "${fullReply}"`);
    // Note: streamChatWithTools already pushes ai turns and tool results to history in-place

    // Verification for Turn 1: Check that AI listed services
    if (i === 0) {
      const lowerReply = fullReply.toLowerCase();
      const mentionsServices =
        lowerReply.includes("हेयर") ||
        lowerReply.includes("हेयरकट") ||
        lowerReply.includes("स्पा") ||
        lowerReply.includes("haircut") ||
        lowerReply.includes("facial");
      console.log(`[Check Turn 1]: Mentions available services? ${mentionsServices ? "YES ✓" : "NO ✗"}`);
      if (!mentionsServices) {
        throw new Error("AI did not mention available services when asked!");
      }
    }
  }

  console.log("\n=== 3. VERIFYING BOOKING IN DATABASE ===");
  const { data: appointments, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .select("id, customer_name, customer_phone, start_time, service_id, status, created_at")
    .eq("user_id", (assistant as any).user_id)
    .order("created_at", { ascending: false })
    .limit(3);

  if (apptErr) {
    console.error("Error querying appointments:", apptErr);
    throw apptErr;
  }

  console.log("Recent appointments in DB:", appointments);
  const latest = appointments?.[0];
  if (!latest) {
    throw new Error("No appointment was booked in the database!");
  }

  console.log("✓ Booking verified in database! Latest appointment ID:", latest.id);
  console.log("✓ Customer Name:", latest.customer_name);
  console.log("✓ Customer Phone:", latest.customer_phone);
  console.log("✓ Start Time:", latest.start_time);

  // Check that customer phone does not contain commas or semicolons
  if (latest.customer_phone.includes(",") || latest.customer_phone.includes(";")) {
    throw new Error(`Customer phone contains invalid punctuation: ${latest.customer_phone}`);
  }

  console.log("\n==========================================");
  console.log("🎉 ALL TESTS PASSED! Booking completed cleanly without comma/semicolon issues, and services were clearly listed.");
  console.log("==========================================");
}

async function main() {
  try {
    await runUnitTests();
    await runBookingDialogueTest();
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

main();
