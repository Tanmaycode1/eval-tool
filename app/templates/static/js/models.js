// Model management

let availableModels = {};

async function loadModels() {
    try {
        console.log('Loading available models...');
        availableModels = await API.getModels();
        console.log('Available models loaded:', availableModels);
        console.log('Providers found:', Object.keys(availableModels));
        
        const providerSelect = document.getElementById('provider-select');
        if (!providerSelect) return;
        
        providerSelect.innerHTML = '<option value="">Select provider</option>';
        
        if (Object.keys(availableModels).length === 0) {
            providerSelect.innerHTML = '<option value="">No API keys configured</option>';
            console.warn('No providers available - check API keys in environment variables');
            return;
        }
        
        Object.keys(availableModels).forEach(provider => {
            const option = document.createElement('option');
            option.value = provider;
            option.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
            providerSelect.appendChild(option);
        });
        
        providerSelect.addEventListener('change', updateModelSelect);
        
        console.log('Models loaded successfully');
    } catch (error) {
        console.error('Error loading models:', error);
        const providerSelect = document.getElementById('provider-select');
        if (providerSelect) {
            providerSelect.innerHTML = '<option value="">Error loading models</option>';
        }
    }
}

function updateModelSelect() {
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    
    if (!providerSelect || !modelSelect) return;
    
    const provider = providerSelect.value;
    
    if (!provider) {
        modelSelect.innerHTML = '<option value="">Select provider first</option>';
        return;
    }
    
    modelSelect.innerHTML = '';
    const models = availableModels[provider] || [];
    
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });
    
    if (models.length > 0) {
        modelSelect.value = models[0];
    }
}

async function populateChainModelSelect(selectElement, currentModel, promptIndex, provider = null) {
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }
    
    if (Object.keys(availableModels).length === 0) {
        await loadModels();
    }
    
    const providersToShow = provider ? [provider] : Object.keys(availableModels);
    
    providersToShow.forEach(prov => {
        const models = availableModels[prov] || [];
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = `${prov}:${model}`;
            option.textContent = `${prov}/${model}`;
            if (model === currentModel) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    });
}

