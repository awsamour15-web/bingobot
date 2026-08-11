#!/usr/bin/env node

/**
 * Force restart bot polling to resolve 409 conflicts
 */

const BOT_TOKEN = process.env.BOT_TOKEN || "8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU";

async function restartBot() {
  console.log("🔄 Force restarting bot polling...\n");

  try {
    // 1. Delete any existing webhook
    console.log("1. Clearing webhook...");
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
    const webhookData = await webhookResponse.json();
    
    if (webhookData.ok) {
      console.log("✅ Webhook cleared");
    } else {
      console.log("❌ Webhook clear failed:", webhookData.description);
    }

    // 2. Clear pending updates
    console.log("\n2. Getting and clearing pending updates...");
    const updatesResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=-1`);
    const updatesData = await updatesResponse.json();
    
    if (updatesData.ok) {
      console.log("✅ Pending updates cleared");
    } else {
      console.log("❌ Failed to clear updates:", updatesData.description);
    }

    // 3. Test basic response
    console.log("\n3. Testing bot responsiveness...");
    const meResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const meData = await meResponse.json();
    
    if (meData.ok) {
      console.log("✅ Bot is responsive:", meData.result.username);
    } else {
      console.log("❌ Bot not responsive:", meData.description);
    }

    console.log("\n✨ Bot restart complete! Server should now start polling successfully.");
    console.log("\n📋 What to do next:");
    console.log("1. Restart your Node.js server (the Express app)");
    console.log("2. Wait 35 seconds for it to initialize");
    console.log("3. Test with a user sending 'Play 🎮' or any menu button");
    console.log("4. Then test 'Withdraw 🤑' with a user who has >100 ETB");

  } catch (error) {
    console.log("❌ Network error:", error.message);
  }
}

restartBot();