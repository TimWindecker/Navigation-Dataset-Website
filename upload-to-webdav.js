// Netlify Functions file: upload-to-webdav.js
const fetch = require('node-fetch');
const { Readable } = require('stream');
const FormData = require('form-data');
const busboy = require('busboy');

// Get these from Netlify environment variables
const WEBDAV_URL = process.env.WEBDAV_URL;
const SHARE_ID = process.env.SHARE_ID;

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse the multipart form data
    const { file, path } = await parseMultipartForm(event);
    
    if (!file || !path) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing file or path parameter' }),
      };
    }

    // Create full WebDAV URL for upload
    const uploadUrl = `${WEBDAV_URL}/${path}`;
    
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
      throw new Error(`WebDAV upload failed: ${response.status} ${errorText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: 'File uploaded successfully',
        path: path
      }),
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Upload failed', 
        message: error.message 
      }),
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
        fileSize: 10 * 1024 * 1024, // 10MB limit
      }
    });
    
    // Handle file part
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        result.file = {
          filename,
          mimetype: mimeType,
          encoding,
          data: Buffer.concat(chunks),
        };
      });
    });
    
    // Handle field part
    bb.on('field', (name, val) => {
      result[name] = val;
    });
    
    // Handle end of parsing
    bb.on('finish', () => {
      resolve(result);
    });
    
    // Handle errors
    bb.on('error', (error) => {
      reject(error);
    });
    
    // Start parsing
    bodyStream.pipe(bb);
  });
}