Write-Host "🚀 Emergent Labs Dev Environment Reset Starting..."

# Stop any running metro processes
Write-Host "Stopping Metro..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove node_modules
Write-Host "Removing node_modules..."
if (Test-Path node_modules) {
    Remove-Item node_modules -Recurse -Force
}

# Remove lock file
Write-Host "Removing package-lock..."
if (Test-Path package-lock.json) {
    Remove-Item package-lock.json -Force
}

# Remove native folders
Write-Host "Removing Android/iOS builds..."
if (Test-Path android) {
    Remove-Item android -Recurse -Force
}

if (Test-Path ios) {
    Remove-Item ios -Recurse -Force
}

# Clean npm cache
Write-Host "Cleaning npm cache..."
npm cache clean --force

# Install dependencies safely
Write-Host "Installing dependencies..."
npm install --legacy-peer-deps

# Install video module if missing
Write-Host "Ensuring react-native-video..."
npm install react-native-video --legacy-peer-deps

# Generate native project
Write-Host "Running Expo prebuild..."
npx expo prebuild --clean

# Build Android dev client
Write-Host "Building Android..."
npx expo run:android

Write-Host "✅ Emergent Dev Build Complete!"