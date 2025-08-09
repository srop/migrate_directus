#!/usr/bin/env node

const DirectusMigrator = require('./DirectusMigrator');
const { config, validateConfig, getMaxFilesPerRun, getEstimatedRunTime } = require('./config');
const { checkFolderExists, loadBatchLog, getImageFiles, setupRequiredFolders } = require('./fileUtils');

/**
 * Feature configurations สำหรับแต่ละ feature
 */
const FEATURE_CONFIGS = {
  topic: {
    name: 'Topic Management',
    description: 'Migration for topic management system',
    tables: {
      main: 'topic',
      columns: ['pic'],
      flags: ['is_migrate']
    },
    sqlPattern: 'single_column_with_flag'
  },
  
  detail: {
    name: 'Detail Content',
    description: 'Migration for detail content system',
    tables: {
      main: 'detail',
      columns: ['pic', 'pic2', 'pic3', 'pic4', 'pic5', 'dfile'],
      flags: []
    },
    sqlPattern: 'multiple_columns_temp_table'
  },
  
  member: {
    name: 'Member Management',
    description: 'Migration for member profile pictures',
    tables: {
      main: 'pinoyphp_users',
      columns: ['picture1'],
      flags: ['is_migrate']
    },
    sqlPattern: 'single_column_with_flag'
  },
  
  content: {
    name: 'Content Management',
    description: 'Migration for content management system',
    tables: {
      main: 'content',
      columns: ['featured_image', 'thumbnail', 'gallery_images'],
      flags: ['is_migrated']
    },
    sqlPattern: 'single_column_with_flag'
  },
  
  product: {
    name: 'Product Catalog',
    description: 'Migration for product catalog system',
    tables: {
      main: 'product',
      columns: ['main_image', 'image_2', 'image_3', 'image_4', 'image_5'],
      flags: ['migration_status']
    },
    sqlPattern: 'multiple_columns_simple'
  },
  
  news: {
    name: 'News System',
    description: 'Migration for news and articles',
    tables: {
      main: 'news',
      columns: ['cover_image', 'content_images'],
      flags: ['is_migrated']
    },
    sqlPattern: 'single_column_with_flag'
  },
  
  all: {
    name: 'All Features',
    description: 'Migration for all features (generates separate queries for each)',
    tables: {
      // Will process all features above
    },
    sqlPattern: 'all_features'
  }
};

/**
 * ดึง feature ที่ระบุจาก command line arguments
 * @returns {string} feature name
 */
function getFeature() {
  const args = process.argv.slice(2);
  
  // หา --feature=xxx หรือ --feature xxx
  let feature = null;
  
  for (const arg of args) {
    if (arg.startsWith('--feature=')) {
      feature = arg.split('=')[1];
      break;
    } else if (arg === '--feature') {
      const index = args.indexOf(arg);
      if (index !== -1 && index + 1 < args.length) {
        feature = args[index + 1];
        break;
      }
    }
  }
  
  // Default ถ้าไม่ระบุ
  if (!feature) {
    feature = 'topic'; // default เป็น topic
    console.log('⚠️  No feature specified, using default: topic');
    console.log('💡 Use --feature=<name> to specify different feature');
  }
  
  // Validate feature
  if (!FEATURE_CONFIGS[feature]) {
    console.error(`❌ Unknown feature: ${feature}`);
    console.log('💡 Available features:');
    Object.entries(FEATURE_CONFIGS).forEach(([key, config]) => {
      console.log(`   --feature=${key} : ${config.description}`);
    });
    process.exit(1);
  }
  
  return feature;
}

/**
 * แสดงข้อมูล configuration ปัจจุบัน
 */
