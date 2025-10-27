import { apiClient } from "../api/client";

export function createOCRView() {
  const section = document.createElement("section");
  section.className = "ocr-section";

  const title = document.createElement("h2");
  title.textContent = "OCR Text Extraction";
  
  const status = document.createElement("p");
  status.className = "status-message";

  const controls = document.createElement("div");
  controls.className = "ocr-controls";
  
  const documentSelect = document.createElement("select");
  const extractButton = document.createElement("button");
  extractButton.textContent = "Extract Text";
  extractButton.disabled = true;

  controls.append(documentSelect, extractButton);

  const viewer = document.createElement("div");
  viewer.className = "ocr-viewer";
  
  const imagePanel = document.createElement("div");
  imagePanel.className = "ocr-image-panel";
  imagePanel.innerHTML = "<h3>Preprocessed Image</h3><div class='ocr-image-container'><p>Select a document</p></div>";
  
  const textPanel = document.createElement("div");
  textPanel.className = "ocr-text-panel";
  const textPanelTitle = document.createElement("h3");
  textPanelTitle.textContent = "Extracted Text";
  const textArea = document.createElement("textarea");
  textArea.className = "ocr-text-area";
  textArea.placeholder = "OCR text will appear here after extraction...";
  textArea.readOnly = false; // Editabil
  textPanel.append(textPanelTitle, textArea);
  
  viewer.append(imagePanel, textPanel);

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
    stopPolling();
    
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
        
        // Check if OCR is done or failed
        const isCompleted = doc.status === "completed";
        const isFailed = doc.status === "failed";
        
        if (isCompleted) {
          stopPolling();
          setStatus("OCR extraction completed!", "success");
          textArea.value = doc.ocr_text || "[No text extracted]";
          extractButton.disabled = false;
        } else if (isFailed) {
          stopPolling();
          setStatus(`OCR extraction failed: ${doc.error_message || "Unknown error"}`, "error");
          extractButton.disabled = false;
        } else {
          // Still processing
          setStatus(`Processing OCR... (${doc.status})`, "info");
        }
      } catch (error) {
        console.error("Polling error:", error);
        stopPolling();
        setStatus("Failed to check OCR status.", "error");
        extractButton.disabled = false;
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
  
  function renderImage(blob, defaultMessage) {
    const container = imagePanel.querySelector('.ocr-image-container');
    container.innerHTML = "";
    if (blob) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      container.appendChild(img);
    } else {
      container.innerHTML = `<p>${defaultMessage}</p>`;
    }
  }

  async function updateView(doc) {
    if (!doc) {
      renderImage(null, "Select a document");
      textArea.value = "";
      return;
    }

    // Show preprocessed image (if available)
    const hasPreprocessed = ["queued_ocr", "ocr", "completed"].includes(doc.status);
    if (hasPreprocessed) {
      const processedBlob = await fetchImageBlob(doc.id, "preprocessed");
      renderImage(processedBlob, "Preprocessed image unavailable.");
    } else {
      // Fallback to original if not preprocessed yet
      const originalBlob = await fetchImageBlob(doc.id, "original");
      renderImage(originalBlob, "Image not preprocessed yet.");
    }

    // Show OCR text if available
    if (doc.ocr_text) {
      textArea.value = doc.ocr_text;
    } else {
      textArea.value = "";
    }
  }

  async function onSelectChange() {
    stopPolling();
    selectedDocumentId = documentSelect.value;
    extractButton.disabled = !selectedDocumentId;
    const selectedDoc = documents.find(d => d.id === selectedDocumentId);
    await updateView(selectedDoc);
  }

  async function onExtractClick() {
    if (!selectedDocumentId) return;
    
    const selectedDoc = documents.find(d => d.id === selectedDocumentId);
    
    // Check if document needs to be processed first
    if (!["queued_ocr", "ocr", "completed"].includes(selectedDoc?.status)) {
      setStatus("Document must be preprocessed first. Go to Preprocess section.", "error");
      return;
    }

    // If already completed, just show the text
    if (selectedDoc?.status === "completed" && selectedDoc?.ocr_text) {
      textArea.value = selectedDoc.ocr_text;
      setStatus("OCR text already extracted.", "success");
      return;
    }

    // Start OCR extraction
    extractButton.disabled = true;
    setStatus("Starting OCR extraction...", "info");

    try {
      await apiClient.post(`/documents/${selectedDocumentId}/process`, {});
      setStatus("OCR extraction started. Checking status...", "info");
      await pollDocumentStatus(selectedDocumentId);
    } catch (error) {
      setStatus(error.message || "Failed to start OCR extraction.", "error");
      extractButton.disabled = false;
    }
  }

  async function fetchDocuments() {
    if (!currentTokens) return;
    try {
      const docs = await apiClient.get("/documents");
      // Only show images that have been preprocessed or completed
      documents = docs.filter(d => 
        d.content_type.startsWith('image/') && 
        ["queued_ocr", "ocr", "completed"].includes(d.status)
      );
      
      documentSelect.innerHTML = '<option value="">-- Select a document --</option>';
      documents.forEach(doc => {
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${doc.filename} (${doc.status})`;
        documentSelect.appendChild(option);
      });
      
      if (documents.length === 0) {
        setStatus("No preprocessed documents available. Preprocess images first.", "info");
      } else {
        setStatus(`Loaded ${documents.length} preprocessed document(s).`, "success");
      }
    } catch (error) {
      setStatus("Failed to load documents.", "error");
    }
  }

  function setTokens(tokens) {
    currentTokens = tokens;
    if (tokens) {
      fetchDocuments();
    } else {
      stopPolling();
    }
  }
  
  documentSelect.addEventListener("change", onSelectChange);
  extractButton.addEventListener("click", onExtractClick);
  
  setStatus("Select a preprocessed document to extract text.", "info");

  return { element: section, setTokens };
}
