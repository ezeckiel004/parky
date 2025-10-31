// JavaScript pour la page de connexion de suppression de compte
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = document.getElementById('submit-btn');
            const errorMessage = document.getElementById('error-message');
            
            // Reset error message
            errorMessage.style.display = 'none';
            
            // Disable button
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connexion...';
            
            try {
                const response = await fetch('/api/auth/account-deletion/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Store token and redirect
                    localStorage.setItem('deletion_token', data.token);
                    window.location.href = '/api/auth/account-deletion/form';
                } else {
                    // Show error
                    errorMessage.textContent = data.message || 'Erreur de connexion';
                    errorMessage.style.display = 'block';
                }
            } catch (error) {
                errorMessage.textContent = 'Erreur de connexion. Veuillez réessayer.';
                errorMessage.style.display = 'block';
            }
            
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Se connecter';
        });
    }
});