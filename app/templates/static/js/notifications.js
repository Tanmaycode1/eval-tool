// Notification system

let errorTimeout = null;

function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (!errorEl) return;
    
    const contentEl = errorEl.querySelector('.error-message-content');
    
    if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
    }
    
    contentEl.textContent = message;
    errorEl.classList.remove('success');
    errorEl.classList.add('active');
    
    errorTimeout = setTimeout(() => {
        hideError();
    }, 5000);
}

function showSuccess(message) {
    const errorEl = document.getElementById('error-message');
    if (!errorEl) return;
    
    const contentEl = errorEl.querySelector('.error-message-content');
    
    if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
    }
    
    contentEl.textContent = message;
    errorEl.classList.add('success');
    errorEl.classList.add('active');
    
    errorTimeout = setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    const errorEl = document.getElementById('error-message');
    if (!errorEl) return;
    
    errorEl.classList.remove('active');
    
    if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
    }
}

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (!loadingEl) return;
    
    if (show) {
        loadingEl.classList.add('active');
    } else {
        loadingEl.classList.remove('active');
    }
}

