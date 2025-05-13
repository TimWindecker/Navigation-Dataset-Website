// Netlify Functions file: upload-to-webdav.js
const fetch = require('node-fetch');
const { Readable } = require('stream');
const FormData = require('form-data');
const busboy = require('busboy');

// Get these from Netlify environment variables
const WEBDAV_URL = process.env.WEBDAV_URL;
const SHARE_ID = process.env.SHARE_ID;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

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

    // Create full WebDAV URL for upload
    const uploadUrl = `${WEBDAV_URL}/${path}`;
    
    // First, ensure the directory exists by creating it
    if (path.includes('/')) {
      const dirPath = path.substring(0, path.lastIndexOf('/'));
      const dirUrl = `${WEBDAV_URL}/${dirPath}`;
      
      try {
        // Try to create the directory (MKCOL request)
        const mkcolResponse = await fetch(dirUrl, {
          method: 'MKCOL',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${SHARE_ID}:`).toString('base64')}`,
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        // 201 Created or 405 Method Not Allowed (if directory already exists) are both acceptable
        if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
          console.warn(`Warning: Could not create directory ${dirPath}: ${mkcolResponse.status}`);
        }
      } catch (dirError) {
        console.warn(`Error creating directory: ${dirError.message}`);
        // Continue anyway, as the PUT might still succeed
      }
    }
    
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