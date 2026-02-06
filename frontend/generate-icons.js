const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Blue gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#2563eb');
    gradient.addColorStop(1, '#1e40af');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // White text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.35}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', size / 2, size / 2);

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(__dirname, 'public', filename), buffer);
    console.log(`Generated ${filename}`);
}

function generateSplash(width, height, filename) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Centered blue circle with logo
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.15;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, '#2563eb');
    gradient.addColorStop(1, '#1e40af');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // White text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${radius * 0.7}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', centerX, centerY);

    // App name below
    ctx.fillStyle = '#2563eb';
    ctx.font = `${radius * 0.25}px Arial`;
    ctx.fillText('Pollica', centerX, centerY + radius + 60);

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(__dirname, 'public', filename), buffer);
    console.log(`Generated ${filename}`);
}

console.log('Generating PWA icons and splash screens...');

// Generate app icons
generateIcon(180, 'apple-touch-icon.png');
generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');

// Generate splash screens for different iOS devices
generateSplash(1125, 2436, 'splash-1125x2436.png'); // iPhone X/XS/11 Pro
generateSplash(1242, 2688, 'splash-1242x2688.png'); // iPhone XS Max/11 Pro Max
generateSplash(828, 1792, 'splash-828x1792.png');   // iPhone XR/11
generateSplash(1242, 2208, 'splash-1242x2208.png'); // iPhone 6+/7+/8+
generateSplash(750, 1334, 'splash-750x1334.png');   // iPhone 6/7/8
generateSplash(1536, 2048, 'splash-1536x2048.png'); // iPad

console.log('All icons and splash screens generated successfully!');
