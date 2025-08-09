const fs = require('fs').promises;
const path = require('path');
const { config, getOutputFiles } = require('./config');

/**
 * ตรวจสอบว่า folder มีอยู่หรือไม่
 * @param {string} folderPath - path ของ folder
 * @returns {boolean} มี folder หรือไม่
 */
async function checkFolderExists(folderPath) {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * สร้าง folder ถ้ายังไม่มี
 * @param {string} folderPath - path ของ folder
 * @returns {boolean} สำเร็จหรือไม่
 */
async function ensureFolderExists(folderPath) {
  try {
    const exists = await checkFolderExists(folderPath);
    if (!exists) {
      await fs.mkdir(folderPath, { recursive: true });
      console.log(`📁 Created folder: ${folderPath}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Error creating folder ${folderPath}:`, error.message);
    return false;
  }
}

/**
 * ย้ายไฟล์จาก source ไปยัง destination
 * @param {string} sourcePath - path ต้นทาง
 * @param {string} destinationPath - path ปลายทาง
 * @returns {boolean} สำเร็จหรือไม่
 */
async function moveFile(sourcePath, destinationPath) {
  try {
    // ตรวจสอบว่า destination folder มีอยู่หรือไม่
    const destDir = path.dirname(destinationPath);
    await ensureFolderExists(destDir);
    
    // ย้ายไฟล์
    await fs.rename(sourcePath, destinationPath);
    return true;
  } catch (error) {
    console.error(`❌ Error moving file ${sourcePath} to ${destinationPath}:`, error.message);
    return false;
  }
}

/**
 * คัดลอกไฟล์จาก source ไปยัง destination
 * @param {string} sourcePath - path ต้นทาง
 * @param {string} destinationPath - path ปลายทาง
 * @returns {boolean} สำเร็จหรือไม่
 */
async function copyFile(sourcePath, destinationPath) {
  try {
    // ตรวจสอบว่า destination folder มีอยู่หรือไม่
    const destDir = path.dirname(destinationPath);
    await ensureFolderExists(destDir);
    
    // คัดลอกไฟล์
    await fs.copyFile(sourcePath, destinationPath);
    return true;
  } catch (error) {
    console.error(`❌ Error copying file ${sourcePath} to ${destinationPath}:`, error.message);
    return false;
  }
}

/**
 * ย้ายไฟล์ที่ประมวลผลแล้วไปยัง folder ที่เหมาะสม
 * @param {Object} result - ผลลัพธ์การ upload
 * @param {string} sourceFolderPath - path ของ folder ต้นทาง
 * @returns {Object} ผลลัพธ์การย้าย
 */
async function moveProcessedFile(result, sourceFolderPath) {
  const sourceFilePath = path.join(sourceFolderPath, result.localFile);
  
  let targetFolder;
  let targetFilePath;
  
  if (result.success) {
    targetFolder = config.PROCESSED_FOLDER;
    targetFilePath = path.join(targetFolder, result.localFile);
  } else {
    targetFolder = config.FAILED_FOLDER;
    targetFilePath = path.join(targetFolder, result.localFile);
  }
  
  const moved = await moveFile(sourceFilePath, targetFilePath);
  
  return {
    moved,
    targetFolder,
    targetFilePath,
    originalPath: sourceFilePath
  };
}

/**
 * ย้ายไฟล์ที่ประมวลผลแล้วไปยัง folder ที่เหมาะสม (สำหรับ test mode - ใช้ copy แทน move)
 * @param {Object} result - ผลลัพธ์การ upload
 * @param {string} sourceFolderPath - path ของ folder ต้นทาง
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {Object} ผลลัพธ์การย้าย
 */
async function processFileAfterUpload(result, sourceFolderPath, isTestMode = false) {
  const sourceFilePath = path.join(sourceFolderPath, result.localFile);
  
  let targetFolder;
  let targetFilePath;
  
  if (result.success) {
    targetFolder = config.PROCESSED_FOLDER;
    targetFilePath = path.join(targetFolder, result.localFile);
  } else {
    targetFolder = config.FAILED_FOLDER;
    targetFilePath = path.join(targetFolder, result.localFile);
  }
  
  let moved = false;
  
  if (isTestMode) {
    // ในโหมดทดสอบให้ copy แทน move เพื่อไม่ให้ไฟล์หายไป
    moved = await copyFile(sourceFilePath, targetFilePath);
  } else {
    // ในโหมด production ให้ move ไฟล์
    moved = await moveFile(sourceFilePath, targetFilePath);
  }
  
  return {
    moved,
    targetFolder,
    targetFilePath,
    originalPath: sourceFilePath,
    action: isTestMode ? 'copied' : 'moved'
  };
}

/**
 * ดึงรายการไฟล์รูปภาพจาก folder
 * @param {string} folderPath - path ของ folder
 * @param {number|null} limit - จำกัดจำนวนไฟล์
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {Array} รายการไฟล์รูปภาพ
 */
async function getImageFiles(folderPath, limit = null, isTestMode = false) {
  try {
    const files = await fs.readdir(folderPath);
    const imageFiles = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (config.IMAGE_EXTENSIONS.includes(ext)) {
          imageFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            extension: ext
          });
        }
      }
    }

    // เรียงตามชื่อไฟล์
    imageFiles.sort((a, b) => a.name.localeCompare(b.name));

    const totalFound = imageFiles.length;
    const finalFiles = limit ? imageFiles.slice(0, limit) : imageFiles;

    if (isTestMode) {
      console.log(`📷 Found ${totalFound} image files in ${folderPath}`);
      if (limit && totalFound > limit) {
        console.log(`📊 Limited to first ${limit} files for testing`);
      }
    } else {
      console.log(`📷 Found ${totalFound} image files`);
    }

    return finalFiles;
  } catch (error) {
    console.error('❌ Error reading image files:', error.message);
    return [];
  }
}

