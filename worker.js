// worker.js for Cloudflare
export default {
  async fetch(request, env) {
    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    try {
      // Check if it's a multipart form
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response(
          JSON.stringify({ error: "Content type must be multipart/form-data" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      // Parse the multipart form data
      const formData = await request.formData();
      const file = formData.get("file");
      const path = formData.get("path");

      if (!file || !path) {
        return new Response(
          JSON.stringify({ error: "Missing file or path parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      console.log(`Processing upload for path: ${path}`);

      // Create directory if needed
      if (path.includes("/")) {
        const dirPath = path.substring(0, path.lastIndexOf("/"));
        console.log(`Directory needs to be created: ${dirPath}`);
        
        try {
          const dirCreated = await createDirectory(dirPath, env);
          if (!dirCreated) {
            return new Response(
              JSON.stringify({
                error: "Failed to create directory",
                message: `Could not create directory ${dirPath}`
              }),
              {
                status: 500,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*"
                }
              }
            );
          }
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: "Exception in createDirectory",
              message: err.message
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
      }

      // Create full WebDAV URL for upload
      const normalizedWebdavUrl = env.WEBDAV_URL.endsWith("/") 
        ? env.WEBDAV_URL.slice(0, -1) 
        : env.WEBDAV_URL;
      
      const normalizedPath = path.startsWith("/") 
        ? path.substring(1) 
        : path;
      
      const uploadUrl = `${normalizedWebdavUrl}/${normalizedPath}`;
      console.log(`Uploading to: ${uploadUrl}`);

      // Upload file to WebDAV
      const fileArrayBuffer = await file.arrayBuffer();
      
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Basic ${btoa(`${env.SHARE_ID}:`)}`,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": file.type || "application/octet-stream",
        },
        body: fileArrayBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`WebDAV upload failed: ${response.status} ${errorText}`);
        
        return new Response(
          JSON.stringify({ 
            error: "WebDAV upload failed", 
            message: `Status: ${response.status} - ${errorText.substring(0, 200)}` 
          }),
          {
            status: response.status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          message: "File uploaded successfully",
          path: path
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      console.error("Upload error:", error);
      
      return new Response(
        JSON.stringify({ 
          error: "Upload failed", 
          message: error.message 
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
};

// Function to create a directory recursively
async function createDirectory(dirPath, env) {
  // Split the path into segments
  const segments = dirPath.split("/").filter(Boolean);
  let currentPath = "";
  
  // Iterate through segments and create directories one by one
  for (const segment of segments) {
    currentPath += `${currentPath ? "/" : ""}${segment}`;
    console.log(`Creating directory segment: ${currentPath}`);
    
    try {
      // Fix double slash issue in directory creation URLs
      const normalizedWebdavUrl = env.WEBDAV_URL.endsWith("/") 
        ? env.WEBDAV_URL.slice(0, -1) 
        : env.WEBDAV_URL;
      
      const normalizedPath = currentPath.startsWith("/") 
        ? currentPath.substring(1) 
        : currentPath;
      
      const dirUrl = `${normalizedWebdavUrl}/${normalizedPath}`;
      console.log(`MKCOL request to: ${dirUrl}`);
      
      const response = await fetch(dirUrl, {
        method: "MKCOL",
        headers: {
          "Authorization": `Basic ${btoa(`${env.SHARE_ID}:`)}`,
          "X-Requested-With": "XMLHttpRequest"
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
          method: "PROPFIND",
          headers: {
            "Authorization": `Basic ${btoa(`${env.SHARE_ID}:`)}`,
            "X-Requested-With": "XMLHttpRequest",
            "Depth": "0"
          }
        });
        
        if (!checkResponse.ok) {
          const checkErrorText = await checkResponse.text();
          console.error(`Directory ${currentPath} does not exist and could not be created: ${checkErrorText}`);
          return false;
        } else {
          console.log(`Directory ${currentPath} already exists, continuing...`);
        }
      } else {
        console.log(`Successfully created or confirmed directory: ${currentPath}`);
      }
    } catch (error) {
      console.error(`Error creating directory ${currentPath}:`, error);
      return false;
    }
  }
  
  return true;
}