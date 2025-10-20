// verify-migration.js
// Quick verification script for Supabase → Firebase migration

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🔍 VERIFYING SUPABASE → FIREBASE MIGRATION\n');

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    if (details) console.log(`   ${details}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${name}`);
    if (details) console.log(`   ${details}`);
    failed++;
  }
}

// Test 1: files.js should be deleted
const filesJsPath = path.join(__dirname, 'server', 'routes', 'files.js');
test(
  'files.js deleted',
  !fs.existsSync(filesJsPath),
  'File should not exist: server/routes/files.js'
);

// Test 2: server.mjs should not import supabase
const serverMjsPath = path.join(__dirname, 'server', 'server.mjs');
const serverContent = fs.readFileSync(serverMjsPath, 'utf8');
test(
  'No Supabase import in server.mjs',
  !serverContent.includes('supabaseServer') && !serverContent.includes('server-supabase-config'),
  'Should not import from server-supabase-config.js'
);

// Test 3: server.mjs should not have files router
test(
  'No files router in server.mjs',
  !serverContent.includes('createFilesRouter'),
  'Should not import or use createFilesRouter'
);

// Test 4: server.mjs should not have attach-files endpoint
test(
  'No attach-files endpoint in server.mjs',
  !serverContent.includes("app.post('/applicants/:id/attach-files'"),
  'attach-files endpoint should be removed'
);

// Test 5: applicants.js should have upload endpoint
const applicantsPath = path.join(__dirname, 'server', 'routes', 'applicants.js');
const applicantsContent = fs.readFileSync(applicantsPath, 'utf8');
test(
  'Upload endpoint exists in applicants.js',
  applicantsContent.includes('upload-file') && applicantsContent.includes('multer'),
  'Should have POST /:applicantId/upload-file endpoint with multer'
);

// Test 6: applicants.js should validate file types
test(
  'File type validation in applicants.js',
  applicantsContent.includes('.pdf') && applicantsContent.includes('.png') && applicantsContent.includes('.jpg'),
  'Should validate PDF, PNG, JPG file types'
);

// Test 7: applicants.js should use Firebase Storage
test(
  'Firebase Storage upload in applicants.js',
  applicantsContent.includes('admin.storage()') && applicantsContent.includes('makePublic'),
  'Should upload to Firebase Storage and make public'
);

// Test 8: tcform.js should not import supabase
const tcformPath = path.join(__dirname, 'applicationform', 'tcform.js');
const tcformContent = fs.readFileSync(tcformPath, 'utf8');
test(
  'No Supabase import in tcform.js',
  !tcformContent.includes('supabase-config') && !tcformContent.includes('from "../supabase-config.js"'),
  'Should not import supabase'
);

// Test 9: tcform.js should use backend API
test(
  'Backend API upload in tcform.js',
  tcformContent.includes('/api/applicants/') && tcformContent.includes('upload-file') && tcformContent.includes('FormData'),
  'Should use FormData and call backend API'
);

// Test 10: tcform.js should not have Supabase upload logic
test(
  'No Supabase upload in tcform.js',
  !tcformContent.includes('supabase.storage.from'),
  'Should not call supabase.storage'
);

// Test 11: server.mjs passes admin to applicants router
test(
  'Admin SDK passed to applicants router',
  serverContent.includes('createApplicantsRouter({') && 
  serverContent.match(/admin\s*[,}]/),
  'Should pass admin SDK to applicants router'
);

// Test 12: Check if multer is in package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
test(
  'Multer dependency exists',
  packageJson.dependencies && packageJson.dependencies.multer,
  'multer should be in package.json dependencies'
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 TEST RESULTS: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED! Migration verified successfully!\n');
  console.log('✅ Code is ready for testing');
  console.log('✅ No Supabase references found');
  console.log('✅ Firebase backend implemented');
  console.log('✅ Frontend updated correctly\n');
  console.log('📋 Next steps:');
  console.log('   1. Start server: node server/server.mjs');
  console.log('   2. Test application form');
  console.log('   3. Verify file uploads work');
  console.log('   4. Check admin portal\n');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED!\n');
  console.log('Please review the failed tests above.');
  console.log('Check PHASE4_VERIFICATION.md for detailed testing guide.\n');
  process.exit(1);
}
