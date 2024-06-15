// Function to load notes from local storage and update the editor
function loadNotes() {
  chrome.storage.local.get(['notes'], (result) => {
    let editor = document.getElementById('editor');
    if (editor && result.notes) {
      editor.value = result.notes;
    }
  });
}

// Event listener for messages received in the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if the message action is 'appendText'
  if (request.action === 'appendText') {
    let editor = document.getElementById('editor');
    if (editor) {
      // Append the requested text to the editor
      editor.value += '\n' + request.text;
      // Save the updated content to local storage
      chrome.storage.local.set({ notes: editor.value });
    }
  }
});

// Load notes when the content script runs (when the new tab page is opened)
loadNotes();
