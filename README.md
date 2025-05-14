# Robot Navigation Dataset Collection Form

This is a minimalistic web application for collecting robot navigation dataset images along with metadata. Users can submit their name, location information, additional notes, and upload multiple images.

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

1. A Cloudflare account (free tier is sufficient)
2. A Nextcloud instance with WebDAV access
3. Git for version control

### Steps

1. Set Up the Worker
    1. Log in to your Cloudflare Dashboard
    2. Navigate to Workers & Pages in the sidebar
    3. Click Create Application → Create Worker
    4. Use this repositroy as source
2. Configure Environment Variables
    1. While in your Worker's dashboard, go to the Settings tab
    2. Scroll down to Environment Variables
    3. Add the following variables:
        - `WEBDAV_URL`: Your Nextcloud WebDAV URL (e.g., https://your-nextcloud.com/public.php/webdav)
        - `SHARE_ID`: Your Nextcloud share ID (e.g. the last part of a shared link, make sure the link has can edit and upload files)
3. Deploy the Website Files
    1. Go to the Workers & Pages dashboard
    2. Click Create Application → Pages
    3. Use this repository as source
    4. Set `public` as root directory
5. Update the UPLOAD_ENDPOINT in index.html to point to the worker URL

_Note:_ If you encounter issues, check the Logs tab in your Worker's dashboard to identify the specific error or your browsers debug console.

## Security Considerations

- This setup uses a Cloudflare Worker as a secure proxy for WebDAV uploads, keeping your credentials safe.
- For production use, consider adding rate limiting or user authentication.
- The WebDAV share should be configured with edit and upload permissions in Nextcloud.

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