async function displayConfiguration(feature = 'topic') {
  const featureConfig = FEATURE_CONFIGS[feature];
  
  console.log('📋 Current Configuration:');
  console.log('=' .repeat(40));
  console.log(`🎯 Feature: ${featureConfig.name}`);
  console.log(`📝 Description: ${featureConfig.description}`);
  console.log(`🌐 Directus URL: ${config.DIRECTUS_URL}`);
  console.log(`📁 Source folder: ${config.LOCAL_FOLDER}`);
  console.log(`📂 Processed folder: ${config.PROCESSED_FOLDER}`);
  console.log(`❌ Failed folder: ${config.FAILED_FOLDER}`);
  console.log(`🎯 Target Directus folder: ${config.MIGRATE_FOLDER_ID}`);
  console.log(`📦 Batch size: ${config.BATCH_SIZE} files`);
  console.log(`🔄 Auto move files: ${config.AUTO_MOVE_FILES ? 'Yes' : 'No'}`);
  
  if (feature !== 'all') {
    console.log(`📊 Target Table: ${featureConfig.tables.main}`);
    console.log(`📋 Columns: ${featureConfig.tables.columns.join(', ')}`);
    if (featureConfig.tables.flags && featureConfig.tables.flags.length > 0) {
      console.log(`🏷️  Flags: ${featureConfig.tables.flags.join(', ')}`);
    }
    console.log(`⚙️  SQL Pattern: ${featureConfig.sqlPattern}`);
  }
  
  // แสดงข้อมูลการจำกัดรอบ
  if (config.MAX_BATCHES) {
    const maxFilesPerRun = getMaxFilesPerRun();
    console.log(`🚫 Max batches per run: ${config.MAX_BATCHES} batches`);
    console.log(`📊 Max files per run: ${maxFilesPerRun} files`);
  } else {
    console.log(`🚫 Max batches per run: Unlimited`);
  }
  
  console.log(`⏱️  Batch wait time: ${config.BATCH_WAIT_TIME/1000}s`);
  
  // แสดงเวลาประมาณในการรัน
  try {
    const folderExists = await checkFolderExists(config.LOCAL_FOLDER);
    if (folderExists) {
      const totalFiles = (await getImageFiles(config.LOCAL_FOLDER)).length;
      if (totalFiles > 0) {
        const maxFilesPerRun = getMaxFilesPerRun();
        const filesThisRun = Math.min(totalFiles, maxFilesPerRun);
        const estimatedTime = getEstimatedRunTime(totalFiles);
        const estimatedMinutes = Math.ceil(estimatedTime / 60);
        
        console.log(`📷 Found ${totalFiles} image files`);
        console.log(`📈 Files in source: ${totalFiles}`);
        console.log(`📊 Files per run: ${filesThisRun}`);
        console.log(`⏰ Estimated time: ~${estimatedMinutes} minutes`);
        
        if (totalFiles > maxFilesPerRun) {
          const totalRuns = Math.ceil(totalFiles / maxFilesPerRun);
          console.log(`🔄 Total runs needed: ${totalRuns}`);
        }
      }
    }
  } catch (error) {
    // ไม่แสดง error ถ้าหา folder ไม่เจอ
  }
  
  console.log('');
}

/**
 * แสดงรายการ features ที่มี
 */
function displayAvailableFeatures() {
  console.log('📋 Available Features for Migration:');
  console.log('='.repeat(40));
  console.log('');
  
  Object.entries(FEATURE_CONFIGS).forEach(([key, config]) => {
    console.log(`🎯 Feature: ${key}`);
    console.log(`   Name: ${config.name}`);
    console.log(`   Description: ${config.description}`);
    
    if (key !== 'all') {
      console.log(`   Main Table: ${config.tables.main}`);
      console.log(`   Columns: ${config.tables.columns.join(', ')}`);
      if (config.tables.flags && config.tables.flags.length > 0) {
        console.log(`   Flag Columns: ${config.tables.flags.join(', ')}`);
      }
      console.log(`   SQL Pattern: ${config.sqlPattern}`);
    }
    console.log('');
  });
}

/**
 * ตรวจสอบ feature configuration
 * @param {string} feature - feature name
 */
