/**
 * Report utilities for migration results
 */

/**
 * แสดงสรุปผลลัพธ์แบบย่อ
 * @param {Object} results - ผลลัพธ์การ migration
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @param {string} feature - feature ที่รัน
 */
function showSummary(results, isTestMode = false, feature = 'unknown') {
    const mode = isTestMode ? 'TEST' : 'PRODUCTION';
    const featureName = feature.charAt(0).toUpperCase() + feature.slice(1);
    
    console.log(`\n📊 ${mode} Migration Summary - ${featureName} Feature`);
    console.log('='.repeat(50));
    
    if (results.batches) {
      // Batch mode results
      console.log(`📦 Batches processed: ${results.batches.length}`);
      console.log(`✅ Total successful: ${results.totalSuccessful}`);
      console.log(`❌ Total failed: ${results.totalFailed}`);
      
      if (results.totalSuccessful + results.totalFailed > 0) {
        const successRate = ((results.totalSuccessful / (results.totalSuccessful + results.totalFailed)) * 100).toFixed(1);
        console.log(`📈 Success rate: ${successRate}%`);
      }
      
      // แสดงเวลาที่ใช้รวม
      if (results.batches.length > 0) {
        const totalDuration = results.batches.reduce((sum, batch) => sum + (batch.duration || 0), 0);
        console.log(`⏱️  Total time: ${totalDuration.toFixed(1)} seconds`);
        
        if (totalDuration > 0) {
          const avgTimePerFile = totalDuration / (results.totalSuccessful + results.totalFailed);
          console.log(`⚡ Average time per file: ${avgTimePerFile.toFixed(2)} seconds`);
        }
      }
    } else {
      // Single mode results
      const successful = results.successful?.length || 0;
      const failed = results.failed?.length || 0;
      
      console.log(`✅ Successful uploads: ${successful}`);
      console.log(`❌ Failed uploads: ${failed}`);
      
      if (successful + failed > 0) {
        const successRate = ((successful / (successful + failed)) * 100).toFixed(1);
        console.log(`📈 Success rate: ${successRate}%`);
      }
    }
    
    // แสดงไฟล์ที่สร้าง
    console.log(`\n📄 Generated files:`);
    if (isTestMode) {
      console.log(`   • filemap-test.json`);
      console.log(`   • ${feature}-query-test.sql`);
      console.log(`   • update-queries-test.sql`);
      console.log(`   • batch-log-test.json`);
    } else {
      console.log(`   • filemap.json`);
      console.log(`   • ${feature}-query.sql`);
      console.log(`   • update-queries.sql`);
      console.log(`   • batch-log.json`);
    }
  }
  
  /**
   * แสดงรายงานแบบละเอียด
   * @param {Object} results - ผลลัพธ์การ migration
   * @param {boolean} isTestMode - โหมดทดสอบ
   * @param {string} feature - feature ที่รัน
   */
  function generateDetailedReport(results, isTestMode = false, feature = 'unknown') {
    const mode = isTestMode ? 'TEST' : 'PRODUCTION';
    const featureName = feature.charAt(0).toUpperCase() + feature.slice(1);
    
    console.log(`\n📋 Detailed ${mode} Migration Report - ${featureName} Feature`);
    console.log('='.repeat(60));
    
    // แสดงข้อมูลทั่วไป
    console.log(`🕐 Report generated: ${new Date().toLocaleString()}`);
    console.log(`🎯 Feature: ${featureName}`);
    console.log(`🔧 Mode: ${mode}`);
    
    if (results.batches) {
      // Batch mode detailed report
      console.log(`\n📊 Batch Statistics:`);
      console.log(`   Total batches: ${results.batches.length}`);
      console.log(`   Total files processed: ${results.totalSuccessful + results.totalFailed}`);
      console.log(`   Successful uploads: ${results.totalSuccessful}`);
      console.log(`   Failed uploads: ${results.totalFailed}`);
      
      if (results.totalSuccessful + results.totalFailed > 0) {
        const successRate = ((results.totalSuccessful / (results.totalSuccessful + results.totalFailed)) * 100).toFixed(1);
        console.log(`   Overall success rate: ${successRate}%`);
      }
      
      // แสดงรายละเอียดแต่ละ batch
      console.log(`\n📦 Batch Details:`);
      results.batches.forEach((batch, index) => {
        const batchSuccessRate = batch.filesProcessed > 0 
          ? ((batch.successful / batch.filesProcessed) * 100).toFixed(1)
          : '0.0';
        
        console.log(`   Batch ${batch.batchNumber}:`);
        console.log(`     Files: ${batch.filesProcessed} (${batch.successful} ✅, ${batch.failed} ❌)`);
        console.log(`     Success rate: ${batchSuccessRate}%`);
        console.log(`     Duration: ${batch.duration?.toFixed(1) || 'N/A'} seconds`);
        console.log(`     Timestamp: ${new Date(batch.timestamp).toLocaleString()}`);
        
        if (index < results.batches.length - 1) console.log('');
      });
      
    } else {
      // Single mode detailed report
      const successful = results.successful || [];
      const failed = results.failed || [];
      
      console.log(`\n📊 Upload Statistics:`);
      console.log(`   Total files processed: ${successful.length + failed.length}`);
      console.log(`   Successful uploads: ${successful.length}`);
      console.log(`   Failed uploads: ${failed.length}`);
      
      if (successful.length + failed.length > 0) {
        const successRate = ((successful.length / (successful.length + failed.length)) * 100).toFixed(1);
        console.log(`   Success rate: ${successRate}%`);
      }
      
      // แสดงรายละเอียดไฟล์ที่สำเร็จ
    if (successful.length > 0) {
        console.log(`\n✅ Successful Files:`);
        successful.forEach((file, index) => {
            console.log(`   ${index + 1}. ${file.localFile}`);
            console.log(`      Directus ID: ${file.directusId}`);
            console.log(`      URL: ${file.directusUrl}`);
            if (index < Math.min(5, successful.length - 1)) console.log('');
            
            // แสดงแค่ 5 ไฟล์แรก
            if (index >= 4 && successful.length > 5) {
                console.log(`      ... and ${successful.length - 5} more files`);
                return; // Changed from break to return
            }
        });
    }
      
      // แสดงรายละเอียดไฟล์ที่ล้มเหลว
      if (failed.length > 0) {
        console.log(`\n❌ Failed Files:`);
        failed.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.localFile}`);
          console.log(`      Error: ${file.error}`);
          if (index < failed.length - 1) console.log('');
        });
      }
    }
    
    // แสดงคำแนะนำ
    console.log(`\n💡 Next Steps:`);
    if (isTestMode) {
      console.log(`   1. Review the test results above`);
      console.log(`   2. Check the generated test files`);
      console.log(`   3. Run production migration: node batch-migrate.js --feature=${feature} --yes`);
    } else {
      console.log(`   1. Review the generated SQL files`);
      console.log(`   2. Verify uploads in Directus admin panel`);
      console.log(`   3. Execute SQL updates in your database`);
      console.log(`   4. Test your application with the new file IDs`);
    }
    
    // แสดงไฟล์ที่สร้าง
    console.log(`\n📄 Generated Files:`);
    const suffix = isTestMode ? '-test' : '';
    console.log(`   • filemap${suffix}.json - File ID mappings`);
    console.log(`   • ${feature}-query${suffix}.sql - Feature-specific SQL`);
    console.log(`   • update-queries${suffix}.sql - General update queries`);
    console.log(`   • batch-log${suffix}.json - Migration logs`);
  }
  
  /**
   * แสดงวิธีการใช้งาน
   */
  function showUsage() {
    console.log('🚀 Directus Image Migrator v2.0.0');
    console.log('='.repeat(40));
    console.log('');
    console.log('A powerful tool for migrating images to Directus CMS with feature-specific SQL generation.');
    console.log('');
    console.log('USAGE:');
    console.log('  node batch-migrate.js --feature=<feature> [options]');
    console.log('');
    console.log('REQUIRED PARAMETERS:');
    console.log('  --feature=<name>       Specify which feature to migrate');
    console.log('');
    console.log('MODE OPTIONS:');
    console.log('  --test                 Run in test mode (limited files, safe)');
    console.log('  --yes                  Skip confirmation in production mode');
    console.log('');
    console.log('INFORMATION OPTIONS:');
    console.log('  --status               Show migration status and progress');
    console.log('  --config               Show current configuration');
    console.log('  --list-features        Show available features');
    console.log('  --help                 Show this help message');
    console.log('');
    console.log('OUTPUT OPTIONS:');
    console.log('  --verbose              Show detailed migration report');
    console.log('  --debug                Show debug information');
    console.log('');
    console.log('EXAMPLES:');
    console.log('  node batch-migrate.js --feature=topic --test');
    console.log('    → Test migration for topic feature');
    console.log('');
    console.log('  node batch-migrate.js --feature=detail --yes');
    console.log('    → Production migration for detail feature');
    console.log('');
    console.log('  node batch-migrate.js --feature=all --test --verbose');
    console.log('    → Test all features with detailed report');
    console.log('');
    console.log('  node batch-migrate.js --status');
    console.log('    → Check migration progress');
    console.log('');
    console.log('AVAILABLE FEATURES:');
    console.log('  topic      - Topic management (single column + flag)');
    console.log('  detail     - Detail content (multiple columns + temp table)');
    console.log('  content    - Content management (single column + flag)');
    console.log('  product    - Product catalog (multiple columns)');
    console.log('  news       - News system (single column + flag)');
    console.log('  gallery    - Gallery system (single column + flag)');
    console.log('  user       - User profiles (single column + flag)');
    console.log('  all        - All features (generates separate queries)');
    console.log('');
    console.log('FOLDER STRUCTURE:');
    console.log('  ./old/         Source images');
    console.log('  ./processed/   Successfully uploaded images');
    console.log('  ./failed/      Failed upload images');
    console.log('  ./backups/     Backup files');
    console.log('');
    console.log('OUTPUT FILES:');
    console.log('  filemap.json           - File ID mappings');
    console.log('  <feature>-query.sql    - Feature-specific SQL updates');
    console.log('  update-queries.sql     - General SQL templates');
    console.log('  batch-log.json         - Migration progress logs');
    console.log('');
    console.log('For more information, visit: https://github.com/yourusername/directus-image-migrator');
  }
  
  /**
   * แสดงสถิติการใช้งาน
   * @param {Object} fileStats - สถิติไฟล์จาก fileUtils
   */
  function showFileStatistics(fileStats) {
    console.log('\n📊 File Statistics:');
    console.log('==================');
    console.log(`📁 Source files: ${fileStats.source}`);
    console.log(`✅ Processed files: ${fileStats.processed}`);
    console.log(`❌ Failed files: ${fileStats.failed}`);
    console.log(`📈 Total files: ${fileStats.total}`);
    
    if (fileStats.total > 0) {
      const processedRate = ((fileStats.processed / fileStats.total) * 100).toFixed(1);
      const failedRate = ((fileStats.failed / fileStats.total) * 100).toFixed(1);
      console.log(`📊 Processed rate: ${processedRate}%`);
      console.log(`📊 Failed rate: ${failedRate}%`);
    }
  }
  
  /**
   * แสดงเวลาที่ใช้ในการ migration
   * @param {Date} startTime - เวลาเริ่มต้น
   * @param {Date} endTime - เวลาสิ้นสุด
   */
  function showExecutionTime(startTime, endTime) {
    const duration = (endTime - startTime) / 1000;
    const minutes = Math.floor(duration / 60);
    const seconds = (duration % 60).toFixed(1);
    
    console.log(`\n⏱️  Execution Time: ${minutes}m ${seconds}s`);
  }
  
  module.exports = {
    showSummary,
    generateDetailedReport,
    showUsage,
    showFileStatistics,
    showExecutionTime
  };