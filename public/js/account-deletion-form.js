// JavaScript pour la page de formulaire de suppression de compte
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is authenticated
    const token = localStorage.getItem('deletion_token');
    if (!token) {
        window.location.href = '/api/auth/account-deletion/login';
        return;
    }

    // Elements
    const form = document.getElementById('delete-account-form');
    const modal = document.getElementById('confirm-modal');
    const confirmDelete = document.getElementById('confirm-delete');
    const cancelDelete = document.getElementById('cancel-delete');
    const submitBtn = document.getElementById('submit-btn');
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');

    // Functions
    window.toggleCustomReason = function() {
        const select = document.getElementById('reason');
        const customReason = document.getElementById('custom-reason');
        const isCustom = select.value === 'Autre (précisez)';

        customReason.style.display = isCustom ? 'block' : 'none';
        
        if (isCustom) {
            customReason.required = true;
        } else {
            customReason.required = false;
            customReason.value = '';
        }
    };

    window.goBack = function() {
        localStorage.removeItem('deletion_token');
        window.location.href = '/api/auth/account-deletion/login';
    };

    // Event listeners
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Reset messages
            successMessage.style.display = 'none';
            errorMessage.style.display = 'none';
            
            // Validate form
            const reasonSelect = document.getElementById('reason');
            const customReasonTextarea = document.getElementById('custom-reason');
            
            if (reasonSelect.value === 'Autre (précisez)' && !customReasonTextarea.value.trim()) {
                errorMessage.textContent = 'Veuillez préciser votre raison.';
                errorMessage.style.display = 'block';
                return;
            }
            
            modal.style.display = 'flex';
        });
    }

    if (confirmDelete) {
        confirmDelete.addEventListener('click', async () => {
            modal.style.display = 'none';
            
            // Disable button
            submitBtn.disabled = true;
            submitBtn.textContent = 'Suppression en cours...';
            
            try {
                const reasonSelect = document.getElementById('reason');
                const customReasonTextarea = document.getElementById('custom-reason');
                
                let reason = reasonSelect.value;
                if (reason === 'Autre (précisez)') {
                    reason = customReasonTextarea.value.trim();
                }
                
                const response = await fetch('/api/auth/account-deletion/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reason })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    successMessage.textContent = data.message;
                    successMessage.style.display = 'block';
                    
                    // Hide form and show success
                    form.style.display = 'none';
                    
                    // Clear token and redirect after delay
                    setTimeout(() => {
                        localStorage.removeItem('deletion_token');
                        window.location.href = '/api/auth/account-deletion/login';
                    }, 3000);
                    
                } else {
                    errorMessage.textContent = data.message || 'Erreur lors de la suppression du compte';
                    errorMessage.style.display = 'block';
                }
                
            } catch (error) {
                errorMessage.textContent = 'Erreur de connexion. Veuillez réessayer.';
                errorMessage.style.display = 'block';
            }
            
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Supprimer';
        });
    }

    if (cancelDelete) {
        cancelDelete.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
});