function validateFeatureConfig(feature) {
  const config = FEATURE_CONFIGS[feature];
  
  console.log(`🔍 Validating ${feature} configuration...`);
  
  if (feature === 'all') {
    console.log(`✅ All features mode - will generate queries for all features`);
    return true;
  }
  
  // Validate configuration
  const issues = [];
  
  if (!config.tables.main) {
    issues.push('Missing main table name');
  }
  
  if (!config.tables.columns || config.tables.columns.length === 0) {
    issues.push('No columns specified');
  }
  
  if (!config.sqlPattern) {
    issues.push('Missing SQL pattern');
  }
  
  if (issues.length > 0) {
    console.error('❌ Feature configuration issues:');
    issues.forEach(issue => console.error(`   - ${issue}`));
    return false;
  }
  
  console.log(`✅ Feature configuration validated`);
  return true;
}

async function displayMigrationStatus(isTestMode = false) {
  const batchLog = await loadBatchLog(isTestMode);
  const completedBatches = batchLog.filter(batch => batch.status === 'completed');
  
  if (completedBatches.length > 0) {
    const modeText = isTestMode ? 'Test Mode' : 'Production Mode';
    console.log(`📊 Previous Migration Status (${modeText}):`);
    console.log('=' .repeat(40));
    console.log(`✅ Completed batches: ${completedBatches.length}`);
    
    const totalSuccessful = completedBatches.reduce((sum, batch) => sum + batch.successful, 0);
    const totalFailed = completedBatches.reduce((sum, batch) => sum + batch.failed, 0);
    const overallSuccessRate = totalSuccessful + totalFailed > 0 
      ? ((totalSuccessful / (totalSuccessful + totalFailed)) * 100).toFixed(1)
      : '0.0';
    
    console.log(`📈 Files processed: ${totalSuccessful + totalFailed}`);
    console.log(`✅ Successful: ${totalSuccessful}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`📊 Success rate: ${overallSuccessRate}%`);
    
    const lastBatch = completedBatches[completedBatches.length - 1];
    console.log(`🕒 Last run: ${new Date(lastBatch.timestamp).toLocaleString()}`);
    console.log('');
  }
}

/**
 * แสดงวิธีการใช้งาน
 */
function displayUsage() {
  console.log('🚀 Directus Batch Migration Tool v2.0.0');
  console.log('='.repeat(40));
  console.log('Usage:');
  console.log('  node batch-migrate.js [options]');
  console.log('');
  console.log('Feature Options (Required):');
  console.log('  --feature=<name>      Specify which feature to migrate');
  console.log('');
  console.log('Mode Options:');
  console.log('  --test                Run in test mode (limited files)');
  console.log('  --yes                 Skip confirmation prompt in production');
  console.log('');
  console.log('Information Options:');
  console.log('  --status              Show migration status only');
  console.log('  --config              Show configuration only');
  console.log('  --list-features       Show available features');
  console.log('  --help                Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node batch-migrate.js --feature=topic --test');
  console.log('  node batch-migrate.js --feature=member --yes');
  console.log('  node batch-migrate.js --feature=all --test');
  console.log('  node batch-migrate.js --status');
  console.log('');
  console.log('Available Features:');
  Object.entries(FEATURE_CONFIGS).forEach(([key, config]) => {
    console.log(`  ${key.padEnd(10)} - ${config.description}`);
    if (key !== 'all') {
      console.log(`              Table: ${config.tables.main}, Columns: ${config.tables.columns.join(', ')}`);
    }
  });
  console.log('');
  console.log('Batch Processing:');
  console.log(`  📦 Batch size: ${config.BATCH_SIZE} files per batch`);
  console.log(`  🚫 Max batches: ${config.MAX_BATCHES} batches per run`);
  console.log(`  📊 Max files: ${config.MAX_BATCHES * config.BATCH_SIZE} files per run`);
  console.log('  🔄 Automatic resume: Continue from where it left off');
  console.log('  🛡️  Token protection: Prevents token expiration');
  console.log('');
  console.log('Folder Structure:');
  console.log('  ./old/        - Source files');
  console.log('  ./processed/  - Successfully uploaded files');
  console.log('  ./failed/     - Failed upload files');
  console.log('');
}

/**
 * แสดงคำเตือนก่อนเริ่ม migration
 */
async function showPreMigrationWarning(isTestMode, feature = 'topic') {
  const featureConfig = FEATURE_CONFIGS[feature];
  
  if (isTestMode) {
    console.log('🧪 TEST MODE');
    console.log('='.repeat(20));
    console.log(`🎯 Feature: ${featureConfig.name}`);
    console.log(`📊 Will process maximum ${config.TEST_LIMIT} files`);
    console.log('📁 Files will NOT be moved (test mode)');
    console.log('✅ Safe to run - no permanent changes');
  } else {
    console.log('🚀 PRODUCTION MODE');
    console.log('='.repeat(25));
    console.log(`🎯 Feature: ${featureConfig.name}`);
    console.log(`📝 Description: ${featureConfig.description}`);
    console.log('⚠️  WARNING: This will process files in batches!');
    
    const maxFilesPerRun = getMaxFilesPerRun();
    console.log(`📦 Processing ${config.BATCH_SIZE} files per batch`);
    console.log(`🚫 Maximum ${config.MAX_BATCHES} batches per run`);
    console.log(`📊 Maximum ${maxFilesPerRun} files per run`);
    
    if (feature !== 'all') {
      console.log(`📋 Target table: ${featureConfig.tables.main}`);
      console.log(`📂 Columns: ${featureConfig.tables.columns.join(', ')}`);
    }
    
    // ตรวจสอบจำนวนไฟล์จริง
    try {
      const folderExists = await checkFolderExists(config.LOCAL_FOLDER);
      if (folderExists) {
        const totalFiles = (await getImageFiles(config.LOCAL_FOLDER)).length;
        if (totalFiles > 0) {
          const filesThisRun = Math.min(totalFiles, maxFilesPerRun);
          console.log(`📈 Files found: ${totalFiles}`);
          console.log(`🎯 Files this run: ${filesThisRun}`);
          
          if (totalFiles > maxFilesPerRun) {
            const totalRuns = Math.ceil(totalFiles / maxFilesPerRun);
            console.log(`🔄 Estimated total runs needed: ${totalRuns}`);
            console.log('💡 Run again to continue from where it left off');
          }
        }
      }
    } catch (error) {
      // ไม่แสดง error
    }
    
    if (config.AUTO_MOVE_FILES) {
      console.log('🔄 Auto file moving is ENABLED');
      console.log('📁 Successful files → processed/ folder');
      console.log('❌ Failed files → failed/ folder');
    } else {
      console.log('🔄 Auto file moving is DISABLED');
    }
    
    console.log('🛡️  Token protection: Limited batches per run');
  }
  console.log('');
}

/**
 * ขอการยืนยันจากผู้ใช้
 */
function askForConfirmation() {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('Do you want to continue? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * ฟังก์ชันหลัก
 */
async function main() {
  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test');
  const showStatus = args.includes('--status');
  const showConfig = args.includes('--config');
  const showHelp = args.includes('--help');
  const forceYes = args.includes('--yes') || args.includes('-y');

  // แสดงความช่วยเหลือ
  if (showHelp) {
    displayUsage();
    return;
  }

  // แสดง configuration
  if (showConfig) {
    await displayConfiguration();
    return;
  }

  // แสดงสถานะ
  if (showStatus) {
    await displayConfiguration();
    await displayMigrationStatus(false); // แสดงสถานะ production
    await displayMigrationStatus(true);  // แสดงสถานะ test
    return;
  }

  console.log('🚀 Starting Directus Batch Migration...\n');

  // ตรวจสอบ configuration
  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    console.error('❌ Configuration errors:');
    configErrors.forEach(error => console.error(`   - ${error}`));
    console.error('\nPlease fix the configuration and try again.');
    process.exit(1);
  }

  // Get feature from command line  
  const feature = getFeature();

  // แสดง configuration
  await displayConfiguration(feature);

  // แสดงสถานะปัจจุบัน
  await displayMigrationStatus(isTestMode);

  // ตรวจสอบ source folder
  const folderExists = await checkFolderExists(config.LOCAL_FOLDER);
  if (!folderExists) {
    console.error(`❌ Source folder "${config.LOCAL_FOLDER}" not found!`);
    console.error('Please make sure the folder exists and contains image files.');
    process.exit(1);
  }

  // แสดงคำเตือนและขอการยืนยัน
  await showPreMigrationWarning(isTestMode, feature);
  
  if (!forceYes && !isTestMode) {
    const confirmed = await askForConfirmation();
    if (!confirmed) {
      console.log('👋 Migration cancelled by user.');
      return;
    }
  }

  console.log('\n🎬 Starting migration process...\n');

  // เริ่ม migration
  try {
    // ✅ แก้ไข: ส่ง options object แทน boolean
    const migrator = new DirectusMigrator({
      TEST_LIMIT: isTestMode ? config.TEST_LIMIT : null,
      BATCH_SIZE: config.BATCH_SIZE,
      MAX_BATCHES: config.MAX_BATCHES
    });
    
    // ✅ แก้ไข: ส่ง feature และ test mode อย่างถูกต้อง
    const migrationOptions = {
      feature: feature,
      test: isTestMode
    };
    
    let results = await migrator.migrateImages(migrationOptions);

    if (results) {
      console.log('\n🎉 Migration completed successfully!');
      
      // แสดงสรุปผลลัพธ์
      if (results.stats) {
        console.log(`✅ Successful uploads: ${results.stats.successful || 0}`);
        console.log(`❌ Failed uploads: ${results.stats.failed || 0}`);
        console.log(`📊 Success rate: ${results.stats.successRate || '0.0'}%`);
      } else {
        console.log(`✅ Successful uploads: 0`);
        console.log(`❌ Failed uploads: 0`);
      }
      
      // แนะนำขั้นตอนถัดไป
      if (isTestMode) {
        console.log('\n💡 Next steps:');
        console.log('   1. Review the test results above');
        console.log('   2. Check output files:');
        console.log('      - test-filemap.json (file mappings)');
        console.log('      - ./feature-queries/test-*-migration.sql');
        console.log('   3. Run without --test flag for full migration');
        console.log('   4. Use --status to check progress anytime');
      } else {
        console.log('\n💡 Next steps:');
        console.log('   1. Review the results and logs above');
        console.log('   2. Check output files:');
        console.log('      - filemap.json (file mappings)');
        console.log('      - ./feature-queries/*-migration.sql');
        console.log('   3. Verify files in Directus admin panel');
        console.log('   4. Check processed/ and failed/ folders');
        console.log('   5. Use SQL files to update your database');
        console.log('   6. Run --status to see final summary');
      }
    } else {
      console.error('\n💥 Migration failed!');
      console.error('Please check the error messages above and try again.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Unexpected error during migration:');
    console.error(`Error: ${error.message}`);
    
    if (isTestMode || args.includes('--debug')) {
      console.error('\nStack trace:');
      console.error(error.stack);
    } else {
      console.error('\nRun with --test flag to see more details.');
    }
    
    process.exit(1);
  }
}

/**
 * Handle process termination gracefully
 */
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Process interrupted by user (Ctrl+C)');
  console.log('👋 Migration stopped. You can resume later by running the same command.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Process terminated');
  console.log('👋 Migration stopped. You can resume later by running the same command.');
  process.exit(0);
});

// รัน script
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main, displayConfiguration, displayMigrationStatus };