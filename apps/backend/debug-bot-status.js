#!/usr/bin/env node

/**
 * Quick diagnostic script to check bot status and recent activity
 */

const BOT_TOKEN = process.env.BOT_TOKEN || "8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU";

async function checkBotStatus() {
  console.log("🔍 Checking bot status...\n");

  try {
    // 1. Check if bot is alive
    const meResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const meData = await meResponse.json();
    
    if (meData.ok) {
      console.log("✅ Bot is alive:");
      console.log(`   Username: @${meData.result.username}`);
      console.log(`   First Name: ${meData.result.first_name}\n`);
    } else {
      console.log("❌ Bot API call failed:", meData.description);
      return;
    }

    // 2. Check recent updates
    const updatesResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=5`);
    const updatesData = await updatesResponse.json();
    
    if (updatesData.ok) {
      console.log("📨 Recent updates:");
      if (updatesData.result.length === 0) {
        console.log("   No recent updates received");
      } else {
        updatesData.result.forEach((update, i) => {
          const msg = update.message;
          if (msg) {
            console.log(`   ${i+1}. From: ${msg.from?.first_name} (@${msg.from?.username || 'no_username'})`);
            console.log(`      Text: "${msg.text || '[non-text]'}"`);
            console.log(`      Date: ${new Date(msg.date * 1000).toLocaleString()}`);
          }
        });
      }
    } else {
      console.log("❌ Failed to get updates:", updatesData.description);
    }

    // 3. Check webhook status
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const webhookData = await webhookResponse.json();
    
    if (webhookData.ok) {
      console.log("\n🔗 Webhook status:");
      if (webhookData.result.url) {
        console.log(`   URL: ${webhookData.result.url}`);
        console.log(`   Pending updates: ${webhookData.result.pending_update_count}`);
      } else {
        console.log("   No webhook set (using long polling) ✅");
      }
    }

  } catch (error) {
    console.log("❌ Network error:", error.message);
  }
}

async function testWithdrawFlow() {
  console.log("\n🧪 Testing withdrawal flow simulation...");
  
  // Test the exact button text matching
  const testButtons = [
    "Withdraw 🤑",
    "withdraw 🤑",  // case sensitivity test
    "Withdraw🤑",   // spacing test
  ];

  testButtons.forEach((button, i) => {
    const matches = button === "Withdraw 🤑";
    console.log(`   ${i+1}. "${button}" → ${matches ? '✅ MATCH' : '❌ NO MATCH'}`);
  });
}

// Run diagnostics
console.log("🤖 Bot Withdrawal Issue Diagnostic Tool");
console.log("=" .repeat(50));

checkBotStatus()
  .then(() => testWithdrawFlow())
  .then(() => {
    console.log("\n💡 Next steps:");
    console.log("1. If bot is not alive → restart server");
    console.log("2. If no recent updates → users may not be interacting");
    console.log("3. If webhook is set → clear it with /deleteWebhook");
    console.log("4. Test with a registered user who has >100 ETB balance");
  });