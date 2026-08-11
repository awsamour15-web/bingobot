#!/usr/bin/env node

/**
 * Test if bot can send messages directly via API
 */

const BOT_TOKEN = process.env.BOT_TOKEN || "8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU";

async function testDirectMessage() {
  console.log("🧪 Testing direct bot message sending...\n");

  // You'll need to provide a chat ID here - get it from the user
  // Ask user to send /start to the bot and check Render logs for their chat ID
  
  const testChatId = ""; // User needs to provide this
  
  if (!testChatId) {
    console.log("❌ No chat ID provided");
    console.log("📋 To get chat ID:");
    console.log("1. Have user send /start to @f_bingobot");
    console.log("2. Check Render logs for: [Bot] /start from user: 12345");
    console.log("3. Use that number as chat ID");
    return;
  }

  try {
    // Test direct message send
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: testChatId,
        text: '🧪 Direct API test - if you see this, the bot can send messages!'
      })
    });

    const result = await response.json();
    
    if (result.ok) {
      console.log("✅ Direct message sent successfully!");
      console.log("This means the bot API works, but polling might be broken.");
    } else {
      console.log("❌ Direct message failed:", result.description);
    }

  } catch (error) {
    console.log("❌ Network error:", error.message);
  }
}

// Also test if we can get recent messages
async function checkUpdates() {
  console.log("\n🔍 Checking for any recent messages...");
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=10`);
    const result = await response.json();
    
    if (result.ok && result.result.length > 0) {
      console.log("📨 Found recent messages:");
      result.result.forEach((update, i) => {
        const msg = update.message;
        if (msg) {
          console.log(`   ${i+1}. From: ${msg.from?.first_name} (ID: ${msg.from?.id})`);
          console.log(`      Text: "${msg.text || '[non-text]'}"`);
          console.log(`      Date: ${new Date(msg.date * 1000).toLocaleString()}`);
        }
      });
    } else {
      console.log("📭 No recent messages found");
    }
  } catch (error) {
    console.log("❌ Error checking updates:", error.message);
  }
}

testDirectMessage().then(() => checkUpdates());