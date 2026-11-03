const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb+srv://jeevadhara:saju%405050@cluster0.sdckdam.mongodb.net/jeevadhara_website?appName=Cluster0';
const backupDir = path.join(__dirname, '..', 'media_backup');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const events = await mongoose.connection.db.collection('events').find({ videoUrl: { $exists: true, $ne: '' } }).toArray();
    console.log(`Found ${events.length} videos to backup.`);

    const manifest = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const filename = `${ev._id}.mp4`;
      const dest = path.join(backupDir, filename);
      console.log(`[${i+1}/${events.length}] Downloading: ${ev.title} -> ${filename}`);
      try {
        await downloadFile(ev.videoUrl, dest);
        const stats = fs.statSync(dest);
        console.log(`  Saved (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        manifest.push({
          id: ev._id.toString(),
          title: ev.title,
          originalUrl: ev.videoUrl,
          localFile: filename,
          sizeBytes: stats.size
        });
      } catch (err) {
        console.error(`  Error downloading ${ev.videoUrl}:`, err.message);
      }
    }

    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`All done! Manifest written to ${path.join(backupDir, 'manifest.json')}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

run();
