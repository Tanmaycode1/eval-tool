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
    
    let content = '';
    if (!assistantResponse || assistantResponse === 'N/A') {
        content = '<div class="table-value">N/A</div>';
    } else if (typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
        content = renderJSONAsTable(assistantResponse);
    } else if (Array.isArray(assistantResponse)) {
        if (assistantResponse.length > 0 && typeof assistantResponse[0] === 'object' && assistantResponse[0] !== null) {
            content = renderArrayAsTable(assistantResponse);
        } else {
            content = '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">' +
                assistantResponse.map(item => `<li style="margin: 0.25rem 0;">${escapeHtml(String(item))}</li>`).join('') +
                '</ul>';
        }
    } else {
        try {
            const parsed = JSON.parse(assistantResponse);
            if (typeof parsed === 'object') {
                content = renderJSONAsTable(parsed);
            } else {
                content = `<pre>${escapeHtml(String(assistantResponse))}</pre>`;
            }
        } catch {
            content = `<pre>${escapeHtml(String(assistantResponse))}</pre>`;
        }
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

