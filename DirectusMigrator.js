#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const https = require('https');
const { performance } = require('perf_hooks');
const { config } = require('./config');

// Helper functions (standalone)
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function isFileTooLarge(fileSize) {
  const maxSize = 10 * 1024 * 1024; // 10MB limit
  return fileSize > maxSize;
}

function getFileSizeWarning(fileSize) {
  if (fileSize > 15 * 1024 * 1024) return '🚨 Very Large';
  if (fileSize > 10 * 1024 * 1024) return '⚠️ Large';
  if (fileSize > 5 * 1024 * 1024) return '📏 Medium-Large';
  return '';
}

class DirectusMigrator {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    
    // Ensure TEST_LIMIT has a default value
    if (!this.config.TEST_LIMIT) {
      this.config.TEST_LIMIT = 10;
    }
    
    // Ensure member feature exists in config
    if (!this.config.FEATURES.member) {
      this.config.FEATURES.member = {
        name: 'Member Management',
        description: 'Migration for member profile pictures',
        tables: {
          main: 'pinoyphp_users',
          columns: ['picture1'],
          flags: ['is_migrate']
        },
        sqlPattern: 'single_column_with_flag'
      };
    }
    
    this.uploadedFiles = [];
    this.failedFiles = [];
    this.totalProcessedFiles = 0;
    this.startTime = null;
    this.isTestMode = false;
    
