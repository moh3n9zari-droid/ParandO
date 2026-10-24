import { runAllCoreTests } from '../src/core/tests_suite';

const results = runAllCoreTests();
const failed = results.filter((r) => r.status === 'failed');
const passed = results.length - failed.length;

console.log(`\n========================================`);
console.log(`Parando Core & Settlement Test Suite`);
console.log(`========================================`);
console.log(`Total tests: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed.length}`);

if (failed.length > 0) {
  console.error('\nFailures:');
  failed.forEach((f) => {
    console.error(`- [${f.category}] ${f.name}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log(`\nAll tests passed successfully (100% ADR-001 - ADR-004 compliance)!\n`);
  process.exit(0);
}
