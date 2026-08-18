import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;

console.log('\n=== Bot Configuration ===');
console.log('BOT_USERNAME in .env:', BOT_USERNAME);
console.log('\nChecking with Telegram...');

const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
const data = await response.json();

if (data.ok) {
  const actualUsername = data.result.username;
  console.log('Actual bot username:', actualUsername);
  console.log('\nMatch:', BOT_USERNAME === actualUsername ? '✅ YES' : '❌ NO');
  
  if (BOT_USERNAME !== actualUsername) {
    console.log('\n⚠️  UPDATE REQUIRED:');
    console.log(`Change BOT_USERNAME="${BOT_USERNAME}" to BOT_USERNAME="${actualUsername}"`);
  } else {
    console.log('\n✅ Configuration is correct!');
  }
} else {
  console.log('Error:', data.description);
}
