/**
 * Script to upload backed-up videos to a new Cloudinary account
 * and automatically update MongoDB event records with the new URLs.
 *
 * Usage:
 *   $env:NEW_CLOUDINARY_CLOUD_NAME="your_cloud_name"
 *   $env:NEW_CLOUDINARY_API_KEY="your_api_key"
 *   $env:NEW_CLOUDINARY_API_SECRET="your_api_secret"
 *   node scripts/upload-to-new-cloudinary.js
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const cloudName = process.env.NEW_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.NEW_CLOUDINARY_API_KEY;
const apiSecret = process.env.NEW_CLOUDINARY_API_SECRET;
const uri = process.env.MONGODB_URI || 'mongodb+srv://jeevadhara:saju%405050@cluster0.sdckdam.mongodb.net/jeevadhara_website?appName=Cluster0';

if (!cloudName || !apiKey || !apiSecret) {
  console.error("Please provide NEW_CLOUDINARY_CLOUD_NAME, NEW_CLOUDINARY_API_KEY, and NEW_CLOUDINARY_API_SECRET.");
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

const backupDir = path.join(__dirname, '..', 'media_backup');
const manifestFile = path.join(backupDir, 'manifest.json');

if (!fs.existsSync(manifestFile)) {
  console.error("Manifest not found in media_backup/. Run download-videos.js first.");
  process.exit(1);
}

async function migrate() {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const eventsCollection = mongoose.connection.db.collection('events');

    console.log(`Found ${manifest.length} videos to upload to new Cloudinary account: ${cloudName}`);

    for (let i = 0; i < manifest.length; i++) {
      const item = manifest[i];
      const filePath = path.join(backupDir, item.localFile);
      console.log(`[${i+1}/${manifest.length}] Uploading ${item.title}...`);

      const uploadRes = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: 'jeevadhara'
      });

      console.log(`  Uploaded! New URL: ${uploadRes.secure_url}`);

      // Update MongoDB record
      await eventsCollection.updateOne(
        { _id: new mongoose.Types.ObjectId(item.id) },
        { $set: { videoUrl: uploadRes.secure_url } }
      );
      console.log(`  Updated event in MongoDB!`);
    }

    console.log(`All ${manifest.length} videos migrated successfully!`);
    await mongoose.disconnect();
  } catch (err) {
    console.error("Migration error:", err);
  }
}

migrate();
