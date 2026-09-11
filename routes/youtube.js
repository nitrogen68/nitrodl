const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { getApi, normalizer } = require('./api');
const { downloadFile, MAX_FILE_SIZE, sanitizeExtension } = require('../utils/download');

async function downloadYoutube(url, basePath = 'resultdownload_preniv') {
  const spinner = ora(' Fetching YouTube video data...').start();
  
  try {
    const response = await axios.get(`${getApi.youtube}${encodeURIComponent(url)}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36'
      }
    });

    const rawData = response.data;

    if (!rawData || !rawData.status) {
      spinner.fail(chalk.red(' Failed to fetch YouTube video data'));
      console.log(chalk.gray('   • The API returned an error or invalid response'));
      return;
    }

    const data = normalizer.normalizeYouTube(rawData.data, 'primary');

    if (!data.downloads.video.length && !data.downloads.audio.length) {
      spinner.fail(chalk.red(' No download formats available'));
      console.log(chalk.gray('   • The video may be unavailable or restricted'));
      return;
    }

    spinner.succeed(chalk.green(' YouTube video data fetched successfully!'));
    console.log('');
    console.log(chalk.cyan(' Video Information:'));
    console.log(chalk.gray('   • ') + chalk.white(`Title: ${data.title || 'No title'}`));
    if (data.duration) {
      console.log(chalk.gray('   • ') + chalk.white(`Duration: ${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')}`));
    }
    console.log('');

    const videoWithAudio = data.downloads.video.filter(f => f.type === 'video_with_audio');
    const videoOnly = data.downloads.video.filter(f => f.type === 'video');
    const audioOnly = data.downloads.audio;

    const downloadChoices = [];

    if (videoWithAudio.length > 0) {
      downloadChoices.push({
        name: chalk.bold.cyan(' Video with Audio'),
        disabled: true
      });
      videoWithAudio.forEach((format, index) => {
        downloadChoices.push({
          name: `   ${format.quality}`,
          value: { url: format.url, type: 'video', format: format.format, quality: format.quality, index }
        });
      });
    }

    if (videoOnly.length > 0) {
      downloadChoices.push({
        name: chalk.bold.yellow(' Video Only (no audio)'),
        disabled: true
      });
      videoOnly.forEach((format, index) => {
        downloadChoices.push({
          name: `   ${format.quality}`,
          value: { url: format.url, type: 'video', format: format.format, quality: format.quality, index }
        });
      });
    }

    if (audioOnly.length > 0) {
      downloadChoices.push({
        name: chalk.bold.green(' Audio Only'),
        disabled: true
      });
      audioOnly.forEach((format, index) => {
        downloadChoices.push({
          name: `   ${format.quality}`,
          value: { url: format.url, type: 'audio', format: format.format, quality: format.quality, index }
        });
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
        choices: downloadChoices,
        pageSize: 15
      }
    ]);

    if (selectedDownload === 'cancel') {
      console.log(chalk.yellow('\n Download cancelled.'));
      return;
    }

    const downloadSpinner = ora(` Downloading ${selectedDownload.type}...`).start();
    
    const safeTitle = (data.title || 'youtube_video')
      .replace(/[<>:"/\\|?*]/g, '')
      .substring(0, 50)
      .trim() || 'youtube_video';
    const extension = sanitizeExtension(selectedDownload.format, selectedDownload.type === 'audio' ? 'mp3' : 'mp4');
    const filename = `${safeTitle}_${selectedDownload.quality.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
    const maxSize = selectedDownload.type === 'video' ? MAX_FILE_SIZE : null;
    
    await downloadFile(selectedDownload.url, filename, downloadSpinner, basePath, maxSize);

  } catch (error) {
    spinner.fail(chalk.red(' Error fetching YouTube video'));
    if (error.code === 'ECONNABORTED') {
      console.log(chalk.gray(' • Request timeout - please try again'));
    } else if (error.response) {
      console.log(chalk.gray(` • API Error: ${error.response.status}`));
      if (error.response.data && error.response.data.message) {
        console.log(chalk.gray(` • ${error.response.data.message}`));
      }
    } else if (error.request) {
      console.log(chalk.gray(' • Network error - please check your connection'));
    } else {
      console.log(chalk.gray(` • ${error.message}`));
    }
  }
}

module.exports = { downloadYouTube: downloadYoutube };
