# Robot Navigation Dataset Collection Form

This is a minimalistic web application for collecting robot navigation dataset images along with metadata. Users can submit their name, location information, additional notes, and upload multiple images.

[![Netlify Status](https://api.netlify.com/api/v1/badges/2ca98639-e01e-42b0-a4fd-b8966b915982/deploy-status)](https://app.netlify.com/sites/navigation-dataset/deploys)

## Features

- Simple, responsive design
- Support for drag-and-drop file uploads
- Multi-image upload support
- Progress indicator during uploads
- Automatic folder creation with timestamp and user name
- Metadata JSON file generated with each submission
- All data stored directly in your Nextcloud via WebDAV

## Deployment Instructions

### Prerequisites

1. A Netlify account (free tier is sufficient)
2. A Nextcloud instance with WebDAV access
3. Git for version control

### Step 1: Set up environment variables

In your Netlify site settings, add the following environment variables:

- `WEBDAV_URL`: Your Nextcloud WebDAV URL (e.g., `https://your-nextcloud.com/public.php/webdav/robot-navigation-data`)
- `SHARE_ID`: Your Nextcloud share ID for public access

### Step 2: Install required dependencies

Create a `package.json` file with the following contents:

```json
{
  "name": "robot-navigation-dataset-collector",
  "version": "1.0.0",
  "description": "A web form for collecting robot navigation datasets",
  "main": "index.html",
  "dependencies": {
    "busboy": "^1.6.0",
    "form-data": "^4.0.0",
    "node-fetch": "^2.6.7"
  }
}
```

### Step 3: Configure Netlify build settings

Create a `netlify.toml` file with the following contents:

```toml
[build]
  publish = "./"
  functions = "./functions"

[functions]
  directory = "functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

### Step 4: Create the functions directory

```
mkdir -p functions
```

Move the `upload-to-webdav.js` file to the `functions` directory.

### Step 5: Deploy to Netlify

You can deploy this website to Netlify through their web interface or using the Netlify CLI:

```bash
npm install -g netlify-cli
netlify login
netlify deploy
```

## Security Considerations

- This setup uses a Netlify Function as a secure proxy for WebDAV uploads, keeping your credentials safe.
- For production use, consider adding rate limiting or user authentication.
- The WebDAV share should be configured with appropriate permissions in Nextcloud.

## Data Structure

Each submission creates a folder with the following structure:

```
username_timestamp/
  ├── metadata.json
  ├── image1.jpg
  ├── image2.jpg
  └── ...
```

The `metadata.json` file contains all form fields and file information.