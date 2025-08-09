#!/usr/bin/env node

const https = require('https');

// ===== SSL Configuration สําหรับ Dev Environment =====
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // ใช้สําหรับ dev environment เท่านั้น
});

// ===== ตั้งค่าการเชื่อมต่อ Directus =====
const config = {
  // Directus Settings
  DIRECTUS_URL: 'https://dev.backend.intranet.itmx.co.th',
  ACCESS_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY4NTJhNmRiLTA2NDctNDNkMy04OWMxLWVjYzdhMjIwODA3ZiIsInJvbGUiOiJiMWVmNWQwOS0xN2JlLTQwODktYmNkNS03YjZiYTUxMzMwNGUiLCJhcHBfYWNjZXNzIjp0cnVlLCJhZG1pbl9hY2Nlc3MiOnRydWUsImlhdCI6MTc1NDczODg1NCwiZXhwIjoxNzU0NzQyNDU0LCJpc3MiOiJkaXJlY3R1cyJ9.NCgjlMAQQ6WMORpPcfC5ItPMqkPfUGfBFG_CYKLvVe0',
  
  // Migration Settings
  LOCAL_FOLDER: './old',
  PROCESSED_FOLDER: './processed', // folder สำหรับไฟล์ที่ทำแล้ว
  FAILED_FOLDER: './failed', // folder สำหรับไฟล์ที่ upload ไม่สำเร็จ
  MIGRATE_FOLDER_ID: 'f2639c2a-4203-46b7-bb1d-7d445564cab7',
  MIGRATE_FOLDER_NAME: 'test',
  
  // Batch Processing Settings
  BATCH_SIZE: 3, // จำนวนไฟล์ที่จะประมวลผลต่อ batch
  MAX_BATCHES: 2, // จำกัดจำนวน batch ต่อการรัน (ป้องกัน token หมดอายุ)
  AUTO_MOVE_FILES: true, // ย้ายไฟล์อัตโนมัติหรือไม่
  
  // Token Management
  MAX_FILES_PER_RUN: null, // จำกัดไฟล์ต่อการรัน (null = ใช้ MAX_BATCHES * BATCH_SIZE)
  
  // Mode Settings
  TEST_LIMIT: 5, // จำนวนไฟล์ในโหมดทดสอบ
  
  // Upload Settings
  TIMEOUT: 30000, // timeout สำหรับ HTTP requests (30 วินาที)
  TEST_WAIT_TIME: 1000, // เวลาพักระหว่างไฟล์ในโหมดทดสอบ (1 วินาที)
  PRODUCTION_WAIT_TIME: 500, // เวลาพักระหว่างไฟล์ในโหมด production (0.5 วินาที)
  BATCH_WAIT_TIME: 5000, // เวลารอระหว่าง batch (5 วินาที)
  
  // File Extensions ที่รองรับ
  IMAGE_EXTENSIONS: [
    '.jpg', '.JPG', 
    '.jpeg', '.JPEG',
    '.png', '.PNG',
    '.gif', '.GIF',
    '.bmp', '.BMP',
    '.webp', '.WEBP',
    '.tiff', '.TIFF',
    '.svg', '.SVG',
    '.pdf', '.PDF',
    '.xlsx', '.XLSX',
    '.xls', '.XLS',
    '.doc', '.DOC',
    '.docx', '.DOCX',
    '.zip', '.ZIP',
    '.rar', '.RAR'
  ],
  
  // Output Files Configuration
  OUTPUT_FILES: {
    TEST: {
      FILEMAP: 'filemap-test.json',
      SQL: 'update-queries-test.sql',
      TOPIC_QUERY: 'topic-query-test.sql',
      DETAIL_QUERY: 'detail-query-test.sql',
      BATCH_LOG: 'batch-log-test.json',
      FEATURE_QUERIES: 'feature-queries-test/' // folder สำหรับ feature queries
    },
    PRODUCTION: {
      FILEMAP: 'filemap.json',
      SQL: 'update-queries.sql',
      TOPIC_QUERY: 'topic-query.sql',
      DETAIL_QUERY: 'detail-query.sql',
      BATCH_LOG: 'batch-log.json',
      FEATURE_QUERIES: 'feature-queries/' // folder สำหรับ feature queries
    }
  },
  
  // Feature Configurations
  FEATURES: {
    topic: {
      name: 'Topic Management',
      description: 'Migration for topic management system (includes detail)',
      outputFileName: 'topic-migration.sql',
      tables: {
        main: 'topic',
        columns: ['pic'],
        flags: ['is_migrate']
      },
      sqlPattern: 'single_column_with_flag',
      // เพิ่ม feature ที่ต้องทำร่วมกัน
      includeFeatures: ['detail'],
      combinedDescription: 'Topic + Detail Migration (combined processing)'
    },
    
    detail: {
      name: 'Detail Content',
      description: 'Migration for detail content system',
      outputFileName: 'detail-migration.sql',
      tables: {
        main: 'detail',
        columns: ['pic', 'pic2', 'pic3', 'pic4', 'pic5', 'dfile'],
        flags: []
      },
      sqlPattern: 'multiple_columns_temp_table',
      // ระบุว่าเป็น secondary feature (จะถูกรวมใน topic)
      isSecondary: true,
      primaryFeature: 'topic'
    },
   member : {
  name: 'Member Management',
  tables: {
    main: 'pinoyphp_users',
    columns: ['picture1'],
    flags: ['is_migrate']
  }
} ,
    content: {
      name: 'Content Management',
      description: 'Migration for content management system',
      outputFileName: 'content-migration.sql',
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
      outputFileName: 'product-migration.sql',
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
      outputFileName: 'news-migration.sql',
      tables: {
        main: 'news',
        columns: ['cover_image', 'content_images'],
        flags: ['is_migrated']
      },
      sqlPattern: 'single_column_with_flag'
    },
    
    gallery: {
      name: 'Gallery System',
      description: 'Migration for gallery and media',
      outputFileName: 'gallery-migration.sql',
      tables: {
        main: 'gallery',
        columns: ['image_url', 'thumbnail_url'],
        flags: ['is_migrated']
      },
      sqlPattern: 'single_column_with_flag'
    },
    
    user: {
      name: 'User Profiles',
      description: 'Migration for user avatars and profiles',
      outputFileName: 'user-migration.sql',
      tables: {
        main: 'users',
        columns: ['avatar', 'cover_photo'],
        flags: ['avatar_migrated']
      },
      sqlPattern: 'single_column_with_flag'
    },
    
    all: {
      name: 'All Features',
      description: 'Migration for all features (generates separate queries for each)',
      outputFileName: 'all-features-migration.sql',
      tables: {
        // Will process all features above
      },
      sqlPattern: 'all_features'
    }
  },
  
  // Performance Settings
  PERFORMANCE: {
    MAX_CONCURRENT_UPLOADS: 1, // จำนวน upload พร้อมกัน (1 = sequential)
    RETRY_ATTEMPTS: 3, // จำนวนครั้งที่จะลองใหม่เมื่อ upload ล้มเหลว
    RETRY_DELAY: 2000, // เวลาพักก่อนลองใหม่ (2 วินาที)
    CHUNK_SIZE: 1024 * 1024 * 5 // ขนาด chunk สำหรับไฟล์ใหญ่ (5MB)
  },
  
  // Logging Settings
  LOGGING: {
    LEVEL: 'info', // debug, info, warn, error
    SAVE_TO_FILE: true, // บันทึก log ลงไฟล์หรือไม่
    LOG_FILE: 'migration.log',
    MAX_LOG_SIZE: 1024 * 1024 * 10, // ขนาดไฟล์ log สูงสุด (10MB)
    BACKUP_LOGS: true // สร้าง backup log files หรือไม่
  },
  
  // Backup Settings
  BACKUP: {
    ENABLED: true, // เปิดใช้งาน backup หรือไม่
    FOLDER: './backups',
    KEEP_DAYS: 7, // เก็บ backup กี่วัน
    AUTO_CLEANUP: true // ลบ backup เก่าอัตโนมัติหรือไม่
  },
  
  // Notification Settings (สำหรับอนาคต)
  NOTIFICATIONS: {
    EMAIL: {
      ENABLED: false,
      SMTP_HOST: '',
      SMTP_PORT: 587,
      FROM_EMAIL: '',
      TO_EMAILS: []
    },
    WEBHOOK: {
      ENABLED: false,
      URL: '',
      SECRET: ''
    }
  },
  
  // HTTPS Agent
  httpsAgent
};