    // Feature combinations
    this.featureCombinations = {
      topic: ['topic', 'detail'], // topic รวม detail
      detail: ['detail'],
      member: ['member'],
      content: ['content'],
      product: ['product'],
      news: ['news'],
      gallery: ['gallery'],
      user: ['user'],
      all: ['topic', 'detail', 'member', 'content', 'product', 'news', 'gallery', 'user']
    };
  }

  logWithTimestamp(message, level = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    return logMessage;
  }

  getFeaturesToProcess(selectedFeature) {
    return this.featureCombinations[selectedFeature] || [selectedFeature];
  }

  async createDirectories() {
    const dirs = [
      this.config.PROCESSED_FOLDER,
      this.config.FAILED_FOLDER,
      './feature-queries'
    ];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  async getAllFiles(folderPath) {
    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true });
      let files = [];
      
      for (const item of items) {
        const fullPath = path.join(folderPath, item.name);
        
        if (item.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files = files.concat(subFiles);
        } else if (item.isFile()) {
          const ext = path.extname(item.name);
          
          if (this.config.IMAGE_EXTENSIONS.includes(ext)) {
            const stats = await fs.stat(fullPath);
            files.push({
              fullPath,
              name: item.name,
              size: stats.size,
              relativePath: path.relative(this.config.LOCAL_FOLDER, fullPath)
            });
          }
        }
      }
      
      return files;
    } catch (error) {
      this.logWithTimestamp(`Error reading folder ${folderPath}: ${error.message}`, 'ERROR');
      return [];
    }
  }

  parseFilePath(relativePath) {
    const pathParts = relativePath.split(path.sep);
    const fileName = path.basename(relativePath);
    
    // Handle structured paths: feature/table/id/file.jpg
    if (pathParts.length >= 3) {
      const feature = pathParts[0];
      const remainingPath = pathParts.slice(1).join('/');
      
      const tableMatch = remainingPath.match(/^([^\/]+)\/(\d+)/);
      if (tableMatch) {
        return {
          feature: feature,
          table: tableMatch[1],
          id: tableMatch[2],
          originalPath: relativePath,
          fileName: fileName
        };
      }
    }
    
    // Handle flat structure: detect feature based on folder name or default mapping
    let detectedFeature = 'topic'; // default
    
    // If files are in members folder, map to member feature
    if (relativePath.includes('members') || pathParts[0] === 'members') {
      detectedFeature = 'member';
    }
    
    const fileNameWithoutExt = path.parse(fileName).name;
    
    // Try to extract ID from filename patterns
    let extractedId = null;
    const numberMatch = fileNameWithoutExt.match(/(\d+)/);
    if (numberMatch) {
      extractedId = numberMatch[1];
    } else {
      // Use hash of filename as ID
      extractedId = Math.abs(this.simpleHash(fileNameWithoutExt)).toString();
    }
    
    return {
      feature: detectedFeature,
      table: detectedFeature === 'member' ? 'pinoyphp_users' : detectedFeature,
      id: extractedId,
      originalPath: relativePath,
      fileName: fileName
    };
  }
  
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  async processFiles(featuresToProcess, isTestMode) {
    const fileMap = new Map();
    
    this.logWithTimestamp(`Processing files for features: ${featuresToProcess.join(', ')}`);
    
    const allFiles = await this.getAllFiles(this.config.LOCAL_FOLDER);
    
    // Debug log
    this.logWithTimestamp(`Found ${allFiles.length} total files in source folder`);
    this.logWithTimestamp(`🔍 DEBUG: processFiles called with isTestMode = ${isTestMode}`);
    
    if (isTestMode) {
      this.logWithTimestamp(`🧪 TEST MODE: Will limit to ${this.config.TEST_LIMIT || 10} files`);
    } else {
      this.logWithTimestamp(`🔥 PRODUCTION MODE: Will process all files`);
    }
    
    for (const file of allFiles) {
      const parsed = this.parseFilePath(file.relativePath);
      
      if (!parsed) continue;
      
      // For flat structure, create mappings for all requested features
      const mappings = [];
      
      for (const requestedFeature of featuresToProcess) {
        const featureConfig = this.config.FEATURES[requestedFeature];
        if (!featureConfig) continue;
        
        // For flat structure, map to the main table of each feature
        for (const column of featureConfig.tables.columns) {
          mappings.push({
            feature: requestedFeature,
            table: featureConfig.tables.main,
            column: column,
            id: parsed.id,
            oldPath: parsed.originalPath,
            fileName: parsed.fileName,
            directusId: null,
            fileSize: file.size
          });
        }
      }
      
      if (mappings.length > 0) {
        if (fileMap.has(file.fullPath)) {
          fileMap.get(file.fullPath).push(...mappings);
        } else {
          fileMap.set(file.fullPath, mappings);
        }
      }
    }
    
    this.logWithTimestamp(`Created mappings for ${fileMap.size} files`);
    
    // Apply test mode limit AFTER creating all mappings
    if (isTestMode) {
      const testLimit = this.config.TEST_LIMIT || 10; // Fallback to 10 if not set
      const limitedMap = new Map();
      let count = 0;
      
      for (const [filePath, mappings] of fileMap) {
        if (count >= testLimit) break;
        limitedMap.set(filePath, mappings);
        count++;
      }
      
      this.logWithTimestamp(`🧪 TEST MODE: Limited to ${limitedMap.size} files (out of ${fileMap.size} total)`);
      this.logWithTimestamp(`🧪 TEST MODE: Will use SIMULATED uploads only`);
      return limitedMap;
    }
    
    this.logWithTimestamp(`🔥 PRODUCTION MODE: Will process all ${fileMap.size} files with REAL uploads`);
    return fileMap;
  }

  async uploadFileToDirectus(filePath, fileName, isTestMode = false) {
    // In test mode, simulate upload without actually uploading
    if (isTestMode) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate upload time
      
      // Simulate some failures for realistic testing
      const shouldFail = Math.random() < 0.1; // 10% failure rate
      
      if (shouldFail) {
        return {
          success: false,
          error: 'Simulated failure (test mode)'
        };
      }
      
      return {
        success: true,
        directusId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: `test_${fileName}`
      };
    }

    return new Promise((resolve) => {
      const form = new FormData();
      const fileStream = require('fs').createReadStream(filePath);
      
      form.append('folder', this.config.MIGRATE_FOLDER_ID);
      form.append('file', fileStream, fileName);
      
      const options = {
        hostname: new URL(this.config.DIRECTUS_URL).hostname,
        port: new URL(this.config.DIRECTUS_URL).port || 443,
        path: '/files',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.ACCESS_TOKEN}`,
          ...form.getHeaders()
        },
        agent: this.config.httpsAgent,
        timeout: this.config.TIMEOUT
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200 || res.statusCode === 201) {
              const response = JSON.parse(data);
              resolve({
                success: true,
                directusId: response.data.id,
                filename: response.data.filename_download
              });
            } else if (res.statusCode === 401) {
              resolve({
                success: false,
                error: `🚨 TOKEN EXPIRED: Authentication failed (401). Please update ACCESS_TOKEN in config.js`,
                isTokenExpired: true
              });
            } else if (res.statusCode === 403) {
              resolve({
                success: false,
                error: `🚨 TOKEN INVALID: Access forbidden (403). Please check ACCESS_TOKEN permissions`,
                isTokenExpired: true
              });
            } else {
              resolve({
                success: false,
                error: `HTTP ${res.statusCode}: ${data}`
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: `Parse error: ${error.message}`
            });
          }
        });
      });
      
      req.on('error', (error) => {
        resolve({
          success: false,
          error: `Request error: ${error.message}`
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Request timeout'
        });
      });
      
      form.pipe(req);
    });
  }

  async moveFile(source, destination) {
    try {
      const destDir = path.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });
      await fs.rename(source, destination);
      return true;
    } catch (error) {
      this.logWithTimestamp(`Failed to move file ${source}: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async processBatch(batch, batchNumber, totalBatches, isTestMode) {
    const startTime = performance.now();
    this.logWithTimestamp(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)${isTestMode ? ' [TEST MODE]' : ''}`);
    
    const batchResults = {
      batchNumber,
      totalFiles: batch.length,
      successful: 0,
      failed: 0,
      files: [],
      startTime: startTime,
      largeFiles: [],
      errors: {}
    };
    
    for (let i = 0; i < batch.length; i++) {
      const [filePath, mappings] = batch[i];
      const fileName = path.basename(filePath);
      const fileSize = mappings[0]?.fileSize || 0;
      const fileSizeFormatted = formatBytes(fileSize); // Use standalone function
      const sizeWarning = getFileSizeWarning(fileSize); // Use standalone function
      
      try {
        const prefix = isTestMode ? '[SIMULATED] ' : '';
        const sizeInfo = sizeWarning ? ` ${sizeWarning} (${fileSizeFormatted})` : ` (${fileSizeFormatted})`;
        this.logWithTimestamp(`${prefix}📤 Uploading ${fileName}${sizeInfo} (${i + 1}/${batch.length})`);
        
        // Check if file is too large
        if (!isTestMode && isFileTooLarge(fileSize)) { // Use standalone function
          this.logWithTimestamp(`⚠️ Warning: ${fileName} is ${fileSizeFormatted} - may fail due to size limit`, 'WARN');
          batchResults.largeFiles.push({ fileName, size: fileSizeFormatted });
        }
        
        const result = await this.uploadFileToDirectus(filePath, fileName, isTestMode);
        
        if (result.success) {
          mappings.forEach(mapping => {
            mapping.directusId = result.directusId;
          });
          
          this.uploadedFiles.push({
            originalPath: filePath,
            directusId: result.directusId,
            filename: result.filename,
            mappings: mappings,
            fileSize: fileSize
          });
          
          if (this.config.AUTO_MOVE_FILES && !isTestMode) {
            const processedPath = path.join(this.config.PROCESSED_FOLDER, fileName);
            await this.moveFile(filePath, processedPath);
          }
          
          batchResults.successful++;
          const testPrefix = isTestMode ? '[SIMULATED] ' : '';
          this.logWithTimestamp(`${testPrefix}✅ Successfully uploaded: ${fileName} (ID: ${result.directusId})`);
        } else {
          this.failedFiles.push({
            path: filePath,
            error: result.error,
            mappings: mappings,
            fileSize: fileSize,
            fileName: fileName
          });
          
          // Categorize errors
          let errorCategory = 'Other';
          if (result.error.includes('413') || result.error.includes('Too Large')) {
            errorCategory = 'File Too Large';
            this.logWithTimestamp(`🚨 File size issue: ${fileName} (${fileSizeFormatted}) - Server rejected large file`, 'ERROR');
          } else if (result.error.includes('timeout')) {
            errorCategory = 'Timeout';
          } else if (result.error.includes('401') || result.error.includes('403')) {
            errorCategory = 'Authentication';
          }
          
          if (!batchResults.errors[errorCategory]) {
            batchResults.errors[errorCategory] = 0;
          }
          batchResults.errors[errorCategory]++;
          
          if (this.config.AUTO_MOVE_FILES && !isTestMode) {
            const failedPath = path.join(this.config.FAILED_FOLDER, fileName);
            await this.moveFile(filePath, failedPath);
          }
          
          batchResults.failed++;
          const testPrefix = isTestMode ? '[SIMULATED] ' : '';
          this.logWithTimestamp(`${testPrefix}❌ Failed to upload: ${fileName} (${fileSizeFormatted}) - ${result.error}`, 'ERROR');
        }
        
        batchResults.files.push({
          fileName,
          fileSize: fileSizeFormatted,
          success: result.success,
          error: result.error || null,
          directusId: result.directusId || null
        });
        
        // Wait between files
        if (i < batch.length - 1) {
          const waitTime = isTestMode ? 100 : this.config.PRODUCTION_WAIT_TIME;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
      } catch (error) {
        const testPrefix = isTestMode ? '[SIMULATED] ' : '';
        this.logWithTimestamp(`${testPrefix}💥 Error processing ${fileName} (${formatBytes(fileSize)}): ${error.message}`, 'ERROR');
        batchResults.failed++;
        
        batchResults.files.push({
          fileName,
          fileSize: formatBytes(fileSize),
          success: false,
          error: error.message,
          directusId: null
        });
      }
    }
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    batchResults.endTime = endTime;
    batchResults.duration = duration;
    
    // Detailed batch summary
    const testSuffix = isTestMode ? ' [SIMULATED]' : '';
    const successRate = batchResults.totalFiles > 0 ? ((batchResults.successful / batchResults.totalFiles) * 100).toFixed(1) : '0.0';
    
    this.logWithTimestamp(`\n📊 Batch ${batchNumber} Summary${testSuffix}:`);
    this.logWithTimestamp(`   ✅ Successful: ${batchResults.successful}/${batchResults.totalFiles} (${successRate}%)`);
    this.logWithTimestamp(`   ❌ Failed: ${batchResults.failed}/${batchResults.totalFiles}`);
    this.logWithTimestamp(`   ⏱️  Duration: ${formatTime(duration)}`);
    
    // Show error breakdown if any
    if (Object.keys(batchResults.errors).length > 0) {
      this.logWithTimestamp(`   🔍 Error breakdown:`);
      for (const [errorType, count] of Object.entries(batchResults.errors)) {
        this.logWithTimestamp(`      • ${errorType}: ${count} files`);
      }
    }
    
    // Show large files if any
    if (batchResults.largeFiles.length > 0) {
      this.logWithTimestamp(`   📏 Large files in this batch: ${batchResults.largeFiles.length}`);
      batchResults.largeFiles.forEach(file => {
        this.logWithTimestamp(`      • ${file.fileName}: ${file.size}`);
      });
    }
    
    return batchResults;
  }

  async processAllFiles(fileMap, isTestMode) {
    const files = Array.from(fileMap.entries());
    
    // For test mode, files should already be limited in processFiles()
    // But double-check to ensure we don't exceed test limit
    let filesToProcess = files;
    
    if (isTestMode) {
      const testLimit = this.config.TEST_LIMIT || 10;
      filesToProcess = files.slice(0, testLimit);
      this.logWithTimestamp(`🧪 TEST MODE: Final file count: ${filesToProcess.length}/${files.length}`);
    }
    
    const batchSize = this.config.BATCH_SIZE;
    
    // ✅ เพิ่ม: จำกัดจำนวน batches ตาม MAX_BATCHES
    const maxBatches = this.config.MAX_BATCHES || null;
    const maxFilesFromBatchLimit = maxBatches ? maxBatches * batchSize : filesToProcess.length;
    
    if (!isTestMode && maxBatches) {
      filesToProcess = filesToProcess.slice(0, maxFilesFromBatchLimit);
      this.logWithTimestamp(`🚫 LIMITED BY MAX_BATCHES: Processing only ${filesToProcess.length} files (${maxBatches} batches × ${batchSize} files)`);
    }
    
    const totalBatches = Math.ceil(filesToProcess.length / batchSize);
    
    const modeText = isTestMode ? ' [TEST MODE - SIMULATED]' : '';
    this.logWithTimestamp(`Starting upload process${modeText}: ${filesToProcess.length} files in ${totalBatches} batches`);
    
    if (isTestMode) {
      this.logWithTimestamp(`🧪 TEST MODE: Will simulate uploads without actually uploading to server`);
    }
    
    // ✅ เพิ่ม: แสดงข้อมูลการจำกัด
    if (!isTestMode && maxBatches && files.length > maxFilesFromBatchLimit) {
      this.logWithTimestamp(`⚠️  Note: ${files.length - maxFilesFromBatchLimit} files will be processed in subsequent runs`);
      this.logWithTimestamp(`🔄 Run the same command again to continue processing remaining files`);
    }
    
    const allBatchResults = [];
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, filesToProcess.length);
      const batch = filesToProcess.slice(start, end);
      
      const batchResult = await this.processBatch(batch, i + 1, totalBatches, isTestMode);
      allBatchResults.push(batchResult);
      
      this.totalProcessedFiles += batch.length;
      
      // Wait between batches (shorter in test mode)
      if (i < totalBatches - 1) {
        const waitTime = isTestMode ? 1000 : this.config.BATCH_WAIT_TIME; // 1s in test, 5s in production
        this.logWithTimestamp(`⏳ Waiting ${waitTime/1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    return allBatchResults;
  }

  generateSQL(fileMap, featuresToProcess) {
    const queries = {};
    
    for (const feature of featuresToProcess) {
      const featureConfig = this.config.FEATURES[feature];
      if (!featureConfig) continue;
      
      const featureQueries = [];
      const fileMappings = new Map(); // filename -> directus_id
      
      // Collect file mappings
      for (const [filePath, mappings] of fileMap) {
        for (const mapping of mappings) {
          if (mapping.feature !== feature) continue;
          
          const uploadedFile = this.uploadedFiles.find(file => 
            file.originalPath === filePath
          );
          
          if (uploadedFile) {
            fileMappings.set(mapping.fileName, uploadedFile.directusId);
          }
        }
      }
      
      if (fileMappings.size === 0) {
        queries[feature] = [];
        continue;
      }
      
      // Generate SQL based on feature
      if (feature === 'topic') {
        // Topic: UPDATE WHERE pic = 'filename'
        featureQueries.push('-- Topic Migration: Update pic column with new Directus IDs');
        featureQueries.push('-- Format: UPDATE topic SET pic = \'new_id\', is_migrate = 1 WHERE pic = \'old_filename\';');
        featureQueries.push('');
        
        for (const [fileName, directusId] of fileMappings) {
          const flagUpdate = featureConfig.tables.flags && featureConfig.tables.flags.length > 0 
            ? `, ${featureConfig.tables.flags[0]} = 1` 
            : '';
          
          featureQueries.push(
            `UPDATE ${featureConfig.tables.main} SET pic = '${directusId}'${flagUpdate} WHERE pic = '${fileName}';`
          );
        }
        
        featureQueries.push('');
        featureQueries.push('-- Verification query:');
        featureQueries.push(`SELECT COUNT(*) as migrated_records FROM ${featureConfig.tables.main} WHERE ${featureConfig.tables.flags[0]} = 1;`);
        featureQueries.push(`-- Expected result: ${fileMappings.size} records`);
        
      } else if (feature === 'member') {
        // Member: UPDATE WHERE picture1 = 'filename'
        featureQueries.push('-- Member Migration: Update picture1 column with new Directus IDs');
        featureQueries.push('-- Format: UPDATE pinoyphp_users SET picture1 = \'new_id\', is_migrate = 1 WHERE picture1 = \'old_filename\';');
        featureQueries.push('');
        
        for (const [fileName, directusId] of fileMappings) {
          const flagUpdate = featureConfig.tables.flags && featureConfig.tables.flags.length > 0 
            ? `, ${featureConfig.tables.flags[0]} = 1` 
            : '';
          
          featureQueries.push(
            `UPDATE ${featureConfig.tables.main} SET picture1 = '${directusId}'${flagUpdate} WHERE picture1 = '${fileName}';`
          );
        }
        
        featureQueries.push('');
        featureQueries.push('-- Verification query:');
        if (featureConfig.tables.flags && featureConfig.tables.flags.length > 0) {
          featureQueries.push(`SELECT COUNT(*) as migrated_records FROM ${featureConfig.tables.main} WHERE ${featureConfig.tables.flags[0]} = 1;`);
        } else {
          featureQueries.push(`SELECT COUNT(*) as migrated_records FROM ${featureConfig.tables.main} WHERE picture1 LIKE 'test-%' OR picture1 LIKE '%-%-%-%-%';`);
        }
        featureQueries.push(`-- Expected result: ${fileMappings.size} records`);
        
      } else if (feature === 'detail') {
        // Detail: Use file_mapping table approach
        featureQueries.push('-- Detail Migration: Using file_mapping table for better performance');
        featureQueries.push('-- Step 1: Create temporary file_mapping table');
        featureQueries.push('CREATE TEMPORARY TABLE file_mapping (');
        featureQueries.push('  old_filename VARCHAR(255) PRIMARY KEY,');
        featureQueries.push('  new_file_id VARCHAR(255) NOT NULL,');
        featureQueries.push('  INDEX(old_filename)');
        featureQueries.push(');');
        featureQueries.push('');
        
        featureQueries.push('-- Step 2: Insert file mappings');
        featureQueries.push('INSERT INTO file_mapping (old_filename, new_file_id) VALUES');
        
        const mappingValues = Array.from(fileMappings.entries())
          .map(([fileName, directusId]) => `('${fileName}', '${directusId}')`)
          .join(',\n');
        featureQueries.push(mappingValues + ';');
        featureQueries.push('');
        
        featureQueries.push('-- Step 3: Update using JOINs (much faster for large datasets)');
        for (const column of featureConfig.tables.columns) {
          featureQueries.push(`UPDATE ${featureConfig.tables.main} d`);
          featureQueries.push(`JOIN file_mapping fm ON d.${column} = fm.old_filename`);
          featureQueries.push(`SET d.${column} = fm.new_file_id;`);
        }
        
        featureQueries.push('');
        featureQueries.push('-- Step 4: Verification queries');
        for (const column of featureConfig.tables.columns) {
          featureQueries.push(`SELECT COUNT(*) as updated_${column} FROM ${featureConfig.tables.main} d`);
          featureQueries.push(`JOIN file_mapping fm ON d.${column} = fm.new_file_id;`);
        }
        
        featureQueries.push('');
        featureQueries.push('-- Step 5: Cleanup');
        featureQueries.push('DROP TEMPORARY TABLE file_mapping;');
        
      } else {
        // Other features: Default behavior with filename matching
        featureQueries.push(`-- ${feature.charAt(0).toUpperCase() + feature.slice(1)} Migration: Update with filename matching`);
        featureQueries.push('');
        
        for (const [fileName, directusId] of fileMappings) {
          for (const column of featureConfig.tables.columns) {
            const flagUpdate = featureConfig.tables.flags && featureConfig.tables.flags.length > 0 
              ? `, ${featureConfig.tables.flags[0]} = 1` 
              : '';
            
            featureQueries.push(
              `UPDATE ${featureConfig.tables.main} SET ${column} = '${directusId}'${flagUpdate} WHERE ${column} = '${fileName}';`
            );
          }
        }
        
        if (featureConfig.tables.flags && featureConfig.tables.flags.length > 0) {
          featureQueries.push('');
          featureQueries.push('-- Verification query:');
          featureQueries.push(`SELECT COUNT(*) as migrated_records FROM ${featureConfig.tables.main} WHERE ${featureConfig.tables.flags[0]} = 1;`);
          featureQueries.push(`-- Expected result: ${fileMappings.size} records`);
        }
      }
      
      queries[feature] = featureQueries;
    }
    
    return queries;
  }

  async saveResults(fileMap, batchResults, featuresToProcess, isTestMode) {
    const timestamp = new Date().toISOString();
    
    // Save file mapping
    const fileMapData = {
      timestamp,
      features: featuresToProcess,
      totalFiles: fileMap.size,
      uploadedFiles: this.uploadedFiles.length,
      failedFiles: this.failedFiles.length,
      uploadResults: this.uploadedFiles,
      failedResults: this.failedFiles
    };
    
    const prefix = isTestMode ? 'test-' : '';
    
    try {
      await fs.writeFile(`${prefix}filemap.json`, JSON.stringify(fileMapData, null, 2));
      this.logWithTimestamp(`💾 Saved file mapping to ${prefix}filemap.json`);
    } catch (error) {
      this.logWithTimestamp(`❌ Failed to save file mapping: ${error.message}`, 'ERROR');
    }
    
    // Generate and save SQL
    const queries = this.generateSQL(fileMap, featuresToProcess);
    
    for (const [feature, featureQueries] of Object.entries(queries)) {
      if (featureQueries.length > 0) {
        const sqlContent = [
          `-- Generated SQL for ${feature} feature`,
          `-- Generated at: ${timestamp}`,
          `-- Total queries: ${featureQueries.length}`,
          '',
          ...featureQueries,
          ''
        ].join('\n');
        
        try {
          await fs.writeFile(`./feature-queries/${prefix}${feature}-migration.sql`, sqlContent);
          this.logWithTimestamp(`Saved ${featureQueries.length} queries for ${feature}`);
        } catch (error) {
          this.logWithTimestamp(`Failed to save SQL for ${feature}: ${error.message}`, 'ERROR');
        }
      }
    }
  }

  displayFinalSummary(batchResults, featuresToProcess) {
    const endTime = performance.now();
    const totalTime = (endTime - this.startTime) / 1000;
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 MIGRATION COMPLETED');
    console.log('='.repeat(80));
    
    console.log(`📊 Features: ${featuresToProcess.join(', ')}`);
    console.log(`⏱️  Total Time: ${formatTime(totalTime)}`);
    console.log(`📦 Total Batches: ${batchResults.length}`);
    console.log(`📁 Total Files: ${this.totalProcessedFiles}`);
    console.log(`✅ Successful: ${this.uploadedFiles.length}`);
    console.log(`❌ Failed: ${this.failedFiles.length}`);
    
    if (this.totalProcessedFiles > 0) {
      const successRate = ((this.uploadedFiles.length / this.totalProcessedFiles) * 100).toFixed(1);
      console.log(`📈 Success Rate: ${successRate}%`);
    }
    
    // Batch-by-batch summary
    console.log('\n📋 Batch Summary:');
    batchResults.forEach((batch, index) => {
      const successRate = batch.totalFiles > 0 ? ((batch.successful / batch.totalFiles) * 100).toFixed(1) : '0.0';
      console.log(`   Batch ${batch.batchNumber}: ${batch.successful}/${batch.totalFiles} success (${successRate}%) - ${formatTime(batch.duration || 0)}`);
    });
    
    // Error analysis
    if (this.failedFiles.length > 0) {
      console.log('\n❌ Failed Files Analysis:');
      
      // Categorize failures
      const errorCategories = {};
      const largeFiles = [];
      
      this.failedFiles.forEach(file => {
        const fileName = file.fileName || path.basename(file.path);
        const fileSize = file.fileSize ? formatBytes(file.fileSize) : 'Unknown size';
        
        if (file.error.includes('413') || file.error.includes('Too Large')) {
          largeFiles.push({ fileName, size: fileSize });
          errorCategories['File Too Large'] = (errorCategories['File Too Large'] || 0) + 1;
        } else if (file.error.includes('timeout')) {
          errorCategories['Timeout'] = (errorCategories['Timeout'] || 0) + 1;
        } else if (file.error.includes('401') || file.error.includes('403')) {
          errorCategories['Authentication'] = (errorCategories['Authentication'] || 0) + 1;
        } else {
          errorCategories['Other'] = (errorCategories['Other'] || 0) + 1;
        }
      });
      
      // Show error categories
      console.log('   Error Categories:');
      for (const [category, count] of Object.entries(errorCategories)) {
        console.log(`      • ${category}: ${count} files`);
      }
      
      // Show large files specifically
      if (largeFiles.length > 0) {
        console.log('\n🚨 Files too large (>10MB limit):');
        largeFiles.forEach(file => {
          console.log(`      • ${file.fileName}: ${file.size}`);
        });
        console.log('   💡 Tip: Compress these files or increase server upload limit');
      }
      
      // Show first few failed files for reference
      console.log('\n   First few failed files:');
      this.failedFiles.slice(0, 5).forEach(file => {
        const fileName = file.fileName || path.basename(file.path);
        const fileSize = file.fileSize ? formatBytes(file.fileSize) : 'Unknown size';
        console.log(`      • ${fileName} (${fileSize}): ${file.error}`);
      });
      
      if (this.failedFiles.length > 5) {
        console.log(`      ... and ${this.failedFiles.length - 5} more`);
      }
    }
    
    // File size analysis
    if (this.uploadedFiles.length > 0) {
      const fileSizes = this.uploadedFiles.map(f => f.fileSize || 0);
      const totalSize = fileSizes.reduce((sum, size) => sum + size, 0);
      const avgSize = totalSize / fileSizes.length;
      const maxSize = Math.max(...fileSizes);
      
      console.log('\n📊 File Size Statistics:');
      console.log(`   Total uploaded: ${formatBytes(totalSize)}`);
      console.log(`   Average size: ${formatBytes(avgSize)}`);
      console.log(`   Largest file: ${formatBytes(maxSize)}`);
    }
    
    console.log('\n📁 Output Files:');
    console.log(`   • File mappings: ${this.isTestMode ? 'test-' : ''}filemap.json`);
    console.log(`   • SQL queries: ./feature-queries/${this.isTestMode ? 'test-' : ''}*-migration.sql`);
    
    console.log('\n' + '='.repeat(80));
  }

  // Main migration method
  async migrate(feature, options = {}) {
    try {
      this.startTime = performance.now();
      this.isTestMode = Boolean(options.test);
      
      // Get features to process
      const featuresToProcess = this.getFeaturesToProcess(feature);
      
      this.logWithTimestamp(`🚀 Starting migration for: ${featuresToProcess.join(', ')}`);
      
      if (this.isTestMode) {
        console.log(`🧪 TEST MODE: Limited to ${this.config.TEST_LIMIT} files`);
        console.log(`🧪 TEST MODE: Will simulate uploads without actually uploading to server`);
      }
      
      // Create directories
      await this.createDirectories();
      
      // Process files
      this.logWithTimestamp('📁 Scanning files...');
      const fileMap = await this.processFiles(featuresToProcess, this.isTestMode);
      
      if (fileMap.size === 0) {
        this.logWithTimestamp('❌ No files found to process');
        return {
          success: false,
          message: 'No files found to process',
          stats: { totalFiles: 0, successful: 0, failed: 0 }
        };
      }
      
      // Upload files
      const batchResults = await this.processAllFiles(fileMap, this.isTestMode);
      
      // Save results
      await this.saveResults(fileMap, batchResults, featuresToProcess, this.isTestMode);
      
      // Display summary
      this.displayFinalSummary(batchResults, featuresToProcess);
      
      return {
        success: true,
        message: 'Migration completed successfully',
        stats: {
          totalFiles: this.totalProcessedFiles,
          successful: this.uploadedFiles.length,
          failed: this.failedFiles.length,
          successRate: this.totalProcessedFiles > 0 ? 
            ((this.uploadedFiles.length / this.totalProcessedFiles) * 100).toFixed(1) : '0.0'
        },
        features: featuresToProcess,
        batchResults: batchResults
      };
      
    } catch (error) {
      this.logWithTimestamp(`💥 Migration failed: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // Compatibility method for batch-migrate.js
  async migrateImages(options = {}) {
    const feature = options.feature || 'topic';
    
    // Detect test mode from command line arguments if not provided in options
    let isTestMode = Boolean(options.test);
    
    // Check command line arguments for --test flag
    const args = process.argv;
    if (args.includes('--test') || args.includes('test')) {
      isTestMode = true;
    }
    
    // Ensure test mode is properly passed through
    const migrationOptions = {
      test: isTestMode
    };
    
    return await this.migrate(feature, migrationOptions);
  }
}

module.exports = DirectusMigrator;