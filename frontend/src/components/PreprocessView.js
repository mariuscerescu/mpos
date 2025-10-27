import { apiClient } from "../api/client";

export function createPreprocessView() {
  const section = document.createElement("section");
  section.className = "preprocess-section";

  const title = document.createElement("h2");
  title.textContent = "Image Preprocessing";
  
  const status = document.createElement("p");
  status.className = "status-message";

  const controls = document.createElement("div");
  controls.className = "preprocess-controls";
  
  const documentSelect = document.createElement("select");
  const preprocessButton = document.createElement("button");
  preprocessButton.textContent = "Preprocess Image";
  preprocessButton.disabled = true;

  controls.append(documentSelect, preprocessButton);

  const viewer = document.createElement("div");
  viewer.className = "preprocess-viewer";
  
  const originalPanel = document.createElement("div");
  originalPanel.className = "image-panel";
  originalPanel.innerHTML = "<h3>Original</h3><div class='image-container'><p>Select a document</p></div>";
  
  const processedPanel = document.createElement("div");
  processedPanel.className = "image-panel";
  processedPanel.innerHTML = "<h3>Preprocessed</h3><div class='image-container'><p>Not processed yet</p></div>";
  
  viewer.append(originalPanel, processedPanel);

  section.append(title, status, controls, viewer);

  let currentTokens = null;
  let documents = [];
  let selectedDocumentId = null;
  let pollingInterval = null;

  function setStatus(message, variant = "info") {
    status.textContent = message;
    status.className = `status-message status-${variant}`;
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  async function pollDocumentStatus(documentId) {
    stopPolling(); // Clear any existing polling
    
    pollingInterval = setInterval(async () => {
      try {
        const doc = await apiClient.get(`/documents/${documentId}`);
        
        // Update the document in our list
        const index = documents.findIndex(d => d.id === documentId);
        if (index >= 0) {
          documents[index] = doc;
        }
        
        // Update the select option text
        const option = Array.from(documentSelect.options).find(opt => opt.value === documentId);
        if (option) {
          option.textContent = `${doc.filename} (${doc.status})`;
        }
        
        // Check if processing is done or failed
        const isProcessed = ["queued_ocr", "ocr", "completed"].includes(doc.status);
        const isFailed = doc.status === "failed";
        
        if (isProcessed) {
          stopPolling();
          setStatus("Preprocessing completed! Displaying result.", "success");
          await updateImageView(doc);
          preprocessButton.disabled = false;
        } else if (isFailed) {
          stopPolling();
          setStatus(`Preprocessing failed: ${doc.error_message || "Unknown error"}`, "error");
          preprocessButton.disabled = false;
        } else {
          // Still processing
          setStatus(`Processing... (${doc.status})`, "info");
        }
      } catch (error) {
        console.error("Polling error:", error);
        stopPolling();
        setStatus("Failed to check processing status.", "error");
        preprocessButton.disabled = false;
      }
    }, 2000); // Poll every 2 seconds
  }
  
  async function fetchImageBlob(documentId, variant) {
    try {
      const response = await fetch(`${apiClient.baseUrl}/documents/${documentId}/binary?variant=${variant}`, {
        headers: { 
          'Authorization': `Bearer ${currentTokens.accessToken}`,
          'Accept': 'image/*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${variant} image: ${response.statusText}`);
      }
      
      return await response.blob();
    } catch (error) {
      console.error(`Failed to fetch ${variant} image:`, error);
      return null;
    }
  }
  
  function renderImage(panel, blob, defaultMessage) {
    const container = panel.querySelector('.image-container');
    container.innerHTML = "";
    if (blob) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      container.appendChild(img);
    } else {
      container.innerHTML = `<p>${defaultMessage}</p>`;
    }
  }

  async function updateImageView(doc) {
      if (!doc) {
        renderImage(originalPanel, null, "Select a document");
        renderImage(processedPanel, null, "Select a document");
        return;
      }

      const originalBlob = await fetchImageBlob(doc.id, "original");
      renderImage(originalPanel, originalBlob, "Original image unavailable.");

      const isProcessed = ["queued_ocr", "ocr", "completed"].includes(doc.status);
      if (isProcessed) {
        const processedBlob = await fetchImageBlob(doc.id, "preprocessed");
        renderImage(processedPanel, processedBlob, "Preprocessed image unavailable.");
      } else {
        renderImage(processedPanel, null, "Image has not been preprocessed yet.");
      }
  }

  async function onSelectChange() {
    stopPolling(); // Stop polling when changing selection
    selectedDocumentId = documentSelect.value;
    preprocessButton.disabled = !selectedDocumentId;
    const selectedDoc = documents.find(d => d.id === selectedDocumentId);
    updateImageView(selectedDoc);
  }

  async function onPreprocessClick() {
    if (!selectedDocumentId) return;
    
    preprocessButton.disabled = true;
    setStatus("Starting preprocessing...", "info");

    try {
      await apiClient.post(`/documents/${selectedDocumentId}/process`, {});
      setStatus("Preprocessing started. Checking status...", "info");
      // Start polling for status updates
      await pollDocumentStatus(selectedDocumentId);
    } catch (error) {
      setStatus(error.message || "Failed to start preprocessing.", "error");
      preprocessButton.disabled = false;
    }
  }

  async function fetchDocuments() {
    if (!currentTokens) return;
    try {
      const docs = await apiClient.get("/documents");
      documents = docs.filter(d => d.content_type.startsWith('image/')); // Only show images
      
      documentSelect.innerHTML = '<option value="">-- Select a document --</option>';
      documents.forEach(doc => {
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${doc.filename} (${doc.status})`;
        documentSelect.appendChild(option);
      });
      setStatus(`Loaded ${documents.length} image documents.`, "success");
    } catch (error) {
      setStatus("Failed to load documents.", "error");
    }
  }

  function setTokens(tokens) {
    currentTokens = tokens;
    if (tokens) {
      fetchDocuments();
    } else {
      stopPolling(); // Stop polling when logging out
    }
  }
  
  documentSelect.addEventListener("change", onSelectChange);
  preprocessButton.addEventListener("click", onPreprocessClick);
  
  setStatus("Select a document to view and preprocess.", "info");

  return { element: section, setTokens };
}