// ===== Validation Functions =====
function validateConfig() {
  const errors = [];
  
  // ตรวจสอบ Directus settings
  if (!config.DIRECTUS_URL || config.DIRECTUS_URL.includes('your-directus-instance')) {
    errors.push('Please update DIRECTUS_URL in config.js');
  }
  
  if (!config.ACCESS_TOKEN || config.ACCESS_TOKEN.includes('your-access-token')) {
    errors.push('Please update ACCESS_TOKEN in config.js');
  }
  
  if (!config.MIGRATE_FOLDER_ID) {
    errors.push('MIGRATE_FOLDER_ID is required');
  }
  
  if (!config.LOCAL_FOLDER) {
    errors.push('LOCAL_FOLDER is required');
  }
  
  // ตรวจสอบ batch settings
  if (config.BATCH_SIZE <= 0) {
    errors.push('BATCH_SIZE must be greater than 0');
  }
  
  if (config.MAX_BATCHES !== null && config.MAX_BATCHES <= 0) {
    errors.push('MAX_BATCHES must be greater than 0 or null');
  }
  
  if (config.TEST_LIMIT <= 0) {
    errors.push('TEST_LIMIT must be greater than 0');
  }
  
  // ตรวจสอบ timeout settings
  if (config.TIMEOUT <= 0) {
    errors.push('TIMEOUT must be greater than 0');
  }
  
  // ตรวจสอบ file extensions
  if (!Array.isArray(config.IMAGE_EXTENSIONS) || config.IMAGE_EXTENSIONS.length === 0) {
    errors.push('IMAGE_EXTENSIONS must be a non-empty array');
  }
  
  return errors;
}

