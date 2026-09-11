const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const MAX_FILE_SIZE = 35 * 1024 * 1024; // 35 MB in bytes

const SAFE_EXT_WHITELIST = new Set(['mp4', 'mp3', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'm4a', 'webm', 'mov', 'avi']);

function sanitizeFragment(value, fallback = 'file') {
  const cleaned = String(value == null ? '' : value)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .substring(0, 80)
    .trim();
  return cleaned || fallback;
}

function sanitizeExtension(value, fallback = 'mp4') {
  const cleaned = String(value == null ? '' : value)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .substring(0, 10);
  if (cleaned && SAFE_EXT_WHITELIST.has(cleaned)) {
    return cleaned;
  }
  return fallback;
}

function getFileExtension(url, defaultExt = 'mp4') {
  try {
    const tokenMatch = url.match(/token=([^&]+)/);
    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1];
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = parts[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        if (decoded.filename && typeof decoded.filename === 'string') {
          const ext = decoded.filename.split('.').pop().toLowerCase();
          if (ext) {
            return sanitizeExtension(ext, defaultExt);
          }
        }
      }
    }
  } catch (error) {
  }
  return sanitizeExtension(defaultExt, 'mp4');
}

async function checkFileSize(url) {
  try {
    const response = await axios.head(url, { timeout: 10000 });
    const contentLength = parseInt(response.headers['content-length'], 10);
    return {
      size: contentLength,
      sizeInMB: (contentLength / (1024 * 1024)).toFixed(2),
      exceedsLimit: contentLength > MAX_FILE_SIZE
    };
  } catch (error) {
    return null;
  }
}

async function downloadFile(url, filename, spinner, basePath = 'resultdownload_preniv', maxSize = null) {
  try {
    if (maxSize) {
      const sizeInfo = await checkFileSize(url);
      if (sizeInfo && sizeInfo.exceedsLimit) {
        spinner.fail(chalk.red(`File size (${sizeInfo.sizeInMB} MB) exceeds maximum limit of ${maxSize / (1024 * 1024)} MB`));
        console.log(chalk.gray('   • This file is too large to download'));
        return null;
      }
      if (sizeInfo) {
        spinner.text = ` Downloading (${sizeInfo.sizeInMB} MB)...`;
      }
    }

    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
    const fullPath = path.join(basePath, filename);

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(fullPath);
    let received = 0;

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        spinner.succeed(chalk.green(`Downloaded: ${fullPath}`));
        resolve(fullPath);
      });
      writer.on('error', (error) => {
        try {
          response.data.destroy();
        } catch (destroyError) {
        }
        try {
          fs.unlinkSync(fullPath);
        } catch (cleanupError) {
        }
        reject(error);
      });
      if (maxSize) {
        response.data.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxSize) {
            writer.destroy(new Error(`File size exceeds maximum limit of ${maxSize / (1024 * 1024)} MB`));
          }
        });
      }
    });
  } catch (error) {
    spinner.fail(chalk.red('Failed to download'));
    throw error;
  }
}

module.exports = {
  downloadFile,
  checkFileSize,
  getFileExtension,
  sanitizeFragment,
  sanitizeExtension,
  MAX_FILE_SIZE
};