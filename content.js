chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request);
    if (request.action === 'appendText') {
      let editor = document.getElementById('editor');
      if (editor) {
        console.log('Appending text to editor:', request.text);
        editor.value += '\n' + request.text;
        chrome.storage.local.set({ notes: editor.value });
      } else {
        console.error('Editor not found.');
      }
    }
  });
  