function validateFeature(featureName) {
  if (!featureName) {
    return { valid: false, error: 'Feature name is required' };
  }
  
  if (!config.FEATURES[featureName]) {
    return { 
      valid: false, 
      error: `Unknown feature: ${featureName}`,
      availableFeatures: Object.keys(config.FEATURES)
    };
  }
  
  const feature = config.FEATURES[featureName];
  
  // ตรวจสอบ feature configuration
  if (featureName !== 'all') {
    if (!feature.tables || !feature.tables.main) {
      return { valid: false, error: `Feature ${featureName} missing main table configuration` };
    }
    
    if (!feature.tables.columns || feature.tables.columns.length === 0) {
      return { valid: false, error: `Feature ${featureName} missing columns configuration` };
    }
    
    if (!feature.sqlPattern) {
      return { valid: false, error: `Feature ${featureName} missing SQL pattern` };
    }
  }
  
  return { valid: true, feature };
}

// ===== Helper Functions =====
function getOutputFiles(isTestMode) {
  return isTestMode ? config.OUTPUT_FILES.TEST : config.OUTPUT_FILES.PRODUCTION;
}

function getWaitTime(isTestMode) {
  return isTestMode ? config.TEST_WAIT_TIME : config.PRODUCTION_WAIT_TIME;
}

function getBatchWaitTime() {
  return config.BATCH_WAIT_TIME;
}

function getMaxFilesPerRun() {
  return config.MAX_FILES_PER_RUN || (config.MAX_BATCHES * config.BATCH_SIZE);
}

function getEstimatedRunTime(totalFiles) {
  const maxFilesPerRun = getMaxFilesPerRun();
  const filesThisRun = Math.min(totalFiles, maxFilesPerRun);
  const batches = Math.ceil(filesThisRun / config.BATCH_SIZE);
  
  // คำนวณเวลาประมาณ: (ไฟล์ × เวลาต่อไฟล์) + (batch × เวลาพัก)
  const fileProcessTime = filesThisRun * (config.PRODUCTION_WAIT_TIME / 1000);
  const batchWaitTime = (batches - 1) * (config.BATCH_WAIT_TIME / 1000);
  const uploadTime = filesThisRun * 2; // ประมาณ 2 วินาทีต่อไฟล์
  
  return Math.ceil(fileProcessTime + batchWaitTime + uploadTime);
}

