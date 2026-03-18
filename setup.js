const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Electron Cally development environment...\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = 18;
const currentVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (currentVersion < requiredVersion) {
  console.error(`❌ Node.js ${requiredVersion}+ is required. Current version: ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if Visual Studio Build Tools are available (for Windows)
if (process.platform === 'win32') {
  try {
    execSync('where cl', { stdio: 'ignore' });
    console.log('✅ Visual Studio Build Tools detected');
  } catch (error) {
    console.warn('⚠️  Visual Studio Build Tools not detected. Native addon may fail to build.');
    console.warn('   Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/');
  }
}

// Create necessary directories
const directories = [
  'dist',
  'dist/main',
  'dist/renderer',
  'assets'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Check for Google Calendar API credentials
const authManagerPath = path.join(__dirname, 'src', 'auth', 'auth-manager.ts');
if (fs.existsSync(authManagerPath)) {
  const authContent = fs.readFileSync(authManagerPath, 'utf8');
  if (authContent.includes('YOUR_GOOGLE_CLIENT_ID')) {
    console.log('\n⚠️  Google Calendar API Setup Required:');
    console.log('   1. Go to https://console.cloud.google.com/');
    console.log('   2. Create a new project or select existing');
    console.log('   3. Enable Google Calendar API');
    console.log('   4. Create OAuth 2.0 credentials (Desktop Application)');
    console.log('   5. Update clientId and clientSecret in src/auth/auth-manager.ts');
  }
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Main dependencies installed');
} catch (error) {
  console.error('❌ Failed to install main dependencies');
  process.exit(1);
}

// Build native addon
console.log('\n🔧 Building native addon...');
try {
  execSync('cd native && npm install && npm run build', { stdio: 'inherit' });
  console.log('✅ Native addon built successfully');
} catch (error) {
  console.error('❌ Failed to build native addon');
  console.error('   This is required for pin-to-desktop functionality');
  console.error('   Ensure Visual Studio Build Tools are installed');
}

// Build TypeScript
console.log('\n🔨 Building TypeScript...');
try {
  execSync('npm run build:main', { stdio: 'inherit' });
  console.log('✅ TypeScript compiled successfully');
} catch (error) {
  console.error('❌ Failed to compile TypeScript');
  process.exit(1);
}

console.log('\n🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Set up Google Calendar API credentials (see warning above)');
console.log('2. Run "npm run dev" to start development');
console.log('3. Run "npm run build && npm start" for production build');
console.log('4. Run "npm run dist" to create installer');

console.log('\n📚 Documentation: README.md');
console.log('🐛 Issues: Create GitHub issues for bugs or feature requests');