/**
 * อ่านไฟล์เป็น buffer
 * @param {string} filePath - path ของไฟล์
 * @returns {Buffer} ข้อมูลไฟล์
 */
async function readFileBuffer(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * อ่านไฟล์เป็น text
 * @param {string} filePath - path ของไฟล์
 * @param {string} encoding - encoding ของไฟล์ (default: utf8)
 * @returns {string} เนื้อหาไฟล์
 */
async function readFileText(filePath, encoding = 'utf8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (error) {
    console.error(`❌ Error reading text file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * เขียนไฟล์ text
 * @param {string} filePath - path ของไฟล์
 * @param {string} content - เนื้อหาที่ต้องการเขียน
 * @param {string} encoding - encoding ของไฟล์ (default: utf8)
 * @returns {boolean} สำเร็จหรือไม่
 */
async function writeFileText(filePath, content, encoding = 'utf8') {
  try {
    // ตรวจสอบว่า directory มีอยู่หรือไม่
    const dir = path.dirname(filePath);
    await ensureFolderExists(dir);
    
    await fs.writeFile(filePath, content, encoding);
    return true;
  } catch (error) {
    console.error(`❌ Error writing file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * สร้างไฟล์ mapping JSON
 * @param {Array} successfulResults - รายการผลลัพธ์ที่สำเร็จ
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {Array} ข้อมูล mapping
 */
async function createFileMapping(successfulResults, isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  
  const mapping = successfulResults.map(result => ({
    localFile: result.localFile,
    directusId: result.directusId,
    directusUrl: result.directusUrl,
    uploadedAt: result.uploadedAt || new Date().toISOString(),
    migrationMode: isTestMode ? 'test' : 'production',
    feature: result.feature || 'unknown',
    fileSize: result.fileData?.filesize || 0,
    mimeType: result.fileData?.type || 'unknown'
  }));

  try {
    await fs.writeFile(outputFiles.FILEMAP, JSON.stringify(mapping, null, 2));
    console.log('📄 File mapping saved to: ' + outputFiles.FILEMAP);
    console.log('📊 File mapping saved with ' + mapping.length + ' entries (REAL IDs)');
    
    // แสดงตัวอย่างการ mapping
    if (mapping.length > 0) {
      const sampleCount = Math.min(2, mapping.length);
      console.log('📄 Sample mappings:');
      for (let i = 0; i < sampleCount; i++) {
        const sample = mapping[i];
        console.log('   - ' + sample.localFile + ' → ' + sample.directusId);
      }
    }
    
    return mapping;
  } catch (error) {
    console.error('❌ Error saving file mapping:', error.message);
    return mapping;
  }
}

/**
 * โหลด file mapping จากไฟล์
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {Array} รายการ file mapping
 */
async function loadFileMapping(isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  
  try {
    const data = await fs.readFile(outputFiles.FILEMAP, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return []; // ไฟล์ไม่มี หรือ parse ไม่ได้
  }
}

/**
 * บันทึก batch log
 * @param {Object} batchData - ข้อมูล batch
 * @param {boolean} isTestMode - โหมดทดสอบ
 */
async function saveBatchLog(batchData, isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  
  try {
    // โหลด log เดิม (ถ้ามี)
    let existingLog = [];
    try {
      const existingData = await fs.readFile(outputFiles.BATCH_LOG, 'utf8');
      existingLog = JSON.parse(existingData);
    } catch (error) {
      // ไฟล์ไม่มี หรือ parse ไม่ได้
    }
    
    // เพิ่ม batch ใหม่
    existingLog.push(batchData);
    
    // บันทึกไฟล์
    await fs.writeFile(outputFiles.BATCH_LOG, JSON.stringify(existingLog, null, 2));
    console.log(`📊 Batch log saved to: ${outputFiles.BATCH_LOG}`);
    
  } catch (error) {
    console.error('❌ Error saving batch log:', error.message);
  }
}

/**
 * โหลด batch log
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {Array} รายการ batch log
 */
async function loadBatchLog(isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  
  try {
    const data = await fs.readFile(outputFiles.BATCH_LOG, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return []; // ไฟล์ไม่มี หรือ parse ไม่ได้
  }
}

/**
 * นับจำนวน batch ที่ทำแล้ว
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {number} จำนวน batch
 */
async function getCompletedBatchCount(isTestMode = false) {
  const log = await loadBatchLog(isTestMode);
  return log.filter(batch => batch.status === 'completed').length;
}

/**
 * ล้าง batch log
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {boolean} สำเร็จหรือไม่
 */
async function clearBatchLog(isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  
  try {
    await fs.writeFile(outputFiles.BATCH_LOG, JSON.stringify([], null, 2));
    console.log(`🗑️  Cleared batch log: ${outputFiles.BATCH_LOG}`);
    return true;
  } catch (error) {
    console.error('❌ Error clearing batch log:', error.message);
    return false;
  }
}

/**
 * ตรวจสอบและสร้าง folders ที่จำเป็น
 */
async function setupRequiredFolders() {
  const folders = [
    config.PROCESSED_FOLDER,
    config.FAILED_FOLDER
  ];
  
  console.log('📁 Setting up required folders...');
  
  for (const folder of folders) {
    const success = await ensureFolderExists(folder);
    if (!success) {
      console.error(`💥 Failed to create folder: ${folder}`);
      return false;
    }
  }
  
  console.log('✅ All required folders are ready');
  return true;
}

/**
 * ตรวจสอบพื้นที่ว่างของ disk
 * @param {string} folderPath - path ที่ต้องการตรวจสอบ
 * @returns {Object} ข้อมูลพื้นที่ disk
 */
async function checkDiskSpace(folderPath) {
  try {
    const stats = await fs.stat(folderPath);
    // Note: Node.js ไม่มี built-in method สำหรับดู disk space
    // ต้องใช้ external library หรือ OS command
    return {
      available: true,
      path: folderPath,
      note: 'Disk space check requires additional implementation'
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * นับจำนวนไฟล์ในแต่ละ folder
 * @returns {Object} สถิติไฟล์
 */
async function getFileStatistics() {
  const stats = {
    source: 0,
    processed: 0,
    failed: 0,
    total: 0
  };
  
  try {
    // นับไฟล์ใน source folder
    if (await checkFolderExists(config.LOCAL_FOLDER)) {
      const sourceFiles = await getImageFiles(config.LOCAL_FOLDER);
      stats.source = sourceFiles.length;
    }
    
    // นับไฟล์ใน processed folder
    if (await checkFolderExists(config.PROCESSED_FOLDER)) {
      const processedFiles = await fs.readdir(config.PROCESSED_FOLDER);
      stats.processed = processedFiles.length;
    }
    
    // นับไฟล์ใน failed folder
    if (await checkFolderExists(config.FAILED_FOLDER)) {
      const failedFiles = await fs.readdir(config.FAILED_FOLDER);
      stats.failed = failedFiles.length;
    }
    
    stats.total = stats.source + stats.processed + stats.failed;
    
  } catch (error) {
    console.error('❌ Error getting file statistics:', error.message);
  }
  
  return stats;
}

/**
 * สร้าง backup ของไฟล์สำคัญ
 * @param {boolean} isTestMode - โหมดทดสอบ
 * @returns {boolean} สำเร็จหรือไม่
 */
async function createBackup(isTestMode = false) {
  const outputFiles = getOutputFiles(isTestMode);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `./backups/${timestamp}`;
  
  try {
    await ensureFolderExists(backupDir);
    
    const filesToBackup = [
      outputFiles.FILEMAP,
      outputFiles.BATCH_LOG
    ];
    
    for (const file of filesToBackup) {
      try {
        const exists = await fs.access(file).then(() => true).catch(() => false);
        if (exists) {
          const fileName = path.basename(file);
          const backupPath = path.join(backupDir, fileName);
          await copyFile(file, backupPath);
          console.log(`📋 Backed up: ${file} → ${backupPath}`);
        }
      } catch (error) {
        // Skip files that don't exist
      }
    }
    
    console.log(`✅ Backup created in: ${backupDir}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error creating backup:', error.message);
    return false;
  }
}

/**
 * ล้างไฟล์ temporary และ backup เก่า
 * @param {number} daysOld - ลบไฟล์ที่เก่ากว่า n วัน
 * @returns {boolean} สำเร็จหรือไม่
 */
async function cleanupOldFiles(daysOld = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const backupDir = './backups';
    
    if (await checkFolderExists(backupDir)) {
      const backupFolders = await fs.readdir(backupDir);
      
      for (const folder of backupFolders) {
        const folderPath = path.join(backupDir, folder);
        const stats = await fs.stat(folderPath);
        
        if (stats.isDirectory() && stats.mtime < cutoffDate) {
          await fs.rmdir(folderPath, { recursive: true });
          console.log(`🗑️  Removed old backup: ${folderPath}`);
        }
      }
    }
    
    console.log(`✅ Cleanup completed (removed files older than ${daysOld} days)`);
    return true;
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    return false;
  }
}

/**
 * ตรวจสอบสถานะของระบบ
 * @returns {Object} สถานะระบบ
 */
async function getSystemStatus() {
  const status = {
    folders: {},
    files: {},
    config: {},
    timestamp: new Date().toISOString()
  };
  
  // ตรวจสอบ folders
  status.folders.source = await checkFolderExists(config.LOCAL_FOLDER);
  status.folders.processed = await checkFolderExists(config.PROCESSED_FOLDER);
  status.folders.failed = await checkFolderExists(config.FAILED_FOLDER);
  
  // สถิติไฟล์
  status.files = await getFileStatistics();
  
  // ข้อมูล config
  status.config.batchSize = config.BATCH_SIZE;
  status.config.maxBatches = config.MAX_BATCHES;
  status.config.autoMoveFiles = config.AUTO_MOVE_FILES;
  status.config.imageExtensions = config.IMAGE_EXTENSIONS.length;
  
  return status;
}

module.exports = {
  // Folder operations
  checkFolderExists,
  ensureFolderExists,
  setupRequiredFolders,
  
  // File operations
  moveFile,
  copyFile,
  moveProcessedFile,
  processFileAfterUpload,
  readFileBuffer,
  readFileText,
  writeFileText,
  
  // Image file operations
  getImageFiles,
  
  // File mapping operations
  createFileMapping,
  loadFileMapping,
  
  // Batch log operations
  saveBatchLog,
  loadBatchLog,
  getCompletedBatchCount,
  clearBatchLog,
  
  // Statistics and monitoring
  getFileStatistics,
  checkDiskSpace,
  getSystemStatus,
  
  // Backup and cleanup
  createBackup,
  cleanupOldFiles
};