function getFeatureConfig(featureName) {
  const validation = validateFeature(featureName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return validation.feature;
}

function getAllFeatures() {
  return Object.keys(config.FEATURES).filter(f => f !== 'all');
}

function getPrimaryFeatures() {
  return Object.keys(config.FEATURES).filter(f => 
    f !== 'all' && !config.FEATURES[f].isSecondary
  );
}

function getIncludedFeatures(featureName) {
  const feature = config.FEATURES[featureName];
  if (!feature) return [featureName];
  
  // ถ้ามี includeFeatures ให้รวมด้วย
  const included = feature.includeFeatures || [];
  return [featureName, ...included];
}

function getCombinedFeatureDescription(featureName) {
  const feature = config.FEATURES[featureName];
  if (!feature) return '';
  
  if (feature.includeFeatures && feature.includeFeatures.length > 0) {
    return feature.combinedDescription || feature.description;
  }
  
  return feature.description;
}

function getFeatureOutputFileName(featureName, isTestMode = false) {
  const feature = getFeatureConfig(featureName);
  const prefix = isTestMode ? 'test-' : '';
  return prefix + feature.outputFileName;
}

// ===== Environment Detection =====
function getEnvironment() {
  if (config.DIRECTUS_URL.includes('localhost') || config.DIRECTUS_URL.includes('127.0.0.1')) {
    return 'local';
  } else if (config.DIRECTUS_URL.includes('dev.') || config.DIRECTUS_URL.includes('development')) {
    return 'development';
  } else if (config.DIRECTUS_URL.includes('staging') || config.DIRECTUS_URL.includes('stage')) {
    return 'staging';
  } else {
    return 'production';
  }
}

// ===== Performance Helpers =====
function getOptimalBatchSize(totalFiles) {
  // ปรับ batch size ตามจำนวนไฟล์
  if (totalFiles < 100) {
    return Math.min(config.BATCH_SIZE, 20);
  } else if (totalFiles < 1000) {
    return Math.min(config.BATCH_SIZE, 50);
  } else {
    return config.BATCH_SIZE;
  }
}

function getOptimalWaitTime(isTestMode, fileSize = 0) {
  const baseWaitTime = getWaitTime(isTestMode);
  
  // ปรับเวลาพักตามขนาดไฟล์ (ไฟล์ใหญ่ = พักนานขึ้น)
  if (fileSize > 5 * 1024 * 1024) { // > 5MB
    return baseWaitTime * 2;
  } else if (fileSize > 1 * 1024 * 1024) { // > 1MB
    return baseWaitTime * 1.5;
  } else {
    return baseWaitTime;
  }
}

// ===== Debug Helpers =====
function getConfigSummary() {
  return {
    environment: getEnvironment(),
    directusUrl: config.DIRECTUS_URL,
    folders: {
      source: config.LOCAL_FOLDER,
      processed: config.PROCESSED_FOLDER,
      failed: config.FAILED_FOLDER
    },
    batch: {
      size: config.BATCH_SIZE,
      maxBatches: config.MAX_BATCHES,
      maxFilesPerRun: getMaxFilesPerRun()
    },
    features: getAllFeatures(),
    supportedExtensions: config.IMAGE_EXTENSIONS.length
  };
}

function printConfigSummary() {
  const summary = getConfigSummary();
  
  console.log('📋 Configuration Summary:');
  console.log('========================');
  console.log(`Environment: ${summary.environment}`);
  console.log(`Directus URL: ${summary.directusUrl}`);
  console.log(`Source Folder: ${summary.folders.source}`);
  console.log(`Batch Size: ${summary.batch.size}`);
  console.log(`Max Batches: ${summary.batch.maxBatches}`);
  console.log(`Max Files Per Run: ${summary.batch.maxFilesPerRun}`);
  console.log(`Available Features: ${summary.features.join(', ')}`);
  console.log(`Supported Extensions: ${summary.supportedExtensions}`);
}

module.exports = {
  config,
  validateConfig,
  validateFeature,
  getOutputFiles,
  getWaitTime,
  getBatchWaitTime,
  getMaxFilesPerRun,
  getEstimatedRunTime,
  getFeatureConfig,
  getAllFeatures,
  getFeatureOutputFileName,
  getEnvironment,
  getOptimalBatchSize,
  getOptimalWaitTime,
  getConfigSummary,
  printConfigSummary
};