// Helper script to convert serviceAccountKey.json to base64 for Render deployment
// Usage: node scripts/convert-firebase-to-base64.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseKeyPath = path.join(__dirname, '..', 'server', 'serviceAccountKey.json');
const outputPath = path.join(__dirname, '..', 'firebase-base64.txt');

try {
  // Read Firebase credentials file
  const content = fs.readFileSync(firebaseKeyPath, 'utf8');
  
  // Convert to base64
  const base64 = Buffer.from(content).toString('base64');
  
  // Save to file
  fs.writeFileSync(outputPath, base64);
  
  console.log('✅ Success! Firebase credentials converted to base64');
  console.log(`📄 Output saved to: firebase-base64.txt`);
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Open firebase-base64.txt');
  console.log('2. Copy ALL the text');
  console.log('3. In Render dashboard, add environment variable:');
  console.log('   Key: FIREBASE_SERVICE_ACCOUNT_BASE64');
  console.log('   Value: (paste the copied text)');
  console.log('');
  console.log('⚠️  Important: Delete firebase-base64.txt after deployment for security!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('');
  console.error('Make sure serviceAccountKey.json exists in server/ folder');
  process.exit(1);
}
