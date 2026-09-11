const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { getApi, normalizer } = require('./api');
const { downloadFile, MAX_FILE_SIZE, sanitizeExtension } = require('../utils/download');

async function downloadSpotify(url, basePath = 'resultdownload_preniv') {
  const spinner = ora(' Fetching Spotify track data...').start();
  
  try {
    const response = await axios.get(`${getApi.spotify}${encodeURIComponent(url)}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36'
      }
    });
    const rawData = response.data;

    if (!rawData || !rawData.status) {
      spinner.fail(chalk.red(' Failed to fetch Spotify track data'));
      console.log(chalk.gray('   • The API returned an error or invalid response'));
      return;
    }

    const data = normalizer.normalizeSpotify(rawData.data, 'primary');

    if (!data.downloads || data.downloads.length === 0) {
      spinner.fail(chalk.red(' Invalid track data received'));
      console.log(chalk.gray('   • The track may be unavailable'));
      return;
    }

    spinner.succeed(chalk.green(' Spotify track data fetched successfully!'));
    console.log('');
    console.log(chalk.cyan(' Track Information:'));
    console.log(chalk.gray('   • ') + chalk.white(`Title: ${data.title || 'No title'}`));
    console.log(chalk.gray('   • ') + chalk.white(`Artist: ${data.author || 'Unknown artist'}`));
    if (data.duration) {
      console.log(chalk.gray('   • ') + chalk.white(`Duration: ${Math.floor(data.duration / 1000)}s`));
    }
    if (data.album) {
      console.log(chalk.gray('   • ') + chalk.white(`Album: ${data.album}`));
    }
    console.log('');

    const downloadChoices = data.downloads.map((download, index) => ({
      name: ` ${download.quality} - ${download.format.toUpperCase()}`,
      value: { url: download.url, type: 'audio', format: download.format, quality: download.quality, index }
    }));

    if (data.thumbnail) {
      downloadChoices.push({
        name: ' Download Cover Image',
        value: { url: data.thumbnail, type: 'image', format: 'jpg' }
      });
    }

    downloadChoices.push({
      name: chalk.gray(' Cancel'),
      value: 'cancel'
    });

    const { selectedDownload } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedDownload',
        message: 'Select download option:',
        choices: downloadChoices
      }
    ]);

    if (selectedDownload === 'cancel') {
      console.log(chalk.yellow('\n Download cancelled.'));
      return;
    }

    const downloadSpinner = ora(` Downloading ${selectedDownload.type}...`).start();
    const extension = sanitizeExtension(selectedDownload.format, selectedDownload.type === 'audio' ? 'mp3' : 'jpg');
    const safeTitle = (data.title || 'spotify_track').replace(/[<>:"/\\|?*]/g, '').substring(0, 50).trim() || 'spotify_track';
    const filename = `${safeTitle}_${selectedDownload.type}_${Date.now()}.${extension}`;
    const maxSize = selectedDownload.type === 'audio' ? MAX_FILE_SIZE : null;
    await downloadFile(selectedDownload.url, filename, downloadSpinner, basePath, maxSize);
    
  } catch (error) {
    spinner.fail(chalk.red(' Error fetching Spotify track'));
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

module.exports = { downloadSpotify };
