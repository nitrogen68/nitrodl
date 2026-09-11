const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { getApi } = require('./api');
const { downloadFile, sanitizeFragment, sanitizeExtension } = require('../utils/download');

async function downloadPinterest(url, basePath = 'resultdownload_preniv') {
  const spinner = ora(' Fetching Pinterest media data...').start();
  
  try {
    const response = await axios.get(`${getApi.pinterest}${encodeURIComponent(url)}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36'
      }
    });
    const data = response.data;

    if (!data || !data.success) {
      spinner.fail(chalk.red(' Failed to fetch Pinterest media data'));
      console.log(chalk.gray('   • The API returned an error or invalid response'));
      return;
    }
    if (!data.data || !data.data.downloads || data.data.downloads.length === 0) {
      spinner.fail(chalk.red(' Invalid media data received'));
      console.log(chalk.gray('   • The pin may be unavailable or deleted'));
      return;
    }

    spinner.succeed(chalk.green(' Pinterest media data fetched successfully!'));
    console.log('');
    console.log(chalk.cyan(' Pin Information:'));
    if (data.data.title && data.data.title.trim()) {
      console.log(chalk.gray('   • ') + chalk.white(`Title: ${data.data.title}`));
    }
    console.log(chalk.gray('   • ') + chalk.white(`Found ${data.data.downloads.length} download option(s)`));
    console.log('');

    if (data.data.downloads.length === 1) {
      const media = data.data.downloads[0];
      const downloadSpinner = ora(' Downloading media...').start();
      const extension = sanitizeExtension(media.format);
      const filename = `pinterest_${Date.now()}.${extension}`;
      await downloadFile(media.url, filename, downloadSpinner, basePath);
    } else {
      const downloadChoices = data.data.downloads.map((media) => ({
        name: ` ${media.quality} - ${media.format}`,
        value: media
      }));
      
      downloadChoices.push({
        name: ' Download All Qualities',
        value: 'all'
      });
      downloadChoices.push({
        name: chalk.gray(' Cancel'),
        value: 'cancel'
      });

      const { selectedDownload } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedDownload',
          message: 'Select quality to download:',
          choices: downloadChoices
        }
      ]);

      if (selectedDownload === 'cancel') {
        console.log(chalk.yellow('\n Download cancelled.'));
        return;
      }

      if (selectedDownload === 'all') {
        for (let i = 0; i < data.data.downloads.length; i++) {
          const media = data.data.downloads[i];
          const downloadSpinner = ora(` Downloading ${media.quality} (${i + 1}/${data.data.downloads.length})...`).start();
          const extension = sanitizeExtension(media.format);
          const safeQuality = sanitizeFragment(media.quality, 'default');
          const filename = `pinterest_${safeQuality}_${Date.now()}.${extension}`;
          await downloadFile(media.url, filename, downloadSpinner, basePath);
        }
      } else {
        const downloadSpinner = ora(' Downloading selected media...').start();
        const extension = sanitizeExtension(selectedDownload.format);
        const safeQuality = sanitizeFragment(selectedDownload.quality, 'default');
        const filename = `pinterest_${safeQuality}_${Date.now()}.${extension}`;
        await downloadFile(selectedDownload.url, filename, downloadSpinner, basePath);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(' Error fetching Pinterest media'));
    if (error.code === 'ECONNABORTED') {
      console.log(chalk.gray(' • Request timeout - please try again'));
    } else if (error.response) {
      console.log(chalk.gray(` • API Error: ${error.response.status}`));
    } else if (error.request) {
      console.log(chalk.gray(' • Network error - please check your connection'));
    } else {
      console.log(chalk.gray(` • ${error.message}`));
    }
  }
}

module.exports = { downloadPinterest };
