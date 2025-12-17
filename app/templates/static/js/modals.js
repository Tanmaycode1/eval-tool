// Modal management

function openModal(title, content) {
    const modal = document.getElementById('content-modal');
    if (!modal) return;
    
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = content;
    
    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('content-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function openImageModal(imageUrl) {
    openModal('Image', `<img src="${escapeHtml(imageUrl)}" class="modal-image" alt="Full size image">`);
}

function openPromptModal(index) {
    if (!window.selectedVersionsData || !window.selectedVersionsData[index]) {
        return;
    }
    
    const promptText = window.selectedVersionsData[index].prompt;
    openModal('User Prompt', `<pre>${escapeHtml(promptText)}</pre>`);
}

function openResponseModal(index) {
    const selectedVersionIds = Array.from(document.querySelectorAll('.version-checkbox:checked'))
        .map(cb => cb.getAttribute('data-version-id'));
    const selectedVersions = window.allVersions.filter(v => selectedVersionIds.includes(v.version_id));
    
    if (!selectedVersions || !selectedVersions[index]) {
        console.error('Version not found at index:', index);
        return;
    }
    
    const version = selectedVersions[index];
    const assistantResponse = version.assistant_response;
    
    // Process response to strip markdown code blocks
    const processedResponse = processAssistantResponse(assistantResponse);
    
    let content = '';
    if (!processedResponse || processedResponse === 'N/A') {
        content = '<div class="table-value">N/A</div>';
    } else if (typeof processedResponse === 'object' && !Array.isArray(processedResponse)) {
        content = renderJSONAsTable(processedResponse);
    } else if (Array.isArray(processedResponse)) {
        if (processedResponse.length > 0 && typeof processedResponse[0] === 'object' && processedResponse[0] !== null) {
            content = renderArrayAsTable(processedResponse);
        } else {
            content = '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">' +
                processedResponse.map(item => `<li style="margin: 0.25rem 0;">${escapeHtml(String(item))}</li>`).join('') +
                '</ul>';
        }
    } else {
        content = `<pre>${escapeHtml(String(processedResponse))}</pre>`;
    }
    
    openModal('Assistant Response', content);
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('content-modal');
    if (event.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

