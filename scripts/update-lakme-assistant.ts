import dotenv from "dotenv";
dotenv.config();

import { supabaseAdmin } from "../src/server/supabase.js";

async function main() {
  const assistantId = "a5cdea49-610c-4408-99b6-079ff1509a81";
  const { data: assistant, error: fetchErr } = await supabaseAdmin
    .from("assistants")
    .select("*")
    .eq("id", assistantId)
    .single();

  if (fetchErr || !assistant) {
    console.error("Error fetching assistant:", fetchErr);
    process.exit(1);
  }

  let prompt: string = assistant.system_prompt;

  // 1. Remove forced spaced words for phone numbers
  prompt = prompt.replace(
    /- नंबर हमेशा शब्दों में बोलो: "चार सौ तीस रुपये", "आठ चार छह शून्य शून्य शून्य नौ नौ चार नौ"।?/g,
    `- फोन नंबर बोलते या दोहराते समय सामान्य रूप से बोलो, बीच में कॉमा (,) या सेमीकॉलन (;) बिल्कुल मत लगाओ।`
  );

  // 2. Update booking flow for step 2 (list services) and step 5 (ask caller phone confirmation)
  const oldBookingFlow = `1. नाम — "आपका नाम बता दीजिए प्लीज़?"
2. सर्विस — "कौन-सी सर्विस लेनी है?"
3. तारीख — "किस दिन आना चाहेंगे?"
4. समय — "कितने बजे का स्लॉट सूट करेगा?"
5. नंबर — "कन्फ़र्मेशन के लिए व्हाट्सएप नंबर बता दीजिए?"`;

  const newBookingFlow = `1. नाम — "आपका नाम बता दीजिए प्लीज़?"
2. सर्विस — जब सर्विस पूछो तो उपलब्ध सर्विसेज के नाम भी बताओ: "हमारे पास हेयरकट, हेयर स्पा, फेशियल, ब्राइडल मेकअप, मेनिक्योर और पेडीक्योर जैसी सर्विसेज उपलब्ध हैं। आप कौन-सी सर्विस लेना चाहेंगे?"
3. तारीख — "किस दिन आना चाहेंगे?"
4. समय — "कितने बजे का स्लॉट सूट करेगा?"
5. नंबर — ग्राहक से पूछो: "क्या आपके इसी कॉलिंग नंबर पर व्हाट्सएप कन्फर्मेशन भेज दूं?" (अगर ग्राहक हाँ कहे तो वही नंबर इस्तेमाल करो; अगर दूसरा नंबर दे तो बिना कॉमा या सेमीकॉलन के सामान्य नंबर लो)।`;

  if (prompt.includes(oldBookingFlow)) {
    prompt = prompt.replace(oldBookingFlow, newBookingFlow);
  } else {
    // If not matching exact block, replace step 2 and step 5 individually
    prompt = prompt.replace(
      /2\.\s*सर्विस\s*—\s*"कौन-सी सर्विस लेनी है\?"/g,
      `2. सर्विस — जब सर्विस पूछो तो उपलब्ध सर्विसेज के नाम भी बताओ: "हमारे पास हेयरकट, हेयर स्पा, फेशियल, ब्राइडल मेकअप, मेनिक्योर और पेडीक्योर जैसी सर्विसेज उपलब्ध हैं। आप कौन-सी सर्विस लेना चाहेंगे?"`
    );
    prompt = prompt.replace(
      /5\.\s*नंबर\s*—\s*"कन्फ़र्मेशन के लिए व्हाट्सएप नंबर बता दीजिए\?"/g,
      `5. नंबर — ग्राहक से पूछो: "क्या आपके इसी कॉलिंग नंबर पर व्हाट्सएप कन्फर्मेशन भेज दूं?" (अगर ग्राहक हाँ कहे तो वही नंबर इस्तेमाल करो; अगर दूसरा नंबर दे तो बिना कॉमा या सेमीकॉलन के सामान्य नंबर लो)।`
    );
  }

  // 3. Ensure tool calling instructions are clear
  if (!prompt.includes("book_appointment")) {
    prompt += `\n\n# टूल्स का इस्तेमाल
- जब ग्राहक से नाम, सर्विस, तारीख, समय और फोन नंबर मिल जाए, तो तुरंत 'book_appointment' टूल को कॉल करो।
- टूल कॉल का रिज़ल्ट आने के बाद ही ग्राहक को कन्फ़र्मेशन दो।`;
  }

  // 4. Update in Supabase
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("assistants")
    .update({ system_prompt: prompt })
    .eq("id", assistantId)
    .select("id, name, system_prompt")
    .single();

  if (updateErr) {
    console.error("Error updating assistant:", updateErr);
    process.exit(1);
  }

  // 5. Ensure starter salon services exist in the services table for this user
  const userId = assistant.user_id;
  const salonServices = [
    { name: "Haircut & Styling", price: 650, duration_minutes: 45, description: "Precision haircut, hair wash, and blow dry" },
    { name: "Hair Spa", price: 1200, duration_minutes: 60, description: "Nourishing deep conditioning hair spa" },
    { name: "Facial Treatment", price: 1500, duration_minutes: 60, description: "Glow facial and skin cleanse" },
    { name: "Bridal Makeup", price: 5000, duration_minutes: 120, description: "Complete HD bridal makeup and styling" },
    { name: "Manicure & Pedicure", price: 800, duration_minutes: 45, description: "Hands and feet grooming and relaxation" },
  ];

  for (const s of salonServices) {
    const { data: existing } = await supabaseAdmin
      .from("services")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", `%${s.name}%`)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("services").insert({
        user_id: userId,
        name: s.name,
        price: s.price,
        duration_minutes: s.duration_minutes,
        description: s.description,
        is_active: true,
      });
      console.log(`Inserted service: ${s.name}`);
    }
  }

  console.log("Assistant and services updated successfully!");
  console.log("=== UPDATED SYSTEM PROMPT SNIPPET ===");
  console.log(updated.system_prompt.substring(0, 1200));
  process.exit(0);
}

main();
