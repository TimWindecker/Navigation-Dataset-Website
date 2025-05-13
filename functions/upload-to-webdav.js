// Netlify Functions file: upload-to-webdav.js
const fetch = require('node-fetch');
const { Readable } = require('stream');
const FormData = require('form-data');
const busboy = require('busboy');

// Get these from Netlify environment variables
const WEBDAV_URL = process.env.WEBDAV_URL;
const SHARE_ID = process.env.SHARE_ID;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
const DEBUG = true; // Set to true for detailed logging

// Helper function for logging when debug is enabled
function debugLog(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    // Parse the multipart form data
    const { file, path } = await parseMultipartForm(event);
    
    if (!file || !path) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing file or path parameter' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    debugLog(`Processing upload for path: ${path}`);
    
    // Check if we need to create a directory
    if (path.includes('/')) {
      const dirPath = path.substring(0, path.lastIndexOf('/'));
      debugLog(`Directory needs to be created: ${dirPath}`);
      try {
        const dirCreated = await createDirectory(dirPath);
        debugLog(`Result of createDirectory(${dirPath}):`, dirCreated);
        if (!dirCreated) {
          debugLog(`Failed to create directory ${dirPath}`);
          return {
            statusCode: 500,
            body: JSON.stringify({
              error: 'Failed to create directory',
              message: `Could not create directory ${dirPath}`
            }),
            headers: { 'Content-Type': 'application/json' }
          };
        }
      } catch (err) {
        console.error("Exception in createDirectory:", err);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Exception in createDirectory',
            message: err.message
          }),
          headers: { 'Content-Type': 'application/json' }
        };
      }
    }

    // Create full WebDAV URL for upload - Fix double slash issue
    // Ensure WEBDAV_URL doesn't end with slash and path doesn't start with slash
    const normalizedWebdavUrl = WEBDAV_URL.endsWith('/') ? WEBDAV_URL.slice(0, -1) : WEBDAV_URL;
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const uploadUrl = `${normalizedWebdavUrl}/${normalizedPath}`;
    
    debugLog(`Uploading to: ${uploadUrl}`);
    
    // Upload to WebDAV
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHARE_ID}:`).toString('base64')}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': file.mimetype || 'application/octet-stream',
      },
      body: file.data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`WebDAV upload failed: ${response.status} ${errorText}`);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'WebDAV upload failed', 
          message: `Status: ${response.status} - ${errorText.substring(0, 200)}` 
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: 'File uploaded successfully',
        path: path
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Upload failed', 
        message: error.message 
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};

// Function to create a directory recursively
async function createDirectory(dirPath) {
  // Split the path into segments
  const segments = dirPath.split('/').filter(Boolean);
  let currentPath = '';
  
  // Iterate through segments and create directories one by one
  for (const segment of segments) {
    currentPath += `${currentPath ? '/' : ''}${segment}`;
    debugLog(`Creating directory segment: ${currentPath}`);
    
    try {
      // Fix double slash issue in directory creation URLs
      const normalizedWebdavUrl = WEBDAV_URL.endsWith('/') ? WEBDAV_URL.slice(0, -1) : WEBDAV_URL;
      const normalizedPath = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
      const dirUrl = `${normalizedWebdavUrl}/${normalizedPath}`;
      
      debugLog(`MKCOL request to: ${dirUrl}`);
      
      const response = await fetch(dirUrl, {
        method: 'MKCOL',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${SHARE_ID}:`).toString('base64')}`,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      // 201 Created = success
      // 405 Method Not Allowed = directory already exists
      // Either is acceptable
      if (!response.ok && response.status !== 405) {
        const errorText = await response.text();
        console.error(`Failed to create directory ${currentPath}: Status ${response.status} - ${errorText}`);
        
        // Check if directory already exists by trying to GET it
        const checkResponse = await fetch(dirUrl, {
          method: 'PROPFIND',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${SHARE_ID}:`).toString('base64')}`,
            'X-Requested-With': 'XMLHttpRequest',
            'Depth': '0'
          }
        });
        
        if (!checkResponse.ok) {
          const checkErrorText = await checkResponse.text();
          console.error(`Directory ${currentPath} does not exist and could not be created: ${checkErrorText}`);
          return false;
        } else {
          debugLog(`Directory ${currentPath} already exists, continuing...`);
        }
      } else {
        debugLog(`Successfully created or confirmed directory: ${currentPath}`);
      }
    } catch (error) {
      console.error(`Error creating directory ${currentPath}:`, error);
      return false;
    }
  }
  
  return true;
}

// Helper function to parse multipart form data
function parseMultipartForm(event) {
  return new Promise((resolve, reject) => {
    const result = {};
    
    // Create a readable stream from the request body
    const bodyStream = new Readable();
    bodyStream.push(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bodyStream.push(null);
    
    // Set up busboy to parse the multipart form
    const bb = busboy({ 
      headers: event.headers,
      limits: {
        fileSize: MAX_FILE_SIZE, // Increased file size limit
      }
    });
    
    // Flag to track if file size limit was exceeded
    let fileSizeExceeded = false;
    
    // Handle file part
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('limit', () => {
        fileSizeExceeded = true;
        console.error('File size limit exceeded');
      });
      
      file.on('end', () => {
        if (!fileSizeExceeded) {
          result.file = {
            filename,
            mimetype: mimeType,
            encoding,
            data: Buffer.concat(chunks),
          };
        }
      });
    });
    
    // Handle field part
    bb.on('field', (name, val) => {
      result[name] = val;
    });
    
    // Handle end of parsing
    bb.on('finish', () => {
      if (fileSizeExceeded) {
        reject(new Error(`File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`));
      } else {
        resolve(result);
      }
    });
    
    // Handle errors
    bb.on('error', (error) => {
      reject(error);
    });
    
    // Start parsing
    bodyStream.pipe(bb);
  });
}